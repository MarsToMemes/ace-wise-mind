import { describe, it, expect } from "vitest";
import { CASH_RAKE, rakeOf, rakeLabel } from "@/core/rake";

describe("règle de rake cash", () => {
  it("5 % du pot, plafonné à 3 bb, rien sans flop", () => {
    expect(CASH_RAKE).toEqual({ pct: 5, capBB: 3, noFlopNoDrop: true });
  });
  it("prend 5 % d'un petit pot", () => {
    expect(rakeOf(10, CASH_RAKE)).toBeCloseTo(0.5, 9);
  });
  it("s'arrête au plafond", () => {
    expect(rakeOf(100, CASH_RAKE)).toBe(3);
  });
  it("sans règle (tournoi) : aucun rake", () => {
    expect(rakeOf(100)).toBe(0);
  });
  it("sans plafond : toujours le pourcentage", () => {
    expect(rakeOf(200, { pct: 5, capBB: null })).toBe(10);
  });
  it("se lit en français", () => {
    expect(rakeLabel(CASH_RAKE)).toBe("5 % plafonné à 3 bb, rien sur un pot gagné avant le flop");
  });
});
