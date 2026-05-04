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

// Equity estimation — Rule of 4 (flop→river) and Rule of 2 (turn→river / per street).
export function estimateEquity(outs: number, boardLen: number): number {
  if (outs <= 0) return 0;
  let pct = 0;
  if (boardLen <= 3) pct = outs * 4;       // flop → river
  else if (boardLen === 4) pct = outs * 2; // turn → river
  else pct = 0;                             // river — no draws
  return Math.max(0, Math.min(100, pct));
}

// Score modifiers based on draw, texture, position
export function adjustedScore(opts: {
  baseScore: number;
  outs: number;
  texture: "Dry" | "Semi-wet" | "Wet";
  position: string;
}): number {
  let s = opts.baseScore;
  if (opts.outs >= 12) s += 25;
  else if (opts.outs >= 8) s += 15;
  else if (opts.outs >= 4) s += 6;
  if (opts.texture === "Wet" && opts.baseScore < 110) s -= 8;
  if (opts.texture === "Dry" && opts.baseScore >= 50) s += 4;
  if (["BTN", "CO"].includes(opts.position)) s += 5;
  if (["SB", "BB"].includes(opts.position)) s -= 3;
  return Math.max(0, s);
}

// Deterministic decision rule engine — equity vs pot odds + hand strength.
export interface DecisionInput {
  baseScore: number;
  adjScore: number;
  outs: number;
  equityPct: number;       // 0..100
  potOddsPct: number | null; // required equity %, null if no call amount
  boardLen: number;
}
export interface DecisionOutput {
  action: "Raise" | "Call" | "Check" | "Fold";
  reason: string;
}

export function decide(d: DecisionInput): DecisionOutput {
  const { adjScore, baseScore, equityPct, potOddsPct, outs } = d;

  // Strong made hand → value raise
  if (baseScore >= 110) return { action: "Raise", reason: "Strong made hand — raise for value." };
  if (adjScore >= 90) return { action: "Raise", reason: "Premium strength after adjustments — bet/raise for value." };

  if (potOddsPct === null) {
    // No call amount → checking decision
    if (adjScore >= 60) return { action: "Raise", reason: "Decent strength with initiative — bet for value/protection." };
    if (outs >= 8) return { action: "Raise", reason: "Strong draw — semi-bluff has fold equity + equity." };
    if (adjScore >= 30) return { action: "Check", reason: "Marginal hand — control the pot." };
    return { action: "Check", reason: "Weak holding — check and reassess." };
  }

  // Facing a bet
  if (equityPct > potOddsPct + 5) {
    if (adjScore >= 90) return { action: "Raise", reason: `Equity ${equityPct.toFixed(0)}% beats required ${potOddsPct.toFixed(0)}% with strong hand — raise.` };
    return { action: "Call", reason: `Equity ${equityPct.toFixed(0)}% > pot odds ${potOddsPct.toFixed(0)}% — call profitably.` };
  }
  if (equityPct >= potOddsPct) {
    return { action: "Call", reason: `Equity (${equityPct.toFixed(0)}%) marginally meets pot odds (${potOddsPct.toFixed(0)}%) — call.` };
  }
  if (adjScore >= 70) return { action: "Call", reason: "Made hand with showdown value — call despite thin odds." };
  return { action: "Fold", reason: `Equity ${equityPct.toFixed(0)}% < required ${potOddsPct.toFixed(0)}% — fold.` };
}

// Street-based sizing strategy
export type Street = "Preflop" | "Flop" | "Turn" | "River";
export type SizingIntent = "Value" | "Bluff" | "Protection" | "Pot Control";

export interface SizingInput {
  street: Street;
  baseScore: number;
  adjScore: number;
  outs: number;
  equityPct: number;
  texture: "Dry" | "Semi-wet" | "Wet";
  position: string;
  pot: number;
  action: "Raise" | "Call" | "Check" | "Fold";
}

export interface SizingOutput {
  intent: SizingIntent;
  pctMin: number;        // % of pot (lower bound)
  pctMax: number;        // % of pot (upper bound)
  pctTarget: number;     // recommended % of pot
  amountBB: number;      // recommended size in BB
  reason: string;
}

export function recommendSizing(s: SizingInput): SizingOutput {
  const { street, baseScore, adjScore, outs, equityPct, texture, position, pot, action } = s;

  // Classify strategic intent
  let intent: SizingIntent;
  if (baseScore >= 110) intent = "Value";
  else if (baseScore >= 50 && adjScore >= 60) intent = "Value";
  else if (outs >= 8 && baseScore < 30) intent = "Bluff";
  else if (baseScore >= 30 && baseScore < 70 && texture !== "Dry") intent = "Protection";
  else if (baseScore >= 30 && baseScore < 70) intent = "Pot Control";
  else if (action === "Raise" && baseScore < 30) intent = "Bluff";
  else intent = "Pot Control";

  let pctMin = 33, pctMax = 66, reason = "";

  if (street === "Preflop") {
    pctMin = 200; pctMax = 300;
    if (["BTN", "CO"].includes(position)) { pctMin = 220; pctMax = 250; }
    if (["UTG", "MP", "HJ"].includes(position)) { pctMin = 250; pctMax = 300; }
    reason = "Preflop open: 2.2–3x BB depending on position.";
  } else if (street === "Flop") {
    if (texture === "Dry") {
      pctMin = 20; pctMax = 40;
      reason = "Dry flop — small range bet (20–40% pot) to deny equity cheaply.";
    } else if (texture === "Wet") {
      pctMin = 50; pctMax = 80;
      reason = "Wet flop — larger sizing (50–80% pot) for protection vs draws.";
    } else {
      pctMin = 33; pctMax = 60;
      reason = "Semi-wet flop — medium sizing (33–60% pot).";
    }
  } else if (street === "Turn") {
    if (intent === "Value" && baseScore >= 90) {
      pctMin = 60; pctMax = 100;
      reason = "Polarized turn value — 60–100% pot to charge draws.";
    } else if (intent === "Bluff" || (outs >= 8 && baseScore < 50)) {
      pctMin = 50; pctMax = 80;
      intent = "Bluff";
      reason = "Turn semi-bluff — 50–80% pot to maximize fold equity + equity realization.";
    } else if (intent === "Protection") {
      pctMin = 55; pctMax = 75;
      reason = "Turn protection bet — 55–75% pot vs medium-strong holdings.";
    } else {
      pctMin = 40; pctMax = 60;
      reason = "Turn pot-control sizing — 40–60% pot.";
    }
  } else { // River
    if (intent === "Value" && baseScore >= 110) {
      pctMin = 70; pctMax = 120;
      reason = "River value — 70–120% pot with strong made hand.";
    } else if (intent === "Value") {
      pctMin = 30; pctMax = 60;
      reason = "Thin river value — 30–60% pot to get called by worse.";
    } else if (intent === "Bluff") {
      pctMin = 80; pctMax = 120;
      reason = "River bluff — large 80–120% pot for max fold equity.";
    } else {
      pctMin = 0; pctMax = 0;
      reason = "River pot control — check / give up.";
    }
  }

  // Fold/Call: no sizing recommendation
  if (action === "Fold" || action === "Call") {
    return {
      intent: action === "Call" ? "Pot Control" : intent,
      pctMin: 0, pctMax: 0, pctTarget: 0, amountBB: 0,
      reason: action === "Fold" ? "No sizing — folding." : "No sizing — calling, not betting.",
    };
  }

  const pctTarget = Math.round((pctMin + pctMax) / 2);
  // Preflop: pct values represent xBB, not % of pot
  const amountBB = street === "Preflop"
    ? +(pctTarget / 100).toFixed(2)
    : +((pctTarget / 100) * pot).toFixed(2);

  return { intent, pctMin, pctMax, pctTarget, amountBB, reason };
}

// Legacy simple helper kept for compatibility
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
