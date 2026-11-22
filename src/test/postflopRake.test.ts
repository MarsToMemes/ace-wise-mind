import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";

const board = ["As", "Kd", "7c", "2h", "2s"];
const R = (t: string) => expandRange(parseRangeText(t), board);
const inp = (rake?: typeof CASH_RAKE): PostflopInput => ({
  street: "River", board, hole: ["Qh", "Qc"], heroRange: R("QQ, JJ, KQs"), villainRange: R("AK, AQ, 76s, 98s"),
  heroInPosition: true, heroIsPfr: false, potBB: 12, toCallBB: 6, heroStackBB: 100, opponents: 1,
  villainCheckedThisStreet: false, samples: 600, rake,
});

describe("conseiller après le flop : rake", () => {
  it("sans rake (tournoi) : il faut 6 / 18 = 33,3 % pour payer", () => {
    expect(advisePostflop(inp()).stats.required).toBe(33.3);
  });
  it("avec le rake cash : le pot gagné perd 0,9 bb, il faut 6 / 17,1 = 35,1 %", () => {
    expect(advisePostflop(inp(CASH_RAKE)).stats.required).toBe(35.1);
  });
});
