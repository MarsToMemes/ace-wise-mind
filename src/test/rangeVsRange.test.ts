import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandRange, boardAdvantage } from "@/engines/rangeVsRange";
import { getRange } from "@/engines/matchupRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";

// ranges d'ouverture : une seule source, la bibliothèque du solveur (chargée par le site au démarrage)
beforeAll(() => setSolverBaseGame(JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8"))));
afterAll(() => setSolverBaseGame(null));

describe("expandRange", () => {
  it("expands combos and removes dead cards", () => {
    expect(expandRange({ AA: 1, AKs: 1, AKo: 1 }, []).length).toBe(6 + 4 + 12);
    expect(expandRange({ AA: 1 }, ["As"]).length).toBe(3);
  });
});

describe("boardAdvantage", () => {
  beforeEach(() => localStorage.clear());

  it("AA crushes 72o on K83", () => {
    const a = boardAdvantage({ AA: 1 }, { "72o": 1 }, ["Kd", "8s", "3c"], { samples: 2000, seed: 1 });
    expect(a.pfrEquity).toBeGreaterThan(0.85);
  });

  it("strong-hand share uses board-relative strength", () => {
    // 88 = set on K83 (strong), AA = overpair (not strong)
    const a = boardAdvantage({ "88": 1 }, { AA: 1 }, ["Kd", "8s", "3c"], { samples: 500, seed: 1 });
    expect(a.pfrStrongPct).toBe(100);
    expect(a.callerStrongPct).toBe(0);
  });

  it("UTG open has equity edge vs BB defense on a high board", () => {
    const a = boardAdvantage(getRange("open:UTG").weights, getRange("call:BB:vs:UTG").weights, ["As", "Kd", "7c"], { samples: 3000, seed: 7 });
    // seuil réglé autrefois sur l'ancienne range d'ouverture écrite en dur (UTG 10,2 %) ; avec celle de la bibliothèque
    // (UTG 17,8 %), l'avantage reste net : 54,95 % mesurés
    expect(a.pfrEquity).toBeGreaterThan(0.53);
  });

  it("is deterministic for a given seed", () => {
    const run = () => boardAdvantage(getRange("open:BTN").weights, getRange("call:BB:vs:BTN").weights, ["9h", "8h", "7c"], { samples: 800, seed: 3 });
    expect(run()).toEqual(run());
  });
});
