import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { SolverGame, TableAction } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { filterByLine, type LineEvent } from "@/engines/postflopRanges";
import { riverSpot3 } from "@/engines/multiway/riverSpot3";
import { VRiver3 } from "@/engines/multiway/vriver3";

// Étape 2b : la river à 3 joueurs sur de vraies ranges, tirées de la ligne préflop jouée (table du site) puis
// resserrées par les actions du flop et de la turn (mêmes filtres que le solveur tête-à-tête).
const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const A = (seatIdx: number, type: string, amountBB = 0): TableAction => ({ seatIdx, street: "Preflop", type, amountBB });
const PRE = [A(2, "Raise", 2.5), A(3, "Call"), A(5, "Call")];          // CO ouvre, BTN paie, BB paie
const BOARD = ["Kh", "9d", "4c", "7s", "2h"];
const base = { preflop: PRE, board: BOARD, potBB: 8, stacks: { 2: 97.5, 3: 97.5, 5: 97.5 } };

describe("étape 2b : spot river à 3 joueurs tiré d'une vraie ligne", () => {
  it("joueurs rangés dans l'ordre de parole après le flop (BB, CO, BTN), tapis suivant le même ordre", () => {
    const s = riverSpot3(g, base)!;
    expect(s.seats).toEqual([5, 2, 3]);
    expect(s.positions).toEqual(["BB", "CO", "BTN"]);
    expect(s.spec.stacks).toEqual([97.5, 97.5, 97.5]);
    expect(s.spec.potBB).toBe(8);
    expect(s.spec.board).toEqual(BOARD);
  });

  it("ranges = range préflop de la ligne, étendue aux combos hors cartes du board, poids max 1", () => {
    const s = riverSpot3(g, base)!;
    const lr = lineRanges(g, SIX, PRE, 100)!;
    s.seats.forEach((seat, p) => {
      const w = lr.bySeat[seat], top = Math.max(...Object.values(w));
      const ref = expandRange(Object.fromEntries(Object.entries(w).map(([h, x]) => [h, x / top])), BOARD);
      expect(s.spec.ranges[p].length).toBe(ref.length);
      expect(Math.max(...s.spec.ranges[p].map(c => c.w))).toBeCloseTo(1, 9);
      for (const c of s.spec.ranges[p]) expect(BOARD.includes(c.cards[0]) || BOARD.includes(c.cards[1])).toBe(false);
    });
    expect(s.combos.every(n => n > 20)).toBe(true);
  });

  it("les actions du flop et de la turn resserrent les ranges avec les filtres du site", () => {
    const lines: Record<number, LineEvent[]> = {
      5: [{ street: "Flop", act: "checkFirst" }, { street: "Turn", act: "checkFirst" }],
      2: [{ street: "Flop", act: "bet" }, { street: "Turn", act: "checkBack" }],
      3: [{ street: "Flop", act: "call" }, { street: "Turn", act: "checkBack" }],
    };
    const s = riverSpot3(g, { ...base, lines })!;
    const lr = lineRanges(g, SIX, PRE, 100)!;
    const w = lr.bySeat[3], top = Math.max(...Object.values(w));
    const ref = filterByLine(expandRange(Object.fromEntries(Object.entries(w).map(([h, x]) => [h, x / top])), BOARD), BOARD, lines[3]);
    const btn = s.spec.ranges[2], refTop = Math.max(...ref.map(c => c.w));
    expect(btn.length).toBe(ref.length);
    btn.forEach((c, k) => expect(c.w).toBeCloseTo(ref[k].w / refTop, 9));
    expect(s.notes.some(n => n.includes("filtres"))).toBe(true);
  });

  it("abstraction : les combos sous minWeight × le plus gros poids sont retirés, et le poids retiré est rapporté", () => {
    const full = riverSpot3(g, base)!, cut = riverSpot3(g, { ...base, minWeight: 0.25 })!;
    cut.spec.ranges.forEach((r, p) => {
      expect(r.length).toBeLessThan(full.spec.ranges[p].length);
      expect(r.every(c => c.w >= 0.25)).toBe(true);
      const tot = (x: typeof r) => x.reduce((t, c) => t + c.w, 0);
      expect(cut.removedWeight[p]).toBeCloseTo(1 - tot(r) / tot(full.spec.ranges[p]), 9);
    });
    expect(full.removedWeight).toEqual([0, 0, 0]);
  });

  it("ligne qui ne laisse pas exactement 3 joueurs : pas de spot", () => {
    expect(riverSpot3(g, { ...base, preflop: [A(3, "Raise", 2.5), A(5, "Call")] })).toBeNull();
    expect(riverSpot3(g, { ...base, board: BOARD.slice(0, 4) })).toBeNull();
  });

  it("le spot se résout : NashConv mesurée et finie", () => {
    const s = riverSpot3(g, { ...base, minWeight: 0.5, sizes: { bets: [0.75], raise: false, allin: false, maxAggr: 1 } })!;
    const res = new VRiver3(s.spec).solve(100, 50);
    expect(Number.isFinite(res.nashConv)).toBe(true);
    expect(res.nashConv).toBeGreaterThanOrEqual(0);
  }, 60000);
});
