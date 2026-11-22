import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { polarRiver } from "@/bench/knownGames";
import { sanityChecks } from "@/bench/sanity";
import type { SolverGame } from "@/engines/solverSpots";

describe("brique 1 : jeux à solution connue", () => {
  // River polarisée (valeur ou air contre attrapeur de bluffs), une seule taille de mise b × pot :
  // part de bluffs = b / (1 + 2b), défense = 1 / (1 + b).
  for (const b of [0.5, 1, 2]) {
    it(`mise de ${b * 100} % du pot : bluffs et défense à la théorie`, () => {
      const [bluff, defense] = polarRiver(b);
      expect(bluff.expected).toBeCloseTo(b / (1 + 2 * b), 9);
      expect(defense.expected).toBeCloseTo(1 / (1 + b), 9);
      expect(bluff.ok).toBe(true);
      expect(defense.ok).toBe(true);
    });
  }
});

describe("brique 1 : mains évidentes dans la table préflop cash", () => {
  const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
  it("chaque contrôle passe", () => {
    const res = sanityChecks(g);
    expect(res.length).toBeGreaterThan(8);
    expect(res.filter(r => !r.ok)).toEqual([]);
  });
});
