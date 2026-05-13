// Baseline opening ranges per position, formatted for the Range Matrix.
// Mixed frequencies sum to ~100 per hand. Hands not listed = pure fold.

import { MatrixHandData } from "@/components/RangeMatrix";

type RangeMap = Record<string, MatrixHandData>;

const COMBOS = (h: string) =>
  h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12;

const r = (
  hand: string,
  frequencies: MatrixHandData["frequencies"],
  notes?: string
): [string, MatrixHandData] => [
  hand,
  { hand, frequencies, combos: COMBOS(hand), notes },
];

// =====================================================================
// UTG — extremely tight, premium-heavy
// =====================================================================
export const UTG_OPEN_MATRIX: RangeMap = Object.fromEntries([
  r("AA", { raise: 100 }),
  r("KK", { raise: 100 }),
  r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }),
  r("TT", { raise: 100 }),
  r("99", { raise: 100 }),
  r("88", { raise: 100 }),
  r("77", { raise: 90, fold: 10 }),
  r("66", { raise: 60, fold: 40 }),
  r("55", { raise: 35, fold: 65 }),
  r("44", { raise: 20, fold: 80 }),
  r("33", { raise: 15, fold: 85 }),
  r("22", { raise: 10, fold: 90 }),
  r("AKs", { raise: 100 }),
  r("AQs", { raise: 100 }),
  r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }),
  r("A9s", { raise: 60, fold: 40 }),
  r("A5s", { raise: 70, fold: 30 }),
  r("A4s", { raise: 50, fold: 50 }),
  r("AKo", { raise: 100 }),
  r("AQo", { raise: 100 }),
  r("AJo", { raise: 70, fold: 30 }),
  r("KQs", { raise: 100 }),
  r("KJs", { raise: 100 }),
  r("KTs", { raise: 80, fold: 20 }),
  r("KQo", { raise: 60, fold: 40 }),
  r("QJs", { raise: 90, fold: 10 }),
  r("QTs", { raise: 60, fold: 40 }),
  r("JTs", { raise: 80, fold: 20 }),
  r("T9s", { raise: 50, fold: 50 }),
  r("98s", { raise: 30, fold: 70 }),
]);

// =====================================================================
// MP / HJ — medium-tight
// =====================================================================
export const MP_OPEN_MATRIX: RangeMap = Object.fromEntries([
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }),
  r("66", { raise: 90, fold: 10 }),
  r("55", { raise: 75, fold: 25 }),
  r("44", { raise: 55, fold: 45 }),
  r("33", { raise: 40, fold: 60 }),
  r("22", { raise: 35, fold: 65 }),
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }), r("A9s", { raise: 90, fold: 10 }),
  r("A8s", { raise: 70, fold: 30 }),
  r("A5s", { raise: 90, fold: 10 }),
  r("A4s", { raise: 80, fold: 20 }),
  r("A3s", { raise: 60, fold: 40 }),
  r("A2s", { raise: 50, fold: 50 }),
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 60, fold: 40 }),
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 70, fold: 30 }),
  r("KQo", { raise: 100 }),
  r("KJo", { raise: 70, fold: 30 }),
  r("QJs", { raise: 100 }), r("QTs", { raise: 90, fold: 10 }),
  r("Q9s", { raise: 50, fold: 50 }),
  r("JTs", { raise: 100 }), r("J9s", { raise: 60, fold: 40 }),
  r("T9s", { raise: 90, fold: 10 }),
  r("98s", { raise: 80, fold: 20 }),
  r("87s", { raise: 60, fold: 40 }),
  r("76s", { raise: 40, fold: 60 }),
]);

// =====================================================================
// CO — wide steal
// =====================================================================
export const CO_OPEN_MATRIX: RangeMap = Object.fromEntries([
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }),
  r("66", { raise: 100 }), r("55", { raise: 100 }),
  r("44", { raise: 90, fold: 10 }), r("33", { raise: 80, fold: 20 }),
  r("22", { raise: 70, fold: 30 }),
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }), r("A9s", { raise: 100 }), r("A8s", { raise: 100 }),
  r("A7s", { raise: 100 }), r("A6s", { raise: 90, fold: 10 }),
  r("A5s", { raise: 100 }), r("A4s", { raise: 100 }),
  r("A3s", { raise: 90, fold: 10 }), r("A2s", { raise: 80, fold: 20 }),
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 100 }), r("A9o", { raise: 60, fold: 40 }),
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 100 }), r("K8s", { raise: 80, fold: 20 }),
  r("K7s", { raise: 60, fold: 40 }),
  r("K6s", { raise: 50, fold: 50 }),
  r("K5s", { raise: 40, fold: 60 }),
  r("KQo", { raise: 100 }), r("KJo", { raise: 100 }), r("KTo", { raise: 70, fold: 30 }),
  r("QJs", { raise: 100 }), r("QTs", { raise: 100 }), r("Q9s", { raise: 90, fold: 10 }),
  r("Q8s", { raise: 60, fold: 40 }),
  r("QJo", { raise: 60, fold: 40 }),
  r("JTs", { raise: 100 }), r("J9s", { raise: 100 }), r("J8s", { raise: 60, fold: 40 }),
  r("T9s", { raise: 100 }), r("T8s", { raise: 80, fold: 20 }),
  r("98s", { raise: 100 }), r("97s", { raise: 60, fold: 40 }),
  r("87s", { raise: 100 }), r("86s", { raise: 50, fold: 50 }),
  r("76s", { raise: 90, fold: 10 }), r("65s", { raise: 80, fold: 20 }),
  r("54s", { raise: 70, fold: 30 }),
]);

// =====================================================================
// BTN — very wide
// =====================================================================
export const BTN_OPEN_MATRIX: RangeMap = Object.fromEntries([
  ...Object.entries(CO_OPEN_MATRIX),
  r("44", { raise: 100 }), r("33", { raise: 100 }), r("22", { raise: 100 }),
  r("A6s", { raise: 100 }), r("A3s", { raise: 100 }), r("A2s", { raise: 100 }),
  r("K7s", { raise: 100 }), r("K6s", { raise: 100 }), r("K5s", { raise: 100 }),
  r("K4s", { raise: 90, fold: 10 }), r("K3s", { raise: 80, fold: 20 }),
  r("K2s", { raise: 70, fold: 30 }),
  r("KTo", { raise: 100 }), r("K9o", { raise: 80, fold: 20 }),
  r("Q8s", { raise: 100 }), r("Q7s", { raise: 70, fold: 30 }),
  r("Q6s", { raise: 60, fold: 40 }),
  r("QJo", { raise: 100 }), r("QTo", { raise: 90, fold: 10 }), r("Q9o", { raise: 60, fold: 40 }),
  r("J8s", { raise: 100 }), r("J7s", { raise: 60, fold: 40 }),
  r("JTo", { raise: 90, fold: 10 }), r("J9o", { raise: 60, fold: 40 }),
  r("T8s", { raise: 100 }), r("T7s", { raise: 60, fold: 40 }),
  r("T9o", { raise: 70, fold: 30 }),
  r("97s", { raise: 100 }), r("96s", { raise: 50, fold: 50 }),
  r("98o", { raise: 50, fold: 50 }),
  r("86s", { raise: 90, fold: 10 }), r("75s", { raise: 60, fold: 40 }),
  r("65s", { raise: 100 }), r("64s", { raise: 60, fold: 40 }),
  r("54s", { raise: 100 }), r("53s", { raise: 60, fold: 40 }),
  r("43s", { raise: 50, fold: 50 }),
]);

// =====================================================================
// SB — open/limp mixed strategy (simplified to RFI-only)
// =====================================================================
export const SB_OPEN_MATRIX: RangeMap = Object.fromEntries([
  ...Object.entries(BTN_OPEN_MATRIX).map(([k, v]) => [
    k,
    { ...v, frequencies: { ...v.frequencies, raise: Math.max(0, (v.frequencies.raise ?? 0) - 15), fold: (v.frequencies.fold ?? 0) + 15 } },
  ] as [string, MatrixHandData]),
]);

// =====================================================================
// BB — defense range (call-heavy facing single raise)
// =====================================================================
export const BB_DEFENSE_MATRIX: RangeMap = Object.fromEntries([
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 80, call: 20 }),
  r("TT", { raise: 50, call: 50 }), r("99", { raise: 30, call: 70 }),
  r("88", { call: 100 }), r("77", { call: 100 }), r("66", { call: 100 }),
  r("55", { call: 100 }), r("44", { call: 100 }), r("33", { call: 100 }), r("22", { call: 100 }),
  r("AKs", { raise: 100 }), r("AQs", { raise: 70, call: 30 }),
  r("AJs", { call: 100 }), r("ATs", { call: 100 }),
  r("A9s", { call: 100 }), r("A8s", { call: 100 }), r("A7s", { call: 100 }),
  r("A6s", { call: 100 }), r("A5s", { raise: 50, call: 50 }),
  r("A4s", { raise: 40, call: 60 }), r("A3s", { call: 100 }), r("A2s", { call: 100 }),
  r("AKo", { raise: 100 }), r("AQo", { raise: 50, call: 50 }), r("AJo", { call: 100 }),
  r("ATo", { call: 100 }), r("A9o", { call: 60, fold: 40 }),
  r("KQs", { call: 100 }), r("KJs", { call: 100 }), r("KTs", { call: 100 }),
  r("K9s", { call: 100 }), r("K8s", { call: 100 }), r("K7s", { call: 80, fold: 20 }),
  r("KQo", { call: 100 }), r("KJo", { call: 100 }), r("KTo", { call: 80, fold: 20 }),
  r("QJs", { call: 100 }), r("QTs", { call: 100 }), r("Q9s", { call: 100 }),
  r("Q8s", { call: 80, fold: 20 }),
  r("QJo", { call: 80, fold: 20 }), r("QTo", { call: 60, fold: 40 }),
  r("JTs", { call: 100 }), r("J9s", { call: 100 }), r("J8s", { call: 80, fold: 20 }),
  r("JTo", { call: 60, fold: 40 }),
  r("T9s", { call: 100 }), r("T8s", { call: 100 }),
  r("98s", { call: 100 }), r("87s", { call: 100 }),
  r("76s", { call: 100 }), r("65s", { call: 100 }), r("54s", { call: 100 }),
]);

export interface PositionRangeInfo {
  position: "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";
  label: string;
  archetype: string;
  openFrequencyPct: number;
  matrix: RangeMap;
  insights: string[];
}

export const POSITION_RANGE_CATALOG: Record<string, PositionRangeInfo> = {
  UTG: {
    position: "UTG",
    label: "Under The Gun",
    archetype: "Extremely tight",
    openFrequencyPct: 14,
    matrix: UTG_OPEN_MATRIX,
    insights: [
      "Tightest range at the table",
      "Strong top-pair density",
      "Low bluff frequency",
      "Premium pocket pairs dominate",
      "High domination potential vs Ax/Kx",
    ],
  },
  MP: {
    position: "MP",
    label: "Middle Position / Hijack",
    archetype: "Medium-tight",
    openFrequencyPct: 19,
    matrix: MP_OPEN_MATRIX,
    insights: [
      "Wider than UTG",
      "More suited broadways",
      "Moderate speculative hands",
      "Balanced bluff/value composition",
    ],
  },
  CO: {
    position: "CO",
    label: "Cutoff",
    archetype: "Wide steal",
    openFrequencyPct: 28,
    matrix: CO_OPEN_MATRIX,
    insights: [
      "Wider steal range",
      "More suited connectors",
      "Higher bluff density",
      "Increased positional aggression",
      "Wider offsuit range",
    ],
  },
  BTN: {
    position: "BTN",
    label: "Button",
    archetype: "Very wide",
    openFrequencyPct: 45,
    matrix: BTN_OPEN_MATRIX,
    insights: [
      "Widest opening range",
      "Maximum positional aggression",
      "All suited hands playable",
      "Heavy steal frequency",
      "Polarized 3bet defense",
    ],
  },
  SB: {
    position: "SB",
    label: "Small Blind",
    archetype: "Wide RFI",
    openFrequencyPct: 35,
    matrix: SB_OPEN_MATRIX,
    insights: [
      "OOP postflop — slightly tighter than BTN",
      "Limp/raise mixed strategy",
      "3bet or fold tendency facing raises",
      "Positional disadvantage post-flop",
    ],
  },
  BB: {
    position: "BB",
    label: "Big Blind",
    archetype: "Defense range",
    openFrequencyPct: 0,
    matrix: BB_DEFENSE_MATRIX,
    insights: [
      "Defends widest — closing the action with a price",
      "Mostly call vs single raise",
      "3bet polarized: premiums + suited blockers",
      "Capped range disadvantage post-flop",
    ],
  },
};
