import { describe, it, expect } from "vitest";
import { baseEquity, handKey } from "@/lib/baseEquity";
import type { OpponentRange } from "@/lib/rangeInference";

// Moteur de base : l'équité ne doit plus valoir 0 avant le flop (règle des outs ×4 / ×2 réservée au flop et à la turn).
const strong: OpponentRange = { seatIdx: 0, estimatedStrength: 90, rangeType: "linear", bluffFrequency: 0.05, notes: [] };

describe("équité du moteur de base", () => {
  it("nom de main : A♥Q♥ → AQs, Q♠Q♦ → QQ, 7♣A♦ → A7o", () => {
    expect(handKey(["Ah", "Qh"])).toBe("AQs");
    expect(handKey(["Qs", "Qd"])).toBe("QQ");
    expect(handKey(["7c", "Ad"])).toBe("A7o");
  });
  it("avant le flop, sans range adverse : équité contre une main au hasard (AQs : 66,5 %), pas 0", () => {
    expect(baseEquity(["Ah", "Qh"], [], 0, []).equityPct).toBe(66.5);
  });
  it("avant le flop, face à une range adverse déduite des actions : équité simulée contre elle (tirage aléatoire, ±4 pts), plus 0", () => {
    const r = baseEquity(["Ah", "Qh"], [], 0, [strong]);
    expect(r.vsRange).not.toBeNull();
    expect(r.equityPct).toBeGreaterThan(20);
    expect(r.equityPct).toBeLessThan(90);
  });
  it("au flop sans range adverse : la règle des outs reste utilisée", () => {
    expect(baseEquity(["Ah", "Qh"], ["2h", "7h", "Kc"], 9, []).equityPct).toBe(36);
  });
});
