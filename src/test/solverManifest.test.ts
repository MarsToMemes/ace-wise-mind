import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { checkSolverTable } from "@/core/solverTableCheck";
import type { SolverGame } from "@/engines/solverSpots";

/** Fiche d'origine d'une table, écrite par scripts/import_gtopen.py. */
interface Manifest {
  schema: number;
  id: string;
  table: { file: string; sha256: string; spots: number };
  game: { format: string; players: number; positions: string[]; stackBB: number; anteBB: number; rake: { pct: number; capBB: number | null; noFlopNoDrop: boolean | null } };
  tree: Record<string, unknown>;
  model: { realization: string | null; leafNet: string | null };
  solve: { iterations: number | null; gap: number | null; gapDefinition: string };
  config: Record<string, unknown>;
  generator: { name: string; commit: string } | null;
}

const DIR = resolve(__dirname, "../../public/solver");
const index = JSON.parse(readFileSync(resolve(DIR, "index.json"), "utf8")) as { id: string; kind: string }[];
const manifests = readdirSync(DIR).filter(f => f.endsWith(".manifest.json"));

describe("fiches d'origine des tables", () => {
  it("chaque table cash du site a sa fiche d'origine", () => {
    const cash = index.filter(e => e.kind === "cash").map(e => e.id);
    expect(cash.length).toBeGreaterThan(0);
    for (const id of cash) expect(existsSync(resolve(DIR, `${id}.manifest.json`)), id).toBe(true);
  });

  for (const file of manifests) {
    describe(file, () => {
      const text = readFileSync(resolve(DIR, file), "utf8");
      const m = JSON.parse(text) as Manifest;
      const tableBytes = readFileSync(resolve(DIR, m.table.file));
      const table = JSON.parse(tableBytes.toString("utf8")) as SolverGame;

      it("décrit bien sa table : même fichier (empreinte), même nombre de lignes, même calcul", () => {
        expect(m.schema).toBe(1);
        expect(m.id).toBe(table.id);
        expect(createHash("sha256").update(tableBytes).digest("hex")).toBe(m.table.sha256);
        expect(table.spots.length).toBe(m.table.spots);
        expect(m.solve.iterations).toBe(table.iterations);
        expect(m.solve.gap).toBe(table.gap);
        expect(m.game.stackBB).toBe(table.stack);
        expect(m.game.positions).toEqual(table.positions);
      });

      it("dit ce qui change le jeu : rake, arbre, modèle, définition de la précision, générateur", () => {
        expect(m.game.rake).toEqual(expect.objectContaining({ pct: expect.any(Number) }));
        expect(m.tree.openBB).toBeDefined();
        expect(m.model.realization).toBeTruthy();
        expect(m.solve.gapDefinition).toMatch(/meilleure réponse/);
        expect(m.config).toBeTruthy();
        expect(m.generator?.name).toBeTruthy();
        expect(m.generator?.commit).toBeTruthy();
      });

      it("ne contient aucun chemin de dossier personnel", () => {
        expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\Users/);
      });

      it("sa table passe les contrôles de forme", () => {
        expect(checkSolverTable(table).slice(0, 5)).toEqual([]);
      });
    });
  }
});
