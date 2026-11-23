import { describe, it, expect } from "vitest";
import { buildHandState, checkInvariants, type HandInput } from "@/core/handState";
import type { PlayerAction } from "@/components/ActionMenu";

const A = (seatIdx: number, type: PlayerAction["type"], amountBB = 0, street: PlayerAction["street"] = "Preflop"): PlayerAction => ({ seatIdx, street, type, amountBB });
// 3 joueurs, bouton siège 2 : SB 0, BB 1, BTN 2 parle en premier
const three = (stacks: number[], actions: PlayerAction[], board: string[] = []): HandInput => ({ tableSize: 3, dealerIdx: 2, heroIdx: 2, stacksBB: stacks, hole: [], board, actions });

describe("pots principaux, annexes et mise rendue", () => {
  it("tapis 30/80/150, les trois à tapis : 90 + 100 contestés, 70 rendus au plus gros tapis", () => {
    const r = buildHandState(three([30, 80, 150], [A(2, "Raise", 150), A(0, "Call", 29.5), A(1, "Call", 79)]));
    expect(r.errors).toEqual([]);
    expect(r.state.pots).toEqual([
      { amount: 90, eligible: [0, 1, 2], kind: "main" },
      { amount: 100, eligible: [1, 2], kind: "side" },
      { amount: 70, eligible: [2], kind: "refund" },
    ]);
    expect(r.state.supported).toBe(true);
    expect(r.state.unsupported).toEqual([]);
  });

  it("tout le monde se couche sur une relance : les blindes sont gagnées, le reste de la relance est rendu", () => {
    const r = buildHandState({ tableSize: 6, dealerIdx: 3, heroIdx: 3, stacksBB: 100, hole: [], board: [],
      actions: [A(0, "Fold"), A(1, "Fold"), A(2, "Fold"), A(3, "Raise", 2.5), A(4, "Fold"), A(5, "Fold")] });
    // pot principal : SB 0,5 + BB 1 + la part du BTN égalisée par la BB (1) ; les 1,5 au-dessus, personne ne les a payés
    expect(r.state.pots).toEqual([{ amount: 2.5, eligible: [3], kind: "main" }, { amount: 1.5, eligible: [3], kind: "refund" }]);
  });

  it("un all-in court qui ne fait que payer : le surplus du relanceur lui est rendu", () => {
    const r = buildHandState(three([13, 100, 100], [A(2, "Raise", 20), A(0, "Call", 12.5), A(1, "Fold")]));
    expect(r.state.toAct).toBe(-1);
    expect(r.state.pots).toEqual([{ amount: 27, eligible: [0, 2], kind: "main" }, { amount: 7, eligible: [2], kind: "refund" }]);
  });

  it("en cours de main : un seul pot tant que personne n'est à tapis, tous les joueurs encore dans le coup peuvent le gagner", () => {
    const r = buildHandState({ tableSize: 6, dealerIdx: 3, heroIdx: 1, stacksBB: 100, hole: [], board: [], actions: [A(0, "Raise", 2.5)] });
    expect(r.state.toAct).toBe(1);
    expect(r.state.pots).toEqual([{ amount: 4, eligible: [0, 1, 2, 3, 4, 5], kind: "main" }]);
  });

  it("à tapis au préflop puis mises au flop : pot principal à trois, pot annexe à deux, le joueur à tapis ne parle plus", () => {
    const r = buildHandState(three([13, 100, 100], [
      A(2, "Raise", 10), A(0, "Raise", 13), A(1, "Call", 12), A(2, "Call", 3),
      A(1, "Bet", 20, "Flop"), A(2, "Call", 20, "Flop"),
    ], ["Ks", "7d", "2c"]));
    expect(r.errors).toEqual([]);
    expect(r.state.pots).toEqual([{ amount: 39, eligible: [0, 1, 2], kind: "main" }, { amount: 40, eligible: [1, 2], kind: "side" }]);
    expect(r.state.seats[0].allIn).toBe(true);
    expect(r.state.toAct).toBe(-1);
  });

  it("le total des pots fait toujours le pot (invariant)", () => {
    const r = buildHandState(three([30, 80, 150], [A(2, "Raise", 150), A(0, "Call", 29.5), A(1, "Call", 79)]));
    expect(r.state.pots.reduce((t, p) => t + p.amount, 0)).toBeCloseTo(r.state.pot, 9);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});
