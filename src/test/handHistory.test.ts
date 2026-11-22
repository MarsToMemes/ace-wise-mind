import { describe, it, expect, beforeEach } from "vitest";
import { saveHand, loadHands, deleteHand, clearHands, summarizeLine, HISTORY_KEY, HISTORY_MAX, type HandSnapshot } from "@/lib/handHistory";

// 6 joueurs, bouton au siège 3 : UTG = 0, MP = 1, CO = 2, BTN = 3, SB = 4, BB = 5 ; le joueur est au BTN.
const hand = (over: Partial<HandSnapshot> = {}): HandSnapshot => ({
  tableSize: 6, dealerIdx: 3, userIdx: 3,
  hole: ["As", "Kd"], flop: [], turn: null, river: null,
  folded: [false, true, true, false, true, false],
  stack: 100, pot: 10, call: 0,
  actions: [
    { seatIdx: 0, street: "Preflop", type: "Raise", amountBB: 2.5 },
    { seatIdx: 1, street: "Preflop", type: "Fold", amountBB: 0 },
    { seatIdx: 2, street: "Preflop", type: "Fold", amountBB: 0 },
    { seatIdx: 3, street: "Preflop", type: "Raise", amountBB: 7.5 },
  ],
  shown: {},
  ...over,
});

describe("historique des mains", () => {
  beforeEach(() => localStorage.clear());

  it("enregistre une main avec sa date et la position du joueur, la plus récente en premier", () => {
    saveHand(hand({ hole: ["2c", "2d"] }), { at: 1000 });
    const h = saveHand(hand(), { at: 2000 });
    expect(h?.hero).toBe("BTN");
    const list = loadHands();
    expect(list.map(x => x.hole[0])).toEqual(["As", "2c"]);
    expect(list[0].at).toBe(2000);
    expect(list[0].id).toBeTruthy();
  });

  it("n'enregistre rien sans les deux cartes du joueur", () => {
    expect(saveHand(hand({ hole: ["As"] }))).toBeNull();
    expect(loadHands()).toEqual([]);
  });

  it("remplace la main rouverte au lieu d'en créer une deuxième, en gardant sa date", () => {
    const first = saveHand(hand(), { at: 1000 })!;
    saveHand(hand({ flop: ["Qh", "Jh", "2c"] }), { at: 5000, replaceId: first.id });
    const list = loadHands();
    expect(list).toHaveLength(1);
    expect(list[0].flop).toEqual(["Qh", "Jh", "2c"]);
    expect(list[0].at).toBe(1000);
  });

  it("garde au plus les 500 dernières mains", () => {
    for (let i = 0; i < HISTORY_MAX + 3; i++) saveHand(hand(), { at: i });
    const list = loadHands();
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0].at).toBe(HISTORY_MAX + 2);
  });

  it("supprime une main, ou toutes", () => {
    const a = saveHand(hand(), { at: 1 })!;
    saveHand(hand(), { at: 2 });
    deleteHand(a.id);
    expect(loadHands()).toHaveLength(1);
    clearHands();
    expect(loadHands()).toEqual([]);
  });

  it("ignore un stockage abîmé sans planter", () => {
    localStorage.setItem(HISTORY_KEY, "{pas du json");
    expect(loadHands()).toEqual([]);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ n: 1 }, null]));
    expect(loadHands()).toEqual([]);
  });

  it("résume la ligne en français : relances, appels, « Toi » pour le joueur, sans les folds des autres", () => {
    expect(summarizeLine(hand())).toBe("UTG relance 2,5 · Toi relance 7,5");
    const postflop = hand({
      flop: ["Qh", "Jh", "2c"],
      actions: [
        ...hand().actions,
        { seatIdx: 0, street: "Preflop", type: "Call", amountBB: 7.5 },
        { seatIdx: 0, street: "Flop", type: "Check", amountBB: 0 },
        { seatIdx: 3, street: "Flop", type: "Bet", amountBB: 6 },
        { seatIdx: 0, street: "Flop", type: "Fold", amountBB: 0 },
      ],
    });
    expect(summarizeLine(postflop)).toBe("UTG relance 2,5 · Toi relance 7,5 · UTG paye | Flop : UTG check · Toi mise 6 · UTG se couche");
  });

  it("dit quand le joueur se couche", () => {
    const h = hand({ actions: [{ seatIdx: 0, street: "Preflop", type: "Raise", amountBB: 2.5 }, { seatIdx: 3, street: "Preflop", type: "Fold", amountBB: 0 }] });
    expect(summarizeLine(h)).toBe("UTG relance 2,5 · Toi se couche");
  });
});
