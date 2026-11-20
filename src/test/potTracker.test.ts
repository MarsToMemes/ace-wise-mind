import { describe, it, expect } from "vitest";
import { trackPot } from "@/lib/potTracker";
import type { PlayerAction } from "@/components/ActionMenu";

// Table 6 places : 0 UTG, 1 MP, 2 CO, 3 BTN, 4 SB, 5 BB
const blinds = { sbIdx: 4, bbIdx: 5 };
const P = (seatIdx: number, type: PlayerAction["type"], amountBB = 0, street: PlayerAction["street"] = "Preflop"): PlayerAction =>
  ({ seatIdx, street, type, amountBB });

describe("trackPot", () => {
  it("blinds are posted: 1.5 bb in the middle, UTG must pay 1, SB 0.5, BB nothing", () => {
    const s = trackPot([], { blinds }, "Preflop");
    expect(s.pot).toBe(1.5);
    expect(s.currentBet).toBe(1);
    expect(s.toCall(0)).toBe(1);
    expect(s.toCall(4)).toBe(0.5);
    expect(s.toCall(5)).toBe(0);
  });

  it("UTG opens 2.5, folds to BB who calls: 5.5 bb on the flop (audit example)", () => {
    const acts = [P(0, "Raise", 2.5), P(1, "Fold"), P(2, "Fold"), P(3, "Fold"), P(4, "Fold"), P(5, "Call", 1.5)];
    expect(trackPot(acts, { blinds }, "Flop").pot).toBe(5.5);
  });

  it("BB facing the 2.5 open pays 1.5, not 2.5", () => {
    const s = trackPot([P(0, "Raise", 2.5)], { blinds }, "Preflop");
    expect(s.toCall(5)).toBe(1.5);
    expect(s.pot).toBe(4);
  });

  it("a call adds what was left to pay (as the table menu records it): open 2.5 then call the 7.5 3-bet = 5", () => {
    const acts = [P(0, "Raise", 2.5), P(3, "Raise", 7.5), P(4, "Fold"), P(5, "Fold"), P(0, "Call", 5)];
    // 7.5 + 7.5 + blindes 1.5
    expect(trackPot(acts, { blinds }, "Flop").pot).toBe(16.5);
  });

  it("a facing bet on the flop: pot includes the bet, to-call is the bet", () => {
    const acts = [P(0, "Raise", 2.5), P(5, "Call", 1.5), P(5, "Check", 0, "Flop"), P(0, "Bet", 3, "Flop")];
    const s = trackPot(acts, { blinds }, "Flop");
    expect(s.pot).toBe(8.5);
    expect(s.toCall(5)).toBe(3);
    expect(s.currentBet).toBe(3);
  });

  it("a re-raise counts only the extra chips: open 2.5, 3-bet 7.5, 4-bet to 17.2 = 14.7 more", () => {
    const acts = [P(0, "Raise", 2.5), P(3, "Raise", 7.5), P(4, "Fold"), P(5, "Fold"), P(0, "Raise", 17.2)];
    expect(trackPot(acts, { blinds }, "Preflop").pot).toBe(26.2);
  });

  it("contributions restart on each street", () => {
    const acts = [P(0, "Raise", 2.5), P(5, "Call", 1.5), P(5, "Bet", 3, "Flop"), P(0, "Call", 3, "Flop")];
    const s = trackPot(acts, { blinds }, "Turn");
    expect(s.pot).toBe(11.5);
    expect(s.currentBet).toBe(0);
    expect(s.toCall(0)).toBe(0);
  });

  it("a hand entered from the flop starts from the pot typed by hand", () => {
    const s = trackPot([P(0, "Bet", 5, "Flop")], { startPot: 10 }, "Flop");
    expect(s.pot).toBe(15);
    expect(s.toCall(5)).toBe(5);
  });

  it("without the dealer, preflop dead money is the blinds (1.5)", () => {
    const s = trackPot([P(0, "Raise", 2.5), P(5, "Call", 2.5)], { startPot: 1.5 }, "Flop");
    expect(s.pot).toBe(6.5);
  });

  it("each step gives the pot before the action and the chips added", () => {
    const acts = [P(0, "Raise", 2.5), P(5, "Call", 1.5), P(5, "Check", 0, "Flop"), P(0, "Bet", 3, "Flop")];
    const s = trackPot(acts, { blinds }, "Flop");
    expect(s.steps.map(x => [x.potBefore, x.added])).toEqual([[1.5, 2.5], [4, 1.5], [5.5, 0], [5.5, 3]]);
  });
});
