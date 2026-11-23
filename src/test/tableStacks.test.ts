import { describe, it, expect, beforeEach } from "vitest";
import { effectiveStack, loadStacks, saveStacks, STACKS_KEY } from "@/lib/tableStacks";

describe("tapis effectif", () => {
  it("le plus petit entre toi et le plus gros adversaire encore dans le coup", () => {
    expect(effectiveStack([100, 40, 250, 120, 100, 60], 3, [1, 5])).toBe(60);
    expect(effectiveStack([100, 40, 250, 80, 100, 60], 3, [2])).toBe(80);
  });
});

describe("tapis gardés pour la table", () => {
  beforeEach(() => localStorage.clear());
  it("se relisent pour la même taille de table, sinon 100 bb partout", () => {
    saveStacks([90, 110, 100, 100, 100, 100]);
    expect(loadStacks(6)).toEqual([90, 110, 100, 100, 100, 100]);
    expect(loadStacks(9)).toEqual(Array(9).fill(100));
  });
  it("stockage abîmé : 100 bb partout", () => {
    localStorage.setItem(STACKS_KEY, "{");
    expect(loadStacks(6)).toEqual(Array(6).fill(100));
  });
});
