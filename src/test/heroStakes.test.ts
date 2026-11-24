import { describe, it, expect } from "vitest";
import { heroStakes } from "@/lib/heroStakes";
import type { LiveHand } from "@/lib/liveHand";
import type { PlayerAction } from "@/components/ActionMenu";
import { advisePostflop, type PostflopInput } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";

// Rapport de test : tapis face à un all-in, tapis saisi ignoré, tapis effectif et SPR, libellé « Check-raise ».
// Table 6-max, bouton au siège 3 : UTG 0, MP 1, CO 2, BTN 3, SB 4, BB 5.
const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
const live = (actions: PlayerAction[], userIdx: number, stacks = Array(6).fill(100), board = ["Kh", "9d", "4c"]): LiveHand =>
  ({ tableSize: 6, dealerIdx: 3, userIdx, stacks, hole: ["Ah", "Kd"], board, actions, folded: Array(6).fill(false), shown: {} });

describe("ce qui reste en jeu pour toi (moteur de règles)", () => {
  it("(A) au flop, après 2,5 bb préflop : il te reste 97,5 bb, tapis effectif 97,5, pot 5,5 (SPR 17,7)", () => {
    const s = heroStakes(live([A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Fold"), A(3, "Preflop", "Raise", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5)], 5));
    expect(s.remaining).toBe(97.5);
    expect(s.effective).toBe(97.5);
    expect(s.pot).toBe(5.5);
    expect(Math.round((s.effective / s.pot) * 10) / 10).toBe(17.7);
    expect(s.canRaise).toBe(true);
  });
  it("(G) tu as 30 bb en BB, tu relances à 8,5, UTG fait tapis (100) : à payer 21,5, pot 39, plus de relance possible", () => {
    const stacks = [100, 100, 100, 100, 100, 30];
    const s = heroStakes(live([A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Fold"), A(3, "Preflop", "Fold"), A(4, "Preflop", "Fold"),
      A(5, "Preflop", "Raise", 8.5), A(0, "Preflop", "Raise", 100)], 5, stacks, []));
    expect(s.remaining).toBe(21.5);
    expect(s.toCall).toBe(21.5);
    expect(s.pot).toBe(39);
    expect(s.effective).toBe(21.5);
    expect(s.canRaise).toBe(false);
  });
  it("adversaire à tapis mais un autre a encore des jetons : la relance reste possible", () => {
    const stacks = [100, 100, 40, 100, 100, 100];
    const s = heroStakes(live([A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 40), A(3, "Preflop", "Fold"), A(4, "Preflop", "Call", 39.5)], 5, stacks, []));
    expect(s.toCall).toBe(39);
    expect(s.canRaise).toBe(true);
  });
  it("tout-tapis d'un joueur : le bouton « Tapis » met tout ce qui lui reste, en plus de ce qu'il a déjà mis sur la street", () => {
    const s = heroStakes(live([A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Fold"), A(2, "Preflop", "Fold"), A(3, "Preflop", "Fold"), A(4, "Preflop", "Fold"),
      A(5, "Preflop", "Raise", 8.5)], 5, [30, 100, 100, 100, 100, 100], []));
    expect(s.allInTo[0]).toBe(30);      // UTG : 2,5 déjà mis + 27,5 derrière
    expect(s.allInTo[5]).toBe(100);
  });
});

const flop = ["Ks", "7d", "2c"];
const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const base = (p: Partial<PostflopInput> = {}): PostflopInput => ({
  street: "Flop", board: flop, hole: ["Kd", "Kc"],
  heroRange: R("22-QQ,A2s-AQs,K2s+,Q6s+,J7s+,T7s+,97s+,86s+,75s+,64s+,54s,A8o-AQo,KTo+,QTo+,JTo", flop),
  villainRange: R("22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A5o+,K9o+,Q9o+,J9o+,T9o", ["Kd", "Kc", ...flop]),
  heroInPosition: false, heroIsPfr: false, potBB: 30, toCallBB: 20, heroStackBB: 80, opponents: 1,
  villainCheckedThisStreet: false, samples: 1500, ...p,
});

describe("conseiller postflop", () => {
  it("face à un tapis (plus de relance possible), la main très forte paie au lieu de proposer « Tapis »", () => {
    const a = advisePostflop(base({ canRaise: false }));
    expect(a.action).toBe("call");
    expect(a.verb).toBe("CALL");
    expect(a.label).toBe("Call 20 BB");
  });
  it("relance permise : la relance pour la value reste proposée, bornée par ce qu'il te reste", () => {
    const a = advisePostflop(base({ canRaise: true, toCallBB: 10, potBB: 20, heroStackBB: 80 }));
    expect(["raise", "jam"]).toContain(a.action);
    expect(a.sizeBB!).toBeLessThanOrEqual(80);
  });
  it("« Check-raise » seulement si tu as checké sur cette street ; après ta propre mise, c'est une relance", () => {
    const afterBet = advisePostflop(base({ canRaise: true, toCallBB: 10, potBB: 20, heroCheckedThisStreet: false }));
    expect(afterBet.label).not.toMatch(/Check-raise/);
    const afterCheck = advisePostflop(base({ canRaise: true, toCallBB: 10, potBB: 20, heroCheckedThisStreet: true }));
    if (afterCheck.action === "raise") expect(afterCheck.label).toMatch(/Check-raise/);
  });
});
