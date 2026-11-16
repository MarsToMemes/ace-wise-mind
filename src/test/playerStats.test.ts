import { describe, it, expect } from "vitest";
import {
  emptyCounters, addCounters, estimate, classify, tendencies, countAnalyzedHand,
  applyQuickEvent, Counters, HandFlags, QuickEvent, POPULATION,
} from "@/engines/playerStats";
import type { PlayerAction } from "@/components/ActionMenu";

const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });

/** Joue `n` mains en suivi rapide avec la même séquence d'événements. */
function play(n: number, seq: QuickEvent[]): Counters {
  let c = emptyCounters();
  for (let i = 0; i < n; i++) {
    let flags: HandFlags = {};
    for (const ev of seq) {
      const r = applyQuickEvent(flags, ev);
      if (r) { c = addCounters(c, r.delta); flags = r.flags; }
    }
  }
  return c;
}

describe("countAnalyzedHand", () => {
  // 0 = BTN, 1 = SB, 2 = BB
  const positions = { 0: "BTN", 1: "SB", 2: "BB" };

  it("limp, iso-raise, c-bet and fold to c-bet", () => {
    const r = countAnalyzedHand({
      positions, boardCards: 3,
      actions: [
        A(0, "Preflop", "Call", 1), A(1, "Preflop", "Raise", 7), A(2, "Preflop", "Fold"), A(0, "Preflop", "Call", 6),
        A(1, "Flop", "Bet", 5), A(0, "Flop", "Fold"),
      ],
    });
    expect(r[0]).toMatchObject({ hands: 1, vpip: 1, limpOpp: 1, limp: 1, pfr: 0, foldCbetOpp: 1, foldCbet: 1 });
    expect(r[1]).toMatchObject({ vpip: 1, pfr: 1, limp: 0, cbetOpp: 1, cbet: 1 });
    expect(r[2]).toMatchObject({ vpip: 0, threeBetOpp: 1, threeBet: 0 });
  });

  it("3-bet is counted against a single open", () => {
    const r = countAnalyzedHand({
      positions, boardCards: 0,
      actions: [A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 10), A(0, "Preflop", "Fold")],
    });
    expect(r[2]).toMatchObject({ threeBetOpp: 1, threeBet: 1, pfr: 1 });
    expect(r[1]).toMatchObject({ threeBetOpp: 1, threeBet: 0 });
  });

  it("showdown and small bets", () => {
    const r = countAnalyzedHand({
      positions, boardCards: 5, potStartBB: 1.5,
      actions: [
        A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Call", 1.5),
        A(2, "Flop", "Check"), A(0, "Flop", "Check"),
        A(2, "Turn", "Bet", 1.5), A(0, "Turn", "Call", 1.5),
        A(2, "River", "Bet", 2), A(0, "River", "Call", 2),
      ],
    });
    expect(r[0]).toMatchObject({ cbetOpp: 1, cbet: 0, wtsdOpp: 1, wtsd: 1 });
    expect(r[2]).toMatchObject({ postBets: 2, smallBets: 2, wtsd: 1 });
  });
});

describe("quick tracker", () => {
  it("counts one preflop action per hand and needs it before postflop", () => {
    expect(applyQuickEvent({}, "cbet")).toBeNull();
    const a = applyQuickEvent({}, "open")!;
    expect(applyQuickEvent(a.flags, "limp")).toBeNull();
    const b = applyQuickEvent(a.flags, "cbet")!;
    expect(b.delta).toMatchObject({ cbetOpp: 1, cbet: 1, wtsdOpp: 1 });
    expect(applyQuickEvent(b.flags, "cbet")).toBeNull();
  });
});

describe("estimates and profiles", () => {
  it("few hands stay close to the population average", () => {
    const c = play(3, ["limp"]);
    expect(estimate(c).vpip).toBeLessThan(0.55);
    expect(estimate(emptyCounters()).vpip).toBeCloseTo(POPULATION.vpip, 5);
  });

  it("recognises a fish limper, a station and a nit", () => {
    const fish = play(60, ["limp"]);
    expect(classify(fish).profile).toBe("FishLimper");

    let station = play(30, ["callOpen", "callCbet", "showdown"]);
    station = addCounters(station, play(30, ["foldPre"]));
    station = addCounters(station, play(10, ["open"]));
    expect(classify(station).profile).toBe("Station");

    const nit = addCounters(play(8, ["open"]), play(52, ["foldPre"]));
    expect(classify(nit).profile).toBe("Nit");
    expect(classify(nit).confidence).toBe("bonne");
  });

  it("is unknown and provisional with very few hands", () => {
    const r = classify(play(3, ["open"]));
    expect(r.profile).toBe("Unknown");
    expect(r.provisional).toBe(true);
    expect(r.confidence).toBe("faible");
  });

  it("detects tendencies from the video", () => {
    const t = tendencies(addCounters(play(20, ["open", "cbet"]), play(10, ["callOpen", "smallBet", "smallBet"])));
    expect(t.some(x => x.startsWith("C-bet trop"))).toBe(true);
    expect(t.some(x => x.startsWith("Mises petites répétées"))).toBe(true);
  });
});
