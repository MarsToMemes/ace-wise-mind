// Preflop Range Database
// Structured store of opponent-specific defense ranges with mixed strategy frequencies.
// Each range entry encodes positional context, stack depth, open size, and per-combo
// action frequencies (raise / call / fold / jam) along with combo weighting.

export type PreflopAction = "raise" | "call" | "fold" | "jam";

export const ACTION_COLORS: Record<PreflopAction, string> = {
  raise: "hsl(0 75% 55%)",      // red
  call: "hsl(140 65% 45%)",     // green
  fold: "hsl(220 70% 55%)",     // blue
  jam: "hsl(48 95% 55%)",       // yellow
};

export interface HandFrequencies {
  raise?: number;   // 0..100
  call?: number;
  fold?: number;
  jam?: number;
}

export interface HandEntry {
  hand: string;                     // e.g. "AKs", "JJ", "T9s", "AJo"
  combos: number;                   // canonical combo count (pair=6, suited=4, offsuit=12)
  frequencies: HandFrequencies;     // must sum ~100
  weight: number;                   // strategic weight 0..1 (combos / 16, normalized)
  mixed: boolean;                   // true if more than one non-zero action
  notes?: string;
}

export interface RangeContext {
  heroPosition: string;             // hero's position
  villainPosition: string;          // opener's position
  facingAction: "open" | "3bet" | "4bet" | "limp";
  openSizeBB: number;
  effectiveStackBB: number;
  rangeArchetype: "tight" | "balanced" | "loose";
  flags: string[];                  // descriptors for engine inference
}

export interface PreflopRange {
  id: string;
  label: string;
  context: RangeContext;
  hands: HandEntry[];
  metadata: {
    totalCombos: number;
    continueCombos: number;
    raiseCombos: number;
    callCombos: number;
    foldCombos: number;
    continuePct: number;            // % of 1326 combos that continue
    raisePct: number;
    callPct: number;
  };
}

const COMBOS = (hand: string): number => {
  if (hand.length === 2) return 6;            // pair
  const suffix = hand[hand.length - 1];
  if (suffix === "s") return 4;               // suited
  if (suffix === "o") return 12;              // offsuit
  return 0;
};

const f = (
  hand: string,
  frequencies: HandFrequencies,
  notes?: string
): HandEntry => {
  const combos = COMBOS(hand);
  const nonZero = Object.values(frequencies).filter(v => (v ?? 0) > 0).length;
  return {
    hand,
    combos,
    frequencies,
    weight: combos / 16,
    mixed: nonZero > 1,
    notes,
  };
};

// =====================================================================
// Range #1 — Hero (BB or BTN) facing UTG 2.5bb open, 100bb effective
// Tight defense, blocker-heavy 3bet, polarized continue, high fold freq.
// =====================================================================

const HANDS_VS_UTG_OPEN_100BB: HandEntry[] = [
  // --- Pocket pairs ---
  f("AA", { raise: 100 }, "Always 3bet for value"),
  f("KK", { raise: 100 }, "Always 3bet for value"),
  f("QQ", { raise: 100 }, "Always 3bet for value"),
  f("JJ", { raise: 70, call: 30 }, "Mostly 3bet, mixed call to protect calling range"),
  f("TT", { raise: 65, call: 35 }, "Mixed value 3bet / set-mining call"),
  f("99", { raise: 60, call: 40 }, "Mixed continue"),
  f("88", { raise: 40, call: 60 }, "Mostly call, occasional 3bet"),
  f("77", { raise: 20, call: 80 }, "Pure set-mine, rare 3bet bluff/value blend"),
  f("66", { raise: 10, call: 50, fold: 40 }, "Mixed low frequency continue"),
  f("55", { raise: 5,  call: 40, fold: 55 }, "Mixed low frequency continue"),
  f("44", { call: 25, fold: 75 }, "Rare set-mine call"),
  f("33", { call: 20, fold: 80 }, "Rare set-mine call"),
  f("22", { call: 15, fold: 85 }, "Rare set-mine call"),

  // --- Suited aces ---
  f("AKs", { raise: 100 }, "Always 3bet for value"),
  f("AQs", { raise: 100 }, "Always 3bet for value"),
  f("AJs", { raise: 70, call: 30 }, "Mixed 3bet / call"),
  f("ATs", { raise: 65, call: 35 }, "Mixed 3bet / call"),
  f("A9s", { raise: 50, fold: 50 }, "Polarized 3bet bluff with blocker, otherwise fold"),
  f("A8s", { raise: 20, fold: 80 }, "Low freq 3bet bluff, mostly fold"),
  f("A7s", { raise: 15, fold: 85 }, "Low freq 3bet bluff"),
  f("A6s", { raise: 15, fold: 85 }, "Low freq 3bet bluff"),
  f("A5s", { raise: 25, fold: 75 }, "Wheel blocker — preferred bluff candidate"),
  f("A4s", { raise: 20, fold: 80 }, "Wheel blocker bluff"),
  f("A3s", { raise: 15, fold: 85 }, "Wheel blocker bluff"),
  f("A2s", { raise: 10, fold: 90 }, "Rare wheel blocker bluff"),

  // --- Offsuit aces ---
  f("AKo", { raise: 100 }, "Always 3bet for value"),
  f("AQo", { raise: 95, call: 5 }, "Mostly 3bet, tiny mixed call"),
  f("AJo", { raise: 10, fold: 90 }, "Mostly fold vs UTG, rare blocker 3bet"),
  f("ATo", { fold: 100 }, "Fold — dominated"),
  f("A9o", { fold: 100 }),
  f("A8o", { fold: 100 }),
  f("A7o", { fold: 100 }),
  f("A6o", { fold: 100 }),
  f("A5o", { fold: 100 }),
  f("A4o", { fold: 100 }),
  f("A3o", { fold: 100 }),
  f("A2o", { fold: 100 }),

  // --- Suited kings ---
  f("KQs", { raise: 100 }, "Always 3bet for value"),
  f("KJs", { raise: 70, call: 30 }, "Mixed 3bet / call"),
  f("KTs", { raise: 20, call: 30, fold: 50 }, "Mixed low frequency continue"),
  f("K9s", { call: 15, fold: 85 }, "Rare flat"),
  f("K8s", { fold: 100 }),
  f("K7s", { fold: 100 }),
  f("K6s", { fold: 100 }),
  f("K5s", { raise: 5, fold: 95 }, "Very rare blocker bluff"),
  f("K4s", { fold: 100 }),
  f("K3s", { fold: 100 }),
  f("K2s", { fold: 100 }),

  // --- Offsuit kings ---
  f("KQo", { raise: 80, fold: 20 }, "High freq 3bet, otherwise fold (no flat)"),
  f("KJo", { fold: 100 }, "Fold — dominated"),
  f("KTo", { fold: 100 }),
  f("K9o", { fold: 100 }),

  // --- Suited queens ---
  f("QJs", { raise: 15, call: 70, fold: 15 }, "Mostly call, some 3bet bluff"),
  f("QTs", { call: 35, fold: 65 }, "Low frequency call"),
  f("Q9s", { fold: 100 }),
  f("Q8s", { fold: 100 }),

  // --- Offsuit queens ---
  f("QJo", { fold: 100 }),
  f("QTo", { fold: 100 }),

  // --- Suited jacks / connectors ---
  f("JTs", { call: 90, raise: 10 }, "Pure call, rare 3bet bluff"),
  f("J9s", { call: 25, fold: 75 }, "Low frequency call"),
  f("T9s", { call: 60, raise: 5, fold: 35 }, "Mixed continue, mostly call"),
  f("T8s", { fold: 100 }),

  // --- Suited connectors / bluff candidates ---
  f("98s", { call: 35, fold: 65 }, "Low frequency mixed continue"),
  f("97s", { fold: 100 }),
  f("87s", { call: 30, fold: 70 }, "Low frequency mixed continue"),
  f("86s", { fold: 100 }),
  f("76s", { call: 15, fold: 85 }, "Rare mixed continue"),
  f("65s", { raise: 10, call: 5, fold: 85 }, "Occasional bluff 3bet, very rare flat"),
  f("54s", { fold: 100 }),

  // --- Offsuit junk (representative subset) ---
  f("JTo", { fold: 100 }),
  f("T9o", { fold: 100 }),
  f("98o", { fold: 100 }),
  f("87o", { fold: 100 }),
  f("76o", { fold: 100 }),
];

function buildMetadata(hands: HandEntry[]) {
  let raise = 0, call = 0, fold = 0, total = 0;
  for (const h of hands) {
    total += h.combos;
    raise += h.combos * ((h.frequencies.raise ?? 0) / 100);
    call  += h.combos * ((h.frequencies.call  ?? 0) / 100);
    fold  += h.combos * ((h.frequencies.fold  ?? 0) / 100);
  }
  // Account for hands not listed (treat as fold) — total pool is 1326 combos.
  const POOL = 1326;
  const continueCombos = raise + call;
  return {
    totalCombos: total,
    continueCombos: +continueCombos.toFixed(2),
    raiseCombos: +raise.toFixed(2),
    callCombos: +call.toFixed(2),
    foldCombos: +(POOL - continueCombos).toFixed(2),
    continuePct: +((continueCombos / POOL) * 100).toFixed(2),
    raisePct: +((raise / POOL) * 100).toFixed(2),
    callPct: +((call / POOL) * 100).toFixed(2),
  };
}

export const RANGE_VS_UTG_OPEN_100BB: PreflopRange = {
  id: "vs-utg-open-2.5bb-100bb",
  label: "Hero facing UTG open 2.5bb (100bb effective)",
  context: {
    heroPosition: "any",
    villainPosition: "UTG",
    facingAction: "open",
    openSizeBB: 2.5,
    effectiveStackBB: 100,
    rangeArchetype: "tight",
    flags: [
      "tight-vs-utg",
      "blocker-heavy-3bet",
      "polarized-continue",
      "high-fold-frequency",
      "premiums-3bet-pure",
      "small-pairs-set-mine",
      "suited-connectors-mixed",
    ],
  },
  hands: HANDS_VS_UTG_OPEN_100BB,
  metadata: buildMetadata(HANDS_VS_UTG_OPEN_100BB),
};

// =====================================================================
// Range #2 — Hero BTN facing CO 2.5bb open, 100bb effective
// Wider defense + aggression than vs UTG. Suited hands gain in position,
// blocker bluffs increase, polarized 3bet, mixed frequencies dominate.
// =====================================================================

const HANDS_BTN_VS_CO_OPEN_100BB: HandEntry[] = [
  // --- Pocket pairs ---
  f("AA", { raise: 100 }, "Always 3bet for value"),
  f("KK", { raise: 100 }, "Always 3bet for value"),
  f("QQ", { raise: 100 }, "Always 3bet for value"),
  f("JJ", { raise: 100 }, "Pure 3bet IP vs CO"),
  f("TT", { raise: 65, call: 35 }, "Mixed value 3bet / call IP"),
  f("99", { raise: 45, call: 55 }, "Mixed continue, slight call lean"),
  f("88", { raise: 30, call: 70 }, "Mostly call, occasional 3bet"),
  f("77", { raise: 20, call: 80 }, "Mostly set-mine"),
  f("66", { raise: 15, call: 85 }, "Set-mine with occasional 3bet"),
  f("55", { call: 90, raise: 5, fold: 5 }, "Mostly call IP"),
  f("44", { call: 70, fold: 30 }, "Low frequency call IP"),
  f("33", { call: 55, fold: 45 }, "Low frequency call"),
  f("22", { call: 45, fold: 55 }, "Low frequency call"),

  // --- Suited aces ---
  f("AKs", { raise: 100 }, "Always 3bet for value"),
  f("AQs", { raise: 100 }, "Always 3bet for value"),
  f("AJs", { raise: 40, call: 60 }, "Mixed 3bet / call IP"),
  f("ATs", { raise: 20, call: 80 }, "Mostly call IP, some 3bet"),
  f("A9s", { raise: 50, fold: 50 }, "Polarized — 3bet bluff with blocker or fold"),
  f("A8s", { raise: 25, call: 15, fold: 60 }, "Low frequency 3bet bluff, occasional flat"),
  f("A7s", { raise: 30, fold: 70 }, "Bluff 3bet with blocker"),
  f("A6s", { raise: 25, fold: 75 }, "Bluff 3bet with blocker"),
  f("A5s", { raise: 55, call: 20, fold: 25 }, "Wheel blocker — preferred bluff IP"),
  f("A4s", { raise: 45, call: 15, fold: 40 }, "Wheel blocker bluff"),
  f("A3s", { raise: 35, fold: 65 }, "Wheel blocker bluff"),
  f("A2s", { raise: 30, fold: 70 }, "Wheel blocker bluff"),

  // --- Offsuit aces ---
  f("AKo", { raise: 100 }, "Always 3bet for value"),
  f("AQo", { raise: 80, call: 20 }, "Mixed 3bet / call IP"),
  f("AJo", { raise: 100 }, "Pure 3bet IP vs CO"),
  f("ATo", { raise: 20, call: 30, fold: 50 }, "Low frequency raise, mixed continue"),
  f("A9o", { fold: 100 }),
  f("A8o", { fold: 100 }),
  f("A7o", { fold: 100 }),
  f("A6o", { fold: 100 }),
  f("A5o", { fold: 100 }),
  f("A4o", { fold: 100 }),
  f("A3o", { fold: 100 }),
  f("A2o", { fold: 100 }),

  // --- Suited kings ---
  f("KQs", { raise: 60, call: 40 }, "Mixed value 3bet / call IP"),
  f("KJs", { raise: 25, call: 75 }, "Mostly call IP"),
  f("KTs", { raise: 30, call: 60, fold: 10 }, "Mixed raise/call IP"),
  f("K9s", { raise: 20, call: 50, fold: 30 }, "Low frequency raise, mostly call"),
  f("K8s", { call: 30, fold: 70 }, "Low frequency call"),
  f("K7s", { call: 15, fold: 85 }, "Rare call"),
  f("K6s", { fold: 100 }),
  f("K5s", { raise: 10, fold: 90 }, "Rare blocker bluff"),
  f("K4s", { fold: 100 }),
  f("K3s", { fold: 100 }),
  f("K2s", { fold: 100 }),

  // --- Offsuit kings ---
  f("KQo", { raise: 100 }, "Pure 3bet IP vs CO"),
  f("KJo", { raise: 100 }, "Pure 3bet IP vs CO"),
  f("KTo", { raise: 25, call: 25, fold: 50 }, "Low frequency mixed continue"),
  f("K9o", { fold: 100 }),
  f("K8o", { fold: 100 }),

  // --- Suited queens ---
  f("QJs", { raise: 35, call: 60, fold: 5 }, "Mixed raise/call IP"),
  f("QTs", { raise: 20, call: 60, fold: 20 }, "Mixed continue IP"),
  f("Q9s", { fold: 100 }),
  f("Q8s", { fold: 100 }),

  // --- Offsuit queens ---
  f("QJo", { fold: 100 }),
  f("QTo", { fold: 100 }),
  f("Q9o", { fold: 100 }),

  // --- Suited jacks / connectors ---
  f("JTs", { raise: 15, call: 85 }, "Mostly call IP, rare 3bet bluff"),
  f("J9s", { fold: 100 }, "Fold vs CO at 100bb"),
  f("J8s", { fold: 100 }),

  // --- Suited connectors / gappers ---
  f("T9s", { raise: 10, call: 70, fold: 20 }, "Mixed continue IP"),
  f("T8s", { call: 25, fold: 75 }, "Low frequency call"),
  f("98s", { raise: 10, call: 65, fold: 25 }, "Mixed continue IP"),
  f("97s", { fold: 100 }),
  f("87s", { call: 50, fold: 50 }, "Low frequency continue IP"),
  f("86s", { fold: 100 }),
  f("76s", { raise: 15, call: 30, fold: 55 }, "Rare bluff raise, mixed continue"),
  f("75s", { fold: 100 }),
  f("65s", { raise: 25, call: 25, fold: 50 }, "Bluff raise mixed with call/fold"),
  f("54s", { raise: 25, call: 20, fold: 55 }, "Bluff raise mixed with call/fold"),
  f("43s", { fold: 100 }),

  // --- Offsuit junk ---
  f("JTo", { fold: 100 }),
  f("T9o", { fold: 100 }),
  f("98o", { fold: 100 }),
  f("87o", { fold: 100 }),
  f("76o", { fold: 100 }),
  f("65o", { fold: 100 }),
];

export const RANGE_BTN_VS_CO_OPEN_100BB: PreflopRange = {
  id: "BTN_vs_CO_2.5bb_100bb",
  label: "Hero BTN facing CO open 2.5bb (100bb effective)",
  context: {
    heroPosition: "BTN",
    villainPosition: "CO",
    facingAction: "open",
    openSizeBB: 2.5,
    effectiveStackBB: 100,
    rangeArchetype: "balanced",
    flags: [
      "btn-vs-co",
      "wide-defense-ip",
      "polarized-3bet",
      "blocker-bluff-heavy",
      "suited-connectors-mixed",
      "positional-advantage",
      "mixed-frequencies-dominant",
    ],
  },
  hands: HANDS_BTN_VS_CO_OPEN_100BB,
  metadata: buildMetadata(HANDS_BTN_VS_CO_OPEN_100BB),
};

// =====================================================================
// Range #3 — Hero CO facing MP/HJ 2.5bb open, 100bb effective
// Medium-tight defense. MP ranges stronger than CO opens; CO cannot
// overdefend. Premium-heavy 3bet, moderate calling, fewer speculatives.
// =====================================================================

const HANDS_CO_VS_MP_OPEN_100BB: HandEntry[] = [
  // --- Pocket pairs ---
  f("AA", { raise: 100 }, "Always 3bet for value"),
  f("KK", { raise: 100 }, "Always 3bet for value"),
  f("QQ", { raise: 100 }, "Always 3bet for value"),
  f("JJ", { raise: 70, call: 30 }, "Mostly 3bet, mixed call"),
  f("TT", { raise: 60, call: 40 }, "Mixed value 3bet / call"),
  f("99", { raise: 40, call: 60 }, "Mixed continue"),
  f("88", { raise: 25, call: 75 }, "Mostly call"),
  f("77", { raise: 15, call: 85 }, "Set-mine, occasional 3bet"),
  f("66", { raise: 10, call: 40, fold: 50 }, "Low frequency mixed continue"),
  f("55", { call: 25, fold: 75 }, "Mostly fold, rare set-mine"),
  f("44", { call: 15, fold: 85 }, "Mostly fold"),
  f("33", { call: 10, fold: 90 }, "Mostly fold"),
  f("22", { fold: 100 }),

  // --- Suited aces ---
  f("AKs", { raise: 100 }, "Always 3bet for value"),
  f("AQs", { raise: 90, call: 10 }, "Mostly 3bet, tiny mixed call"),
  f("AJs", { raise: 40, call: 60 }, "Mixed 3bet / call"),
  f("ATs", { raise: 20, call: 80 }, "Mostly call"),
  f("A9s", { raise: 35, fold: 65 }, "Mixed bluff 3bet / fold"),
  f("A8s", { raise: 20, fold: 80 }, "Low freq blocker bluff"),
  f("A7s", { raise: 15, fold: 85 }, "Low freq blocker bluff"),
  f("A6s", { raise: 15, fold: 85 }, "Low freq blocker bluff"),
  f("A5s", { raise: 30, fold: 70 }, "Wheel blocker — preferred bluff"),
  f("A4s", { raise: 10, fold: 90 }, "Mostly fold"),
  f("A3s", { fold: 100 }),
  f("A2s", { fold: 100 }),

  // --- Offsuit aces ---
  f("AKo", { raise: 100 }, "Always 3bet for value"),
  f("AQo", { raise: 80, call: 20 }, "Mixed 3bet / call"),
  f("AJo", { raise: 15, fold: 85 }, "Mostly fold vs MP"),
  f("ATo", { fold: 100 }),
  f("A9o", { fold: 100 }),
  f("A8o", { fold: 100 }),
  f("A7o", { fold: 100 }),
  f("A6o", { fold: 100 }),
  f("A5o", { fold: 100 }),
  f("A4o", { fold: 100 }),
  f("A3o", { fold: 100 }),
  f("A2o", { fold: 100 }),

  // --- Suited kings ---
  f("KQs", { raise: 50, call: 50 }, "Mixed 3bet / call"),
  f("KJs", { raise: 25, call: 75 }, "Mostly call"),
  f("KTs", { raise: 15, call: 35, fold: 50 }, "Low frequency mixed continue"),
  f("K9s", { fold: 100 }),
  f("K8s", { fold: 100 }),
  f("K7s", { fold: 100 }),
  f("K6s", { fold: 100 }),
  f("K5s", { fold: 100 }),
  f("K4s", { fold: 100 }),
  f("K3s", { fold: 100 }),
  f("K2s", { fold: 100 }),

  // --- Offsuit kings ---
  f("KQo", { raise: 100 }, "Pure 3bet for value"),
  f("KJo", { raise: 20, fold: 80 }, "Low frequency 3bet / fold"),
  f("KTo", { fold: 100 }),
  f("K9o", { fold: 100 }),

  // --- Suited queens ---
  f("QJs", { raise: 25, call: 70, fold: 5 }, "Mixed raise/call"),
  f("QTs", { call: 35, fold: 65 }, "Low frequency continue"),
  f("Q9s", { fold: 100 }),
  f("Q8s", { fold: 100 }),

  // --- Offsuit queens ---
  f("QJo", { fold: 100 }),
  f("QTo", { fold: 100 }),

  // --- Suited jacks / connectors ---
  f("JTs", { raise: 10, call: 85, fold: 5 }, "Mostly call, rare 3bet bluff"),
  f("J9s", { fold: 100 }),
  f("T9s", { call: 40, fold: 60 }, "Low frequency continue"),
  f("T8s", { fold: 100 }),
  f("98s", { call: 25, fold: 75 }, "Rare mixed continue"),
  f("87s", { call: 15, fold: 85 }, "Very low frequency continue"),
  f("76s", { fold: 100 }),
  f("65s", { raise: 15, fold: 85 }, "Occasional bluff 3bet"),
  f("54s", { raise: 15, fold: 85 }, "Occasional bluff 3bet"),

  // --- Offsuit junk ---
  f("JTo", { fold: 100 }),
  f("T9o", { fold: 100 }),
  f("98o", { fold: 100 }),
  f("87o", { fold: 100 }),
  f("76o", { fold: 100 }),
];

export const RANGE_CO_VS_MP_OPEN_100BB: PreflopRange = {
  id: "CO_vs_MP_2.5bb_100bb",
  label: "Hero CO facing MP/HJ open 2.5bb (100bb effective)",
  context: {
    heroPosition: "CO",
    villainPosition: "MP",
    facingAction: "open",
    openSizeBB: 2.5,
    effectiveStackBB: 100,
    rangeArchetype: "balanced",
    flags: [
      "co-vs-mp",
      "medium-tight-defense",
      "premium-heavy-3bet",
      "moderate-calling-range",
      "fewer-speculatives",
      "wheel-blocker-bluffs",
      "mixed-frequencies",
    ],
  },
  hands: HANDS_CO_VS_MP_OPEN_100BB,
  metadata: buildMetadata(HANDS_CO_VS_MP_OPEN_100BB),
};

// =====================================================================
// Range registry — engine entry point
// =====================================================================

export const PREFLOP_RANGE_DB: Record<string, PreflopRange> = {
  [RANGE_VS_UTG_OPEN_100BB.id]: RANGE_VS_UTG_OPEN_100BB,
  [RANGE_BTN_VS_CO_OPEN_100BB.id]: RANGE_BTN_VS_CO_OPEN_100BB,
  [RANGE_CO_VS_MP_OPEN_100BB.id]: RANGE_CO_VS_MP_OPEN_100BB,
};

/**
 * Look up the preflop strategy for a specific hand against a stored range.
 * Returns frequencies, dominant action, and mixed-strategy flag.
 */
export function lookupHand(rangeId: string, hand: string): {
  entry: HandEntry | null;
  dominantAction: PreflopAction;
  isMixed: boolean;
} {
  const range = PREFLOP_RANGE_DB[rangeId];
  if (!range) return { entry: null, dominantAction: "fold", isMixed: false };
  const entry = range.hands.find(h => h.hand === hand) ?? null;
  if (!entry) return { entry: null, dominantAction: "fold", isMixed: false };
  let dominant: PreflopAction = "fold";
  let max = -1;
  (Object.keys(entry.frequencies) as PreflopAction[]).forEach(a => {
    const v = entry.frequencies[a] ?? 0;
    if (v > max) { max = v; dominant = a; }
  });
  return { entry, dominantAction: dominant, isMixed: entry.mixed };
}

/**
 * Lookup by villain context (position + action + stack depth).
 * Used by the live engine to pick the right stored range automatically.
 */
export function findRangeByContext(opts: {
  villainPosition: string;
  facingAction: RangeContext["facingAction"];
  effectiveStackBB: number;
}): PreflopRange | null {
  return Object.values(PREFLOP_RANGE_DB).find(r =>
    r.context.villainPosition.toUpperCase() === opts.villainPosition.toUpperCase() &&
    r.context.facingAction === opts.facingAction &&
    Math.abs(r.context.effectiveStackBB - opts.effectiveStackBB) <= 25
  ) ?? null;
}
