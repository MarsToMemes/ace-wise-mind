import { describe, it, expect } from "vitest";
import { siteView, actionBounds, menuToCall } from "@/lib/siteView";
import type { PlayerAction } from "@/components/ActionMenu";
import type { LiveHand } from "@/lib/liveHand";

// Corrections D35 (bugs trouvés par le banc tests-solveur). Table 6-max, bouton au siège 3 : UTG 0, MP 1, CO 2, BTN 3, SB 4, BB 5.
const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
const live = (actions: PlayerAction[], userIdx: number, stacks: number[], board: string[] = []): LiveHand =>
  ({ tableSize: 6, dealerIdx: 3, userIdx, stacks, hole: ["Ah", "Ad"], board, actions, folded: Array(6).fill(false), shown: {} });
const view = (l: LiveHand) => siteView({ live: l, tracked: true, stack: l.stacks[l.userIdx], potTyped: 0, callTyped: 0 });

describe("page : pot, menu d'action et fin de main (D35)", () => {
  it("call à tapis enregistré pour la mise entière : le pot de la table compte ce que le joueur a (191,5, pas 241,5)", () => {
    const v = view(live([A(0, "Preflop", "Raise", 80), A(1, "Preflop", "Call", 80), A(2, "Preflop", "Fold"), A(3, "Preflop", "Call", 80), A(4, "Preflop", "Fold"), A(5, "Preflop", "Fold")],
      1, [80, 150, 100, 30, 100, 100]));
    expect(v.tablePot).toBe(191.5);
  });
  it("le menu propose un « à payer » plafonné au tapis du joueur", () => {
    expect(menuToCall(80, 0, 30)).toBe(30);
    expect(menuToCall(80, 0, 100)).toBe(80);
    expect(menuToCall(3, 0.5, 2.5)).toBe(2);
  });
  it("relance minimale du menu : mise + plus grande relance (2,5 → 4 ; 2 → 3)", () => {
    const v1 = view(live([A(0, "Preflop", "Raise", 2.5)], 1, Array(6).fill(100)));
    expect(actionBounds(v1.currentBet, "Preflop", 100, v1.minRaiseTo).minAmt).toBe(4);
    const v2 = view(live([A(0, "Preflop", "Raise", 2)], 1, Array(6).fill(100)));
    expect(actionBounds(v2.currentBet, "Preflop", 100, v2.minRaiseTo).minAmt).toBe(3);
  });
  it("river fermée (check, check) : la page remplace le conseil par un message", () => {
    const acts = [A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Fold"), A(3, "Preflop", "Fold"), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5),
      ...(["Flop", "Turn", "River"] as const).flatMap(st => [A(5, st, "Check"), A(0, st, "Check")])];
    const v = view(live(acts, 5, Array(6).fill(100), ["Kd", "7c", "2s", "4h", "9d"]));
    expect(v.done).toMatch(/Main terminée/);
  });
  it("à ton tour, pas de message : le conseil reste affiché", () => {
    const v = view(live([A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Fold"), A(3, "Preflop", "Fold"), A(4, "Preflop", "Fold")], 5, Array(6).fill(100)));
    expect(v.done).toBeNull();
  });
  it("UTG a ouvert, les autres n'ont pas encore parlé : la main n'est pas finie", () => {
    const v = view(live([A(0, "Preflop", "Raise", 2.5)], 0, Array(6).fill(100)));
    expect(v.done).toBeNull();
  });
});
