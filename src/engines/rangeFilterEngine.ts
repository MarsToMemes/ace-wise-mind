// Range filter engine — narrows villain range action-by-action.

export interface RangeCombo {
  hand: string;
  probability: number;
  combos: number;
  category?: "value" | "bluff" | "medium";
}

const GTO_RANGES: Record<string, string[]> = {
  UTG: ["AA","KK","QQ","JJ","TT","99","88","AKs","AQs","AJs","ATs","A9s","KQs","AKo","AQo"],
  MP:  ["AA","KK","QQ","JJ","TT","99","88","77","AKs","AQs","AJs","ATs","A9s","A8s","KQs","KJs","QJs","AKo","AQo","AJo"],
  CO:  ["AA","KK","QQ","JJ","TT","99","88","77","66","55","AKs","AQs","AJs","ATs","A9s","A8s","A7s","A5s","A4s","KQs","KJs","KTs","QJs","QTs","JTs","AKo","AQo","AJo","ATo","KQo"],
  BTN: ["AA","KK","QQ","JJ","TT","99","88","77","66","55","44","33","22","AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s","KQs","KJs","KTs","K9s","QJs","QTs","Q9s","JTs","J9s","T9s","98s","87s","76s","AKo","AQo","AJo","ATo","A9o","KQo","KJo","KTo","QJo"],
  SB:  ["AA","KK","QQ","JJ","TT","99","88","77","66","55","44","AKs","AQs","AJs","ATs","A9s","A8s","A7s","A5s","A4s","KQs","KJs","KTs","QJs","JTs","T9s","98s","AKo","AQo","AJo","ATo","KQo","KJo"],
};

const RANK_ORDER = "AKQJT98765432";
const rankVal = (r: string) => 14 - RANK_ORDER.indexOf(r);

export function initializePreflopRange(position: string): RangeCombo[] {
  const baseHands = GTO_RANGES[position] || GTO_RANGES.CO;
  return baseHands.map(hand => ({
    hand,
    probability: 100,
    combos: getBaseCombos(hand),
    category: "medium" as const,
  }));
}

function getBaseCombos(hand: string): number {
  if (hand.length === 2) return 6;
  if (hand.endsWith("s")) return 4;
  return 12;
}

export function applyCardRemoval(range: RangeCombo[], deadCards: string[]): RangeCombo[] {
  return range
    .map(c => ({ ...c, combos: calculateCombosWithRemoval(c.hand, deadCards) }))
    .filter(c => c.combos > 0);
}

function calculateCombosWithRemoval(hand: string, deadCards: string[]): number {
  const r1 = hand[0], r2 = hand[1];
  const isPair = hand.length === 2;
  const isSuited = hand.endsWith("s");
  const d1 = deadCards.filter(c => c[0] === r1).length;
  const d2 = deadCards.filter(c => c[0] === r2).length;
  if (isPair) {
    const a = 4 - d1;
    return Math.max(0, (a * (a - 1)) / 2);
  }
  const a1 = 4 - d1, a2 = 4 - d2;
  if (isSuited) return Math.max(0, Math.min(a1, a2, 4));
  const total = a1 * a2;
  const suited = Math.min(a1, a2, 4);
  return Math.max(0, total - suited);
}

// Deterministic strength score (0..1) for a hand label
function handStrength(hand: string): number {
  if (hand.length === 2) {
    // pair
    return 0.55 + (rankVal(hand[0]) - 2) / 24; // 22→0.55, AA→1.05
  }
  const hi = rankVal(hand[0]);
  const lo = rankVal(hand[1]);
  const suited = hand.endsWith("s");
  let s = (hi + lo) / 30; // base
  if (suited) s += 0.08;
  if (hi - lo === 1) s += 0.05; // connector
  if (hi === 14) s += 0.05; // ace
  return s;
}

/**
 * Filter by flop action — deterministic, strength-aware.
 * Bet: keep top ~65% strongest + some bluff-candidate suited connectors.
 * Check: keep mid-strength (pot control / weak made hands).
 */
export function filterByFlopAction(range: RangeCombo[], action: "Bet" | "Check"): RangeCombo[] {
  const scored = range.map(c => ({ c, s: handStrength(c.hand) }));
  scored.sort((a, b) => b.s - a.s);
  if (action === "Bet") {
    const keep = Math.ceil(scored.length * 0.65);
    return scored.slice(0, keep).map(x => x.c);
  }
  // Check: drop top 25% (strong bets) and bottom 20% (gives up)
  const lo = Math.floor(scored.length * 0.25);
  const hi = Math.ceil(scored.length * 0.80);
  return scored.slice(lo, hi).map(x => x.c);
}

export function filterByTurnAction(range: RangeCombo[], action: "Bet" | "Check"): RangeCombo[] {
  const scored = range.map(c => ({ c, s: handStrength(c.hand) }));
  scored.sort((a, b) => b.s - a.s);
  if (action === "Bet") {
    const keep = Math.ceil(scored.length * 0.5);
    return scored.slice(0, keep).map(x => x.c);
  }
  const lo = Math.floor(scored.length * 0.20);
  const hi = Math.ceil(scored.length * 0.80);
  return scored.slice(lo, hi).map(x => x.c);
}

export function categorizeRiverRange(range: RangeCombo[], _board: string[]): RangeCombo[] {
  const scored = range.map(c => ({ c, s: handStrength(c.hand) }));
  scored.sort((a, b) => b.s - a.s);
  const n = scored.length;
  const valueCut = Math.ceil(n * 0.4);
  const mediumCut = Math.ceil(n * 0.6);
  return scored.map((x, i) => ({
    ...x.c,
    category: (i < valueCut ? "value" : i < mediumCut ? "medium" : "bluff") as RangeCombo["category"],
  }));
}
