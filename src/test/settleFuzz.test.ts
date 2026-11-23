import { describe, it, expect } from "vitest";
import { buildHandState, checkInvariants } from "@/core/handState";
import { settleHand } from "@/core/settle";
import { CASH_RAKE } from "@/core/rake";
import { FULL_DECK } from "@/engines/rangeVsRange";
import type { PlayerAction } from "@/components/ActionMenu";
import type { TableSize } from "@/components/PokerTable";

// Générateur reproductible (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const half = (x: number) => Math.round(x * 2) / 2;

/** Une main jouée au hasard, avec seulement des actions légales proposées par le moteur. */
function randomHand(seed: number) {
  const r = rng(seed);
  const n = (2 + Math.floor(r() * 5)) as TableSize;
  const dealerIdx = Math.floor(r() * n);
  const stacks = Array.from({ length: n }, () => half(3 + r() * 197));
  const deck = [...FULL_DECK].sort(() => r() - 0.5);
  const actions: PlayerAction[] = [];
  let board: string[] = [];
  const problems: string[] = [];
  for (let guard = 0; guard < 300; guard++) {
    const res = buildHandState({ tableSize: n, dealerIdx, heroIdx: 0, stacksBB: stacks, hole: [], board, actions });
    problems.push(...res.errors.map(e => `${e.code} ${e.message}`), ...checkInvariants(res.state).map(v => v.code));
    const st = res.state;
    if (st.toAct < 0) {
      const live = st.seats.filter(s => !s.folded);
      if (live.length <= 1 || board.length === 5) return { st, stacks, problems, r };
      board = deck.slice(0, board.length === 0 ? 3 : board.length + 1);
      continue;
    }
    const L = st.legal!;
    const opts: (() => PlayerAction)[] = [];
    const mk = (type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx: st.toAct, street: st.street, type, amountBB });
    if (st.toCall > 0) opts.push(() => mk("Fold"));
    if (L.check) opts.push(() => mk("Check"), () => mk("Check"));
    if (L.call > 0) opts.push(() => mk("Call", L.call), () => mk("Call", L.call));
    if (L.bet) opts.push(() => mk("Bet", Math.min(L.bet!.max, Math.max(L.bet!.min, half(L.bet!.min + r() * (L.bet!.max - L.bet!.min))))));
    if (L.raise) opts.push(() => mk("Raise", Math.min(L.raise!.maxTo, Math.max(L.raise!.minTo, half(L.raise!.minTo + r() * (L.raise!.maxTo - L.raise!.minTo))))));
    actions.push(opts[Math.floor(r() * opts.length)]());
  }
  throw new Error(`main ${seed} trop longue`);
}

describe("conservation des jetons sur 500 mains aléatoires (2 à 6 joueurs, tapis différents, rake cash)", () => {
  it("aucune erreur du moteur, rien ne se perd ni ne se crée", () => {
    let sidePotHands = 0, refunds = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const { st, stacks, problems, r } = randomHand(seed);
      expect(problems, `main ${seed}`).toEqual([]);
      const ranks: Record<number, number> = {};
      st.seats.forEach(s => { if (!s.folded) ranks[s.idx] = Math.floor(r() * 4); }); // égalités possibles
      const s = settleHand(st, { ranks, rake: CASH_RAKE });
      expect(s.unresolved, `main ${seed}`).toEqual([]);
      expect(s.payouts.reduce((t, x) => t + x, 0) + s.rake, `main ${seed}`).toBeCloseTo(st.pot, 6);
      expect(s.stacksAfter.reduce((t, x) => t + x, 0) + s.rake, `main ${seed}`).toBeCloseTo(stacks.reduce((t, x) => t + x, 0), 6);
      expect(Math.min(...s.stacksAfter), `main ${seed}`).toBeGreaterThanOrEqual(0);
      expect(s.rake, `main ${seed}`).toBeLessThanOrEqual(3 + 1e-9);
      if (st.pots.filter(p => p.kind !== "refund").length >= 2) sidePotHands++;
      if (st.pots.some(p => p.kind === "refund")) refunds++;
    }
    // le tirage couvre bien les cas difficiles
    expect(sidePotHands).toBeGreaterThan(20);
    expect(refunds).toBeGreaterThan(50);
  });
});
