import { describe, it, expect } from "vitest";
import { SolverGame, matchSpot, coverageOf, TableAction } from "@/engines/solverSpots";

// Petite partie à deux joueurs, 100 bb : UTG ouvre à 2,5 (ou tapis, presque jamais), MP répond.
const G: SolverGame = {
  id: "t", kind: "cash", stack: 100, ante: 0, positions: ["UTG", "MP"], iterations: 1, gap: 0,
  spots: [
    { k: "", a: "UTG", acts: ["F", "R2.5", "A100"], f: [80, 19.9, 0.1], h: { AA: [0, 100, 0], "72o": [100, 0, 0] } },
    { k: "UTG:R2.5", a: "MP", acts: ["F", "C", "R7.5", "A100"], f: [70, 20, 10, 0], h: { KK: [0, 0, 100, 0], AJo: [0, 100, 0, 0] } },
    { k: "UTG:A100", a: "MP", acts: ["F", "C"], f: [90, 10], h: { AA: [0, 100], KK: [40, 60] }, r: 1 },
    { k: "UTG:R2.5,MP:R7.5", a: "UTG", acts: ["F", "C", "A100"], f: [50, 30, 20], h: { AA: [0, 0, 100] } },
    { k: "UTG:R2.5,MP:R7.5,UTG:A100", a: "MP", acts: ["F", "C"], f: [30, 70], h: { KK: [0, 100] } },
  ],
};
const SEATS = ["UTG", "MP"];
const A = (seatIdx: number, type: string, amountBB = 0): TableAction => ({ seatIdx, street: "Preflop", type, amountBB });

describe("coverageOf", () => {
  it("ligne calculée, jouée, saisie à la bonne taille → solveur exact", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.5)], 100);
    expect(coverageOf(m)).toEqual({ level: "exact", details: [] });
  });

  it("une petite différence de taille (moins de 5 %) reste exacte", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.6)], 100);
    expect(coverageOf(m).level).toBe("exact");
  });

  it("relance de 3 bb ramenée à 2,5 bb → approché, avec le détail", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 3)], 100);
    expect(m.spot?.k).toBe("UTG:R2.5");
    const c = coverageOf(m);
    expect(c.level).toBe("approx");
    expect(c.details).toEqual(["Relance de UTG à 3 bb comptée comme 2,5 bb (taille calculée la plus proche)."]);
  });

  it("5-bet à 40 bb sans petite relance dans l'arbre → compté comme tapis", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.5), A(1, "Raise", 7.5), A(0, "Raise", 40)], 100);
    expect(m.spot?.k).toBe("UTG:R2.5,MP:R7.5,UTG:A100");
    const c = coverageOf(m);
    expect(c.level).toBe("approx");
    expect(c.details).toEqual(["Relance de UTG à 40 bb comptée comme tapis."]);
  });

  it("un vrai tapis n'est pas un rapprochement", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.5), A(1, "Raise", 7.5), A(0, "Raise", 100)], 100);
    expect(coverageOf(m).level).toBe("exact");
  });

  it("ligne que la stratégie ne joue presque jamais → ligne rare, indicative", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 100)], 100);
    expect(m.spot?.k).toBe("UTG:A100");
    const c = coverageOf(m);
    expect(c.level).toBe("rare");
    expect(c.details[0]).toMatch(/presque jamais.*indicatif/);
  });

  it("ligne rare ET rapprochée : rare l'emporte, les deux détails restent", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 60)], 100);
    const c = coverageOf(m);
    expect(c.level).toBe("rare");
    expect(c.details).toHaveLength(2);
    expect(c.details[1]).toBe("Relance de UTG à 60 bb comptée comme tapis.");
  });

  it("tapis du joueur différent de la table calculée → approché", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.5)], 90);
    const c = coverageOf(m, "Conseil calculé à 100 bb (ton tapis : 90 bb).");
    expect(c).toEqual({ level: "approx", details: ["Conseil calculé à 100 bb (ton tapis : 90 bb)."] });
  });

  it("table à plus de 6 joueurs regroupée → approché", () => {
    const m = matchSpot(G, ["UTG", "UTG", "MP"], 2, [A(0, "Raise", 2.5)], 100);
    expect(coverageOf(m).level).toBe("approx");
  });
});

describe("ligne préflop non calculée", () => {
  it("dit quelle ligne manque, sans les folds", () => {
    const m = matchSpot(G, SEATS, 1, [A(0, "Raise", 2.5), A(1, "Raise", 7.5), A(0, "Call")], 100);
    expect(m.spot).toBeUndefined();
    expect(m.missing).toBe(true);
    expect(m.line).toBe("UTG relance 2,5 · MP relance 7,5 · UTG paye");
  });
  it("une main pas encore saisie n'est pas une ligne manquante", () => {
    expect(matchSpot(G, ["", ""], 0, [], 100).missing).toBeFalsy();
  });
});
