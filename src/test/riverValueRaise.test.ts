import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { withSeed } from "@/bench/driftCases";

const board = ["Qs", "8s", "Jh", "Qd", "Tc"];
const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
// River pairée, il mise 10 bb dans 14 : ta range a des fulls (QJ, QT, JJ…), la sienne surtout des paires de dames.
const facing = (hole: string[]): PostflopInput => ({
  street: "River", board, hole,
  heroRange: R("99, QJ, QT, JJ, TT, 88, AK, KQ, AQ, K9s", board), villainRange: R("AQ, KQ, KJ, AJ, QT, JT, A8s, 87s", [...board, ...hole]),
  heroInPosition: true, heroIsPfr: true, potBB: 24, toCallBB: 10, heroStackBB: 85, opponents: 1,
  villainCheckedThisStreet: false, samples: 1200,
});

describe("river, face à une mise : relancer seulement le haut de ta range", () => {
  it("quinte (value, pas le haut de ta range) sur board pairé : paie au lieu de relancer", () => {
    const a = withSeed(3, () => advisePostflop(facing(["9s", "9d"])));
    expect(a.role).toBe("value");
    expect(a.action).toBe("call");
  });
  it("full (haut de ta range) : relance toujours", () => {
    const a = withSeed(3, () => advisePostflop(facing(["Qh", "Jc"])));
    expect(a.role).toBe("nuts");
    expect(["raise", "jam"]).toContain(a.action);
  });
});
