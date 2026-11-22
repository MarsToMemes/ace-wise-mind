import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { withSeed } from "@/bench/driftCases";

const board = ["Qd", "8c", "2d", "3s", "Ts"];
const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
// Tu as payé sa mise à la turn et tu parles en premier : la river t'avantage, le conseiller choisit le donk bet.
const spot = (b: string[]): PostflopInput => ({
  street: b.length === 4 ? "Turn" : "River", board: b, hole: ["Tc", "9c"],
  heroRange: R("T9s, T8s, 98s, 33, 22, TT, 88, Q8s, JTs, A2s, 54s", b), villainRange: R("AK, AJ, KJ, 99, 77, 66, A5s, J9s", [...b, "Tc", "9c"]),
  heroInPosition: false, heroIsPfr: false, potBB: 14, toCallBB: 0, heroStackBB: 90, opponents: 1,
  villainCheckedThisStreet: false, prevVillain: "bet", prevHero: "call", samples: 1200,
});

describe("donk bet à la river avec une value moyenne", () => {
  it("petite mise (33 %) : une grosse mise ne se fait payer que par mieux", () => {
    const a = withSeed(4, () => advisePostflop(spot(board)));
    expect(a.role).toBe("value");
    expect(a.action).toBe("donk");
    expect(a.sizePct).toBe(33);
  });
});
