// Données du Range Explorer propres à chaque position : libellés, conseils, grilles de 3-bet et défense de la BB.
// L'OUVERTURE n'est plus ici : elle vient de la bibliothèque du solveur (getOpenRange, solverSpots.ts), seule source
// pour le conseiller et l'Explorer. Pas de chiffre ni de conseil d'ouverture ici : l'Explorer les calcule depuis la
// bibliothèque (lib/explorerOpen.ts, openFacts).
//
// Combos par classe de mains : paire 6, assortie 4, dépareillée 12 (1 326 au total).

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
// Les ranges d'ouverture UTG à SB ne sont plus écrites ici : elles viennent de la bibliothèque du solveur
// (getOpenRange dans solverSpots.ts), seule source pour le conseiller et le Range Explorer.

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
  /** Libellé court, sans chiffre (BB : la défense). */
  archetype?: string;
  /** Grille propre à la position hors ouverture (BB : défense). L'ouverture vient de la bibliothèque du solveur. */
  matrix?: RangeMap;
  matrix3bet?: RangeMap;
  threeBetContext?: string;
  /** Conseils écrits à la main : seulement hors ouverture (BB). */
  insights?: string[];
  /** Note de calibration affichée sous la matrice */
  calibration?: string;
}

export const POSITION_RANGE_CATALOG: Record<string, PositionRangeInfo> = {
  UTG: {
    position: "UTG",
    label: "Under The Gun",
    matrix3bet: UTG_3BET_MATRIX,
    threeBetContext: "Hero facing UTG open 2.5bb · 100bb",
  },
  MP: {
    position: "MP",
    label: "Middle Position / Hijack",
    matrix3bet: MP_3BET_MATRIX,
    threeBetContext: "Hero CO facing MP open 2.5bb · 100bb",
  },
  CO: {
    position: "CO",
    label: "Cutoff",
    matrix3bet: CO_3BET_MATRIX,
    threeBetContext: "Hero BTN facing CO open 2.5bb · 100bb",
  },
  BTN: {
    position: "BTN",
    label: "Button",
  },
  SB: {
    position: "SB",
    label: "Small Blind",
  },
  BB: {
    position: "BB",
    label: "Big Blind",
    archetype: "Défense face à l'ouverture du BTN (2,5 bb)",
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
