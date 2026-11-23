// Raccord entre la main saisie sur le site et le moteur de règles (docs/DECISIONS.md D1) : la main est rejouée par
// core/handState (tapis par siège, pots annexes, mise rendue), puis réglée par core/settle.
import type { PlayerAction } from "@/components/ActionMenu";
import type { TableSize } from "@/components/PokerTable";
import { buildHandState, computePots, type BuildResult } from "@/core/handState";
import { settleHand } from "@/core/settle";
import type { RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";

export interface LiveHand {
  tableSize: number;
  dealerIdx: number;
  userIdx: number;
  /** Tapis de chaque siège au début de la main. */
  stacks: number[];
  hole: string[];
  board: string[];
  actions: PlayerAction[];
  /** Bouton « Couché » de la table. */
  folded: boolean[];
  /** Cartes montrées à l'abattage, par siège (texte libre, ex. « Kc Kd »). */
  shown: Record<number, string>;
}

export type LiveSettle =
  | { kind: "incomplete" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "ask"; pots: { pot: number; amount: number; eligible: number[]; main: boolean }[] }
  | { kind: "settled"; stacksAfter: number[]; rake: number };

const CARD = /([2-9TJQKA])([shdc])/gi;
const cardsOf = (t: string | undefined) => [...(t ?? "").matchAll(CARD)].map(m => m[1].toUpperCase() + m[2].toLowerCase());

/**
 * Rejoue la main du site. Comme pour le conseil, un joueur sans aucune action saisie se couche quand vient son tour (sauf
 * toi avec tes cartes) ; un joueur marqué « Couché » sur la table après avoir joué est couché après le rejeu, son
 * argent restant au pot.
 */
export function replayLive(h: LiveHand): BuildResult {
  // le board avance au rythme des actions saisies (sinon le moteur passerait au flop trop tôt)
  const CARDS: Record<PlayerAction["street"], number> = { Preflop: 0, Flop: 3, Turn: 4, River: 5 };
  const build = (actions: PlayerAction[], upTo?: PlayerAction["street"]) => buildHandState({
    tableSize: h.tableSize as TableSize, dealerIdx: h.dealerIdx, heroIdx: h.userIdx, stacksBB: h.stacks,
    hole: h.hole, board: upTo ? h.board.slice(0, CARDS[upTo]) : h.board, actions,
  });
  const queue = [...h.actions];
  const out: PlayerAction[] = [];
  const keeps = (seat: number) => (seat === h.userIdx && h.hole.length === 2) || queue.some(a => a.seatIdx === seat);
  let res = build(out, queue[0]?.street);
  for (let guard = 0; guard < 400; guard++) {
    const toAct = res.state.toAct;
    const next = queue[0];
    if (toAct >= 0 && !keeps(toAct) && !h.actions.some(a => a.seatIdx === toAct)) {
      out.push({ seatIdx: toAct, street: res.state.street, type: "Fold", amountBB: 0 });
    } else if (next) {
      out.push(queue.shift()!);
    } else break;
    res = build(out, queue[0]?.street);
  }
  res = build(out);
  const late = res.state.seats.filter(s => h.folded[s.idx] && !s.folded);
  if (late.length) {
    late.forEach(s => { s.folded = true; });
    res.state.pots = computePots(res.state.seats, false);
  }
  return res;
}

/**
 * Règle la main : seul joueur restant, ou abattage (river posée, aucune mise en attente). Les mains connues
 * (les tiennes, les cartes montrées) désignent les gagnants ; sinon on demande le gagnant de chaque pot (`choices`).
 */
export function settleLive(h: LiveHand, o: { rake?: RakeRule | null; choices?: Record<number, number[]> }): LiveSettle {
  const res = replayLive(h);
  if (!res.valid) return { kind: "invalid", errors: res.errors.map(e => e.message) };
  const st = res.state;
  const live = st.seats.filter(s => !s.folded);
  const pending = live.some(s => !s.allIn && s.streetBB < st.currentBet - 1e-9);
  const finished = live.length <= 1 || (h.board.length === 5 && !pending);
  if (!finished) return { kind: "incomplete" };

  const ranks: Record<number, number> = {};
  if (h.board.length === 5) {
    for (const s of live) {
      const cards = s.idx === h.userIdx ? h.hole : cardsOf(h.shown[s.idx]);
      if (cards.length === 2) ranks[s.idx] = rank7([...cards, ...h.board]);
    }
  }
  const winners = o.choices ? st.pots.filter(p => p.kind !== "refund").map(p => o.choices![st.pots.indexOf(p)] ?? []) : undefined;
  const s = settleHand(st, { ranks, winners, rake: o.rake ?? null });
  if (s.unresolved.length) {
    return { kind: "ask", pots: s.unresolved.map(u => ({ pot: u.pot, amount: st.pots[u.pot].amount, eligible: u.eligible, main: st.pots[u.pot].kind === "main" })) };
  }
  return { kind: "settled", stacksAfter: s.stacksAfter, rake: s.rake };
}
