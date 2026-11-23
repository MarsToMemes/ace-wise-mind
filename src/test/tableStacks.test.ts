import { describe, it, expect, beforeEach } from "vitest";
import { handContributions, settleHand, handOutcome, effectiveStack, loadStacks, saveStacks, STACKS_KEY } from "@/lib/tableStacks";
import type { PlayerAction } from "@/components/ActionMenu";

// 6 joueurs, bouton au siège 3 : SB = 4, BB = 5.
const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
const blinds = { blinds: { sbIdx: 4, bbIdx: 5 }, startPot: 0 };

describe("ce que chacun a mis dans la main", () => {
  it("blindes, relance, call et mises après le flop", () => {
    const acts = [A(3, "Preflop", "Raise", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5), A(5, "Flop", "Check"), A(3, "Flop", "Bet", 3), A(5, "Flop", "Call", 3)];
    expect(handContributions(acts, blinds, 6)).toEqual([0, 0, 0, 5.5, 0.5, 5.5]);
  });
});

describe("règlement d'une main", () => {
  const start = [100, 100, 100, 100, 100, 100];
  it("le gagnant prend le pot, rake déduit si le flop est vu", () => {
    const r = settleHand(start, [0, 0, 0, 5.5, 0.5, 5.5], [3], { flopSeen: true });
    expect(r[3]).toBeCloseTo(100 - 5.5 + 11.5 - 0.575, 6);
    expect(r[5]).toBe(94.5);
    expect(r[4]).toBe(99.5);
  });
  it("pas de rake sans flop", () => {
    const r = settleHand(start, [0, 0, 0, 2.5, 0.5, 1], [3], { flopSeen: false });
    expect(r[3]).toBe(101.5);
  });
  it("la mise non payée est rendue avant de partager", () => {
    // BTN mise 20 au river, BB se couche : BB n'avait mis que 6 ; les 14 de trop reviennent au BTN
    const r = settleHand(start, [0, 0, 0, 20, 0, 6], [3], { flopSeen: true });
    expect(r[3]).toBeCloseTo(100 + 6 - 0.6, 6);
  });
  it("pot partagé entre deux gagnants", () => {
    const r = settleHand(start, [0, 0, 0, 10, 0, 10], [3, 5], { flopSeen: true });
    expect(r[3]).toBeCloseTo(100 - 0.5, 6);
    expect(r[5]).toBeCloseTo(100 - 0.5, 6);
  });
  it("le rake s'arrête au plafond de 3 bb", () => {
    const r = settleHand(start, [0, 0, 0, 100, 0, 100], [3], { flopSeen: true });
    expect(r[3]).toBe(197);
    expect(r[5]).toBe(0);
  });
});

describe("qui a gagné", () => {
  const base = { size: 6, hero: 3, heroCards: ["Ah", "Ad"], board: [] as string[], shown: {} as Record<number, string>, folded: Array(6).fill(false) };
  it("tout le monde s'est couché : le dernier gagne", () => {
    const o = handOutcome({ ...base, actions: [A(3, "Preflop", "Raise", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Fold")] });
    expect(o).toEqual({ kind: "auto", winners: [3] });
  });
  it("abattage avec les cartes connues : le site désigne le gagnant", () => {
    const o = handOutcome({ ...base, board: ["2c", "7d", "9s", "Jh", "4c"], shown: { 5: "Kc Kd" },
      actions: [A(3, "Preflop", "Raise", 2.5), A(5, "Preflop", "Call", 1.5), A(5, "River", "Check"), A(3, "River", "Check")] });
    expect(o).toEqual({ kind: "auto", winners: [3] });
  });
  it("abattage sans les cartes adverses : il faut demander", () => {
    const o = handOutcome({ ...base, board: ["2c", "7d", "9s", "Jh", "4c"],
      actions: [A(3, "Preflop", "Raise", 2.5), A(5, "Preflop", "Call", 1.5), A(5, "River", "Check"), A(3, "River", "Check")] });
    expect(o).toEqual({ kind: "ask", candidates: [3, 5] });
  });
  it("main pas finie (pas de river, plusieurs joueurs) : on ne touche pas aux tapis", () => {
    const o = handOutcome({ ...base, board: ["2c", "7d", "9s"], actions: [A(3, "Preflop", "Raise", 2.5), A(5, "Preflop", "Call", 1.5)] });
    expect(o).toEqual({ kind: "incomplete" });
  });
  it("le bouton « Couché » de la table compte aussi comme un fold", () => {
    const folded = Array(6).fill(false); folded[5] = true;
    const o = handOutcome({ ...base, folded, board: ["2c", "7d", "9s"], actions: [A(3, "Preflop", "Raise", 2.5), A(5, "Preflop", "Call", 1.5)] });
    expect(o).toEqual({ kind: "auto", winners: [3] });
  });
});

describe("tapis effectif", () => {
  it("le plus petit entre toi et le plus gros adversaire encore dans le coup", () => {
    expect(effectiveStack([100, 40, 250, 120, 100, 60], 3, [1, 5])).toBe(60);
    expect(effectiveStack([100, 40, 250, 80, 100, 60], 3, [2])).toBe(80);
  });
});

describe("tapis gardés pour la table", () => {
  beforeEach(() => localStorage.clear());
  it("se relisent pour la même taille de table, sinon 100 bb partout", () => {
    saveStacks([90, 110, 100, 100, 100, 100]);
    expect(loadStacks(6)).toEqual([90, 110, 100, 100, 100, 100]);
    expect(loadStacks(9)).toEqual(Array(9).fill(100));
  });
  it("stockage abîmé : 100 bb partout", () => {
    localStorage.setItem(STACKS_KEY, "{");
    expect(loadStacks(6)).toEqual(Array(6).fill(100));
  });
});
