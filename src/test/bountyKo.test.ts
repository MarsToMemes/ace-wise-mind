import { describe, it, expect } from "vitest";
import { bountyValue, requiredEquity, callChart } from "@/engines/bountyKo";
import { equityVsRange, topPercentRange, estimatedJamPct, EQ_VS_RANDOM } from "@/engines/preflopEquity";

describe("preflop equity", () => {
  it("table matches known equities vs a random hand", () => {
    expect(EQ_VS_RANDOM["AA"]).toBeCloseTo(85.2, 0);
    expect(EQ_VS_RANDOM["72o"]).toBeCloseTo(34.6, 0);
  });
  it("AA vs KK ≈ 82 %", () => {
    expect(equityVsRange("AA", { KK: 1 }, { samples: 4000, seed: 1 })).toBeCloseTo(0.82, 1);
  });
  it("top 10 % starts with pairs and big aces; jam % shrinks with stack", () => {
    const r = topPercentRange(10);
    expect(r["AA"]).toBe(1);
    expect(r["72o"]).toBeUndefined();
    expect(estimatedJamPct(5)).toBeGreaterThan(estimatedJamPct(15));
  });
});

describe("bountyValue", () => {
  const base = { buyIn: 10, bountyPart: 5, startingStack: 20000, bigBlind: 200, villainBounty: 5 };
  it("classic KO: whole bounty, converted to big blinds", () => {
    // 1 jeton = 5 € / 20 000 = 0,00025 € → 5 € = 20 000 jetons = 100 bb
    expect(bountyValue({ ...base, type: "classic", covers: true }).bountyBB).toBeCloseTo(100, 5);
  });
  it("progressive KO: half cash now + discounted half on your head", () => {
    const v = bountyValue({ ...base, type: "progressive", covers: true });
    expect(v.cashNowEur).toBeCloseTo(2.5, 5);
    expect(v.bountyBB).toBeCloseTo(70, 5); // (2,5 + 2,5 × 0,4) € = 3,5 € = 14 000 jetons
  });
  it("no bounty when you don't cover the villain", () => {
    expect(bountyValue({ ...base, type: "classic", covers: false }).bountyBB).toBe(0);
  });
});

describe("requiredEquity", () => {
  it("call 20 into 22: 47.6 % without bounty, 40.8 % with 7 bb bounty", () => {
    expect(requiredEquity(20, 22, 0) * 100).toBeCloseTo(47.6, 1);
    expect(requiredEquity(20, 22, 7) * 100).toBeCloseTo(40.8, 1);
  });
});

describe("callChart", () => {
  it("the bounty turns some folds into calls", () => {
    const jam = topPercentRange(42);
    const c = callChart({ callBB: 10, potBB: 11.5, bountyBB: 8, jamRange: jam, quick: true });
    expect(c.status["AA"]).toBe("call");
    expect(c.status["72o"]).toBe("fold");
    expect(Object.values(c.status).filter(s => s === "bounty").length).toBeGreaterThan(5);
    const none = callChart({ callBB: 10, potBB: 11.5, bountyBB: 0, jamRange: jam, quick: true });
    expect(Object.values(none.status).filter(s => s === "bounty").length).toBe(0);
  });
});
