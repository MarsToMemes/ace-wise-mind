import { describe, it, expect } from "vitest";
import { buildTree, type ActNode } from "@/engines/endgame/tree";
import { Solver, makeHandSet, showdownCFV, foldCFV } from "@/engines/endgame/cfr";
import { solveEndgame } from "@/engines/endgame/solve";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange, type Combo } from "@/engines/rangeVsRange";
import { rank7 } from "@/engines/handEval7";

const range = (txt: string, board: string[]): Combo[] => expandRange(parseRangeText(txt), board);

describe("buildTree", () => {
  it("offers check, three sizes and all-in at the river root", () => {
    const { root } = buildTree({ street: "River", startPot: 10, stack: 100 });
    const r = root as ActNode;
    expect(r.player).toBe(0);
    expect(r.actions.map(a => a.kind)).toEqual(["check", "bet", "bet", "bet", "allin"]);
    expect(r.actions.map(a => a.to)).toEqual([0, 3.3, 7.5, 12.5, 100]);
  });

  it("turns big bets into all-in when the stack is short", () => {
    const { root } = buildTree({ street: "River", startPot: 10, stack: 10 });
    expect((root as ActNode).actions.map(a => `${a.kind}:${a.to}`)).toEqual(["check:0", "bet:3.3", "allin:10"]);
  });

  it("inserts the real bet size and returns the node where the next player acts", () => {
    const { root, pathNode } = buildTree({ street: "River", startPot: 10, stack: 100, path: [{ player: 0, kind: "bet", to: 5 }] });
    expect((root as ActNode).actions.some(a => a.kind === "bet" && a.to === 5)).toBe(true);
    expect(pathNode?.t).toBe("act");
    expect(pathNode!.player).toBe(1);
    expect(pathNode!.actions.map(a => a.kind)).toEqual(["fold", "call", "raise", "allin"]);
  });

  it("adds a chance node after the turn betting closes", () => {
    const { root } = buildTree({ street: "Turn", startPot: 10, stack: 100, board: ["Ks", "Kd", "8h", "4c"] });
    const r = root as ActNode;
    const ip = r.children[0] as ActNode;          // OOP check
    const chance = ip.children[0];                 // IP check back
    expect(chance.t).toBe("chance");
    if (chance.t === "chance") expect(chance.cards.length).toBe(48);
  });
});

describe("terminal values with card removal", () => {
  it("match a brute-force calculation", () => {
    const board = ["Ks", "Kd", "8h", "4c", "2s"];
    const a = makeHandSet(range("AA,KQ,88,76s,QJo", board), board);
    const b = makeHandSet(range("AK,QQ,T9s,A8,54", board), board);
    const reach = Float32Array.from(b.weights);
    const sd = showdownCFV(a, b, reach, 15, 7.5, -5);
    const fd = foldCFV(a, b, reach, 3);
    for (let i = 0; i < a.n; i++) {
      let s = 0, f = 0;
      for (let j = 0; j < b.n; j++) {
        if (a.cards[i].some(c => b.cards[j].includes(c))) continue;
        const x = rank7([...a.cards[i], ...board]), y = rank7([...b.cards[j], ...board]);
        s += reach[j] * (x > y ? 15 : x === y ? 7.5 : -5);
        f += reach[j] * 3;
      }
      expect(sd[i]).toBeCloseTo(s, 3);
      expect(fd[i]).toBeCloseTo(f, 3);
    }
  });
});

describe("Solver on a polarised river", () => {
  // OOP : brelan de rois (value) ou air ; IP : QQ (attrapeur de bluffs). Mise = pot = tapis.
  const board = ["Ks", "Kd", "8h", "4c", "2s"];
  const oop = range("AK,65", board);
  const ip = range("QQ", board);
  const make = () => new Solver({ street: "River", board, startPot: 10, stack: 10, ranges: [oop, ip], sizes: { bets: [1] } });

  it("bluffs 1 time out of 3 and defends half the time", () => {
    const s = make();
    s.run(1500);
    const root = s.root as ActNode;
    const bet = root.actions.findIndex(a => a.kind === "allin");
    const st = s.averageStrategy(root);
    let value = 0, bluff = 0;
    oop.forEach((c, i) => {
      const w = c.w * st[bet * oop.length + i];
      if (c.cards.some(x => x[0] === "K")) value += w; else bluff += w;
    });
    expect(bluff / (value + bluff)).toBeGreaterThan(0.27);
    expect(bluff / (value + bluff)).toBeLessThan(0.39);
    const facing = root.children[bet] as ActNode;
    const call = facing.actions.findIndex(a => a.kind === "call");
    const sf = s.averageStrategy(facing);
    const callFreq = ip.reduce((t, c, i) => t + sf[call * ip.length + i], 0) / ip.length;
    expect(callFreq).toBeGreaterThan(0.42);
    expect(callFreq).toBeLessThan(0.58);
  });

  it("gets more precise with more iterations", () => {
    const s = make();
    s.run(20);
    const early = s.exploitabilityPct();
    s.run(800);
    const late = s.exploitabilityPct();
    expect(late).toBeLessThan(early);
    expect(late).toBeLessThan(1);
  });
});

describe("Solver on a small turn", () => {
  it("converges without errors", () => {
    const board = ["Ks", "9d", "8h", "4c"];
    const s = new Solver({ street: "Turn", board, startPot: 10, stack: 30, ranges: [range("AK,KQs,98s,T9s,77", board), range("KJs,QQ,JTs,A8s", board)] });
    s.run(150);
    const e = s.exploitabilityPct();
    expect(Number.isFinite(e)).toBe(true);
    expect(e).toBeLessThan(3);
  });
});

describe("solveEndgame", () => {
  it("gives the hero's mix, EVs per action (fold = 0) and the range summary", () => {
    const board = ["Ks", "Kd", "8h", "4c", "2s"];
    const res = solveEndgame({
      street: "River", board, startPot: 10, stack: 50,
      ranges: [range("AK,65,QJs,88", board), range("QQ,JJ,AQ,K9s", board)],
      hero: 1, heroCards: ["Qh", "Qd"],
      path: [{ player: 0, kind: "bet", to: 7.5 }],
      maxIter: 300, timeBudgetMs: 5000,
    });
    expect(res).not.toBeNull();
    const total = res!.actions.reduce((t, a) => t + a.freq, 0);
    expect(total).toBeCloseTo(1, 2);
    expect(res!.actions.find(a => a.kind === "fold")!.ev).toBeCloseTo(0, 5);
    expect(res!.range.length).toBeGreaterThan(0);
    expect(res!.iterations).toBeGreaterThan(0);
  });

  it("returns null when the path does not lead to the hero", () => {
    const board = ["Ks", "Kd", "8h", "4c", "2s"];
    const res = solveEndgame({
      street: "River", board, startPot: 10, stack: 50,
      ranges: [range("AK", board), range("QQ", board)], hero: 0, heroCards: ["Ah", "Kh"],
      path: [{ player: 0, kind: "bet", to: 7.5 }], maxIter: 10,
    });
    expect(res).toBeNull();
  });
});
