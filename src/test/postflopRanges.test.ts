import { describe, it, expect } from "vitest";
import { filterByLine, rangeAdvantage, handPercentile, handEquity, relStrength } from "@/engines/postflopRanges";
import { expandRange } from "@/engines/rangeVsRange";

const board = ["Ks", "8d", "3c"];

describe("postflop ranges", () => {
  it("relative strength counts categories above the board", () => {
    expect(relStrength(["Kh", "Qd"], board)).toBe(1);
    expect(relStrength(["8h", "8c"], board)).toBe(3);
    expect(relStrength(["Ah", "Qd"], board)).toBe(0);
  });

  it("calling a c-bet removes most air, checking back removes strong hands", () => {
    const r = expandRange({ "AQo": 1, "88": 1, "KQs": 1 }, board);
    const weight = (cs: { cards: string[]; w: number }[], hand: string) =>
      cs.filter(c => c.cards[0][0] + c.cards[1][0] === hand.slice(0, 2)).reduce((s, c) => s + c.w, 0);
    const called = filterByLine(r, board, [{ street: "Flop", act: "call" }]);
    expect(weight(called, "AQ")).toBeLessThan(weight(r, "AQ") * 0.2);
    expect(weight(called, "KQ")).toBe(weight(r, "KQ"));
    const checked = filterByLine(r, board, [{ street: "Flop", act: "checkBack" }]);
    expect(weight(checked, "88")).toBeLessThan(weight(r, "88") * 0.3);
  });

  it("sets have the top of the range and big equity", () => {
    const range = expandRange({ "AA": 1, "KQs": 1, "88": 1, "QJs": 1 }, board);
    expect(handPercentile(["8h", "8c"], range, board)).toBeGreaterThan(0.85);
    expect(handPercentile(["Qh", "Jh"], range, board)).toBeLessThan(0.4);
    const villain = expandRange({ "KQo": 1, "AQo": 1 }, board);
    expect(handEquity(["8h", "8c"], villain, board, 1500)).toBeGreaterThan(0.85);
  });

  it("range advantage works on turn and river boards", () => {
    const strong = expandRange({ "KK": 1, "88": 1, "AK": 1 }, []);
    const weak = expandRange({ "76s": 1, "54s": 1, "QJs": 1 }, []);
    const turn = ["Ks", "8d", "3c", "2h"];
    const a = rangeAdvantage(strong, weak, turn, 1500);
    expect(a.heroEquity).toBeGreaterThan(0.7);
    const river = [...turn, "9d"];
    expect(rangeAdvantage(strong, weak, river, 800).heroStrongPct).toBeGreaterThan(a.villainStrongPct);
  });
});
