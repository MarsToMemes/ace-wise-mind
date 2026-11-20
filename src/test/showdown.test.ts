import { describe, it, expect } from "vitest";
import { parseCards, strengthAt, buildShowdownRecord, showdownInsights, equityByStreet, showdownSeats } from "@/engines/showdown";
import type { PlayerAction } from "@/components/ActionMenu";

const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });

describe("parseCards", () => {
  it("reads many formats", () => {
    expect(parseCards("AhJd")).toEqual(["Ah", "Jd"]);
    expect(parseCards("ah jd")).toEqual(["Ah", "Jd"]);
    expect(parseCards("A♥ J♦")).toEqual(["Ah", "Jd"]);
    expect(parseCards("10s9s")).toEqual(["Ts", "9s"]);
    expect(parseCards("AhAh")).toBeNull();
    expect(parseCards("AJ")).toBeNull();
  });
});

describe("strengthAt", () => {
  const board = ["Ks", "8d", "3c", "2h", "9s"];
  it("classifies value, medium and bluff", () => {
    expect(strengthAt(["Kh", "Qd"], board)).toBe("value");   // top paire
    expect(strengthAt(["8h", "7d"], board)).toBe("medium");  // paire moyenne
    expect(strengthAt(["Qh", "Jd"], board)).toBe("bluff");   // rien
    expect(strengthAt(["9h", "8c"], board)).toBe("value");   // deux paires
  });
});

describe("buildShowdownRecord + insights", () => {
  // 0 = héros BTN, 1 = vilain BB
  const board = ["Ks", "8d", "3c", "2h", "9s"];
  const actions = [
    A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Call", 1.5),
    A(1, "Flop", "Check"), A(0, "Flop", "Bet", 2), A(1, "Flop", "Call", 2),
    A(1, "Turn", "Check"), A(0, "Turn", "Check"),
    A(1, "River", "Bet", 7), A(0, "River", "Call", 7),
  ];
  it("records the villain's line with sizes and strength", () => {
    const r = buildShowdownRecord(["Qh", "Jd"], 1, "BB", actions, board, 1.5);
    expect(r.handClass).toBe("QJo");
    const river = r.events.find(e => e.street === "River")!;
    expect(river.sizePct).toBe(Math.round((7 / 9.5) * 100)); // pot avant la mise : 1,5 + 2,5 + 1,5 + 2 + 2
    expect(river.strength).toBe("bluff");
    expect(r.line).toContain("river mise");
  });

  it("counts big river bluffs and light calls", () => {
    const bluff = buildShowdownRecord(["Qh", "Jd"], 1, "BB", actions, board);
    const value = buildShowdownRecord(["Kh", "Qd"], 1, "BB", actions, board);
    const ins = showdownInsights([bluff, bluff, value, { cards: "AJo", line: "ancienne note" }]);
    expect(ins.bigRiverBets).toBe(3);
    expect(ins.bigRiverBluffs).toBe(2);
    expect(ins.lines[0]).toContain("2 bluffs sur 3");
    expect(ins.lines[0]).toContain("paie plus large");
  });
});

describe("equityByStreet", () => {
  it("gives exact equities against known cards", () => {
    const eq = equityByStreet(["Ah", "Kd"], ["Qh", "Jd"], ["Ks", "8d", "3c", "2h", "9s"]);
    expect(eq.map(e => e.street)).toEqual(["Préflop", "Flop", "Turn", "River"]);
    expect(eq[3].equity).toBe(100);
    expect(eq[2].equity).toBeGreaterThan(85);
  });
});

describe("showdownSeats (qui peut montrer ses cartes)", () => {
  const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
  const none = Array(6).fill(false);
  it("lists players who only acted after the flop (hand entered from the flop)", () => {
    const acts = [A(5, "Flop", "Check"), A(2, "Flop", "Bet", 5), A(3, "Flop", "Call", 5), A(5, "Flop", "Call", 5)];
    expect(showdownSeats(acts, none, 5)).toEqual([2, 3]);
  });
  it("leaves out you and anyone who folded, on any street", () => {
    const acts = [A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Call", 2.5), A(5, "Preflop", "Call", 1.5), A(1, "Turn", "Fold")];
    const folded = [false, false, false, false, true, false];
    expect(showdownSeats(acts, folded, 5)).toEqual([0]);
  });
  it("with no action entered, offers every player still seated", () => {
    expect(showdownSeats([], [false, true, false, false, false, false], 3)).toEqual([0, 2, 4, 5]);
  });
});
