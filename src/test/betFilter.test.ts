import { describe, it, expect } from "vitest";
import { filterByBet, handEquity, relStrength } from "@/engines/postflopRanges";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { expandRange, Combo } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const total = (c: Combo[]) => c.reduce((s, x) => s + x.w, 0);
const share = (c: Combo[], f: (x: Combo) => boolean) => c.filter(f).reduce((s, x) => s + x.w, 0) / total(c);

const river = ["Ks", "7d", "2c", "9h", "4s"];
const hole = ["Kh", "Tc"];
const btnOpen = "22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A5o+,K9o+,Q9o+,J9o+,T9o";

describe("filterByBet", () => {
  it("on the river, bluffs are capped at the standard ratio for the bet size", () => {
    const r = R(btnOpen, [...hole, ...river]);
    const isAir = (x: Combo) => relStrength(x.cards, river) === 0;
    const half = filterByBet(r, river, "River", 0.5);
    const pot = filterByBet(r, river, "River", 1);
    // ½ pot → au plus 25 % de bluffs ; pot → au plus 33 %
    expect(share(half, isAir)).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(share(pot, isAir)).toBeLessThanOrEqual(1 / 3 + 1e-9);
    expect(share(pot, isAir)).toBeGreaterThan(share(half, isAir));
  });

  it("keeps all value hands and draws, never deletes a combo entirely", () => {
    const flop = river.slice(0, 3);
    const r = R(btnOpen, [...hole, ...flop]);
    const f = filterByBet(r, flop, "Flop", 0.66);
    const w = (a: string, b: string) => f.find(x => x.cards.includes(a) && x.cards.includes(b))?.w ?? 0;
    expect(w("Kd", "Qd")).toBe(1);        // top pair
    expect(w("7s", "7c")).toBe(1);        // brelan
    expect(f.length).toBe(r.length);
  });

  it("makes top pair much weaker against a river bet than against the whole range", () => {
    const r = R(btnOpen, [...hole, ...river]);
    const before = handEquity(hole, r, river, 3000);
    const after = handEquity(hole, filterByBet(r, river, "River", 0.5), river, 3000);
    expect(before - after).toBeGreaterThan(0.15);
  });
});

describe("advisor facing a river bet with top pair", () => {
  it("calls instead of check-raising once the bet narrows the range", () => {
    const bbCall = R("22-QQ,A2s-AQs,K2s+,Q6s+,J7s+,T7s+,97s+,86s+,75s+,64s+,54s,A8o-AQo,KTo+,QTo+,JTo", river);
    const v = filterByBet(R(btnOpen, [...hole, ...river]), river, "River", 0.5);
    const a = advisePostflop({ street: "River", board: river, hole, heroRange: bbCall, villainRange: v, heroInPosition: false, heroIsPfr: false,
      potBB: 15, toCallBB: 5, heroStackBB: 90, opponents: 1, villainCheckedThisStreet: false, samples: 3000 });
    expect(a.action).toBe("call");
  });
});
