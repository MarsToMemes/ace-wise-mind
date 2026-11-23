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
  it("CFR+ reste le calcul par défaut ; DCFR se choisit explicitement", () => {
    expect(new VRiver3(micro).algo).toBe("cfr+");
    expect(new VRiver3(micro, { algo: "dcfr" }).algo).toBe("dcfr");
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
