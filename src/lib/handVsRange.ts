// =============================================================
// HAND vs RANGE — true range-relative hand strength evaluator.
// =============================================================
// Estimates opponent hand DISTRIBUTIONS (not single hands) from
// the range readout, then computes hero equity vs that combined
// range via Monte Carlo. Classifies hand_vs_range_strength as:
//   "Strong vs Range" / "Medium vs Range" / "Weak vs Range"
// with multiway-adjusted thresholds (tighter requirements when
// more opponents are live).
//
// The result is used to OVERRIDE absolute hand-strength tiers so
// that e.g. top-pair on a wet board vs a polarized 3-bettor is
// no longer mis-classified as "Strong".

import { evaluateBest, parseCard, RANKS, SUITS, type Card } from "./pokerEngine";
import type { OpponentRange, RangeType } from "./rangeInference";

// ---------------- Chen-style preflop strength ----------------
function chen(a: Card, b: Card): number {
  const pa = parseCard(a), pb = parseCard(b);
  const high = Math.max(pa.val, pb.val);
  const low = Math.min(pa.val, pb.val);
  const suited = pa.suit === pb.suit;
  const pair = pa.val === pb.val;
  const baseMap: Record<number, number> = { 14: 10, 13: 8, 12: 7, 11: 6 };
  let s = baseMap[high] ?? high / 2;
  if (pair) {
    s = Math.max(5, (baseMap[high] ?? high / 2) * 2);
    if (high === 5) s = 6;
  }
  if (suited) s += 2;
  const gap = high - low - 1;
  if (!pair) {
    if (gap === 1) s -= 1;
    else if (gap === 2) s -= 2;
    else if (gap === 3) s -= 4;
    else if (gap >= 4) s -= 5;
  }
  if (high <= 12 && gap <= 1 && !pair && low >= 5) s += 1;
  return s;
}

// Pre-build all 1326 combos sorted by chen desc (deck order is stable).
const ALL_COMBOS: { combo: [Card, Card]; chen: number }[] = (() => {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  const out: { combo: [Card, Card]; chen: number }[] = [];
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      out.push({ combo: [deck[i], deck[j]], chen: chen(deck[i], deck[j]) });
    }
  }
  return out.sort((a, b) => b.chen - a.chen);
})();

// strength 0..100 → fraction of starting hands the opponent could hold.
function rangePct(strength: number, opponents: number): number {
  // Tighter when more opponents (multiway tightens ranges).
  const base = Math.max(0.05, Math.min(1, (110 - strength) / 100));
  const tighten = Math.pow(0.88, Math.max(0, opponents - 1));
  return Math.max(0.04, base * tighten);
}

function buildOpponentCombos(
  opp: OpponentRange,
  opponents: number,
  dead: Set<Card>,
): [Card, Card][] {
  const pct = rangePct(opp.estimatedStrength, opponents);
  const live = ALL_COMBOS.filter(c => !dead.has(c.combo[0]) && !dead.has(c.combo[1]));
  if (live.length === 0) return [];
  const n = Math.max(1, Math.floor(live.length * pct));

  const top = live.slice(0, n);
  if (opp.rangeType === "capped") {
    // Remove the very top of the range (no nutted hands).
    const cut = Math.max(1, Math.floor(n * 0.15));
    return top.slice(cut).map(c => c.combo);
  }
  if (opp.rangeType === "polarized") {
    // Mix of top value combos + low chen-score "bluff" combos.
    const valueN = Math.max(1, Math.floor(n * 0.55));
    const bluffN = Math.max(1, Math.floor(n * 0.35));
    const value = live.slice(0, valueN).map(c => c.combo);
    const bluff = live.slice(-bluffN).map(c => c.combo);
    return [...value, ...bluff];
  }
  if (opp.rangeType === "linear") {
    return top.map(c => c.combo);
  }
  if (opp.rangeType === "merged") {
    // Merged: middle of strong + medium hands (strip bottom of range).
    return top.slice(0, Math.max(1, Math.floor(n * 0.85))).map(c => c.combo);
  }
  // wide / unknown
  return top.map(c => c.combo);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface HandVsRangeInput {
  hole: Card[];
  board: Card[];
  opponentRanges: OpponentRange[];
  sims?: number;
}

export type HandVsRangeStrength = "Strong vs Range" | "Medium vs Range" | "Weak vs Range";

export interface HandVsRangeResult {
  equity_percentage: number;          // 0..100
  hand_vs_range_strength: HandVsRangeStrength;
  confidence_level: number;           // 0..1
  percentileVsRange: number;          // 0..100 — share of opp combos hero beats
  opponents: number;
  detail: string;                     // short reason string
}

/**
 * Monte Carlo hero equity vs combined opponent ranges.
 * Each sim: sample one combo per opponent from their estimated range
 * (no replacement), complete the board, evaluate showdown.
 */
export function evaluateHandVsRange(inp: HandVsRangeInput): HandVsRangeResult | null {
  const { hole, board, opponentRanges } = inp;
  if (hole.length !== 2 || opponentRanges.length === 0) return null;

  const dead = new Set<Card>([...hole, ...board]);
  const oppCombos = opponentRanges.map(o => buildOpponentCombos(o, opponentRanges.length, dead));
  if (oppCombos.some(list => list.length === 0)) return null;

  const remainingBoard = 5 - board.length;
  const N = inp.sims ?? (opponentRanges.length === 1 ? 350 : 250);

  let wins = 0;
  let ties = 0;
  let beatCount = 0;   // total opp-combos hero beats across sims (for percentile)
  let totalOppHands = 0;

  for (let s = 0; s < N; s++) {
    // Build live deck excluding dead cards
    const live: Card[] = [];
    for (const r of RANKS) for (const su of SUITS) {
      const c = r + su;
      if (!dead.has(c)) live.push(c);
    }

    // Sample opp hands without replacement
    const usedThisSim = new Set<Card>();
    const oppHands: [Card, Card][] = [];
    let abort = false;
    for (const list of oppCombos) {
      // Try a few random picks until we find one that doesn't collide
      let picked: [Card, Card] | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const cand = list[Math.floor(Math.random() * list.length)];
        if (!usedThisSim.has(cand[0]) && !usedThisSim.has(cand[1])) {
          picked = cand;
          break;
        }
      }
      if (!picked) { abort = true; break; }
      usedThisSim.add(picked[0]);
      usedThisSim.add(picked[1]);
      oppHands.push(picked);
    }
    if (abort) continue;

    // Remove opp cards from live, shuffle, draw remaining board
    const deckMinusOpps = live.filter(c => !usedThisSim.has(c));
    const drawn = shuffle(deckMinusOpps).slice(0, remainingBoard);
    const finalBoard = [...board, ...drawn];

    const heroEval = evaluateBest([...hole, ...finalBoard]);
    const heroVal = (heroEval.score) * 1e6 + tieScore(heroEval.bestFive);

    let bestOpp = -Infinity;
    let beatLocal = 0;
    for (const oh of oppHands) {
      const oe = evaluateBest([...oh, ...finalBoard]);
      const ov = oe.score * 1e6 + tieScore(oe.bestFive);
      if (ov > bestOpp) bestOpp = ov;
      if (heroVal > ov) beatLocal++;
    }
    totalOppHands += oppHands.length;
    beatCount += beatLocal;

    if (heroVal > bestOpp) wins++;
    else if (heroVal === bestOpp) ties += 1 / (1 + oppHands.filter(_ => true).length);
  }

  const equity = ((wins + ties) / N) * 100;
  const percentile = totalOppHands > 0 ? (beatCount / totalOppHands) * 100 : 0;

  // Multiway-adjusted classification thresholds
  const k = opponentRanges.length;
  const strongEq = 58 + (k - 1) * 8;   // HU 58, 3-way 66, 4-way 74
  const mediumEq = 40 + (k - 1) * 5;

  let cat: HandVsRangeStrength;
  if (equity >= strongEq) cat = "Strong vs Range";
  else if (equity >= mediumEq) cat = "Medium vs Range";
  else cat = "Weak vs Range";

  // Confidence: more sims + heads-up + extreme equity = higher confidence
  let conf = 0.55;
  if (N >= 300) conf += 0.1;
  if (k === 1) conf += 0.1;
  if (k >= 3) conf -= 0.05;
  if (equity >= 75 || equity <= 25) conf += 0.15;
  conf = Math.max(0.3, Math.min(0.95, conf));

  return {
    equity_percentage: +equity.toFixed(1),
    hand_vs_range_strength: cat,
    confidence_level: +conf.toFixed(2),
    percentileVsRange: +percentile.toFixed(0),
    opponents: k,
    detail: `${equity.toFixed(0)}% equity vs ${k} opp range(s) — beats ${percentile.toFixed(0)}% of their combos`,
  };
}

// Stable tiebreaker — sum hand vals
function tieScore(cards: Card[]): number {
  let s = 0;
  for (const c of cards) s = s * 15 + parseCard(c).val;
  return s;
}
