import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { withSeed } from "@/bench/driftCases";

const board = ["Jc", "Jd", "Kc", "Qd", "Ks"];
const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
// Tu as été l'agresseur et ta range a beaucoup plus de mains fortes (fulls) : le conseiller choisit l'overbet.
const spot = (ip: boolean): PostflopInput => ({
  street: "River", board, hole: ["As", "Ts"],
  heroRange: R("KK, QQ, JJ, KJ, KQ, AK, AT, AQ, QJ", board), villainRange: R("T9s, 98s, 87s, 66, 55, 44, A5s, QT, JT", [...board, "As", "Ts"]),
  heroInPosition: ip, heroIsPfr: true, potBB: 27, toCallBB: 0, heroStackBB: 85, opponents: 1,
  villainCheckedThisStreet: ip, prevHero: "bet", prevVillain: "call", samples: 1200,
});

describe("value moyenne à la river, gros avantage de mains fortes", () => {
  it("hors de position, en premier : check (l'overbet est pour le haut de ta range)", () => {
    const a = withSeed(5, () => advisePostflop(spot(false)));
    expect(a.role).toBe("value");
    expect(a.action).toBe("check");
  });
  it("en position après son check : l'overbet reste conseillé", () => {
    const a = withSeed(5, () => advisePostflop(spot(true)));
    expect(a.role).toBe("value");
    expect(a.action).toBe("overbet");
  });
});
