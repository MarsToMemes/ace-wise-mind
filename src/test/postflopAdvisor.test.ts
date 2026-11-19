import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const base = (p: Partial<PostflopInput> & Pick<PostflopInput, "board" | "hole" | "heroRange" | "villainRange">): PostflopInput => ({
  street: p.board.length === 3 ? "Flop" : p.board.length === 4 ? "Turn" : "River",
  heroInPosition: true, heroIsPfr: true, potBB: 12, toCallBB: 0, heroStackBB: 100, opponents: 1,
  villainCheckedThisStreet: true, samples: 1200, ...p,
});

describe("advisePostflop", () => {
  it("overbets the nuts on the river with a big nut advantage", () => {
    const board = ["As", "Kd", "7c", "2h", "2s"];
    const a = advisePostflop(base({
      board, hole: ["Ah", "Ac"],
      heroRange: R("AA, KK, 77, AK, QJs", board),
      villainRange: R("KQo, KJo, QJo, 99, T9s", board),
    }));
    expect(a.action).toBe("overbet");
    expect(a.sizePct).toBe(150);
    expect(a.sizeBB).toBe(18);
    expect(a.role).toBe("nuts");
  });

  it("donk bets the turn when the card favours the caller", () => {
    const board = ["8d", "6c", "2h", "5s"];
    const a = advisePostflop(base({
      board, hole: ["7h", "4h"], heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, prevVillain: "bet", prevHero: "call",
      heroRange: R("76s, 74s, 43s, 97s, 88, 66", board),
      villainRange: R("AA, KK, QQ, AK, AQs, KQs", board),
    }));
    expect(a.action).toBe("donk");
  });

  it("probes after the aggressor checked back", () => {
    const board = ["Qd", "7c", "3h", "9s"];
    const a = advisePostflop(base({
      board, hole: ["Qh", "Ts"], heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, prevVillain: "checkBack", prevHero: "checkFirst",
      heroRange: R("QT, Q9s, 77, T9s, A7s", board),
      villainRange: R("AK, AJ, KJ, 55, 44", board),
    }));
    expect(a.action).toBe("probe");
  });

  it("checks to raise a strong hand against an aggressive player when it has no edge", () => {
    const board = ["Kh", "9d", "4c"];
    const a = advisePostflop(base({
      board, hole: ["9h", "9s"], heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, villainAggressive: true,
      heroRange: R("99, KQ, QJ, JT, 65s, A5s", board),
      villainRange: R("KK, AK, AA, KQ, 44", board),
    }));
    expect(a.action).toBe("checkRaise");
  });

  it("block bets a medium hand on the river out of position", () => {
    const board = ["Jh", "8d", "4c", "2s", "3h"];
    const a = advisePostflop(base({
      board, hole: ["Jc", "Td"], street: "River", heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false,
      heroRange: R("JT, J9, 98s, 77, 55, AQ", board),
      villainRange: R("AJ, KJ, JJ, 88, AK, QT", board),
    }));
    expect(a.action).toBe("block");
    expect(a.sizePct).toBe(25);
  });

  it("facing a bet: raises the nuts ~3x, jams when short, folds air", () => {
    const board = ["Ks", "8d", "3c"];
    const heroRange = R("88, KQ, AJ, 76s", board);
    const villainRange = R("KQ, KJ, AK, QJ, 99", board);
    const raise = advisePostflop(base({ board, hole: ["8h", "8c"], heroRange, villainRange, toCallBB: 4, potBB: 16, heroInPosition: false, villainCheckedThisStreet: false }));
    expect(raise.action).toBe("raise");
    expect(raise.sizeBB).toBe(12);
    const jam = advisePostflop(base({ board, hole: ["8h", "8c"], heroRange, villainRange, toCallBB: 4, potBB: 16, heroStackBB: 14 }));
    expect(jam.action).toBe("jam");
    const fold = advisePostflop(base({ board, hole: ["7h", "6h"], heroRange, villainRange, toCallBB: 12, potBB: 24 }));
    expect(fold.action).toBe("fold");
  });

  it("small c-bet on a static board with an equity edge, sized in bb", () => {
    const board = ["Ks", "8d", "3c"];
    const a = advisePostflop(base({
      board, hole: ["Ah", "Kd"],
      heroRange: R("AA, KK, AK, KQ, AQ, QQ, JJ", board),
      villainRange: R("76s, 65s, 98s, T9s, A5s, 44", board),
    }));
    expect(a.action).toBe("bet");
    expect(a.sizePct).toBe(30);
    expect(a.sizeBB).toBe(3.5);
  });
});
