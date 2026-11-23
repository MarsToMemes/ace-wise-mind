import { describe, it, expect } from "vitest";
import { river3, MICRO_RIVER } from "@/engines/multiway/river3";
import { expectedValues, nashConv } from "@/engines/multiway/bestResponse";
import { uniformProfile } from "@/engines/multiway/bestResponse";
import { VRiver3, fromRiverSpec, type VSpec } from "@/engines/multiway/vriver3";
import { CASH_RAKE } from "@/core/rake";

// Solveur « par vecteurs de mains » (un seul arbre d'enchères, une stratégie par main à chaque nœud).
// Vérification croisée : même jeu que la river miniature de l'étape 1 (arbre explicite, une branche par distribution).
const explicitSpec = { ...MICRO_RIVER, rake: CASH_RAKE };
const vspec: VSpec = fromRiverSpec(explicitSpec);

describe("river à 3 par vecteurs de mains : vérification croisée avec l'étape 1", () => {
  it("mêmes ensembles d'information que l'arbre explicite", () => {
    const v = new VRiver3(vspec);
    const g = river3(explicitSpec);
    const infos = new Set<string>();
    const walk = (n: typeof g.root) => { if (n.t === "decision") { infos.add(n.info); n.children.forEach(walk); } else if (n.t === "chance") n.outcomes.forEach(o => walk(o.child)); };
    walk(g.root);
    expect(new Set(v.infoKeys())).toEqual(infos);
  });

  it("stratégie uniforme : mêmes valeurs par joueur que l'arbre explicite (distribution jointe et gains exacts)", () => {
    const v = new VRiver3(vspec);
    const g = river3(explicitSpec);
    const a = v.expectedValues(v.uniform()), b = expectedValues(g, uniformProfile());
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 8));
  });

  it("après CFR : la stratégie trouvée, rejouée dans l'arbre explicite, donne les mêmes valeurs et la même NashConv", () => {
    const v = new VRiver3(vspec);
    v.run(1000);
    const prof = v.averageProfile();
    const g = river3(explicitSpec);
    const explicit = v.toExplicit(prof);
    const a = v.expectedValues(prof), b = expectedValues(g, explicit);
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 8));
    expect(v.nashConv(prof)).toBeCloseTo(nashConv(g, explicit), 8);
    expect(v.nashConv(prof)).toBeLessThan(0.001 * vspec.potBB);
  });
});

describe("river à 3 par vecteurs : arbre riche (plusieurs tailles, relances, tapis)", () => {
  const rich: VSpec = { ...vspec, bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3, stacks: [40, 100, 100], rake: CASH_RAKE };
  it("la somme des gains vaut -rake à chaque fin de main, pour toutes les distributions possibles", () => {
    const v = new VRiver3(rich);
    expect(v.terminalCount()).toBeGreaterThan(30);
    const worst = v.conservationCheck();
    expect(worst.maxExcess).toBeLessThanOrEqual(1e-9);   // jamais plus que 0
    expect(worst.maxRake).toBeLessThanOrEqual(3 + 1e-9); // jamais plus que le plafond
  });
  it("tapis égaux, sans rake : NashConv sous 0,1 % du pot", () => {
    const v = new VRiver3({ ...rich, stacks: [100, 100, 100], rake: null });
    v.run(1500);
    expect(v.nashConv(v.averageProfile())).toBeLessThan(0.001 * rich.potBB);
  }, 60000); // ~3 s seul, plus quand toute la suite tourne en parallèle
});
