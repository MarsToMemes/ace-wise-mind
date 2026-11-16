import { describe, it, expect } from "vitest";
import { calculateGeometricSizing } from "@/engines/geometricSizing";
import { calculateAlpha } from "@/engines/alphaEngine";
import { optimalBluffToValueRatio } from "@/lib/pokerEngine";

describe("Geometric stack-off", () => {
  it("bet fraction is ((Pf/Pi)^(1/N) - 1) / 2 and stacks off exactly on the last street", () => {
    const r = calculateGeometricSizing({ currentPotBB: 10, heroStackBB: 100, villainStackBB: 100, streetsRemaining: 3 });
    const g = Math.pow(210 / 10, 1 / 3);
    expect(r.growthRate).toBeCloseTo((g - 1) / 2, 6); // ~0.879
    expect(r.streets[0].betSizeBB).toBeCloseTo(8.8, 1);
    expect(r.streets[1].betSizeBB).toBeCloseTo(24.3, 1);
    expect(r.streets[2].betSizeBB).toBeCloseTo(66.9, 1);
    expect(r.streets[2].stackAfterBB).toBeCloseTo(0, 1);
    expect(r.streets[2].potAfterBB).toBeCloseTo(210, 1);
  });

  it("single street = jam the whole stack", () => {
    const r = calculateGeometricSizing({ currentPotBB: 10, heroStackBB: 50, villainStackBB: 80, streetsRemaining: 1 });
    expect(r.streets[0].betSizeBB).toBeCloseTo(50, 1);
    expect(r.growthRate).toBeCloseTo(5, 6);
  });
});

describe("Bluff-to-value ratio", () => {
  it("bluffs per value bet equals alpha = s/(1+s)", () => {
    const a = calculateAlpha(7, 10); // s = 0.7
    expect(a.bluffsPerValueBet).toBeCloseTo(0.7 / 1.7, 6);
    expect(a.bluffToValueRatio).toBe("1 bluff per 2.4 value bets");
  });

  it("pot-sized bet → 1 bluff per 2 value bets", () => {
    expect(calculateAlpha(10, 10).bluffToValueRatio).toBe("1 bluff per 2.0 value bets");
    expect(optimalBluffToValueRatio(0.5).bluffs).toBe(5); // 5 bluffs for 10 value
  });
});
