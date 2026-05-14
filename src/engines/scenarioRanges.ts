// Scenario ranges — discrete, click-explorable spots with extended actions.
// Each hand maps to a single dominant action (scenario view = pure strategy
// per cell, not mixed). Frequencies are the SCENARIO-LEVEL stats.

export type ScenarioAction =
  | "fold"
  | "call"
  | "3bet"
  | "3betLight"
  | "4bet"
  | "4betLight"
  | "allin"
  | "raise"
  | "loosie"
  | "tightfie"
  | "notInRange";

export const SCENARIO_ACTION_COLORS: Record<ScenarioAction, string> = {
  fold:       "hsl(220 70% 55%)",   // blue
  call:       "hsl(140 65% 45%)",   // green
  "3bet":     "hsl(28 90% 55%)",    // orange
  "3betLight":"hsl(275 70% 60%)",   // purple
  "4bet":     "hsl(28 90% 55%)",    // orange
  "4betLight":"hsl(275 70% 60%)",   // purple
  allin:      "hsl(0 65% 45%)",     // dark red (#C0392B-ish)
  raise:      "hsl(28 90% 55%)",    // orange
  loosie:     "hsl(140 65% 45%)",   // green
  tightfie:   "hsl(204 70% 53%)",   // blue (#3498DB)
  notInRange: "hsl(0 0% 30%)",      // dim grey
};

export const SCENARIO_ACTION_LABELS: Record<ScenarioAction, string> = {
  fold: "Fold",
  call: "Call",
  "3bet": "3bet (value)",
  "3betLight": "3bet light",
  "4bet": "4bet (value)",
  "4betLight": "4bet light",
  allin: "All-in",
  raise: "Raise (open)",
  loosie: "Loosie (loose open)",
  tightfie: "Tightfie (tight open)",
  notInRange: "Not in range",
};

export type ScenarioCategory = "vsOpen" | "vs3bet" | "openRaise";

/** A hand can either map to a pure action, or to a mix of actions w/ pct */
export type HandMix = { mix: { action: ScenarioAction; pct: number }[] };
export type HandEntry = ScenarioAction | HandMix;
export const isMix = (e: HandEntry): e is HandMix =>
  typeof e === "object" && e !== null && "mix" in e;

export interface ScenarioStat {
  action: ScenarioAction;
  pct: number;
  sizing?: string;   // e.g. "10.5bb"
  ev?: string;       // e.g. "+0.42 bb"
}

export interface ScenarioRange {
  id: string;
  label: string;          // e.g. "BB vs CO · 50bb"
  hero: string;
  villain: string;
  stackBB: number;
  action: string;         // e.g. "CO raise 2.5bb"
  category?: ScenarioCategory; // default: vsOpen
  stackBadgeColor?: string; // tailwind classes for badge
  stats: ScenarioStat[];
  /** action assigned per hand — pure action OR mixed-frequency entry */
  hands: Record<string, HandEntry>;
  /** EV per hand (optional, displayed in popup) */
  handEV?: Record<string, string>;
  /** Optional set of opening hands (for vs-3bet scenarios). Hands NOT in
   *  this set get the "notInRange" action automatically. */
  inRange?: string[];
  notes?: string;
}

// =====================================================================
// Helpers to expand shorthand
// =====================================================================
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"] as const;

/** "AK" → ["AKs","AKo"]. "AA" → ["AA"]. "AKs" → ["AKs"]. */
function expand(token: string): string[] {
  if (token.length === 2) {
    if (token[0] === token[1]) return [token];        // pair
    return [token + "s", token + "o"];                // both versions
  }
  return [token];
}

/** Range like "K9s-K2s" → all suited Kx between K9s and K2s. */
function expandRange(token: string): string[] {
  const m = token.match(/^([AKQJT2-9])([AKQJT2-9])([so])-\1([AKQJT2-9])\3$/);
  if (!m) return expand(token);
  const high = m[1];
  const lo1 = RANKS.indexOf(m[2] as typeof RANKS[number]);
  const lo2 = RANKS.indexOf(m[4] as typeof RANKS[number]);
  const suit = m[3];
  const out: string[] = [];
  const start = Math.min(lo1, lo2);
  const end = Math.max(lo1, lo2);
  for (let i = start; i <= end; i++) out.push(`${high}${RANKS[i]}${suit}`);
  return out;
}

/** Pair range "22-55" → ["22","33","44","55"]. */
function expandPairs(token: string): string[] {
  const m = token.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/);
  if (!m) return expand(token);
  const i1 = RANKS.indexOf(m[1] as typeof RANKS[number]);
  const i2 = RANKS.indexOf(m[2] as typeof RANKS[number]);
  const out: string[] = [];
  const start = Math.min(i1, i2);
  const end = Math.max(i1, i2);
  for (let i = start; i <= end; i++) out.push(RANKS[i] + RANKS[i]);
  return out;
}

function assign(
  acc: Record<string, ScenarioAction>,
  tokens: string[],
  action: ScenarioAction,
) {
  for (const t of tokens) {
    let parts: string[];
    if (/-/.test(t)) {
      parts = t.length === 5 ? expandPairs(t) : expandRange(t);
    } else {
      parts = expand(t);
    }
    for (const h of parts) acc[h] = action;
  }
}

// =====================================================================
// SCENARIO 1 — BB vs CO · 50bb · CO open 2.5bb
// =====================================================================
function scenarioBBvsCO50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, ["AA","AK","AQ","KK","QQ","JJ"], "3bet");
  assign(h, ["J8s","T7s","T9s","A6s","A5s"], "3betLight");
  assign(h, [
    "AJs","ATs","A9s","A8s","A7s","A4s","A3s","A2s",
    "AJo","ATo","A9o","A8o",
    "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s",
    "KQo","KJo","KTo",
    "QJs","QTs","Q9s","Q8s","Q7s","Q6s","Q5s",
    "QJo","QTo",
    "JTs","J9s","J7s","J6s",
    "JTo","J9o",
    "T8s","T6s",
    "T9o","T8o",
    "98s","97s","96s","95s",
    "87s","86s","85s",
    "76s","75s",
    "65s","64s",
    "55","66","77","88","99","TT",
  ], "call");
  return {
    id: "bb_vs_co_50",
    label: "BB vs CO · 50bb",
    hero: "BB", villain: "CO", stackBB: 50,
    action: "CO raise 2.5bb",
    stats: [
      { action: "fold",      pct: 38.0 },
      { action: "call",      pct: 52.6, ev: "+0.18 bb" },
      { action: "3betLight", pct: 4.2 },
      { action: "3bet",      pct: 5.1, ev: "+0.74 bb" },
    ],
    hands: h,
  };
}

// =====================================================================
// SCENARIO 2 — BB vs CO · 10bb · CO open 2.0bb (push/fold-ish)
// =====================================================================
function scenarioBBvsCO10(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  // All-in: every Ax (suited + offsuit), KK-22, KQ/KJ/KT suited, QQ/QJ suited
  assign(h, [
    "AA","AK","AQ","AJ","AT","A9","A8","A7","A6","A5","A4","A3","A2",
    "KK","QQ","JJ","TT","99","88","77","66","55","44","33","22",
    "KQs","KJs","KTs",
    "QJs",
  ], "allin");
  // Call wide
  assign(h, [
    "K9s-K2s",
    "Q9s-Q2s",
    "J9s-J2s",
    "T8s-T5s",
    "98s","97s","87s","86s","76s","75s","65s","64s",
    "KQo","KJo","QJo","QTo","JTo",
    "KTo","K9o","Q9o","J9o","T9o","98o",
  ], "call");
  return {
    id: "bb_vs_co_10",
    label: "BB vs CO · 10bb",
    hero: "BB", villain: "CO", stackBB: 10,
    action: "CO raise 2.0bb",
    stackBadgeColor: "bg-destructive text-destructive-foreground",
    stats: [
      { action: "fold",  pct: 17.2 },
      { action: "call",  pct: 57.6 },
      { action: "allin", pct: 25.2, ev: "+1.05 bb" },
    ],
    hands: h,
  };
}

// =====================================================================
// SCENARIO 3 — BB vs SB · 50bb · SB open 3.5bb
// =====================================================================
function scenarioBBvsSB50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, [
    "AA","AK","AQ","AJ","KK","QQ","JJ","TT","99",
    "A4s","A3s","A2s","K6s","K5s","K4s","K3s",
    "Q7s","J7s","J6s","76s","87s",
    "A7o","A6o","A5o","A4o","A3o","A2o",
  ], "3bet");
  assign(h, [
    "ATs","A9s","A8s","A6s","A5s",
    "KQs","KJs","KTs","K9s","K8s","K7s",
    "QJs","QTs","Q9s","Q8s",
    "JTs","J9s","J8s",
    "T9s","T8s","T7s",
    "98s","97s","96s",
    "88","77","66","55","44","33","22",
    "KQo","KJo","KTo","QJo","JTo",
    "65s","54s",
  ], "call");
  return {
    id: "bb_vs_sb_50",
    label: "BB vs SB · 50bb",
    hero: "BB", villain: "SB", stackBB: 50,
    action: "SB raise 3.5bb",
    stats: [
      { action: "fold", pct: 39.8 },
      { action: "call", pct: 47.8, ev: "+0.31 bb" },
      { action: "3bet", pct: 12.4, sizing: "10.5bb", ev: "+0.92 bb" },
    ],
    hands: h,
  };
}

// =====================================================================
// SCENARIO 4 — CO vs BTN 3bet · 50bb (4bet/call/fold)
// =====================================================================
const CO_OPEN_LIST = [
  // Pairs
  "AA","KK","QQ","JJ","TT","99","88","77","66","55","44","33","22",
  // Suited Aces
  "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
  // Suited Kings
  "KQs","KJs","KTs","K9s","K8s",
  // Suited Queens / Jacks / connectors
  "QJs","QTs","Q9s","JTs","J9s","J8s",
  "T9s","T8s","98s","97s","87s","86s","76s","65s","54s",
  // Offsuit broadways
  "AKo","AQo","AJo","ATo","KQo","KJo","KTo","QJo","QTo",
];

function scenarioCOvsBTN3bet50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, ["AA","AK","AQ","KK","QQ"], "4bet");
  assign(h, ["ATs","76s","87s"], "4betLight");
  assign(h, [
    "JJ","TT","99","88",
    "AJs","KQs","KJs","QJs","JTs","T9s","98s",
  ], "call");
  // Everything else in CO open range = fold
  for (const hand of CO_OPEN_LIST) if (!h[hand]) h[hand] = "fold";
  return {
    id: "co_vs_btn3b_50",
    label: "CO open x2,5 vs BTN 3bet · 50bb",
    hero: "CO", villain: "BTN", stackBB: 50,
    action: "CO open x2,5 → BTN 3bet 7.5bb",
    stats: [
      { action: "notInRange", pct: 0 }, // legend hint
      { action: "fold",       pct: 40.4 },
      { action: "call",       pct: 34.3, ev: "+0.22 bb" },
      { action: "4bet",       pct: 5.3, sizing: "20bb", ev: "+1.41 bb" },
      { action: "4betLight",  pct: 2.8 },
    ],
    inRange: CO_OPEN_LIST,
    hands: h,
  };
}

// =====================================================================
// SCENARIO 5 — CO vs BTN 3bet shove · 20bb
// =====================================================================
function scenarioCOvsBTN3bet20(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, [
    "AA","AK","AQ","AJ","AT","A9s",
    "KK","QQ","JJ","TT","99","88","77","66","55","44",
    "KQs","KJs","QJs","JTs","T9s","98s","87s","76s",
  ], "call");
  for (const hand of CO_OPEN_LIST) if (!h[hand]) h[hand] = "fold";
  return {
    id: "co_vs_btn3b_20",
    label: "CO open x2,5 vs BTN 3bet shove · 20bb",
    hero: "CO", villain: "BTN", stackBB: 20,
    action: "CO open x2,5 → BTN 3bet shove",
    stats: [
      { action: "notInRange", pct: 0 },
      { action: "fold", pct: 54.3 },
      { action: "call", pct: 45.7, ev: "+0.86 bb" },
    ],
    inRange: CO_OPEN_LIST,
    hands: h,
  };
}

// =====================================================================
// SCENARIO 6 — BTN vs UTG · 20bb · UTG raise 2.0bb (push/fold)
// =====================================================================
function scenarioBTNvsUTG20(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, [
    "AA","AK","AQ","AJ",
    "KK","KQ","KJ","KT",
    "QQ","QJ",
    "JJ","TT","99","88","77","66","55","44","33",
  ], "allin");
  assign(h, [
    "ATs","A9s","A8s","A7s","A6s","A5s","A4s",
    "KQs",
  ], "call");
  return {
    id: "btn_vs_utg_20",
    label: "BTN vs UTG · 20bb",
    hero: "BTN", villain: "UTG", stackBB: 20,
    action: "UTG raise 2.0bb",
    stackBadgeColor: "bg-destructive text-destructive-foreground",
    stats: [
      { action: "fold",  pct: 82.5 },
      { action: "call",  pct: 6.3 },
      { action: "allin", pct: 11.2, ev: "+0.42 bb" },
    ],
    notes: "BTN faces early position raise — very tight calling/shoving range.",
    hands: h,
  };
}

// =====================================================================
// SCENARIO 7 — BTN vs UTG · 50bb · UTG raise 2.5bb
// =====================================================================
function scenarioBTNvsUTG50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, ["AA","AK","AQ","AJ","KK","QQ","JJ","TT"], "3bet");
  assign(h, [
    "ATs","A5s","A4s",
    "KJs","K8s","K7s",
    "Q9s",
    "J9s",
    "T8s",
    "76s","65s","54s",
  ], "3betLight");
  assign(h, [
    "AQo","AJo",
    "KQs","KJs","KTs","K9s",
    "QJs","QTs",
    "JTs","J9s",
    "T9s","T8s",
    "98s","97s","87s","86s",
    "66","55","44","33","22",
  ], "call");
  return {
    id: "btn_vs_utg_50",
    label: "BTN vs UTG · 50bb",
    hero: "BTN", villain: "UTG", stackBB: 50,
    action: "UTG raise 2.5bb",
    stats: [
      { action: "fold",      pct: 79.3 },
      { action: "call",      pct: 12.7 },
      { action: "3betLight", pct: 4.5 },
      { action: "3bet",      pct: 3.5, ev: "+0.68 bb" },
    ],
    notes: "UTG is early position — BTN 3bet range tighter/more linear vs UTG than vs CO.",
    hands: h,
  };
}

// =====================================================================
// SCENARIO 8 — BTN vs MP · 50bb · MP raise 2.5bb
// =====================================================================
function scenarioBTNvsMP50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, ["AA","AK","AQ","KK","QQ","JJ","TT"], "3bet");
  assign(h, [
    "AJs","ATs","A5s","A4s",
    "KJs","K8s","K7s",
    "Q9s",
    "T8s",
    "76s",
    "KTo","QJo",
  ], "3betLight");
  assign(h, [
    "AQo","AJo","ATo",
    "KQs","KJs","KTs","K9s",
    "QJs","QTs","Q9s",
    "JTs","J9s",
    "T9s","T8s",
    "98s","97s",
    "88","77","66","55","44","33","22",
  ], "call");
  return {
    id: "btn_vs_mp_50",
    label: "BTN vs MP · 50bb",
    hero: "BTN", villain: "MP", stackBB: 50,
    action: "MP raise 2.5bb",
    stats: [
      { action: "fold",      pct: 78.4 },
      { action: "call",      pct: 12.1 },
      { action: "3betLight", pct: 5.7 },
      { action: "3bet",      pct: 3.8, ev: "+0.71 bb" },
    ],
    notes: "MP slightly looser than UTG — BTN 3bet% marginally higher.",
    hands: h,
  };
}

// =====================================================================
// SCENARIO 9 — BTN vs CO · 50bb · CO raise 2.5bb
// =====================================================================
function scenarioBTNvsCO50(): ScenarioRange {
  const h: Record<string, ScenarioAction> = {};
  assign(h, ["AA","AK","AQ","KK","QQ","JJ","TT","99"], "3bet");
  assign(h, [
    "A9s","A8s","A5s","A4s",
    "K7s","K6s",
    "Q8s",
    "J8s",
    "T8s",
    "76s","54s",
    "QTo","JTo",
  ], "3betLight");
  assign(h, [
    "AJo","ATo",
    "KQs","KJs","KTs","K9s","K8s",
    "QJs","QTs","Q9s",
    "JTs","J9s","J8s",
    "T9s","T8s","T7s",
    "98s","97s","96s",
    "87s","86s",
    "76s","65s","64s",
    "66","55","44","33","22",
  ], "call");
  return {
    id: "btn_vs_co_50",
    label: "BTN vs CO · 50bb",
    hero: "BTN", villain: "CO", stackBB: 50,
    action: "CO raise 2.5bb",
    stats: [
      { action: "fold",      pct: 73.0 },
      { action: "call",      pct: 15.6 },
      { action: "3betLight", pct: 6.9 },
      { action: "3bet",      pct: 4.4, sizing: "7.5bb", ev: "+0.83 bb" },
    ],
    notes: "CO later position — BTN widens 3bet range, total aggression ~11.3% vs ~8% for earlier positions.",
    hands: h,
  };
}

export const SCENARIO_RANGES: ScenarioRange[] = [
  scenarioBBvsCO50(),
  scenarioBBvsCO10(),
  scenarioBBvsSB50(),
  scenarioCOvsBTN3bet50(),
  scenarioCOvsBTN3bet20(),
  scenarioBTNvsUTG20(),
  scenarioBTNvsUTG50(),
  scenarioBTNvsMP50(),
  scenarioBTNvsCO50(),
];

/** Group scenarios by matchup (hero+villain) for the stack toggle */
export function groupedScenarios(): Record<string, ScenarioRange[]> {
  const out: Record<string, ScenarioRange[]> = {};
  for (const s of SCENARIO_RANGES) {
    const key = `${s.hero}_vs_${s.villain}`;
    (out[key] ||= []).push(s);
  }
  return out;
}
