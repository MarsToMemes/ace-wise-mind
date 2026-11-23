import { describe, it, expect } from "vitest";
import type { Node } from "@/engines/multiway/game";
import { river3, river3Payoffs, MICRO_RIVER, type RiverSpec } from "@/engines/multiway/river3";
import { CFR } from "@/engines/multiway/cfr";
import { nashConv } from "@/engines/multiway/bestResponse";
import { CASH_RAKE } from "@/core/rake";

const terminals = (n: Node, out: number[][] = []): number[][] => {
  if (n.t === "terminal") out.push(n.payoffs);
  else if (n.t === "chance") n.outcomes.forEach(o => terminals(o.child, out));
  else n.children.forEach(c => terminals(c, out));
  return out;
};

describe("river à 3 joueurs miniature, vraies cartes", () => {
  it("distributions exactes : jamais de carte partagée, probabilités proportionnelles aux poids (D9)", () => {
    const spec: RiverSpec = { ...MICRO_RIVER, weights: [[1, 1, 1, 2], [1, 1, 1, 1], [1, 1, 1, 1]] };
    const g = river3(spec);
    if (g.root.t !== "chance") throw new Error("racine");
    const total = g.root.outcomes.reduce((t, o) => t + o.p, 0);
    expect(total).toBeCloseTo(1, 12);
    // aucune distribution ne donne deux fois la même carte (ni une carte du board)
    for (const d of g.deals) {
      const cards = [...spec.board, ...d.flat()];
      expect(new Set(cards).size).toBe(cards.length);
    }
    // une main de poids 2 pèse deux fois plus que la même distribution avec une main de poids 1
    const pOf = (c0: number) => g.root.t === "chance" ? g.root.outcomes.filter((_, k) => g.dealIdx[k][0] === c0).reduce((t, o) => t + o.p, 0) : 0;
    const per = (c0: number) => pOf(c0) / g.deals.filter(d => d[0] === spec.ranges[0][c0]).length;
    expect(per(3) / per(0)).toBeCloseTo(2, 9);
  });

  it("bloqueurs : une main qui partage une carte avec un adversaire n'est jamais distribuée avec lui", () => {
    const g = river3(MICRO_RIVER);
    const clash = g.deals.filter(d => d[1].some(c => d[2].includes(c)));
    expect(clash).toEqual([]);
  });

  it("conservation : à chaque fin de main, la somme des gains vaut -rake (gains calculés par le moteur de règles)", () => {
    const g = river3({ ...MICRO_RIVER, rake: CASH_RAKE });
    for (const p of terminals(g.root)) {
      const s = p.reduce((a, b) => a + b, 0);
      expect(s).toBeLessThanOrEqual(1e-9);
      expect(s).toBeGreaterThanOrEqual(-3 - 1e-9);
    }
  });

  it("tapis inégaux : le petit tapis à tapis ne gagne que le pot principal", () => {
    // pot 30 avant la river (10 chacun), tapis restants 20 / 100 / 100 ; J1 mise 40 : J0 paie 20 à tapis, J2 paie 40
    const pay = river3Payoffs({ ...MICRO_RIVER, stacks: [20, 100, 100], rake: null },
      [["Ah", "Kh"], ["Ac", "Ad"], ["Kc", "Qc"]], [20, 40, 40], [false, false, false]);
    // J0 (AK, brelan de rois) bat J2 (KQ) au kicker et J1 (AA) : il gagne le pot principal 30 + 3 × 20 = 90
    // pot annexe 40 : entre J1 et J2 seulement ; J2 (KQ, brelan) bat J1 (AA, deux paires)
    // résultat net de la main (chacun avait mis 10 avant la river) : J0 +90 - 30, J1 0 - 50, J2 +40 - 50
    expect(pay).toEqual([60, -50, -10]);
  });

  it("CFR : NashConv exacte sous 0,1 % du pot (0,03 bb), et en baisse avec les itérations", () => {
    const g = river3({ ...MICRO_RIVER, rake: CASH_RAKE });
    const s = new CFR(g);
    s.run(50);
    const early = nashConv(g, s.averageProfile());
    s.run(1950);
    const late = nashConv(g, s.averageProfile());
    expect(late).toBeLessThan(early);
    expect(late).toBeLessThan(0.001 * MICRO_RIVER.potBB);
  });

  it("tapis court (15/100/100) sans rake : pots annexes dans le jeu, NashConv sous 0,1 % du pot", () => {
    const g = river3({ ...MICRO_RIVER, stacks: [15, 100, 100], rake: null });
    const s = new CFR(g);
    s.run(3000);
    expect(nashConv(g, s.averageProfile())).toBeLessThan(0.001 * MICRO_RIVER.potBB);
  });
});
