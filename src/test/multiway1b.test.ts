import { describe, it, expect } from "vitest";
import type { Node } from "@/engines/multiway/game";
import { kuhn } from "@/engines/multiway/kuhn";
import { CFR } from "@/engines/multiway/cfr";
import { expectedValues, bestResponseValue, nashConv } from "@/engines/multiway/bestResponse";
import { kuhnChecks } from "@/bench/knownGames";

// Poker de Kuhn à 3 joueurs. Famille d'équilibres publiée par Szafron, Gibson, Sturtevant (AAMAS 2013) :
// le joueur 1 checke toujours ; valeurs par main : J1 = -(1+2β)/48, J2 = -1/48, J3 = (1+β)/24, β entre 0 et 1.
// Critère dur : la NashConv exacte (docs/DECISIONS.md D14). Les propriétés publiées sont des comparaisons.
const g = kuhn(3);
const solved = (() => { const s = new CFR(g); s.run(5000); return s.averageProfile(); })();

describe("poker de Kuhn à 3 joueurs", () => {
  it("24 distributions de cartes, gains à somme nulle", () => {
    expect(g.root.t === "chance" ? g.root.outcomes.length : 0).toBe(24);
    const bad: number[] = [];
    const walk = (n: Node) => { if (n.t === "terminal") { const s = n.payoffs.reduce((a, b) => a + b, 0); if (Math.abs(s) > 1e-12) bad.push(s); } else if (n.t === "chance") n.outcomes.forEach(o => walk(o.child)); else n.children.forEach(walk); };
    walk(g.root);
    expect(bad).toEqual([]);
  });

  it("critère dur : NashConv exacte sous 0,001 jeton par main, et aucun joueur ne gagne plus de 0,001 en dérivant", () => {
    expect(nashConv(g, solved)).toBeLessThan(1e-3);
    const ev = expectedValues(g, solved);
    for (let i = 0; i < 3; i++) expect(bestResponseValue(g, solved, i) - ev[i]).toBeLessThan(1e-3);
  });

  it("comparaison publiée : le joueur 1 ne mise jamais en premier", () => {
    for (const card of [0, 1, 2, 3]) expect(solved(`0|${card}|`)![1]).toBeLessThan(1e-3);
  });

  it("comparaison publiée : valeur du joueur 2 = -1/48, et un même β (entre 0 et 1) explique les valeurs des joueurs 1 et 3", () => {
    const [v1, v2, v3] = expectedValues(g, solved);
    expect(v2).toBeCloseTo(-1 / 48, 3);
    const beta1 = (-48 * v1 - 1) / 2, beta3 = 24 * v3 - 1;
    expect(Math.abs(beta1 - beta3)).toBeLessThan(0.01);
    expect(beta1).toBeGreaterThanOrEqual(-0.01);
    expect(beta1).toBeLessThanOrEqual(1.01);
  });
});

describe("bulletin : jeux de Kuhn", () => {
  it("les contrôles du bulletin passent", () => {
    const res = kuhnChecks();
    expect(res.length).toBeGreaterThanOrEqual(4);
    expect(res.filter(r => !r.ok)).toEqual([]);
  });
});
