import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { computeDecisions, diffDecisions, withSeed, type Reference } from "@/bench/driftCases";
import type { SolverGame } from "@/engines/solverSpots";

const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
const ref: Reference = JSON.parse(readFileSync(resolve(__dirname, "../bench/reference.json"), "utf8"));

describe("brique 3 : détecteur de dérive", () => {
  it("le hasard fixé donne deux fois le même tirage, et rend Math.random ensuite", () => {
    const orig = Math.random;
    expect(withSeed(7, () => [Math.random(), Math.random()])).toEqual(withSeed(7, () => [Math.random(), Math.random()]));
    expect(Math.random).toBe(orig);
  });

  it("repère une décision changée, ajoutée ou retirée", () => {
    const d = diffDecisions(
      [{ id: "a", what: "A", result: "R 100" }, { id: "c", what: "C", result: "F 100" }],
      [{ id: "a", what: "A", result: "C 100" }, { id: "b", what: "B", result: "F 100" }],
    );
    expect(d.changed).toEqual([{ id: "a", what: "A", before: "C 100", after: "R 100" }]);
    expect(d.added.map(x => x.id)).toEqual(["c"]);
    expect(d.removed.map(x => x.id)).toEqual(["b"]);
  });

  it("aucune décision du jeu de mains types n'a changé depuis la référence", () => {
    const d = diffDecisions(computeDecisions(g), ref.decisions);
    // en cas d'échec : si le changement est voulu, mettre la référence à jour avec « npm run bench -- --update »
    expect(d).toEqual({ changed: [], added: [], removed: [] });
  }, 60000);
});
