import { describe, it, expect } from "vitest";
import { adviseCbet } from "@/engines/cbetAdvisor";
import { analyzeBoard } from "@/engines/boardTexture";

const adv = (eq: number, pfrStrong: number, callerStrong: number) => ({
  pfrEquity: eq, pfrStrongPct: pfrStrong, callerStrongPct: callerStrong, pfrCombos: 100, callerCombos: 300, samples: 4000,
});

describe("adviseCbet", () => {
  it("equity edge on a static board, in position → frequent small c-bet", () => {
    const a = adviseCbet({ texture: analyzeBoard(["As", "7d", "2c"]), adv: adv(0.56, 4, 3), pfrInPosition: true, potType: "srp" });
    expect(a.frequencyPct).toBeGreaterThanOrEqual(70);
    expect(a.size).toBe("25-33%");
    expect(a.checkMostly).toBe(false);
  });

  it("nut edge on a dynamic board → bigger polar c-bet", () => {
    const a = adviseCbet({ texture: analyzeBoard(["Qh", "Jh", "Ts"]), adv: adv(0.6, 30, 15), pfrInPosition: true, potType: "srp" });
    expect(a.size).toBe("66-75%");
  });

  it("no edge on a dynamic board out of position → check mostly", () => {
    const a = adviseCbet({ texture: analyzeBoard(["9h", "8h", "7c"]), adv: adv(0.46, 9, 19), pfrInPosition: false, potType: "srp" });
    expect(a.frequencyPct).toBeLessThanOrEqual(35);
    expect(a.checkMostly).toBe(true);
  });

  it("donk bet only when the caller acts first with the nut edge on a middle/low board", () => {
    const t = analyzeBoard(["9h", "8h", "7c"]);
    expect(adviseCbet({ texture: t, adv: adv(0.5, 9, 12), pfrInPosition: true, potType: "srp" }).donk.suggested).toBe(true);
    expect(adviseCbet({ texture: t, adv: adv(0.5, 9, 12), pfrInPosition: false, potType: "srp" }).donk.suggested).toBe(false);
    expect(adviseCbet({ texture: analyzeBoard(["As", "Kd", "7c"]), adv: adv(0.5, 3, 8), pfrInPosition: true, potType: "srp" }).donk.suggested).toBe(false);
  });

  it("3-bet pots size one notch smaller", () => {
    const t = analyzeBoard(["As", "7d", "2c"]);
    expect(adviseCbet({ texture: t, adv: adv(0.6, 4, 3), pfrInPosition: true, potType: "3bet" }).size).toBe("20-25%");
  });

  it("frequency is clamped to 20..90 and rounded to 5", () => {
    const hi = adviseCbet({ texture: analyzeBoard(["As", "7d", "2c"]), adv: adv(0.9, 40, 1), pfrInPosition: true, potType: "srp" });
    expect(hi.frequencyPct).toBe(90);
    const lo = adviseCbet({ texture: analyzeBoard(["9h", "8h", "7c"]), adv: adv(0.2, 1, 30), pfrInPosition: false, potType: "srp" });
    expect(lo.frequencyPct).toBe(20);
    expect(hi.frequencyPct % 5).toBe(0);
  });
});
