import { describe, it, expect } from "vitest";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";

const river = ["Ks", "7d", "2c", "9h", "4s"];
const hole = ["Kd", "Kc"]; // brelan de rois : les nuts
const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const base = (p: Partial<PostflopInput> = {}): PostflopInput => ({
  street: "River", board: river, hole,
  heroRange: R("22-QQ,A2s-AQs,K2s+,Q6s+,J7s+,T7s+,97s+,86s+,75s+,64s+,54s,A8o-AQo,KTo+,QTo+,JTo", river),
  villainRange: R("22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A5o+,K9o+,Q9o+,J9o+,T9o", [...hole, ...river]),
  heroInPosition: false, heroIsPfr: false, potBB: 10, toCallBB: 0, heroStackBB: 90, opponents: 1,
  villainCheckedThisStreet: false, samples: 2000, ...p,
});

describe("nuts first to act with no bet", () => {
  it("does not plan to just call: it bets for value or plans to raise", () => {
    const a = advisePostflop(base());
    expect(a.role).toBe("nuts");
    expect(a.plan.join(" ")).not.toMatch(/paie si ton équité/);
    expect(a.action === "bet" || a.action === "checkRaise").toBe(true);
    expect(a.plan.join(" ")).toMatch(/relance|tapis/i);
  });

  it("against a passive player, leads for value instead of checking", () => {
    const a = advisePostflop(base({ villainAggressive: false }));
    expect(a.action).toBe("bet");
    expect(a.sizeBB).toBeGreaterThan(0);
  });

  it("against an aggressive player, still checks to check-raise", () => {
    const a = advisePostflop(base({ villainAggressive: true }));
    expect(a.action).toBe("checkRaise");
  });
});
