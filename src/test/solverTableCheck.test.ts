import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkSolverTable, checkStrategyRow } from "@/core/solverTableCheck";
import type { SolverGame } from "@/engines/solverSpots";

const codes = (vs: { code: string }[]) => [...new Set(vs.map(v => v.code))].sort();

// petite table saine : UTG ouvre ou se couche, MP répond à l'ouverture
const healthy = (): SolverGame => ({
  id: "cash-test", kind: "cash", stack: 100, ante: 0, positions: ["UTG", "MP", "CO", "BTN", "SB", "BB"],
  spots: [
    { k: "", a: "UTG", acts: ["F", "R2.5", "A100"], f: [80, 19.5, 0.5], h: { AA: [0, 100, 0], "72o": [100, 0, 0] } },
    { k: "UTG:R2.5", a: "MP", acts: ["F", "C", "R7.5", "A100"], f: [85, 5, 10, 0], h: { AA: [0, 0, 100, 0], KK: [0, 1, 99, 0] } },
  ],
});

describe("contrôle d'une ligne de stratégie", () => {
  it("accepte des fréquences qui font 100 % (à l'arrondi près)", () => {
    expect(checkStrategyRow([33, 33, 33], 100, 1)).toEqual([]);
    expect(checkStrategyRow([0.5, 0.5], 1, 0.01)).toEqual([]);
  });
  it("refuse une somme fausse ou une fréquence négative", () => {
    expect(codes(checkStrategyRow([50, 30], 100, 1))).toEqual(["FREQ_SUM"]);
    expect(codes(checkStrategyRow([110, -10], 100, 1))).toContain("FREQ_RANGE");
  });
});

describe("contrôle d'une table préflop", () => {
  it("une table saine ne lève rien", () => {
    expect(checkSolverTable(healthy())).toEqual([]);
  });

  it("repère une ligne en double", () => {
    const g = healthy();
    g.spots.push({ ...g.spots[1] });
    expect(codes(checkSolverTable(g))).toContain("DUP_KEY");
  });

  it("repère un code d'action inconnu", () => {
    const g = healthy();
    g.spots[0].acts[1] = "Z2.5";
    expect(codes(checkSolverTable(g))).toContain("BAD_ACTION");
  });

  it("repère des fréquences globales qui ne font pas 100 %", () => {
    const g = healthy();
    g.spots[0].f = [80, 10, 0.5];
    expect(codes(checkSolverTable(g))).toContain("FREQ_SUM");
  });

  it("repère une main mal écrite ou une ligne de main de mauvaise longueur", () => {
    const g = healthy();
    g.spots[0].h["A1s"] = [100, 0, 0];
    g.spots[1].h["QQ"] = [0, 100];
    expect(codes(checkSolverTable(g))).toEqual(expect.arrayContaining(["BAD_HAND", "ROW_LENGTH"]));
  });

  it("repère un joueur qui n'est pas à la table", () => {
    const g = healthy();
    g.spots[1].a = "HJ";
    expect(codes(checkSolverTable(g))).toContain("BAD_ACTOR");
  });

  it("repère une ligne dont l'action d'origine n'existe pas", () => {
    const g = healthy();
    g.spots[1].k = "UTG:R3";
    expect(codes(checkSolverTable(g))).toContain("ORPHAN");
  });
});

describe("la table cash 100 bb publiée sur le site", () => {
  const g = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8")) as SolverGame;

  it("est une table cash 6-max à 100 bb", () => {
    expect(g.kind).toBe("cash");
    expect(g.stack).toBe(100);
    expect(g.positions).toEqual(["UTG", "MP", "CO", "BTN", "SB", "BB"]);
  });

  it("passe tous les contrôles", () => {
    const problems = checkSolverTable(g);
    expect(problems.slice(0, 5)).toEqual([]);
  });
});
