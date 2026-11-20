import { describe, it, expect } from "vitest";
import { handEquity, handEquityMulti, scaleEqThreshold } from "@/engines/postflopRanges";
import { advisePostflop, PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange, FULL_DECK, Combo } from "@/engines/rangeVsRange";
import { rank7 } from "@/engines/handEval7";
import { parseRangeText } from "@/engines/myRanges";

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const one = (a: string, b: string): Combo[] => [{ cards: [a, b], w: 1 }];

/** Équité exacte du héros contre des mains fixes (énumération des cartes à venir). */
function exactVsFixed(hole: string[], opps: string[][], board: string[]) {
  const used = new Set([...hole, ...board, ...opps.flat()]);
  const rest = FULL_DECK.filter(c => !used.has(c));
  const need = 5 - board.length;
  const runs = need === 1 ? rest.map(c => [c]) : rest.flatMap((c, i) => rest.slice(i + 1).map(d => [c, d]));
  let s = 0;
  for (const run of runs) {
    const b = [...board, ...run];
    const h = rank7([...hole, ...b]);
    const o = opps.map(x => rank7([...x, ...b]));
    const best = Math.max(h, ...o);
    if (h === best) s += 1 / (1 + o.filter(v => v === best).length);
  }
  return s / runs.length;
}

describe("handEquityMulti", () => {
  it("with one opponent it gives exactly the heads-up equity", () => {
    const board = ["Ks", "7d", "2c"], hole = ["Ah", "Kd"];
    const v = R("22+,A2s+,KTs+,QJs,ATo+,KQo", [...hole, ...board]);
    expect(handEquityMulti(hole, [v], board, 3000)).toBe(handEquity(hole, v, board, 3000));
  });

  it("matches the exact 3-way equity against fixed hands", () => {
    const board = ["Jh", "Th", "9c"], hole = ["Qs", "Qd"];
    const opps = [["As", "Ad"], ["8h", "7h"]];
    const exact = exactVsFixed(hole, opps, board);
    const mc = handEquityMulti(hole, opps.map(([a, b]) => one(a, b)), board, 20000);
    expect(Math.abs(mc - exact)).toBeLessThan(0.015);
  });

  it("is much lower than the heads-up equity on a connected board", () => {
    const board = ["Jh", "Th", "9c"], hole = ["Qs", "Qd"];
    const open = R("22+,A2s+,K9s+,QTs+,JTs,T9s,98s,ATo+,KJo+", [...hole, ...board]);
    const call = R("22-JJ,A2s-AQs,KTs+,QTs+,J9s+,T8s+,97s+,87s,76s,AJo-AQo,KQo", [...hole, ...board]);
    const hu = handEquity(hole, open, board, 4000);
    const three = handEquityMulti(hole, [open, call], board, 4000);
    expect(hu - three).toBeGreaterThan(0.1);
  });

  it("skips impossible deals instead of reusing cards", () => {
    const board = ["2c", "7d", "9s"], hole = ["Ah", "Ad"];
    // les deux adversaires ne peuvent avoir que les mêmes deux cartes → aucune donne possible
    const eq = handEquityMulti(hole, [one("Ks", "Kc"), one("Ks", "Kc")], board, 500);
    expect(eq).toBe(0.5);
  });
});

describe("scaleEqThreshold", () => {
  it("keeps heads-up thresholds and maps 50 % to the fair share in multiway", () => {
    expect(scaleEqThreshold(0.65, 1)).toBeCloseTo(0.65);
    expect(scaleEqThreshold(0.5, 2)).toBeCloseTo(1 / 3);
    expect(scaleEqThreshold(1, 2)).toBeCloseTo(1);
    expect(scaleEqThreshold(0, 2)).toBeCloseTo(0);
    expect(scaleEqThreshold(0.4, 2)).toBeCloseTo((1 / 3) * 0.8);
  });
});

describe("advisePostflop multiway", () => {
  const board = ["Jh", "Th", "9c"], hole = ["7s", "7c"];
  const dead = [...hole, ...board];
  const heroRange = R("22-QQ,A2s-AQs,KTs+,QTs+,J9s+,T8s+,97s+,87s,76s,AJo-AQo,KQo", board);
  const open = R("22+,A2s+,K9s+,QTs+,JTs,T9s,98s,ATo+,KJo+", dead);
  const call = R("22-JJ,A2s-AQs,KTs+,QTs+,J9s+,T8s+,97s+,87s,76s,AJo-AQo,KQo", dead);
  const base: PostflopInput = {
    street: "Flop", board, hole, heroRange, villainRange: open, heroInPosition: false, heroIsPfr: false,
    potBB: 11, toCallBB: 4, heroStackBB: 95, opponents: 2, villainCheckedThisStreet: false, samples: 3000,
  };

  it("measures the hand against both opponents", () => {
    const hu = advisePostflop({ ...base, opponents: 1 });
    const mw = advisePostflop({ ...base, otherRanges: [call] });
    expect(hu.stats.handEquity - mw.stats.handEquity).toBeGreaterThan(10);
  });

  it("folds 77 on J-T-9 facing a bet with two opponents", () => {
    const mw = advisePostflop({ ...base, otherRanges: [call] });
    expect(mw.action).toBe("fold");
    expect(mw.reasons.join(" ")).toContain("2 adversaires");
  });

  it("without the second range, the main opponent's range stands in for the missing one", () => {
    const hu = advisePostflop({ ...base, opponents: 1 });
    const guess = advisePostflop({ ...base });
    expect(hu.stats.handEquity - guess.stats.handEquity).toBeGreaterThan(10);
  });
});
