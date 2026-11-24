import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { SolverGame } from "@/engines/solverSpots";
import { VRiver3, fromRiverSpec, type VSpec } from "@/engines/multiway/vriver3";
import { MICRO_RIVER } from "@/engines/multiway/river3";
import { riverSpot3 } from "@/engines/multiway/riverSpot3";
import { CASH_RAKE } from "@/core/rake";

// Accélérations (D20). Réécriture sans changer les opérations : mêmes résultats au bit près que le solveur d'avant
// (référence figée dans fixtures/vriver3-reference.json, cas « rich » : valeurs, NashConv et stratégie moyenne).
// Le nouveau calcul des fins de main change l'ordre des additions : écart de l'ordre de 1e-13 en relatif, qui suffit à
// faire diverger la trajectoire de CFR (regrets à égalité). On vérifie donc sa justesse contre le calcul exact
// (multiway2b) et sa qualité ici : même précision atteinte que la référence, à itérations égales.
const ref = JSON.parse(readFileSync(resolve(__dirname, "fixtures/vriver3-reference.json"), "utf8"));
const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
const A = (seatIdx: number, type: string, amountBB = 0) => ({ seatIdx, street: "Preflop", type, amountBB });
const specs: Record<string, VSpec> = {
  rich: { ...fromRiverSpec(MICRO_RIVER), bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3, stacks: [40, 100, 100], rake: CASH_RAKE },
  real: riverSpot3(g, { preflop: [A(2, "Raise", 2.5), A(3, "Call"), A(5, "Call")], board: ["Kh", "9d", "4c", "7s", "2h"], potBB: 8, stacks: { 2: 97.5, 3: 40, 5: 97.5 }, sizes: { bets: [0.5, 1], maxAggr: 2 } })!.spec,
};

describe("D20 : les accélérations ne changent pas les résultats", () => {
  for (const name of ["rich"]) it(`même stratégie, mêmes valeurs, même NashConv que la référence (${name})`, () => {
    const r = ref[name], v = new VRiver3(specs[name]);
    v.run(r.iterations);
    const p = v.averageProfile(), s = [...p.values()].flatMap(a => Array.from(a));
    expect(s.length).toBe(r.n);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(r.sum, 6);
    expect(s.reduce((a, b, i) => a + b * ((i % 997) + 1), 0)).toBeCloseTo(r.wsum, 4);
    s.filter((_, i) => i % 53 === 0).forEach((x, k) => expect(x).toBeCloseTo(r.sample[k], 8));
    v.expectedValues(p).forEach((x, i) => expect(x).toBeCloseTo(r.ev[i], 8));
    expect(v.nashConv(p)).toBeCloseTo(r.nashConv, 8);
  }, 120000);
});

import { VRiver3Parallel, inProcessPool } from "@/engines/multiway/vparallel";

describe("D20 : nouveau calcul des fins de main, même qualité", () => {
  // Sensibilité mesurée : l'ancien calcul, perturbé de 1e-12 en relatif, finit entre 0,0072 et 0,0090 à 400 itérations
  // (realAt400Band). On exige la même précision que lui, avec cette marge de trajectoire (×1,3).
  it("vraies ranges : NashConv en baisse régulière, et aussi bonne que l'ancien calcul au bout de 400 itérations", () => {
    const v = new VRiver3(specs.real);
    const nc = [100, 200, 300, 400].map(() => { v.run(100); return v.nashConv(v.averageProfile()); });
    nc.slice(1).forEach((x, k) => expect(x).toBeLessThan(nc[k]));
    expect(nc[3]).toBeLessThan(ref.realAt400 * 1.3);
  }, 300000);
});

describe("D20 : calcul réparti entre plusieurs ouvriers", () => {
  for (const [name, depth, workers] of [["rich", 1, 3], ["rich", 2, 4], ["real", undefined, 3]] as const) {
    it(`mêmes regrets, même stratégie et même NashConv que le calcul d'un seul tenant (${name}, profondeur ${depth ?? "auto"}, ${workers} ouvriers)`, async () => {
      const seq = new VRiver3(specs[name]);
      const par = new VRiver3Parallel(specs[name], inProcessPool(workers), { depth });
      await par.init();
      seq.run(8); await par.run(8);
      const a = seq.averageProfile(), b = await par.averageProfile();
      expect(b.size).toBe(a.size);
      let worst = 0;
      a.forEach((s, id) => s.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - b.get(id)![k])); }));
      expect(worst).toBe(0);
      expect(await par.nashConv()).toBeCloseTo(seq.nashConv(a), 10);
      (await par.expectedValues()).forEach((x, i) => expect(x).toBeCloseTo(seq.expectedValues(a)[i], 10));
    }, 120000);
  }

  it("solve réparti : garde la meilleure stratégie mesurée, comme le calcul d'un seul tenant", async () => {
    const seq = new VRiver3(specs.rich), par = new VRiver3Parallel(specs.rich, inProcessPool(3));
    await par.init();
    const r1 = seq.solve(60, 20), r2 = await par.solve(60, 20);
    expect(r2.checks.map(c => c.nashConv)).toEqual(r1.checks.map(c => c.nashConv).map(x => expect.closeTo(x, 10)));
    expect(r2.iterations).toBe(r1.iterations);
    let worst = 0;
    r1.profile.forEach((s, id) => s.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - r2.profile.get(id)![k])); }));
    expect(worst).toBe(0);
  }, 120000);
});
