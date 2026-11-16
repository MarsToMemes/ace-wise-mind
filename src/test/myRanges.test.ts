import { describe, it, expect, beforeEach } from "vitest";
import {
  parseRangeText, rangeToText, countCombos, ALL_HANDS,
  loadMyRanges, saveMyRange, clearMyRange, exportMyRanges, importMyRanges,
} from "@/engines/myRanges";

describe("parseRangeText", () => {
  it("22+ = all 13 pairs", () => {
    const r = parseRangeText("22+");
    expect(Object.keys(r).length).toBe(13);
    expect(r["AA"]).toBe(1);
  });
  it("A2s+ = A2s..AKs", () => {
    const r = parseRangeText("A2s+");
    expect(Object.keys(r).sort()).toEqual(["A2s","A3s","A4s","A5s","A6s","A7s","A8s","A9s","AJs","AKs","AQs","ATs"].sort());
  });
  it("is case-insensitive", () => {
    expect(Object.keys(parseRangeText("a5s-a3s, kqo")).sort()).toEqual(["A3s", "A4s", "A5s", "KQo"]);
  });
  it("KTo+ = KTo, KJo, KQo", () => {
    expect(Object.keys(parseRangeText("KTo+")).sort()).toEqual(["KJo", "KQo", "KTo"]);
  });
  it("AK = AKs + AKo; 77-55 = 77, 66, 55", () => {
    expect(Object.keys(parseRangeText("AK")).sort()).toEqual(["AKo", "AKs"]);
    expect(Object.keys(parseRangeText("77-55")).sort()).toEqual(["55", "66", "77"]);
  });
  it("weights with :50 and ignores junk", () => {
    const r = parseRangeText("AKo:50, QQ, zz, A5s-A3s");
    expect(r["AKo"]).toBe(0.5);
    expect(r["QQ"]).toBe(1);
    expect(Object.keys(r).sort()).toEqual(["A3s", "A4s", "A5s", "AKo", "QQ"]);
  });
  it("round-trips through text", () => {
    const r = parseRangeText("JJ+, AQs+, AKo, T9s:50");
    expect(parseRangeText(rangeToText(r))).toEqual(r);
  });
});

describe("countCombos", () => {
  it("AA + AKs = 10, all hands = 1326", () => {
    expect(countCombos({ AA: 1, AKs: 1 })).toBe(10);
    expect(countCombos({ AKo: 0.5 })).toBe(6);
    expect(countCombos(Object.fromEntries(ALL_HANDS.map(h => [h, 1])))).toBe(1326);
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());
  it("saves, loads, clears, exports and imports", () => {
    saveMyRange("open:UTG", { AA: 1 });
    expect(loadMyRanges()["open:UTG"]).toEqual({ AA: 1 });
    const json = exportMyRanges();
    clearMyRange("open:UTG");
    expect(loadMyRanges()["open:UTG"]).toBeUndefined();
    expect(importMyRanges(json)).toBe(1);
    expect(loadMyRanges()["open:UTG"]).toEqual({ AA: 1 });
    expect(importMyRanges("pas du json")).toBe(0);
  });
});
