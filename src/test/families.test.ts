import { describe, it, expect } from "vitest";
import { emptyCounters, addCounters, applyQuickEvent, Counters, HandFlags, QuickEvent, familyOf, referenceGaps } from "@/engines/playerStats";

function play(n: number, seq: QuickEvent[]): Counters {
  let c = emptyCounters();
  for (let i = 0; i < n; i++) {
    let f: HandFlags = {};
    for (const ev of seq) { const r = applyQuickEvent(f, ev); if (r) { c = addCounters(c, r.delta); f = r.flags; } }
  }
  return c;
}
const mix = (...parts: Counters[]) => parts.reduce((a, b) => addCounters(a, b), emptyCounters());

describe("families", () => {
  it("passive recreational: plays a lot, raises little", () => {
    expect(familyOf(mix(play(40, ["limp", "callCbet", "showdown"]), play(20, ["foldPre"])))).toBe("recPassif");
  });
  it("aggressive recreational: plays a lot, 3-bets and bets big", () => {
    expect(familyOf(mix(play(30, ["threeBet", "bigBet", "bigBet"]), play(15, ["open", "cbet", "bigBet"]), play(15, ["foldPre"])))).toBe("recAgressif");
  });
  it("nit and competent regular", () => {
    expect(familyOf(mix(play(8, ["open", "cbet"]), play(52, ["foldPre"])))).toBe("regSerre");
    expect(familyOf(mix(play(14, ["open", "cbet"]), play(2, ["callOpen"]), play(44, ["foldPre"])))).toBe("regCompetent");
  });
  it("unknown below 5 hands", () => {
    expect(familyOf(play(3, ["limp"]))).toBe("inconnu");
  });
});

describe("reference gaps", () => {
  it("flags a player who never 3-bets and folds too much to c-bets", () => {
    const c = mix(play(40, ["callOpen", "foldToCbet"]), play(40, ["foldPre"]));
    const gaps = referenceGaps(c);
    expect(gaps.find(g => g.stat === "threeBet")?.dir).toBe("low");
    expect(gaps.find(g => g.stat === "foldCbet")?.dir).toBe("high");
  });
  it("needs enough occasions", () => {
    expect(referenceGaps(play(4, ["callOpen", "foldToCbet"]))).toEqual([]);
  });
});
