import { describe, it, expect } from "vitest";
import type { Game, Node } from "@/engines/multiway/game";
import { kuhn } from "@/engines/multiway/kuhn";
import { CFR } from "@/engines/multiway/cfr";
import { expectedValues, bestResponseValue, nashConv, uniformProfile } from "@/engines/multiway/bestResponse";

// Petit jeu à information cachée : J0 choisit G ou D ; J1 choisit g ou d SANS voir le choix de J0.
const T = (a: number): Node => ({ t: "terminal", payoffs: [a, -a] });
const pennies: Game = {
  name: "pièces", players: 2,
  root: { t: "decision", player: 0, info: "0", actions: ["G", "D"], children: [
    { t: "decision", player: 1, info: "1", actions: ["g", "d"], children: [T(1), T(-1)] },
    { t: "decision", player: 1, info: "1", actions: ["g", "d"], children: [T(-1), T(1)] },
  ] },
};
const fixed = (p: Record<string, number[]>) => (info: string) => p[info];

describe("meilleure réponse exacte (information cachée)", () => {
  it("J1 joue g 70 % : la meilleure réponse de J0 est G, valeur 0,4", () => {
    expect(bestResponseValue(pennies, fixed({ "0": [0.5, 0.5], "1": [0.7, 0.3] }), 0)).toBeCloseTo(0.4, 12);
  });
  it("J0 joue G 60 % : J1 ne voit pas le choix, sa meilleure réponse est d pour les deux nœuds, valeur 0,2", () => {
    expect(bestResponseValue(pennies, fixed({ "0": [0.6, 0.4], "1": [0.5, 0.5] }), 1)).toBeCloseTo(0.2, 12);
  });
  it("NashConv : 0 à l'équilibre (50/50), positive ailleurs", () => {
    expect(nashConv(pennies, fixed({ "0": [0.5, 0.5], "1": [0.5, 0.5] }))).toBeCloseTo(0, 12);
    expect(nashConv(pennies, fixed({ "0": [0.6, 0.4], "1": [0.7, 0.3] }))).toBeGreaterThan(0.1);
  });
});

describe("poker de Kuhn à 2 joueurs (valeur exacte connue : -1/18 pour le joueur 1)", () => {
  const g = kuhn(2);
  it("6 distributions de cartes, gains à somme nulle", () => {
    const deals = g.root.t === "chance" ? g.root.outcomes.length : 0;
    expect(deals).toBe(6);
    const sums: number[] = [];
    const walk = (n: Node) => { if (n.t === "terminal") sums.push(n.payoffs.reduce((a, b) => a + b, 0)); else if (n.t === "chance") n.outcomes.forEach(o => walk(o.child)); else n.children.forEach(walk); };
    walk(g.root);
    expect(sums.every(s => Math.abs(s) < 1e-12)).toBe(true);
  });
  it("CFR converge : valeur du joueur 1 à ±0,001 de -1/18, NashConv sous 0,001 jeton par main", () => {
    const s = new CFR(g);
    const before = nashConv(g, uniformProfile());
    s.run(20000);
    const prof = s.averageProfile();
    expect(expectedValues(g, prof)[0]).toBeCloseTo(-1 / 18, 3);
    const nc = nashConv(g, prof);
    expect(nc).toBeLessThan(1e-3);
    expect(nc).toBeLessThan(before);
  });
  it("la stratégie trouvée a la forme de l'équilibre connu : le joueur 1 mise le valet à α (≤ 1/3), le roi à 3α, checke la dame", () => {
    const s = new CFR(g);
    s.run(20000);
    const p = s.averageProfile();
    const alpha = p("0|0|")![1];                       // carte 0 = valet, action 1 = mise
    expect(alpha).toBeLessThanOrEqual(1 / 3 + 1e-3);
    expect(p("0|2|")![1]).toBeCloseTo(3 * alpha, 2);     // roi
    expect(p("0|1|")![1]).toBeLessThan(1e-3);            // dame : check
  });
  it("une stratégie fixée pendant chaque itération : CFR+ descend sous 0,0001 jeton par main en 20 000 itérations", () => {
    const s = new CFR(g);
    s.run(20000);
    expect(nashConv(g, s.averageProfile())).toBeLessThan(1e-4);
  });
});
