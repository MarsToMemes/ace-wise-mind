// Baseline opening ranges per position — GTO 6-max 100bb cash NLHE
// (rake 5% / cap 3bb assumption). Frequencies sum to 100. Hands not listed = pure fold.
//
// Combo counts per hand class:
//   pair (XX) = 6, suited (Xs) = 4, offsuit (Xo) = 12.  Total deck = 1326 combos.
// Target RFI %:
//   UTG ~16% · MP ~22% · CO ~28% · BTN ~48% · SB ~40% · BB defense vs BTN ~55%

import { MatrixHandData } from "@/components/RangeMatrix";
import {
  RANGE_VS_UTG_OPEN_100BB,
  RANGE_CO_VS_MP_OPEN_100BB,
  RANGE_BTN_VS_CO_OPEN_100BB,
  PreflopRange,
} from "@/engines/preflopRanges";

type RangeMap = Record<string, MatrixHandData>;

function rangeToMatrix(range: PreflopRange): RangeMap {
  const out: RangeMap = {};
  for (const h of range.hands) {
    out[h.hand] = {
      hand: h.hand,
      combos: h.combos,
      frequencies: h.frequencies,
      notes: h.notes,
    };
  }
  return out;
}

export const UTG_3BET_MATRIX: RangeMap = rangeToMatrix(RANGE_VS_UTG_OPEN_100BB);
export const MP_3BET_MATRIX:  RangeMap = rangeToMatrix(RANGE_CO_VS_MP_OPEN_100BB);
export const CO_3BET_MATRIX:  RangeMap = rangeToMatrix(RANGE_BTN_VS_CO_OPEN_100BB);

const COMBOS = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);

const r = (
  hand: string,
  frequencies: MatrixHandData["frequencies"],
  notes?: string,
): [string, MatrixHandData] => [
  hand,
  { hand, frequencies, combos: COMBOS(hand), notes },
];

// =====================================================================
// UTG — 16% RFI · 88+, AJs+, KQs, AQo+, ATs+, suited connectors 76s+
// =====================================================================
export const UTG_OPEN_MATRIX: RangeMap = Object.fromEntries([
  // Pairs 88+
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }),
  r("77", { raise: 50, fold: 50 }),
  // Suited Aces
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }),
  r("AJs", { raise: 100 }), r("ATs", { raise: 100 }),
  r("A5s", { raise: 60, fold: 40 }),
  r("A4s", { raise: 40, fold: 60 }),
  // Suited Kings
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }),
  r("KTs", { raise: 80, fold: 20 }),
  // Suited Broadways
  r("QJs", { raise: 100 }), r("QTs", { raise: 70, fold: 30 }),
  r("JTs", { raise: 100 }),
  // Suited connectors
  r("T9s", { raise: 80, fold: 20 }),
  r("98s", { raise: 60, fold: 40 }),
  r("87s", { raise: 50, fold: 50 }),
  r("76s", { raise: 40, fold: 60 }),
  // Offsuit broadways
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }),
  r("AJo", { raise: 60, fold: 40 }),
  r("KQo", { raise: 70, fold: 30 }),
]);

// =====================================================================
// MP / HJ — 22% RFI · 66+, ATs+, KTs+, QTs+, JTs, AJo+, KQo
// =====================================================================
export const MP_OPEN_MATRIX: RangeMap = Object.fromEntries([
  // Pairs 66+
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }), r("66", { raise: 100 }),
  r("55", { raise: 60, fold: 40 }),
  r("44", { raise: 40, fold: 60 }),
  // Suited Aces ATs+ + suited wheel
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }),
  r("A9s", { raise: 60, fold: 40 }),
  r("A5s", { raise: 100 }), r("A4s", { raise: 80, fold: 20 }),
  r("A3s", { raise: 60, fold: 40 }),
  // Suited Kings KTs+
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 50, fold: 50 }),
  // Suited Queens QTs+
  r("QJs", { raise: 100 }), r("QTs", { raise: 100 }),
  // Other suited Broadway / connectors
  r("JTs", { raise: 100 }),
  r("J9s", { raise: 60, fold: 40 }),
  r("T9s", { raise: 100 }),
  r("98s", { raise: 90, fold: 10 }),
  r("87s", { raise: 80, fold: 20 }),
  r("76s", { raise: 60, fold: 40 }),
  r("65s", { raise: 40, fold: 60 }),
  // Offsuit AJo+, KQo
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 50, fold: 50 }),
  r("KQo", { raise: 100 }),
  r("KJo", { raise: 50, fold: 50 }),
]);

// =====================================================================
// CO — 28% RFI · 55+, A9s+, K9s+, Q9s+, J9s+, T9s, ATo+, KJo+
// =====================================================================
export const CO_OPEN_MATRIX: RangeMap = Object.fromEntries([
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }), r("66", { raise: 100 }),
  r("55", { raise: 100 }),
  r("44", { raise: 80, fold: 20 }), r("33", { raise: 60, fold: 40 }),
  r("22", { raise: 50, fold: 50 }),
  // Suited Aces A9s+ + wheel
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }), r("A9s", { raise: 100 }),
  r("A8s", { raise: 100 }), r("A7s", { raise: 100 }),
  r("A6s", { raise: 100 }),
  r("A5s", { raise: 100 }), r("A4s", { raise: 100 }),
  r("A3s", { raise: 100 }), r("A2s", { raise: 90, fold: 10 }),
  // Suited Kings K9s+
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 100 }),
  r("K8s", { raise: 60, fold: 40 }),
  // Suited Queens Q9s+
  r("QJs", { raise: 100 }), r("QTs", { raise: 100 }), r("Q9s", { raise: 100 }),
  // Suited Jacks J9s+
  r("JTs", { raise: 100 }), r("J9s", { raise: 100 }),
  r("J8s", { raise: 60, fold: 40 }),
  // Suited connectors T9s + lower
  r("T9s", { raise: 100 }), r("T8s", { raise: 80, fold: 20 }),
  r("98s", { raise: 100 }), r("97s", { raise: 70, fold: 30 }),
  r("87s", { raise: 100 }), r("86s", { raise: 50, fold: 50 }),
  r("76s", { raise: 100 }), r("65s", { raise: 90, fold: 10 }),
  r("54s", { raise: 70, fold: 30 }),
  // Offsuit ATo+, KJo+
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 100 }),
  r("A9o", { raise: 50, fold: 50 }),
  r("KQo", { raise: 100 }), r("KJo", { raise: 100 }),
  r("KTo", { raise: 70, fold: 30 }),
  r("QJo", { raise: 70, fold: 30 }),
]);

// =====================================================================
// BTN — 48% RFI · 22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, A7o+, K9o+, Q9o+, J9o+, T9o, 98o
// =====================================================================
export const BTN_OPEN_MATRIX: RangeMap = Object.fromEntries([
  // Pairs 22+
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }), r("66", { raise: 100 }),
  r("55", { raise: 100 }), r("44", { raise: 100 }), r("33", { raise: 100 }),
  r("22", { raise: 100 }),
  // Suited Aces A2s+
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }), r("A9s", { raise: 100 }), r("A8s", { raise: 100 }),
  r("A7s", { raise: 100 }), r("A6s", { raise: 100 }),
  r("A5s", { raise: 100 }), r("A4s", { raise: 100 }),
  r("A3s", { raise: 100 }), r("A2s", { raise: 100 }),
  // Suited Kings K2s+
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 100 }), r("K8s", { raise: 100 }), r("K7s", { raise: 100 }),
  r("K6s", { raise: 100 }), r("K5s", { raise: 100 }), r("K4s", { raise: 100 }),
  r("K3s", { raise: 90, fold: 10 }), r("K2s", { raise: 80, fold: 20 }),
  // Suited Queens Q5s+
  r("QJs", { raise: 100 }), r("QTs", { raise: 100 }), r("Q9s", { raise: 100 }),
  r("Q8s", { raise: 100 }), r("Q7s", { raise: 90, fold: 10 }),
  r("Q6s", { raise: 80, fold: 20 }), r("Q5s", { raise: 70, fold: 30 }),
  // Suited Jacks J7s+
  r("JTs", { raise: 100 }), r("J9s", { raise: 100 }), r("J8s", { raise: 100 }),
  r("J7s", { raise: 80, fold: 20 }),
  // Suited Tens T7s+
  r("T9s", { raise: 100 }), r("T8s", { raise: 100 }), r("T7s", { raise: 80, fold: 20 }),
  // Suited connectors 97s+
  r("98s", { raise: 100 }), r("97s", { raise: 100 }),
  r("87s", { raise: 100 }), r("86s", { raise: 90, fold: 10 }),
  r("76s", { raise: 100 }), r("75s", { raise: 80, fold: 20 }),
  r("65s", { raise: 100 }), r("64s", { raise: 70, fold: 30 }),
  r("54s", { raise: 100 }), r("53s", { raise: 60, fold: 40 }),
  r("43s", { raise: 50, fold: 50 }),
  // Offsuit A7o+
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 100 }), r("A9o", { raise: 100 }), r("A8o", { raise: 100 }),
  r("A7o", { raise: 90, fold: 10 }),
  // Offsuit K9o+
  r("KQo", { raise: 100 }), r("KJo", { raise: 100 }),
  r("KTo", { raise: 100 }), r("K9o", { raise: 80, fold: 20 }),
  // Offsuit Q9o+, J9o+, T9o, 98o
  r("QJo", { raise: 100 }), r("QTo", { raise: 100 }), r("Q9o", { raise: 70, fold: 30 }),
  r("JTo", { raise: 100 }), r("J9o", { raise: 70, fold: 30 }),
  r("T9o", { raise: 70, fold: 30 }),
  r("98o", { raise: 50, fold: 50 }),
]);

// =====================================================================
// SB — 40% RFI · BTN range moins les marges (limp/raise mixte simplifié)
// =====================================================================
export const SB_OPEN_MATRIX: RangeMap = Object.fromEntries([
  // Pairs 22+
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 100 }), r("TT", { raise: 100 }), r("99", { raise: 100 }),
  r("88", { raise: 100 }), r("77", { raise: 100 }), r("66", { raise: 100 }),
  r("55", { raise: 100 }), r("44", { raise: 100 }), r("33", { raise: 100 }),
  r("22", { raise: 100 }),
  // Suited Aces A2s+
  r("AKs", { raise: 100 }), r("AQs", { raise: 100 }), r("AJs", { raise: 100 }),
  r("ATs", { raise: 100 }), r("A9s", { raise: 100 }), r("A8s", { raise: 100 }),
  r("A7s", { raise: 100 }), r("A6s", { raise: 100 }),
  r("A5s", { raise: 100 }), r("A4s", { raise: 100 }),
  r("A3s", { raise: 90, fold: 10 }), r("A2s", { raise: 80, fold: 20 }),
  // Suited Kings K5s+
  r("KQs", { raise: 100 }), r("KJs", { raise: 100 }), r("KTs", { raise: 100 }),
  r("K9s", { raise: 100 }), r("K8s", { raise: 90, fold: 10 }),
  r("K7s", { raise: 70, fold: 30 }), r("K6s", { raise: 60, fold: 40 }),
  r("K5s", { raise: 50, fold: 50 }),
  // Suited Queens Q8s+
  r("QJs", { raise: 100 }), r("QTs", { raise: 100 }), r("Q9s", { raise: 100 }),
  r("Q8s", { raise: 80, fold: 20 }),
  // Suited Jacks/Tens
  r("JTs", { raise: 100 }), r("J9s", { raise: 100 }), r("J8s", { raise: 70, fold: 30 }),
  r("T9s", { raise: 100 }), r("T8s", { raise: 80, fold: 20 }),
  // Suited connectors
  r("98s", { raise: 100 }), r("87s", { raise: 100 }),
  r("76s", { raise: 90, fold: 10 }), r("65s", { raise: 80, fold: 20 }),
  r("54s", { raise: 70, fold: 30 }),
  // Offsuit (plus serré que BTN — OOP postflop)
  r("AKo", { raise: 100 }), r("AQo", { raise: 100 }), r("AJo", { raise: 100 }),
  r("ATo", { raise: 100 }), r("A9o", { raise: 80, fold: 20 }),
  r("A8o", { raise: 60, fold: 40 }), r("A7o", { raise: 50, fold: 50 }),
  r("KQo", { raise: 100 }), r("KJo", { raise: 100 }), r("KTo", { raise: 90, fold: 10 }),
  r("K9o", { raise: 60, fold: 40 }),
  r("QJo", { raise: 90, fold: 10 }), r("QTo", { raise: 70, fold: 30 }),
  r("JTo", { raise: 70, fold: 30 }),
]);

// =====================================================================
// BB — defense vs BTN 2.5bb · ~55% (large call + 3bet polarisé)
// =====================================================================
export const BB_DEFENSE_MATRIX: RangeMap = Object.fromEntries([
  // Premiums 3bet
  r("AA", { raise: 100 }), r("KK", { raise: 100 }), r("QQ", { raise: 100 }),
  r("JJ", { raise: 80, call: 20 }),
  r("TT", { raise: 50, call: 50 }), r("99", { raise: 30, call: 70 }),
  r("88", { call: 100 }), r("77", { call: 100 }), r("66", { call: 100 }),
  r("55", { call: 100 }), r("44", { call: 100 }), r("33", { call: 100 }),
  r("22", { call: 100 }),
  // Suited Aces — call wide, 3bet wheel as bluff
  r("AKs", { raise: 100 }), r("AQs", { raise: 70, call: 30 }),
  r("AJs", { raise: 30, call: 70 }), r("ATs", { call: 100 }),
  r("A9s", { call: 100 }), r("A8s", { call: 100 }), r("A7s", { call: 100 }),
  r("A6s", { call: 100 }),
  r("A5s", { raise: 60, call: 40 }), r("A4s", { raise: 50, call: 50 }),
  r("A3s", { raise: 30, call: 70 }), r("A2s", { call: 100 }),
  // Suited Kings — call wide
  r("KQs", { raise: 30, call: 70 }), r("KJs", { call: 100 }), r("KTs", { call: 100 }),
  r("K9s", { call: 100 }), r("K8s", { call: 100 }), r("K7s", { call: 100 }),
  r("K6s", { call: 80, fold: 20 }), r("K5s", { call: 70, fold: 30 }),
  r("K4s", { call: 60, fold: 40 }), r("K3s", { call: 40, fold: 60 }),
  r("K2s", { call: 30, fold: 70 }),
  // Suited Queens
  r("QJs", { call: 100 }), r("QTs", { call: 100 }), r("Q9s", { call: 100 }),
  r("Q8s", { call: 100 }), r("Q7s", { call: 70, fold: 30 }),
  r("Q6s", { call: 50, fold: 50 }), r("Q5s", { call: 40, fold: 60 }),
  // Suited Jacks/Tens
  r("JTs", { call: 100 }), r("J9s", { call: 100 }), r("J8s", { call: 100 }),
  r("J7s", { call: 60, fold: 40 }),
  r("T9s", { call: 100 }), r("T8s", { call: 100 }), r("T7s", { call: 60, fold: 40 }),
  // Suited connectors all
  r("98s", { call: 100 }), r("97s", { call: 100 }),
  r("87s", { call: 100 }), r("86s", { call: 80, fold: 20 }),
  r("76s", { call: 100 }), r("75s", { call: 70, fold: 30 }),
  r("65s", { call: 100 }), r("64s", { call: 60, fold: 40 }),
  r("54s", { call: 100 }), r("53s", { call: 50, fold: 50 }),
  // Offsuit Aces
  r("AKo", { raise: 100 }), r("AQo", { raise: 50, call: 50 }),
  r("AJo", { call: 100 }), r("ATo", { call: 100 }),
  r("A9o", { call: 80, fold: 20 }), r("A8o", { call: 60, fold: 40 }),
  r("A7o", { call: 50, fold: 50 }), r("A6o", { call: 40, fold: 60 }),
  r("A5o", { call: 50, fold: 50 }), r("A4o", { call: 40, fold: 60 }),
  // Offsuit Kings
  r("KQo", { call: 100 }), r("KJo", { call: 100 }), r("KTo", { call: 100 }),
  r("K9o", { call: 70, fold: 30 }), r("K8o", { call: 50, fold: 50 }),
  // Offsuit Queens / Broadways
  r("QJo", { call: 100 }), r("QTo", { call: 90, fold: 10 }),
  r("Q9o", { call: 60, fold: 40 }),
  r("JTo", { call: 90, fold: 10 }), r("J9o", { call: 60, fold: 40 }),
  r("T9o", { call: 70, fold: 30 }), r("T8o", { call: 40, fold: 60 }),
  r("98o", { call: 60, fold: 40 }), r("87o", { call: 40, fold: 60 }),
]);

export interface PositionRangeInfo {
  position: "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";
  label: string;
  archetype: string;
  openFrequencyPct: number;
  matrix: RangeMap;
  matrix3bet?: RangeMap;
  threeBetContext?: string;
  insights: string[];
  /** Note de calibration affichée sous la matrice */
  calibration?: string;
}

const CALIBRATION = "Baseline GTO 6-max 100bb cash NLHE, rake 5%/3bb cap. À adapter selon votre format (FR, heads-up) et niveau adverse.";

export const POSITION_RANGE_CATALOG: Record<string, PositionRangeInfo> = {
  UTG: {
    position: "UTG",
    label: "Under The Gun",
    archetype: "Tight (~16% RFI)",
    openFrequencyPct: 16,
    matrix: UTG_OPEN_MATRIX,
    matrix3bet: UTG_3BET_MATRIX,
    threeBetContext: "Hero facing UTG open 2.5bb · 100bb",
    calibration: CALIBRATION,
    insights: [
      "Range la plus tight de la table",
      "Forte densité de top pair / overpair",
      "Faible fréquence de bluff",
      "Suited connectors 76s+ uniquement",
      "Haut potentiel de domination vs Ax/Kx",
    ],
  },
  MP: {
    position: "MP",
    label: "Middle Position / Hijack",
    archetype: "Medium-tight (~22% RFI)",
    openFrequencyPct: 22,
    matrix: MP_OPEN_MATRIX,
    matrix3bet: MP_3BET_MATRIX,
    threeBetContext: "Hero CO facing MP open 2.5bb · 100bb",
    calibration: CALIBRATION,
    insights: [
      "Plus large que UTG",
      "Suited broadways complets",
      "Wheel suited Ax (A5s, A4s) ajoutés",
      "Composition équilibrée value/spéculatif",
    ],
  },
  CO: {
    position: "CO",
    label: "Cutoff",
    archetype: "Wide steal (~28% RFI)",
    openFrequencyPct: 28,
    matrix: CO_OPEN_MATRIX,
    matrix3bet: CO_3BET_MATRIX,
    threeBetContext: "Hero BTN facing CO open 2.5bb · 100bb",
    calibration: CALIBRATION,
    insights: [
      "Steal range large",
      "Tous les suited Ax open",
      "Plus de suited connectors et gappers",
      "ATo+, KJo+ inclus",
      "Densité de bluff plus élevée",
    ],
  },
  BTN: {
    position: "BTN",
    label: "Button",
    archetype: "Very wide (~48% RFI)",
    openFrequencyPct: 48,
    matrix: BTN_OPEN_MATRIX,
    calibration: CALIBRATION,
    insights: [
      "Range d'ouverture la plus large",
      "Toutes les paires + tous les suited Ax/Kx",
      "Suited Q5s+, J7s+, T7s+, 97s+",
      "Offsuit large : A7o+, K9o+, Q9o+, J9o+, T9o, 98o",
      "Agressivité positionnelle maximale",
    ],
  },
  SB: {
    position: "SB",
    label: "Small Blind",
    archetype: "Wide RFI (~40%)",
    openFrequencyPct: 40,
    matrix: SB_OPEN_MATRIX,
    calibration: CALIBRATION,
    insights: [
      "OOP postflop — légèrement plus tight que BTN",
      "Stratégie limp/raise mixte selon dynamique",
      "Tendance 3bet ou fold face aux raises",
      "Désavantage positionnel postflop",
    ],
  },
  BB: {
    position: "BB",
    label: "Big Blind",
    archetype: "Defense ~55% vs BTN 2.5bb",
    openFrequencyPct: 0,
    matrix: BB_DEFENSE_MATRIX,
    calibration: "Defense vs BTN open 2.5bb · 6-max 100bb cash. Adaptez selon la position de l'open (vs UTG : range bien plus tight).",
    insights: [
      "Défend le plus large — clôt l'action avec un prix",
      "Majoritairement call vs single raise",
      "3bet polarisé : premiums + suited blockers (A5s, A4s)",
      "Range cappée — désavantage postflop",
    ],
  },
};
