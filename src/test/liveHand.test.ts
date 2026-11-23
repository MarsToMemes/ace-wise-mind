import { describe, it, expect } from "vitest";
import { settleLive, type LiveHand } from "@/lib/liveHand";
import { CASH_RAKE } from "@/core/rake";
import type { PlayerAction } from "@/components/ActionMenu";

const A = (seatIdx: number, type: PlayerAction["type"], amountBB = 0, street: PlayerAction["street"] = "Preflop"): PlayerAction => ({ seatIdx, street, type, amountBB });
// 6 joueurs, bouton siège 3 : UTG 0, MP 1, CO 2, BTN 3, SB 4, BB 5 ; tu es au CO
const six = (o: Partial<LiveHand>): LiveHand => ({
  tableSize: 6, dealerIdx: 3, userIdx: 2, stacks: Array(6).fill(100), hole: ["Ah", "Kd"], board: [], actions: [],
  folded: Array(6).fill(false), shown: {}, ...o,
});
const board5 = ["2c", "7d", "9s", "Jh", "4c"];

describe("régler la main du site avec le moteur de règles", () => {
  it("tout le monde se couche sur ta relance : tu gagnes les blindes, ta relance non payée t'est rendue", () => {
    const r = settleLive(six({ actions: [A(0, "Fold"), A(1, "Fold"), A(2, "Raise", 2.5), A(3, "Fold"), A(4, "Fold"), A(5, "Fold")] }), { rake: CASH_RAKE });
    expect(r).toEqual({ kind: "settled", stacksAfter: [100, 100, 101.5, 100, 99.5, 99], rake: 0 });
  });

  it("les joueurs sans action saisie sont couchés (comme pour le conseil)", () => {
    const r = settleLive(six({ actions: [A(2, "Raise", 2.5)] }), { rake: CASH_RAKE });
    expect(r.kind).toBe("settled");
    if (r.kind === "settled") expect(r.stacksAfter[2]).toBe(101.5);
  });

  it("pots annexes : le plus petit tapis gagne 90, le second 100, le gros tapis récupère 70 (le bug d'avant)", () => {
    const h: LiveHand = { tableSize: 3, dealerIdx: 2, userIdx: 2, stacks: [30, 80, 150], hole: ["Qh", "Qd"], board: board5,
      actions: [A(2, "Raise", 150), A(0, "Call", 29.5), A(1, "Call", 79)], folded: [false, false, false], shown: { 0: "As Ad", 1: "Ks Kd" } };
    expect(settleLive(h, {})).toEqual({ kind: "settled", stacksAfter: [90, 100, 70], rake: 0 });
  });

  it("abattage sans les cartes adverses : on demande le gagnant de chaque pot, puis on règle", () => {
    const h: LiveHand = { tableSize: 3, dealerIdx: 2, userIdx: 2, stacks: [30, 80, 150], hole: ["Qh", "Qd"], board: board5,
      actions: [A(2, "Raise", 150), A(0, "Call", 29.5), A(1, "Call", 79)], folded: [false, false, false], shown: {} };
    const ask = settleLive(h, {});
    expect(ask).toEqual({ kind: "ask", pots: [
      { pot: 0, amount: 90, eligible: [0, 1, 2], main: true },
      { pot: 1, amount: 100, eligible: [1, 2], main: false },
    ] });
    expect(settleLive(h, { choices: { 0: [1], 1: [1] } })).toEqual({ kind: "settled", stacksAfter: [0, 190, 70], rake: 0 });
  });

  it("river posée sans les derniers checks saisis, sans mise en attente : c'est l'abattage", () => {
    const r = settleLive(six({ board: board5, shown: { 5: "Kc Kh" },
      actions: [A(0, "Fold"), A(1, "Fold"), A(2, "Raise", 2.5), A(3, "Fold"), A(4, "Fold"), A(5, "Call", 1.5)] }), { rake: CASH_RAKE });
    expect(r.kind).toBe("settled"); // AK hauteur as contre KK : KK gagne
    if (r.kind === "settled") { expect(r.stacksAfter[5]).toBeCloseTo(100 - 2.5 + 5.5 - 0.275, 9); expect(r.stacksAfter[2]).toBe(97.5); }
  });

  it("main pas finie (flop seulement, deux joueurs) : rien n'est réglé", () => {
    const r = settleLive(six({ board: ["2c", "7d", "9s"], actions: [A(2, "Raise", 2.5), A(5, "Call", 1.5)] }), {});
    expect(r).toEqual({ kind: "incomplete" });
  });

  it("le bouton « Couché » de la table compte comme un fold", () => {
    const folded = Array(6).fill(false); folded[5] = true;
    const r = settleLive(six({ folded, board: ["2c", "7d", "9s"], actions: [A(2, "Raise", 2.5), A(5, "Call", 1.5)] }), { rake: CASH_RAKE });
    expect(r.kind).toBe("settled");
    if (r.kind === "settled") expect(r.stacksAfter[2]).toBeCloseTo(100 - 2.5 + 5.5 - 0.275, 9);
  });

  it("une suite d'actions impossible n'est pas réglée", () => {
    const r = settleLive(six({ actions: [A(2, "Raise", 2.5), A(5, "Raise", 3)] }), {});
    expect(r.kind).toBe("invalid");
  });
});
