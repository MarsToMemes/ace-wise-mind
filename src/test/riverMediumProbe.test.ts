import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { withSeed } from "@/bench/driftCases";

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
// Tu parles en premier, il a checké derrière à la street d'avant : sa range est limitée (« probe »).
const probeSpot = (board: string[]): PostflopInput => ({
  street: board.length === 4 ? "Turn" : "River", board, hole: ["7c", "7h"],
  heroRange: R("JT, J9, 98s, 77, 55, AQ", board), villainRange: R("AJ, KJ, JJ, 88, AK, QT", board),
  heroInPosition: false, heroIsPfr: false, potBB: 12, toCallBB: 0, heroStackBB: 100, opponents: 1,
  villainCheckedThisStreet: false, prevVillain: "checkBack", prevHero: "checkFirst", samples: 1200,
});

describe("main moyenne, tu parles en premier après son check derrière", () => {
  it("river : check (miser ne se fait payer que par mieux)", () => {
    const a = withSeed(11, () => advisePostflop(probeSpot(["Jh", "8d", "4c", "2s", "3h"])));
    expect(a.role).toBe("showdown");
    expect(a.action).toBe("check");
  });
  it("turn : le probe reste possible (value fine et protection)", () => {
    const a = withSeed(11, () => advisePostflop(probeSpot(["Jh", "8d", "4c", "2s"])));
    expect(a.role).toBe("showdown");
    expect(a.action).toBe("probe");
  });
});
