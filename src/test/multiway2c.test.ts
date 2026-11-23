import { describe, it, expect } from "vitest";
import { VRiver3, fromRiverSpec, type VSpec } from "@/engines/multiway/vriver3";
import { MICRO_RIVER, river3 } from "@/engines/multiway/river3";
import { nashConv } from "@/engines/multiway/bestResponse";
import { CASH_RAKE } from "@/core/rake";

// Discounted CFR (thèse de N. Brown, §3.1) : regrets positifs × t^1,5/(t^1,5+1), négatifs × 1/2,
// contribution à la stratégie moyenne × ((t−1)/t)². Mêmes réglages que le solveur tête-à-tête (endgame/cfr.ts).
const micro = fromRiverSpec({ ...MICRO_RIVER, rake: CASH_RAKE });
const rich: VSpec = { ...micro, bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3, rake: null };

describe("étape 2c : Discounted CFR dans le solveur river à 3", () => {
  it("DCFR est le calcul par défaut (D18) ; CFR+ reste disponible", () => {
    expect(new VRiver3(micro).algo).toBe("dcfr");
    expect(new VRiver3(micro, { algo: "cfr+" }).algo).toBe("cfr+");
  });

  it("calcul avec contrôles : garde la stratégie à la plus faible NashConv mesurée (cas tapis court + rake, D15)", () => {
    const s = { ...micro, stacks: [15, 100, 100] };
    const v = new VRiver3(s);
    const res = v.solve(3000, 250);
    expect(res.checks.length).toBe(12);
    const best = Math.min(...res.checks.map(c => c.nashConv));
    expect(res.nashConv).toBe(best);
    expect(v.nashConv(res.profile)).toBeCloseTo(best, 12);
    expect(res.nashConv).toBeLessThanOrEqual(v.nashConv(v.averageProfile()) + 1e-12);
    expect(res.iterations).toBe(res.checks.find(c => c.nashConv === best)!.iterations);
    expect(res.nashConv).toBeLessThan(0.001 * s.potBB);
  });

  it("DCFR : la stratégie trouvée, rejouée dans l'arbre explicite de l'étape 1, a la même NashConv, sous 0,1 % du pot", () => {
    const v = new VRiver3(micro, { algo: "dcfr" });
    v.run(1000);
    const prof = v.averageProfile();
    const nc = v.nashConv(prof);
    expect(nashConv(river3({ ...MICRO_RIVER, rake: CASH_RAKE }), v.toExplicit(prof))).toBeCloseTo(nc, 8);
    expect(nc).toBeLessThan(0.001 * micro.potBB);
  });

  it("DCFR, arbre riche à tapis égaux sans rake : NashConv sous 0,1 % du pot en 1 500 itérations", () => {
    const v = new VRiver3(rich, { algo: "dcfr" });
    v.run(1500);
    expect(v.nashConv(v.averageProfile())).toBeLessThan(0.001 * rich.potBB);
  }, 60000);
});
