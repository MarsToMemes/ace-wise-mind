// Baseline Opening Range Models — positional priors for the engine.
// These are NOT hero-vs-villain defense charts; they describe the natural
// composition and strength of a player's RFI (raise-first-in) range from
// each position. Used as foundational priors for postflop reasoning:
// range estimation, cbet/bluff prediction, nut advantage, board interaction,
// exploit detection, and street-by-street range narrowing.

export type OpenerPosition = "UTG" | "MP" | "CO" | "BTN" | "SB";

export type RangeArchetype =
  | "extremely-tight"
  | "tight"
  | "medium-tight"
  | "balanced"
  | "wide"
  | "very-wide";

export interface PositionalPriors {
  // 0..1 densities — population assumptions for an unopened raise
  premiumDensity: number;        // AA-QQ, AK
  topPairDensity: number;        // hands that flop TP+ on average board
  overpairDensity: number;       // pocket pairs > top board card
  suitedConnectorDensity: number;
  suitedBroadwayDensity: number;
  blockerBluffDensity: number;   // Axs, Kxs blocker hands
  weakOffsuitDensity: number;
  bluffFrequency: number;        // overall bluff/light-open share
  dominationPotential: number;   // chance villain dominates marginal Bx/Ax
  cbetFrequencyPrior: number;    // expected flop cbet frequency
}

export interface OpeningRangeModel {
  id: string;
  tag: string;
  position: OpenerPosition;
  openSizeBB: number;
  effectiveStackBB: number;
  archetype: RangeArchetype;
  openFrequencyPct: number;      // % of hands opened from this position
  description: string;
  priors: PositionalPriors;
  flags: string[];
  // Representative range composition — used by inference engines
  composition: {
    pairs: string[];             // pocket pairs in range
    suitedAces: string[];
    offsuitAces: string[];
    suitedKings: string[];
    offsuitKings: string[];
    suitedQueens: string[];
    suitedConnectors: string[];
    offsuitBroadways: string[];
  };
}

// =====================================================================
// UTG — extremely tight, premium-heavy, low bluff density
// =====================================================================
export const UTG_BASE_OPEN_MODEL: OpeningRangeModel = {
  id: "UTG_base_open_model",
  tag: "UTG_base_open_model",
  position: "UTG",
  openSizeBB: 2.5,
  effectiveStackBB: 100,
  archetype: "extremely-tight",
  openFrequencyPct: 14,
  description:
    "UTG opens are extremely tight, premium-heavy, and low in bluff density. Strong broadways and pocket pairs dominate the range. High domination potential against weaker Ax/Kx/Qx.",
  priors: {
    premiumDensity: 0.32,
    topPairDensity: 0.55,
    overpairDensity: 0.42,
    suitedConnectorDensity: 0.08,
    suitedBroadwayDensity: 0.22,
    blockerBluffDensity: 0.05,
    weakOffsuitDensity: 0.02,
    bluffFrequency: 0.10,
    dominationPotential: 0.78,
    cbetFrequencyPrior: 0.70,
  },
  flags: [
    "extremely-tight",
    "premium-heavy",
    "low-bluff-density",
    "strong-broadways",
    "strong-pocket-pairs",
    "high-domination-potential",
    "narrow-range",
    "few-weak-offsuit",
  ],
  composition: {
    pairs: ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77"],
    suitedAces: ["AKs", "AQs", "AJs", "ATs", "A5s", "A4s"],
    offsuitAces: ["AKo", "AQo", "AJo"],
    suitedKings: ["KQs", "KJs", "KTs"],
    offsuitKings: ["KQo"],
    suitedQueens: ["QJs", "QTs"],
    suitedConnectors: ["JTs", "T9s", "98s"],
    offsuitBroadways: [],
  },
};

// =====================================================================
// MP / HJ — medium-tight, balanced, moderate aggression
// =====================================================================
export const MP_BASE_OPEN_MODEL: OpeningRangeModel = {
  id: "MP_base_open_model",
  tag: "MP_base_open_model",
  position: "MP",
  openSizeBB: 2.5,
  effectiveStackBB: 100,
  archetype: "medium-tight",
  openFrequencyPct: 19,
  description:
    "MP/HJ opens are medium-tight, wider than UTG with more suited broadways and moderate speculative hands. Balanced bluff/value composition with mixed aggression.",
  priors: {
    premiumDensity: 0.24,
    topPairDensity: 0.52,
    overpairDensity: 0.36,
    suitedConnectorDensity: 0.14,
    suitedBroadwayDensity: 0.28,
    blockerBluffDensity: 0.10,
    weakOffsuitDensity: 0.05,
    bluffFrequency: 0.18,
    dominationPotential: 0.65,
    cbetFrequencyPrior: 0.65,
  },
  flags: [
    "medium-tight",
    "balanced-range",
    "wider-than-utg",
    "more-suited-broadways",
    "moderate-speculative",
    "mixed-aggression",
    "moderate-bluff-frequency",
  ],
  composition: {
    pairs: ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55"],
    suitedAces: ["AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s", "A2s"],
    offsuitAces: ["AKo", "AQo", "AJo", "ATo"],
    suitedKings: ["KQs", "KJs", "KTs", "K9s"],
    offsuitKings: ["KQo", "KJo"],
    suitedQueens: ["QJs", "QTs", "Q9s"],
    suitedConnectors: ["JTs", "T9s", "98s", "87s", "76s"],
    offsuitBroadways: ["KQo"],
  },
};

// =====================================================================
// CO — significantly wider, steal-oriented, more bluff density
// =====================================================================
export const CO_BASE_OPEN_MODEL: OpeningRangeModel = {
  id: "CO_base_open_model",
  tag: "CO_base_open_model",
  position: "CO",
  openSizeBB: 2.5,
  effectiveStackBB: 100,
  archetype: "wide",
  openFrequencyPct: 28,
  description:
    "CO opens are significantly wider with more suited connectors, blocker bluffs, and steal-oriented opens. Wider offsuit range and increased positional aggression. Weaker average hand strength.",
  priors: {
    premiumDensity: 0.16,
    topPairDensity: 0.48,
    overpairDensity: 0.28,
    suitedConnectorDensity: 0.22,
    suitedBroadwayDensity: 0.32,
    blockerBluffDensity: 0.20,
    weakOffsuitDensity: 0.12,
    bluffFrequency: 0.32,
    dominationPotential: 0.50,
    cbetFrequencyPrior: 0.60,
  },
  flags: [
    "wide",
    "steal-oriented",
    "high-bluff-density",
    "more-suited-connectors",
    "blocker-bluff-heavy",
    "wider-offsuit",
    "positional-aggression",
    "weaker-average-strength",
  ],
  composition: {
    pairs: ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22"],
    suitedAces: [
      "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s",
      "A6s", "A5s", "A4s", "A3s", "A2s",
    ],
    offsuitAces: ["AKo", "AQo", "AJo", "ATo", "A9o"],
    suitedKings: ["KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s"],
    offsuitKings: ["KQo", "KJo", "KTo"],
    suitedQueens: ["QJs", "QTs", "Q9s", "Q8s"],
    suitedConnectors: ["JTs", "T9s", "98s", "87s", "76s", "65s", "54s"],
    offsuitBroadways: ["KQo", "KJo", "KTo", "QJo", "QTo", "JTo"],
  },
};

// =====================================================================
// Registry — engine entry point for positional priors
// =====================================================================
export const OPENING_RANGE_MODELS: Record<OpenerPosition, OpeningRangeModel> = {
  UTG: UTG_BASE_OPEN_MODEL,
  MP: MP_BASE_OPEN_MODEL,
  CO: CO_BASE_OPEN_MODEL,
  // Aliases for downstream lookups; populated with the closest available model.
  BTN: { ...CO_BASE_OPEN_MODEL, id: "BTN_base_open_model", tag: "BTN_base_open_model", position: "BTN", openFrequencyPct: 45, archetype: "very-wide" },
  SB: { ...CO_BASE_OPEN_MODEL, id: "SB_base_open_model", tag: "SB_base_open_model", position: "SB", openFrequencyPct: 35, archetype: "wide" },
};

/**
 * Resolve the baseline opening model for a villain position.
 * Used as the FOUNDATIONAL PRIOR before any postflop action occurs.
 */
export function getOpeningModel(position: string): OpeningRangeModel {
  const p = position.toUpperCase() as OpenerPosition;
  return OPENING_RANGE_MODELS[p] ?? MP_BASE_OPEN_MODEL;
}

/**
 * Quick natural-language summary of what a raise from this position represents.
 * Useful for the coach UI / verdict justification.
 */
export function describeOpenerRange(position: string): string {
  const m = getOpeningModel(position);
  return `${m.position} open (${m.openFrequencyPct}% RFI, ${m.archetype}): bluff freq ${(m.priors.bluffFrequency * 100).toFixed(0)}%, top-pair density ${(m.priors.topPairDensity * 100).toFixed(0)}%, domination potential ${(m.priors.dominationPotential * 100).toFixed(0)}%.`;
}

/**
 * Compare two opener positions — useful for relative range advantage priors.
 * Returns positive if A's range is stronger than B's (more premium, less bluff).
 */
export function relativeRangeStrength(a: string, b: string): number {
  const A = getOpeningModel(a).priors;
  const B = getOpeningModel(b).priors;
  return (A.premiumDensity - B.premiumDensity) +
         (A.overpairDensity - B.overpairDensity) * 0.5 -
         (A.bluffFrequency - B.bluffFrequency);
}
