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
export function estimateEquity(outs: number, boardLen: number, backdoorOuts = 0): number {
  if (outs <= 0 && backdoorOuts <= 0) return 0;
  let pct = 0;
  if (boardLen <= 3) pct = outs * 4;       // flop → river
  else if (boardLen === 4) pct = outs * 2; // turn → river
  else pct = 0;                             // river — no draws
  if (boardLen === 3 && backdoorOuts > 0) pct += backdoorOuts * 0.5; // backdoor ~ half an out
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

// ============================================================
// RELATIVE HAND STRENGTH CLASSIFIER (contextual, not absolute)
// ============================================================
// Classifies a hand as Strong / Medium / Weak / Draw RELATIVE to:
//   board texture, number of players, position, street, and (when available)
//   action history pressure. Does NOT use absolute thresholds like
//   "score < 50 = weak". Top pair on a wet 4-way pot ≠ top pair HU on a dry board.

export type HandCategory4 = "Strong" | "Medium" | "Weak" | "Draw";

export interface HandClassificationInput {
  baseScore: number;                        // raw made-hand score (0..180)
  category: HandCategory;                   // made-hand label
  outs: number;                             // draw outs
  drawType: string;                         // "Flush Draw", etc.
  equityPct: number;                        // 0..100
  texture: "Dry" | "Semi-wet" | "Wet";
  opponents: number;                        // active opponents (excl. hero)
  position: string;
  street: Street;
  facingAggression?: boolean;               // bet/raise in front of hero
  betSizePct?: number;                      // call as % of pot
  boardCards?: string[];                    // optional board cards for board-vs-range interaction
}

export interface HandClassification {
  hand_category: HandCategory4;
  confidence_level: number;                 // 0..1
  reason: string;                           // short contextual explanation
}

export function classifyHandStrength(h: HandClassificationInput): HandClassification {
  const { baseScore, category, outs, equityPct, texture, opponents, position, street, facingAggression, betSizePct, boardCards } = h;
  const ip = ["BTN", "CO", "HJ"].includes(position);
  const multiway = opponents >= 2;
  const heavyMultiway = opponents >= 3;
  const wet = texture === "Wet";
  const dry = texture === "Dry";
  const reasons: string[] = [];

  // ---------- 1) DRAW (no/weak made hand but real equity) ----------
  // A draw classification supersedes "weak made hand" when there is real equity.
  const isDrawHand = outs >= 6 && baseScore < 70;
  if (isDrawHand) {
    let conf = 0.5;
    if (outs >= 12) conf = 0.85;
    else if (outs >= 8) conf = 0.7;
    else conf = 0.55;
    if (street === "River") conf *= 0.3;          // draws are dead on river
    if (multiway) conf = Math.min(1, conf + 0.05); // draws play better multiway (implied)
    reasons.push(`${outs} outs (${equityPct.toFixed(0)}% equity)`);
    if (wet) reasons.push("dynamic board");
    return { hand_category: "Draw", confidence_level: +conf.toFixed(2), reason: reasons.join(", ") };
  }

  // ---------- 2) MADE HANDS — relative to context ----------
  // Start from the made-hand "absolute" tier, then apply context shifts.
  // Tiers: monster (FH+) / strong (straight/flush/set) / topPair-ish / weak made / air.
  let tier: "monster" | "strong" | "decent" | "marginal" | "air";
  if (baseScore >= 130) tier = "monster";
  else if (baseScore >= 90) tier = "strong";       // straight, flush, set/trips
  else if (baseScore >= 50) tier = "decent";       // two pair, overpair, top pair
  else if (baseScore >= 30) tier = "marginal";     // pair, weak pair
  else tier = "air";

  // Contextual downgrades / upgrades
  let cat: HandCategory4 = "Weak";
  let conf = 0.5;

  if (tier === "monster") {
    cat = "Strong";
    conf = 0.95;
    reasons.push(category.toLowerCase());
  } else if (tier === "strong") {
    cat = "Strong";
    conf = wet && heavyMultiway ? 0.7 : 0.88;
    reasons.push(category.toLowerCase());
    if (wet && heavyMultiway) reasons.push("wet board, many players → some risk");
  } else if (tier === "decent") {
    // Top pair / overpair / two pair — most context-sensitive tier.
    cat = "Medium";
    conf = 0.65;
    reasons.push(category.toLowerCase());
    // Multiway downgrade: top pair → medium (or even weak) in big multiway pots.
    if (heavyMultiway) {
      if (baseScore < 60) { cat = "Weak"; conf = 0.55; reasons.push("downgraded: heavy multiway"); }
      else { cat = "Medium"; conf = 0.55; reasons.push("downgraded vs multiway field"); }
    } else if (multiway && wet) {
      cat = "Medium"; conf = 0.55;
      reasons.push("multiway + wet → showdown value only");
    } else if (!multiway && dry) {
      cat = "Strong"; conf = 0.78;
      reasons.push("HU on dry board → top of range");
    }
    // Facing big aggression on later streets pushes top-pair-ish toward bluff-catch only
    if (facingAggression && (betSizePct ?? 0) >= 80 && (street === "Turn" || street === "River")) {
      cat = cat === "Strong" ? "Medium" : "Weak";
      conf = Math.max(0.45, conf - 0.15);
      reasons.push("large bet pressure → bluff-catcher only");
    }
  } else if (tier === "marginal") {
    cat = "Weak";
    conf = 0.6;
    reasons.push("weak pair");
    if (!multiway && dry && ip && !facingAggression) {
      cat = "Medium"; conf = 0.5;
      reasons.push("HU dry IP → some showdown value");
    }
    if (multiway) reasons.push("dominated multiway");
  } else {
    cat = "Weak";
    conf = 0.7;
    reasons.push("no made hand, no draw");
  }

  // Equity sanity tie-breaker for ambiguous spots
  if (cat === "Medium" && equityPct >= 65) { cat = "Strong"; conf = Math.max(conf, 0.7); }
  if (cat === "Weak" && equityPct >= 55 && !facingAggression) { cat = "Medium"; conf = 0.5; }

  // Board interaction: high cards + monotone affect range vs board fit
  if (boardCards && boardCards.length >= 3) {
    const parsedB = boardCards.map(parseCard);
    const highCount = parsedB.filter(p => p.val >= 11).length;
    if (highCount >= 3 && tier === "decent") {
      cat = "Weak";
      conf = Math.max(0.4, conf - 0.1);
      reasons.push("high-card board favors PFR range");
    }
    const suitCounts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
    parsedB.forEach(p => suitCounts[p.suit]++);
    const monotone = Object.values(suitCounts).some(c => c === parsedB.length);
    if (monotone && category !== "Flush" && category !== "Straight Flush") {
      reasons.push("monotone board — flush possible");
      conf = Math.max(0.3, conf - 0.1);
    }
  }

  return { hand_category: cat, confidence_level: +conf.toFixed(2), reason: reasons.join(", ") };
}

// Deterministic decision rule engine — equity vs pot odds + hand strength.
export interface DecisionInput {
  baseScore: number;
  adjScore: number;
  outs: number;
  equityPct: number;       // 0..100
  potOddsPct: number | null; // required equity %, null if no call amount
  boardLen: number;
  facingRaise?: boolean;     // hero already bet this street, now facing a re-raise
  betSizePct?: number;       // call amount as % of pot (sizing pressure)
  street?: Street;
  texture?: "Dry" | "Semi-wet" | "Wet";
  opponents?: number;
  position?: string;
  handClass?: HandClassification;     // contextual classification (preferred driver)
}
export interface DecisionOutput {
  action: "Raise" | "Call" | "Check" | "Fold";
  reason: string;
}

export function decide(d: DecisionInput): DecisionOutput {
  const { equityPct, potOddsPct, outs, facingRaise, betSizePct, opponents, position, handClass } = d;
  const cat = handClass?.hand_category;
  const isStrong = cat === "Strong";
  const isMedium = cat === "Medium";
  const isWeak = cat === "Weak";
  const isDraw = cat === "Draw";

  // ---- FACING A RAISE (after hero bet) — pressure logic, classification-driven ----
  if (facingRaise && potOddsPct !== null) {
    const sizePct = betSizePct ?? 66;
    const isSmall = sizePct < 50;
    const isLarge = sizePct >= 100;
    const multiway = (opponents ?? 1) >= 2;
    const oop = position && ["SB", "BB", "UTG", "MP"].includes(position);

    if (isStrong) {
      if (!multiway && !isLarge) {
        return { action: "Raise", reason: `Strong hand facing a raise — 3-bet for value (size ${sizePct.toFixed(0)}% pot).` };
      }
      return { action: "Call", reason: `Strong hand facing a raise — call to keep range balanced and trap${multiway ? " (multiway)" : ""}.` };
    }
    if (isDraw) {
      if (equityPct >= potOddsPct) {
        if (!multiway && outs >= 12 && isSmall) {
          return { action: "Raise", reason: `Combo draw vs raise — semi-bluff: equity ${equityPct.toFixed(0)}% + fold equity vs small sizing.` };
        }
        return { action: "Call", reason: `Draw vs raise — equity ${equityPct.toFixed(0)}% ≥ price ${potOddsPct.toFixed(0)}%, call to realize.` };
      }
      return { action: "Fold", reason: `Draw vs raise — equity ${equityPct.toFixed(0)}% < ${potOddsPct.toFixed(0)}%, no price.` };
    }
    if (isMedium) {
      if (isSmall && !multiway && !oop && equityPct + 5 >= potOddsPct) {
        return { action: "Call", reason: `Medium hand vs small raise (${sizePct.toFixed(0)}% pot) IP — call once and reassess.` };
      }
      return { action: "Fold", reason: `Medium hand facing a raise${isLarge ? " (large sizing)" : ""} — fold, dominated too often.` };
    }
    return { action: "Fold", reason: `Weak hand facing a raise — clear fold.` };
  }

  // ---- NO BET FACED ----
  if (potOddsPct === null) {
    if (isStrong) return { action: "Raise", reason: `Strong hand (${handClass?.reason}) — bet/raise for value.` };
    if (isDraw)   return { action: "Raise", reason: `Strong draw (${outs} outs) — semi-bluff has fold equity + equity.` };
    if (isMedium) return { action: "Check", reason: `Medium hand (${handClass?.reason}) — pot control.` };
    return { action: "Check", reason: `Weak hand — check and reassess.` };
  }

  // ---- FACING A BET ----
  if (isStrong) {
    if (equityPct > potOddsPct + 5) return { action: "Raise", reason: `Strong hand with equity edge (${equityPct.toFixed(0)}% vs ${potOddsPct.toFixed(0)}%) — raise for value.` };
    return { action: "Call", reason: `Strong hand — call (or trap) at acceptable price.` };
  }
  if (isDraw) {
    if (equityPct >= potOddsPct) return { action: "Call", reason: `Draw — equity ${equityPct.toFixed(0)}% ≥ pot odds ${potOddsPct.toFixed(0)}%.` };
    return { action: "Fold", reason: `Draw without price — equity ${equityPct.toFixed(0)}% < ${potOddsPct.toFixed(0)}%.` };
  }
  if (isMedium) {
    if (equityPct >= potOddsPct) return { action: "Call", reason: `Medium hand — bluff-catch at correct price (${equityPct.toFixed(0)}% vs ${potOddsPct.toFixed(0)}%).` };
    return { action: "Fold", reason: `Medium hand — price too high (${potOddsPct.toFixed(0)}% needed, ${equityPct.toFixed(0)}% equity).` };
  }
  // Weak / no classification fallback
  if (equityPct >= potOddsPct + 3) return { action: "Call", reason: `Marginal call — equity edge.` };
  return { action: "Fold", reason: `Weak hand, equity ${equityPct.toFixed(0)}% < ${potOddsPct.toFixed(0)}% — fold.` };
}

// Street-based sizing strategy
export type Street = "Preflop" | "Flop" | "Turn" | "River";
export type SizingIntent = "Value" | "Semi-Bluff" | "Bluff" | "Protection" | "Pot Control";
export type HeroAction = "Bet" | "Check" | "Raise" | "Call" | "Fold";

export interface SizingInput {
  street: Street;
  baseScore: number;
  adjScore: number;
  outs: number;
  equityPct: number;
  texture: "Dry" | "Semi-wet" | "Wet";
  position: string;
  pot: number;
  call: number;            // amount currently to call (0 = no bet faced)
  opponents: number;       // active opponents at table
  action: "Raise" | "Call" | "Check" | "Fold"; // engine decision
  rangeMods?: { strengthDelta: number; sizingPctDelta: number; aggressionDelta: number; reason: string };
}

export interface SizingOutput {
  intent: SizingIntent;
  heroAction: HeroAction;  // user-facing action label
  facingBet: boolean;
  inPosition: boolean;
  pctMin: number;          // % of pot (lower bound)
  pctMax: number;          // % of pot (upper bound)
  pctTarget: number;       // recommended % of pot
  amountBB: number;        // recommended size in BB (bet/raise) or call amount
  reason: string;          // engine explanation
  explanation: string;     // human-readable summary for UI/AI
}

/**
 * GLOBAL BET SIZING STRATEGY ENGINE — single source of truth.
 *
 * Sizing is jointly determined by:
 *   street · texture · active opponents (HU vs multiway) ·
 *   hand strength · strategic intent · position
 *
 * Multiway dynamics (3+ active players) tighten ranges, increase value sizing,
 * and suppress bluff frequency. Heads-up widens ranges and allows more bluffs
 * and flexible sizing. All previous isolated rules are unified here.
 */
export function recommendSizing(s: SizingInput): SizingOutput {
  const { street, baseScore, adjScore, outs, equityPct, texture, position, pot, call, opponents, action } = s;
  const facingBet = call > 0;
  const inPosition = ["BTN", "CO", "HJ"].includes(position);
  const multiway = opponents >= 2; // 3+ players in the hand (hero + 2+ opps)
  const headsUp = opponents <= 1;

  // Map engine action to user-facing hero action
  let heroAction: HeroAction;
  if (action === "Fold") heroAction = "Fold";
  else if (action === "Call") heroAction = "Call";
  else if (action === "Check") heroAction = "Check";
  else heroAction = facingBet ? "Raise" : "Bet";

  // Classify strategic intent (street + multiway aware)
  let intent: SizingIntent;
  if (baseScore >= 110) intent = "Value";
  else if (baseScore >= 50 && adjScore >= 60) intent = "Value";
  else if (outs >= 8 && baseScore < 50) intent = "Semi-Bluff";
  else if (baseScore >= 30 && baseScore < 70 && (texture === "Wet" || texture === "Semi-wet")) intent = "Protection";
  else if (baseScore >= 30 && baseScore < 70) intent = "Pot Control";
  else if (heroAction === "Bet" || heroAction === "Raise") intent = "Bluff";
  else intent = "Pot Control";

  // In multiway pots, suppress pure bluffs unless we have real equity
  if (multiway && intent === "Bluff" && outs < 8) {
    intent = "Pot Control";
  }

  let pctMin = 33, pctMax = 66, reason = "";

  if (street === "Preflop") {
    pctMin = 220; pctMax = 300;
    if (inPosition) { pctMin = 220; pctMax = 250; }
    else if (["UTG", "MP"].includes(position)) { pctMin = 270; pctMax = 300; }
    if (multiway) { pctMin += 30; pctMax += 50; } // larger preflop opens vs multiway field
    reason = "Preflop open: 2.2–3x BB depending on position.";
  } else if (street === "Flop") {
    if (intent === "Value") {
      pctMin = headsUp ? 50 : 60; pctMax = headsUp ? 80 : 100;
      reason = `Flop value (${headsUp ? "HU" : "multiway"}) — build pot with strong hands.`;
    } else if (intent === "Semi-Bluff") {
      pctMin = 50; pctMax = headsUp ? 75 : 80;
      reason = "Flop semi-bluff — leverage equity + fold equity.";
    } else if (intent === "Bluff") {
      // HU: small/medium range bet on dry, larger on wet
      pctMin = texture === "Dry" ? 20 : 33;
      pctMax = texture === "Dry" ? 40 : 50;
      reason = `Flop bluff on ${texture.toLowerCase()} board — ${headsUp ? "small/medium range bet" : "selective high-equity only"}.`;
    } else if (intent === "Protection") {
      pctMin = 50; pctMax = 75;
      reason = "Flop protection — charge draws on wet board.";
    } else {
      pctMin = 25; pctMax = 45;
      reason = "Flop pot control — small sizing to keep pot manageable.";
    }
  } else if (street === "Turn") {
    if (intent === "Value") {
      pctMin = headsUp ? 60 : 70; pctMax = headsUp ? 100 : 110;
      reason = "Turn value — polarize and charge draws.";
    } else if (intent === "Semi-Bluff") {
      pctMin = 50; pctMax = 80;
      reason = "Turn semi-bluff — fold equity + equity realization.";
    } else if (intent === "Bluff") {
      pctMin = 60; pctMax = 90;
      reason = "Turn bluff — apply real pressure with polarized sizing.";
    } else if (intent === "Protection") {
      pctMin = 55; pctMax = 75;
      reason = "Turn protection — vs medium holdings.";
    } else {
      pctMin = 40; pctMax = 60;
      reason = "Turn pot control.";
    }
  } else { // River
    if (intent === "Value" && baseScore >= 110) {
      pctMin = headsUp ? 80 : 90; pctMax = 120;
      reason = "River strong value — fully polarized for max value.";
    } else if (intent === "Value") {
      pctMin = 30; pctMax = 60;
      reason = "Thin river value — get called by worse.";
    } else if (intent === "Bluff" || intent === "Semi-Bluff") {
      pctMin = 80; pctMax = 120;
      reason = "River bluff — polarized for max fold equity.";
    } else {
      pctMin = 0; pctMax = 0;
      reason = "River pot control — check / give up.";
    }
  }

  // Context adjustments (post-flop only)
  const adjustments: string[] = [];
  if (street !== "Preflop" && pctMax > 0) {
    if (texture === "Wet" && intent !== "Bluff") {
      pctMin = Math.min(120, pctMin + 10); pctMax = Math.min(120, pctMax + 10);
      adjustments.push("wet board → +10%");
    }
    if (texture === "Dry" && intent === "Bluff") {
      pctMin = Math.max(15, pctMin - 5); pctMax = Math.max(25, pctMax - 5);
      adjustments.push("dry board → −5%");
    }
    if (!inPosition && intent !== "Value") {
      pctMin = Math.max(15, pctMin - 5); pctMax = Math.max(25, pctMax - 5);
      adjustments.push("OOP → more conservative");
    }
    // Active-players modifier — each extra opponent shifts the dial
    if (opponents >= 2 && intent === "Value") {
      const bump = Math.min(20, (opponents - 1) * 8);
      pctMin = Math.min(120, pctMin + bump); pctMax = Math.min(120, pctMax + bump);
      adjustments.push(`${opponents} opps → larger value (+${bump}%)`);
    }
    if (opponents >= 2 && intent === "Bluff") {
      const cut = Math.min(30, (opponents - 1) * 12);
      pctMax = Math.max(pctMin, pctMax - cut);
      adjustments.push(`${opponents} opps → bluff less / smaller (−${cut}%)`);
    }
    if (opponents >= 2 && intent === "Semi-Bluff") {
      pctMax = Math.max(pctMin, pctMax - 5);
      adjustments.push("multiway → tighter semi-bluff");
    }
  }

  // Range-inference modifiers (opponent reads)
  if (s.rangeMods && street !== "Preflop" && pctMax > 0) {
    const d = s.rangeMods.sizingPctDelta;
    if (d !== 0) {
      pctMin = Math.max(0, Math.min(120, pctMin + d));
      pctMax = Math.max(pctMin, Math.min(120, pctMax + d));
      adjustments.push(`opp range → ${d > 0 ? "+" : ""}${d}% (${s.rangeMods.reason})`);
    }
  }

  // Fold/Call: no betting size — return call amount instead
  if (action === "Fold") {
    return {
      intent, heroAction: "Fold", facingBet, inPosition,
      pctMin: 0, pctMax: 0, pctTarget: 0, amountBB: 0,
      reason: "Fold — equity insufficient vs price.",
      explanation: `Fold: equity ${equityPct.toFixed(0)}% does not justify the call.`,
    };
  }
  if (action === "Call") {
    return {
      intent: "Pot Control", heroAction: "Call", facingBet, inPosition,
      pctMin: 0, pctMax: 0, pctTarget: 0, amountBB: +call.toFixed(2),
      reason: "Call — price meets required equity.",
      explanation: `Call ${call} BB: pot odds met, no value in raising.`,
    };
  }
  if (action === "Check") {
    return {
      intent, heroAction: "Check", facingBet: false, inPosition,
      pctMin: 0, pctMax: 0, pctTarget: 0, amountBB: 0,
      reason: "Check — pot control / give up.",
      explanation: "Check: marginal/weak holding, no profitable bet.",
    };
  }

  const pctTarget = Math.round((pctMin + pctMax) / 2);
  // Preflop: pct values represent xBB, not % of pot
  const amountBB = street === "Preflop"
    ? +(pctTarget / 100).toFixed(2)
    : +((pctTarget / 100) * pot).toFixed(2);

  const adjText = adjustments.length ? ` Adjustments: ${adjustments.join(", ")}.` : "";
  const verb = heroAction === "Raise" ? "Raise to" : "Bet";
  const tableCtx = headsUp ? "HU" : `${opponents + 1}-way`;
  const explanation = street === "Preflop"
    ? `${verb} ${amountBB}x BB (${position}, ${tableCtx}). ${reason}${adjText}`
    : `${verb} ${amountBB} BB (~${pctTarget}% pot, ${tableCtx}). Intent: ${intent}. ${reason}${adjText}`;

  return {
    intent, heroAction, facingBet, inPosition,
    pctMin, pctMax, pctTarget, amountBB,
    reason: reason + adjText,
    explanation,
  };
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
