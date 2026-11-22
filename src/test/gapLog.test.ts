import { describe, it, expect, beforeEach } from "vitest";
import { gapsOf, recordGaps, loadGaps, clearGaps, exportGaps, heroJustActed, endsOnHeroDecision, GAPS_KEY, GAPS_MAX, type Gap } from "@/lib/gapLog";
import { RARE_NOTE } from "@/engines/solverSpots";

const base = { hasHand: true, stackBB: 100, depthOk: true } as const;

describe("gapsOf : ce qui est moins fiable que le solveur", () => {
  it("conseil solveur exact : aucune lacune", () => {
    expect(gapsOf({ ...base, street: "Preflop", preflop: { title: "BTN face à : relance UTG", coverage: { level: "exact", details: [] } } })).toEqual([]);
  });

  it("sans cartes du joueur : rien n'est noté", () => {
    expect(gapsOf({ ...base, hasHand: false, street: "Flop", postflop: true })).toEqual([]);
  });

  it("ligne préflop non calculée", () => {
    expect(gapsOf({ ...base, street: "Preflop", preflopMissing: "UTG relance 2,5 · MP tapis 100" })).toEqual([
      { key: "missing|UTG relance 2,5 · MP tapis 100", kind: "missing", label: "Ligne préflop non calculée : UTG relance 2,5 · MP tapis 100" },
    ]);
  });

  it("profondeur sans table cash", () => {
    expect(gapsOf({ ...base, street: "Preflop", stackBB: 52, depthOk: false })).toEqual([
      { key: "depth|52", kind: "depth", label: "Tapis de 52 bb : pas de table cash à cette profondeur" },
    ]);
  });

  it("chaque rapprochement est une lacune à part", () => {
    const d = "Relance de UTG à 3 bb comptée comme 2,5 bb (taille calculée la plus proche).";
    expect(gapsOf({ ...base, street: "Preflop", preflop: { title: "BTN face à : relance UTG", coverage: { level: "approx", details: [d] } } }))
      .toEqual([{ key: `approx|${d}`, kind: "approx", label: d }]);
  });

  it("ligne rare : notée une fois, avec ses rapprochements éventuels", () => {
    const d = "Relance de UTG à 60 bb comptée comme tapis.";
    const g = gapsOf({ ...base, street: "Preflop", preflop: { title: "MP face à : tapis UTG", coverage: { level: "rare", details: [RARE_NOTE, d] } } });
    expect(g.map(x => x.kind)).toEqual(["rare", "approx"]);
    expect(g[0].label).toBe("Ligne rare : MP face à : tapis UTG");
  });

  it("flop : pas de solveur, conseil maison", () => {
    expect(gapsOf({ ...base, street: "Flop", postflop: true })).toEqual([{ key: "flop", kind: "flop", label: "Flop : pas de solveur, conseil maison" }]);
  });

  it("turn ou river à 3 joueurs ou plus, et garde-fou", () => {
    const g = gapsOf({ ...base, street: "River", postflop: true, multiway: true, guard: true });
    expect(g.map(x => x.kind)).toEqual(["multiway", "guard"]);
  });
});

describe("liste des lacunes (navigateur seulement)", () => {
  beforeEach(() => localStorage.clear());
  const A: Gap = { key: "flop", kind: "flop", label: "Flop : pas de solveur, conseil maison" };
  const B: Gap = { key: "depth|52", kind: "depth", label: "Tapis de 52 bb : pas de table cash à cette profondeur" };

  it("compte les mains, pas les affichages : revoir une main ne la compte pas deux fois", () => {
    recordGaps([A, B], "h1", 1000);
    recordGaps([A], "h2", 2000);
    recordGaps([A], "h2", 3000);
    const g = loadGaps();
    expect(g.map(x => [x.key, x.count])).toEqual([["flop", 2], ["depth|52", 1]]);
    expect(g[0].hands[0]).toBe("h2");
    expect(g[0].first).toBe(1000);
    expect(g[0].last).toBe(3000);
  });

  it("une même lacune vue deux fois dans une main ne compte qu'une fois", () => {
    recordGaps([A, A], "h1", 1000);
    expect(loadGaps()[0].count).toBe(1);
  });

  it("garde au plus GAPS_MAX lacunes, en jetant les moins fréquentes", () => {
    recordGaps([A], "h0", 1);
    recordGaps([A], "h00", 2);
    for (let i = 0; i < GAPS_MAX + 5; i++) recordGaps([{ key: `approx|${i}`, kind: "approx", label: `x${i}` }], `h${i}`, 10 + i);
    const g = loadGaps();
    expect(g.length).toBe(GAPS_MAX);
    expect(g[0].key).toBe("flop");
  });

  it("supporte un stockage abîmé", () => {
    localStorage.setItem(GAPS_KEY, "{pas du json");
    expect(loadGaps()).toEqual([]);
  });

  it("export : fichier lisible, sans les identifiants de mains", () => {
    recordGaps([A], "h1", 1000);
    const out = JSON.parse(exportGaps(5000));
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe(5000);
    expect(out.gaps[0]).toEqual({ kind: "flop", label: A.label, count: 1, first: 1000, last: 1000 });
  });

  it("tout effacer", () => {
    recordGaps([A], "h1", 1000);
    clearGaps();
    expect(loadGaps()).toEqual([]);
  });
});

describe("à quel moment une décision du joueur compte", () => {
  const a = (seatIdx: number, type = "Raise") => ({ seatIdx, type });
  it("quand le joueur vient d'ajouter son action", () => {
    expect(heroJustActed(1, [a(0), a(3)], 3)).toBe(true);
  });
  it("pas quand un adversaire agit, ni quand une main entière est rechargée", () => {
    expect(heroJustActed(1, [a(0), a(1)], 3)).toBe(false);
    expect(heroJustActed(0, [a(0), a(3), a(0)], 3)).toBe(false);
  });
  it("main laissée alors que le joueur devait agir : le conseil affiché compte", () => {
    expect(endsOnHeroDecision([], 3)).toBe(true);
    expect(endsOnHeroDecision([a(0)], 3)).toBe(true);
  });
  it("pas si le joueur a agi en dernier ou s'est couché", () => {
    expect(endsOnHeroDecision([a(0), a(3)], 3)).toBe(false);
    expect(endsOnHeroDecision([a(3, "Fold"), a(0)], 3)).toBe(false);
  });
});
