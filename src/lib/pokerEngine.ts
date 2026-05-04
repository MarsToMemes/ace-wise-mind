// Local poker evaluation engine
export type Card = string; // e.g. "As", "Td", "2c"

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS = ["s", "h", "d", "c"] as const;
export const SUIT_SYMBOLS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

const rankVal = (r: string) => RANKS.indexOf(r) + 2; // 2..14

export function parseCard(c: Card) {
  return { rank: c[0], suit: c[1], val: rankVal(c[0]) };
}

export const HAND_CATEGORIES = [
  "High Card", "Pair", "Two Pair", "Three of a Kind",
  "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush",
] as const;
export type HandCategory = typeof HAND_CATEGORIES[number];

export const CATEGORY_SCORE: Record<HandCategory, number> = {
  "High Card": 10,
  "Pair": 30,
  "Two Pair": 50,
  "Three of a Kind": 70,
  "Straight": 90,
  "Flush": 110,
  "Full House": 130,
  "Four of a Kind": 150,
  "Straight Flush": 180,
};

function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, combo: T[]) => {
    if (combo.length === k) { res.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  };
  rec(0, []);
  return res;
}

function evaluate5(cards: Card[]): { category: HandCategory; tiebreak: number[] } {
  const parsed = cards.map(parseCard);
  const vals = parsed.map(p => p.val).sort((a, b) => b - a);
  const suits = parsed.map(p => p.suit);
  const counts = new Map<number, number>();
  vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  const grouped = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = suits.every(s => s === suits[0]);
  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  let isStraight = false;
  let topStraight = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; topStraight = uniq[0]; }
    else if (uniq.join(",") === "14,5,4,3,2") { isStraight = true; topStraight = 5; }
  }
  if (isStraight && isFlush) return { category: "Straight Flush", tiebreak: [topStraight] };
  if (grouped[0][1] === 4) return { category: "Four of a Kind", tiebreak: [grouped[0][0], grouped[1][0]] };
  if (grouped[0][1] === 3 && grouped[1][1] === 2) return { category: "Full House", tiebreak: [grouped[0][0], grouped[1][0]] };
  if (isFlush) return { category: "Flush", tiebreak: vals };
  if (isStraight) return { category: "Straight", tiebreak: [topStraight] };
  if (grouped[0][1] === 3) return { category: "Three of a Kind", tiebreak: [grouped[0][0], ...vals.filter(v => v !== grouped[0][0])] };
  if (grouped[0][1] === 2 && grouped[1][1] === 2) return { category: "Two Pair", tiebreak: [grouped[0][0], grouped[1][0], grouped[2][0]] };
  if (grouped[0][1] === 2) return { category: "Pair", tiebreak: [grouped[0][0], ...vals.filter(v => v !== grouped[0][0])] };
  return { category: "High Card", tiebreak: vals };
}

export function evaluateBest(allCards: Card[]): { category: HandCategory; score: number; bestFive: Card[] } {
  if (allCards.length < 5) {
    // Partial — score by current pairs/highs
    const parsed = allCards.map(parseCard);
    const counts = new Map<number, number>();
    parsed.forEach(p => counts.set(p.val, (counts.get(p.val) || 0) + 1));
    const max = Math.max(...counts.values());
    let cat: HandCategory = "High Card";
    if (max === 4) cat = "Four of a Kind";
    else if (max === 3) cat = "Three of a Kind";
    else if (max === 2) {
      const pairs = [...counts.values()].filter(v => v === 2).length;
      cat = pairs >= 2 ? "Two Pair" : "Pair";
    }
    return { category: cat, score: CATEGORY_SCORE[cat], bestFive: allCards };
  }
  const combos = combinations(allCards, 5);
  let best: { category: HandCategory; tiebreak: number[]; cards: Card[] } | null = null;
  for (const c of combos) {
    const e = evaluate5(c);
    if (!best || compareEval(e, { category: best.category, tiebreak: best.tiebreak }) > 0) {
      best = { category: e.category, tiebreak: e.tiebreak, cards: c };
    }
  }
  return { category: best!.category, score: CATEGORY_SCORE[best!.category], bestFive: best!.cards };
}

function compareEval(a: { category: HandCategory; tiebreak: number[] }, b: { category: HandCategory; tiebreak: number[] }) {
  const sa = CATEGORY_SCORE[a.category], sb = CATEGORY_SCORE[b.category];
  if (sa !== sb) return sa - sb;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] || 0, bv = b.tiebreak[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Draw detection
export function detectDraws(hole: Card[], board: Card[]): { drawType: string; outs: number } {
  const all = [...hole, ...board];
  if (board.length < 3) return { drawType: "None", outs: 0 };
  const parsed = all.map(parseCard);
  const suitCounts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  parsed.forEach(p => suitCounts[p.suit]++);
  const flushDraw = Object.values(suitCounts).some(c => c === 4);

  const vals = [...new Set(parsed.map(p => p.val))].sort((a, b) => a - b);
  // Check straight draws by scanning windows of 5 ranks
  let openEnded = false, gutshot = false;
  const set = new Set(vals);
  const lowAce = set.has(14) ? [...vals, 1] : vals;
  const sortedLow = [...new Set(lowAce)].sort((a, b) => a - b);
  for (let lo = 1; lo <= 10; lo++) {
    const window = [lo, lo + 1, lo + 2, lo + 3, lo + 4];
    const have = window.filter(v => sortedLow.includes(v)).length;
    if (have === 4) {
      // Determine if open-ended (consecutive 4) vs gutshot
      const consec = window.filter(v => sortedLow.includes(v));
      const isConsec = consec.length === 4 && consec[3] - consec[0] === 3;
      if (isConsec && lo > 1 && lo < 10) openEnded = true;
      else gutshot = true;
    }
  }

  let drawType = "None";
  let outs = 0;
  if (flushDraw && openEnded) { drawType = "Flush + OESD"; outs = 15; }
  else if (flushDraw && gutshot) { drawType = "Flush + Gutshot"; outs = 12; }
  else if (flushDraw) { drawType = "Flush Draw"; outs = 9; }
  else if (openEnded) { drawType = "Open-Ended Straight"; outs = 8; }
  else if (gutshot) { drawType = "Gutshot"; outs = 4; }
  return { drawType, outs };
}

// Board texture
export function classifyTexture(board: Card[]): "Dry" | "Semi-wet" | "Wet" {
  if (board.length < 3) return "Dry";
  const parsed = board.map(parseCard);
  const suitCounts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  parsed.forEach(p => suitCounts[p.suit]++);
  const flushPotential = Math.max(...Object.values(suitCounts));
  const vals = [...new Set(parsed.map(p => p.val))].sort((a, b) => a - b);
  let connectivity = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] <= 2) connectivity++;
  const flushDraw = flushPotential >= 3;
  const monotone = flushPotential >= 3;
  const connected = connectivity >= 2;
  if (monotone && connected) return "Wet";
  if (flushDraw || connected) return "Semi-wet";
  return "Dry";
}

// Range advantage heuristic
export function rangeAdvantage(position: string, board: Card[]): { hero: string; villain: string } {
  const aggressivePos = ["BTN", "CO"].includes(position);
  const blindPos = ["SB", "BB"].includes(position);
  const parsed = board.map(parseCard);
  const highCards = parsed.filter(p => p.val >= 11).length;
  const lowBoard = parsed.length >= 3 && parsed.every(p => p.val <= 9);

  let hero = "Neutral", villain = "Neutral";
  if (aggressivePos && highCards >= 2) { hero = "Strong"; villain = "Weak"; }
  else if (aggressivePos) { hero = "Slight"; villain = "Slight"; }
  else if (blindPos && lowBoard) { hero = "Slight"; villain = "Neutral"; }
  else if (blindPos && highCards >= 2) { hero = "Weak"; villain = "Strong"; }
  return { hero, villain };
}

export function potOdds(call: number, pot: number) {
  if (!call || call <= 0) return null;
  const odds = call / (pot + call);
  return { odds, reqEquity: odds * 100 };
}

export function suggestAction(opts: {
  score: number; outs: number; potOdds: number | null;
}): "Raise" | "Call" | "Check" | "Fold" {
  const { score, outs, potOdds: po } = opts;
  if (score >= 90) return "Raise";
  if (score >= 50 && (po === null || po < 0.33)) return "Raise";
  if (score >= 30 && (po === null || po < 0.4)) return "Call";
  if (outs >= 8 && po !== null && po < (outs * 2) / 100) return "Call";
  if (po === null) return "Check";
  return "Fold";
}

export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(r + s);
  return out;
}
