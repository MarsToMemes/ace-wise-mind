import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { withSeed } from "@/bench/driftCases";

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const facing = (board: string[], hole: string[], hr: string, vr: string): PostflopInput => ({
  street: board.length === 3 ? "Flop" : "Turn", board, hole, heroRange: R(hr, board), villainRange: R(vr, [...board, ...hole]),
  heroInPosition: true, heroIsPfr: true, potBB: 16, toCallBB: 7, heroStackBB: 90, opponents: 1, villainCheckedThisStreet: false, samples: 1200,
});
const HR = "JJ, QQ, KK, AA, TT, 77, A2s, AT, KT, 98s, 22", VR = "AT, KT, QT, JT, T9s, 99, 88, A7s, 76s";

describe("turn, face à une mise : relancer seulement le haut de ta range", () => {
  it("JJ sur 2-7-2-T (value, pas le haut de ta range) : paie au lieu de relancer", () => {
    const a = withSeed(9, () => advisePostflop(facing(["2h", "7s", "2c", "Th"], ["Js", "Jh"], HR, VR)));
    expect(a.role).toBe("value");
    expect(a.action).toBe("call");
  });
  it("au flop, la relance de value ne change pas", () => {
    const a = withSeed(9, () => advisePostflop(facing(["2h", "7s", "2c"], ["Js", "Jh"], HR, VR)));
    expect(a.role).toBe("value");
    expect(["raise", "jam"]).toContain(a.action);
  });
});
