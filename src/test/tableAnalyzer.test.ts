import { describe, it, expect } from "vitest";
import { analyzeTable, SeatInfo } from "@/engines/tableAnalyzer";
import { emptyCounters, addCounters, applyQuickEvent, Counters, HandFlags, QuickEvent } from "@/engines/playerStats";

function play(n: number, seq: QuickEvent[]): Counters {
  let c = emptyCounters();
  for (let i = 0; i < n; i++) {
    let f: HandFlags = {};
    for (const ev of seq) { const r = applyQuickEvent(f, ev); if (r) { c = addCounters(c, r.delta); f = r.flags; } }
  }
  return c;
}
const fish = (name: string, hands = 60): SeatInfo => ({ name, counters: addCounters(play(Math.round(hands * 0.7), ["limp", "callCbet", "showdown"]), play(Math.round(hands * 0.3), ["foldPre"])) });
const reg = (name: string): SeatInfo => ({ name, counters: addCounters(addCounters(play(14, ["open", "cbet"]), play(2, ["callOpen"])), play(44, ["foldPre"])) });

describe("analyzeTable (6 seats, hero = seat 3)", () => {
  it("excellent when a recreational sits just to hero's right", () => {
    const a = analyzeTable(6, 3, { 2: fish("Fishou"), 0: reg("A"), 1: reg("B") });
    expect(a.grade).toBe("excellente");
    expect(a.rightSeat).toBe(2);
  });

  it("good with two recreationals elsewhere, suggests the seat left of the best fish", () => {
    const a = analyzeTable(6, 3, { 0: fish("F1"), 5: fish("F2", 30), 1: reg("B") });
    expect(a.grade).toBe("bonne");
    expect(a.bestSeat).toBe(1); // à gauche de F1 (siège 0), qui a le plus de mains
  });

  it("average with one recreational not on the right", () => {
    const a = analyzeTable(6, 3, { 0: fish("F1"), 1: reg("B"), 2: reg("C") });
    expect(a.grade).toBe("moyenne");
    expect(a.bestSeat).toBe(1);
  });

  it("leave when only regulars are known", () => {
    expect(analyzeTable(6, 3, { 0: reg("A"), 1: reg("B"), 2: reg("C") }).grade).toBe("quitter");
  });

  it("unknown when hero seat or players are missing", () => {
    expect(analyzeTable(6, -1, {}).grade).toBe("inconnue");
    expect(analyzeTable(6, 3, { 0: reg("A") }).grade).toBe("inconnue");
  });
});
