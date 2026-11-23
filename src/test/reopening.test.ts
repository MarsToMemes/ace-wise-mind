import { describe, it, expect } from "vitest";
import { buildHandState, type HandInput } from "@/core/handState";
import type { PlayerAction } from "@/components/ActionMenu";

// Règle A (docs/DECISIONS.md D2) : un joueur qui a déjà parlé ne peut relancer que si le total des relances depuis son
// action atteint une relance complète (all-in courts successifs additionnés) ; sinon payer ou se coucher.
const A = (seatIdx: number, type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street: "Preflop", type, amountBB });
// 3 joueurs, bouton siège 2 : SB 0, BB 1, BTN 2 parle en premier
const three = (stacks: number[], actions: PlayerAction[]): HandInput => ({ tableSize: 3, dealerIdx: 2, heroIdx: 2, stacksBB: stacks, hole: [], board: [], actions });
// 4 joueurs, bouton siège 3 : SB 0, BB 1, CO 2 parle en premier, BTN 3
const four = (stacks: number[], actions: PlayerAction[]): HandInput => ({ tableSize: 4, dealerIdx: 3, heroIdx: 2, stacksBB: stacks, hole: [], board: [], actions });

describe("réouverture des enchères, joueur par joueur", () => {
  it("all-in court (+3 face à une relance de 9) : le relanceur peut seulement payer ou se coucher", () => {
    const r = buildHandState(three([13, 100, 100], [A(2, "Raise", 10), A(0, "Raise", 13), A(1, "Fold")]));
    expect(r.errors).toEqual([]);
    expect(r.state.toAct).toBe(2);
    expect(r.state.legal?.call).toBe(3);
    expect(r.state.legal?.raise).toBeNull();
  });

  it("le même all-in court : la BB, qui n'a pas encore parlé, peut relancer (minimum 13 + 9 = 22)", () => {
    const r = buildHandState(three([13, 100, 100], [A(2, "Raise", 10), A(0, "Raise", 13)]));
    expect(r.state.toAct).toBe(1);
    expect(r.state.legal?.raise).toEqual({ minTo: 22, maxTo: 100 });
  });

  it("deux all-in courts qui font ensemble une relance complète (+3 puis +7) : le relanceur peut relancer", () => {
    const r = buildHandState(four([20, 100, 100, 13], [A(2, "Raise", 10), A(3, "Raise", 13), A(0, "Raise", 20), A(1, "Fold")]));
    expect(r.errors).toEqual([]);
    expect(r.state.toAct).toBe(2);
    expect(r.state.legal?.raise).not.toBeNull();
  });

  it("deux all-in courts qui restent sous une relance complète (+3 puis +5) : payer ou se coucher", () => {
    const r = buildHandState(four([18, 100, 100, 13], [A(2, "Raise", 10), A(3, "Raise", 13), A(0, "Raise", 18), A(1, "Fold")]));
    expect(r.state.toAct).toBe(2);
    expect(r.state.legal?.raise).toBeNull();
    expect(r.state.legal?.call).toBe(8);
  });

  it("un all-in qui fait une relance complète rouvre les enchères", () => {
    const r = buildHandState(four([100, 100, 100, 25], [A(2, "Raise", 10), A(3, "Raise", 25), A(0, "Fold"), A(1, "Fold")]));
    expect(r.state.toAct).toBe(2);
    expect(r.state.legal?.raise).toEqual({ minTo: 40, maxTo: 100 });
  });

  it("une relance saisie alors que les enchères ne sont pas rouvertes est une erreur", () => {
    const r = buildHandState(three([13, 100, 100], [A(2, "Raise", 10), A(0, "Raise", 13), A(1, "Fold"), A(2, "Raise", 40)]));
    expect(r.errors.map(e => e.code)).toContain("RAISE_NOT_REOPENED");
  });

  it("un joueur à tapis reste dans le coup mais n'est plus jamais appelé à parler", () => {
    const r = buildHandState(three([13, 100, 100], [A(2, "Raise", 10), A(0, "Raise", 13), A(1, "Call", 12)]));
    expect(r.state.seats[0].allIn).toBe(true);
    expect(r.state.seats[0].folded).toBe(false);
    expect(r.state.toAct).toBe(2);
  });
});
