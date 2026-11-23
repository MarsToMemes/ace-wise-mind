import { describe, it, expect } from "vitest";
import { buildHandState, type HandInput } from "@/core/handState";
import { settleHand } from "@/core/settle";
import { CASH_RAKE } from "@/core/rake";
import type { PlayerAction } from "@/components/ActionMenu";

const A = (seatIdx: number, type: PlayerAction["type"], amountBB = 0, street: PlayerAction["street"] = "Preflop"): PlayerAction => ({ seatIdx, street, type, amountBB });
const three = (stacks: number[], actions: PlayerAction[], board: string[] = []): HandInput => ({ tableSize: 3, dealerIdx: 2, heroIdx: 2, stacksBB: stacks, hole: [], board, actions });
const allIn3 = buildHandState(three([30, 80, 150], [A(2, "Raise", 150), A(0, "Call", 29.5), A(1, "Call", 79)], ["Ks", "7d", "2c", "9h", "4s"])).state;

describe("règlement d'une main (pots, partages, rake)", () => {
  it("le plus petit tapis gagne : 90 pour lui, 100 au second meilleur, 70 rendus au gros tapis (sans rake)", () => {
    const s = settleHand(allIn3, { ranks: { 0: 3, 1: 2, 2: 1 } });
    expect(s.unresolved).toEqual([]);
    expect(s.payouts).toEqual([90, 100, 70]);
    expect(s.rake).toBe(0);
  });

  it("rake : plafond de 3 bb sur le total contesté (190), réparti au prorata, la mise rendue n'est pas rakée", () => {
    const s = settleHand(allIn3, { ranks: { 0: 3, 1: 2, 2: 1 }, rake: CASH_RAKE });
    expect(s.rake).toBeCloseTo(3, 9);
    expect(s.perPot.map(p => p.rake)).toEqual([expect.closeTo(3 * 90 / 190, 9), expect.closeTo(3 * 100 / 190, 9), 0]);
    expect(s.payouts[0]).toBeCloseTo(90 - 3 * 90 / 190, 9);
    expect(s.payouts[1]).toBeCloseTo(100 - 3 * 100 / 190, 9);
    expect(s.payouts[2]).toBe(70);
  });

  it("partage du pot principal entre deux joueurs à égalité ; le pot annexe va à celui qui le conteste", () => {
    const s = settleHand(allIn3, { ranks: { 0: 5, 1: 5, 2: 1 } });
    expect(s.payouts).toEqual([45, 145, 70]);
  });

  it("tout le monde se couche avant le flop : pas de rake, le relanceur reprend tout", () => {
    const st = buildHandState({ tableSize: 6, dealerIdx: 3, heroIdx: 3, stacksBB: 100, hole: [], board: [],
      actions: [A(0, "Fold"), A(1, "Fold"), A(2, "Fold"), A(3, "Raise", 2.5), A(4, "Fold"), A(5, "Fold")] }).state;
    const s = settleHand(st, { rake: CASH_RAKE });
    expect(s.rake).toBe(0);
    expect(s.payouts[3]).toBe(4);
    expect(s.stacksAfter).toEqual([100, 100, 100, 101.5, 99.5, 99]);
  });

  it("abattage sans la main d'un joueur : le pot reste à attribuer (le site demandera)", () => {
    const s = settleHand(allIn3, { ranks: { 0: 3 } });
    expect(s.unresolved.map(u => u.eligible)).toEqual([[0, 1, 2], [1, 2]]);
    expect(s.payouts).toEqual([0, 0, 70]);
  });

  it("le gagnant d'un pot peut être imposé (choix du joueur dans la fenêtre « Qui a gagné ? »)", () => {
    const s = settleHand(allIn3, { winners: [[0], [2]] });
    expect(s.unresolved).toEqual([]);
    expect(s.payouts).toEqual([90, 0, 170]);
  });

  it("rien ne se perd : gains + rake = pot ; tapis après + rake = tapis avant", () => {
    const s = settleHand(allIn3, { ranks: { 0: 1, 1: 4, 2: 2 }, rake: CASH_RAKE });
    expect(s.payouts.reduce((t, x) => t + x, 0) + s.rake).toBeCloseTo(allIn3.pot, 9);
    expect(s.stacksAfter.reduce((t, x) => t + x, 0) + s.rake).toBeCloseTo(30 + 80 + 150, 9);
  });
});
