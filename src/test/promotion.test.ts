import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { SolverGame } from "@/engines/solverSpots";
import { compareTables, manifestProblems, checkCandidate, applyCandidate, rollback } from "@/bench/promotion";

// Petite table « tournoi » à deux joueurs : UTG ouvre ou se couche, MP répond.
const table = (aaRaise = 100, extra = false): SolverGame => ({
  id: "t1", kind: "mtt", stack: 10, ante: 0, positions: ["UTG", "MP"], iterations: 100, gap: 0.01,
  spots: [
    { k: "", a: "UTG", acts: ["F", "A10"], f: [70, 30], h: { AA: [100 - aaRaise, aaRaise], "72o": [100, 0] } },
    { k: "UTG:A10", a: "MP", acts: ["F", "C"], f: [80, 20], h: { KK: [0, 100], QJs: [90, 10] } },
    ...(extra ? [{ k: "UTG:F", a: "MP", acts: ["F", "A10"], f: [10, 90], h: { AA: [0, 100] } }] : []),
  ],
});
const manifestFor = (g: SolverGame, bytes: Buffer, over: Record<string, unknown> = {}) => ({
  schema: 1, id: g.id, table: { file: `${g.id}.json`, sha256: createHash("sha256").update(bytes).digest("hex"), spots: g.spots.length },
  game: { format: g.kind, players: 2, positions: g.positions, stackBB: g.stack, anteBB: 0, rake: { pct: 0, capBB: null, noFlopNoDrop: true } },
  tree: { openBB: [10] }, model: { realization: "balanced", leafNet: null },
  solve: { iterations: g.iterations, gap: g.gap, gapDefinition: "Somme du gain d'une meilleure réponse" },
  config: {}, generator: { name: "GTOpen", commit: "abc" }, run: { dates: "2026-11-23" }, notes: [], ...over,
});
function put(dir: string, g: SolverGame, over: Record<string, unknown> = {}) {
  mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(JSON.stringify(g));
  writeFileSync(join(dir, `${g.id}.json`), bytes);
  writeFileSync(join(dir, `${g.id}.manifest.json`), JSON.stringify(manifestFor(g, bytes, over)));
  writeFileSync(join(dir, "index.json"), JSON.stringify([{ id: g.id, kind: g.kind, label: "MTT · 10 bb", stack: g.stack, spots: g.spots.length }]));
}

describe("comparaison de deux tables", () => {
  it("lignes gagnées et perdues, mains dont l'action principale change, plus gros changements", () => {
    const d = compareTables(table(100, true), table(0));
    expect(d.lost).toEqual(["UTG:F"]);
    expect(d.gained).toEqual([]);
    expect(d.handsCompared).toBe(4);
    expect(d.handsChanged).toBe(1); // AA : relance → fold
    expect(d.top[0].k).toBe("");
  });
});

describe("fiche d'origine", () => {
  const g = table();
  const bytes = Buffer.from(JSON.stringify(g));
  it("fiche conforme : aucun problème", () => {
    expect(manifestProblems(manifestFor(g, bytes), bytes, g)).toEqual([]);
  });
  it("empreinte fausse ou chemin personnel : refusée", () => {
    expect(manifestProblems({ ...manifestFor(g, bytes), table: { file: "t1.json", sha256: "0", spots: 2 } }, bytes, g).join()).toMatch(/empreinte/);
    expect(manifestProblems(manifestFor(g, bytes, { notes: ["/Users/moi/calcul"] }), bytes, g).join()).toMatch(/chemin personnel/);
  });
});

describe("contrôle, mise en service et retour arrière", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "promo-"));
    put(join(root, "public/solver"), table(100));
    put(join(root, "solver-candidates"), table(100, true));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("une candidate saine passe le contrôle, avec un rapport", () => {
    const c = checkCandidate(root, "t1");
    expect(c.blocking).toEqual([]);
    expect(c.warnings).toEqual([]);
    expect(c.ok).toBe(true);
    expect(c.report).toMatch(/1 ligne gagnée/);
  });

  it("mise en service : l'ancienne table est archivée, la candidate la remplace, l'index suit", () => {
    const cand = readFileSync(join(root, "solver-candidates/t1.json"));
    const r = applyCandidate(root, "t1", "20261123-1200");
    expect(readFileSync(join(root, "public/solver/t1.json"))).toEqual(cand);
    expect(existsSync(join(root, "solver-candidates/t1.json"))).toBe(false);
    expect(readdirSync(join(root, "solver-archive"))).toEqual(["t1-20261123-1200"]);
    expect(r.archivedTo).toContain("t1-20261123-1200");
    const ix = JSON.parse(readFileSync(join(root, "public/solver/index.json"), "utf8"));
    expect(ix[0].spots).toBe(3);
  });

  it("retour arrière : l'ancienne table revient, celle qu'on retire est gardée", () => {
    const old = readFileSync(join(root, "public/solver/t1.json"));
    applyCandidate(root, "t1", "20261123-1200");
    rollback(root, "t1", "20261123-1300");
    expect(readFileSync(join(root, "public/solver/t1.json"))).toEqual(old);
    expect(JSON.parse(readFileSync(join(root, "public/solver/index.json"), "utf8"))[0].spots).toBe(2);
    expect(readdirSync(join(root, "solver-archive")).sort()).toEqual(["t1-20261123-1200-restauree", "t1-20261123-1300-retiree"]);
  });

  it("perdre beaucoup de lignes est un point d'attention : mise en service seulement avec accord explicite", () => {
    put(join(root, "public/solver"), table(100, true));
    put(join(root, "solver-candidates"), table(100));
    const c = checkCandidate(root, "t1");
    expect(c.ok).toBe(true);
    expect(c.warnings.join()).toMatch(/lignes perdues/);
    expect(() => applyCandidate(root, "t1", "x")).toThrow(/point.* d'attention/);
    applyCandidate(root, "t1", "x", { acceptWarnings: true });
    expect(JSON.parse(readFileSync(join(root, "public/solver/t1.json"), "utf8")).spots.length).toBe(2);
  });

  it("une candidate qui échoue au contrôle n'est jamais mise en service", () => {
    put(join(root, "solver-candidates"), table(100), { generator: null });
    const before = readFileSync(join(root, "public/solver/t1.json"));
    expect(() => applyCandidate(root, "t1", "x")).toThrow(/refusée/);
    expect(readFileSync(join(root, "public/solver/t1.json"))).toEqual(before);
  });
});

describe("table cash 100 bb : mains évidentes et mains de référence", () => {
  let root: string;
  const live = resolve(__dirname, "../../public/solver");
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "promo-cash-"));
    for (const d of ["public/solver", "solver-candidates", "src/bench"]) mkdirSync(join(root, d), { recursive: true });
    for (const f of ["cash100.json", "cash100.manifest.json", "index.json"]) {
      copyFileSync(join(live, f), join(root, "public/solver", f));
      copyFileSync(join(live, f), join(root, "solver-candidates", f));
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("même table : aucune décision ne change", () => {
    const c = checkCandidate(root, "cash100");
    expect(c.ok).toBe(true);
    expect(c.report).toMatch(/0 décision de référence changée/);
  });

  it("une table où AA se couche d'UTG est bloquée", () => {
    const g = JSON.parse(readFileSync(join(live, "cash100.json"), "utf8")) as SolverGame;
    const s = g.spots.find(x => x.k === "")!;
    s.h.AA = s.acts.map(a => (a === "F" ? 100 : 0));
    const bytes = Buffer.from(JSON.stringify(g));
    writeFileSync(join(root, "solver-candidates/cash100.json"), bytes);
    const m = JSON.parse(readFileSync(join(live, "cash100.manifest.json"), "utf8"));
    m.table.sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(root, "solver-candidates/cash100.manifest.json"), JSON.stringify(m));
    const c = checkCandidate(root, "cash100");
    expect(c.ok).toBe(false);
    expect(c.blocking.join()).toMatch(/AA relance toujours/);
  });

  it("mise en service de cash100 : la référence des mains types est réécrite", () => {
    applyCandidate(root, "cash100", "20261123-1200");
    const ref = JSON.parse(readFileSync(join(root, "src/bench/reference.json"), "utf8"));
    expect(ref.decisions.length).toBeGreaterThan(20);
  }, 60000);
});
