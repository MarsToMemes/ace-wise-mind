// Équité utilisée par le moteur de base (Index.tsx) : contre les ranges adverses déduites des actions quand elles sont
// connues (simulation de tout le board restant, aussi avant le flop) ; à défaut, avant le flop, l'équité contre une
// main au hasard (table EQ_VS_RANDOM) ; au flop et à la turn, la règle des outs. Avant ce module, l'équité valait 0
// avant le flop (règle des outs), ce qui faisait conseiller « Fold » avec A♥Q♥ face à un tapis.
import { estimateEquity } from "@/lib/pokerEngine";
import { evaluateHandVsRange, type HandVsRangeResult } from "@/lib/handVsRange";
import type { OpponentRange } from "@/lib/rangeInference";
import { EQ_VS_RANDOM } from "@/engines/preflopEquity";

const RANKS = "AKQJT98765432";

/** Nom de la main : AA, AKs, AKo… */
export function handKey(hole: string[]): string {
  const [a, b] = [...hole].sort((x, y) => RANKS.indexOf(x[0]) - RANKS.indexOf(y[0]));
  if (a[0] === b[0]) return a[0] + b[0];
  return a[0] + b[0] + (a[1] === b[1] ? "s" : "o");
}

export function baseEquity(hole: string[], board: string[], outs: number, opponents: OpponentRange[]): { equityPct: number; vsRange: HandVsRangeResult | null } {
  const vsRange = hole.length === 2 && opponents.length > 0 && (board.length === 0 || board.length >= 3)
    ? evaluateHandVsRange({ hole, board, opponentRanges: opponents }) : null;
  if (vsRange) return { equityPct: vsRange.equity_percentage, vsRange };
  if (board.length === 0 && hole.length === 2) return { equityPct: EQ_VS_RANDOM[handKey(hole)] ?? 0, vsRange: null };
  return { equityPct: estimateEquity(outs, board.length), vsRange: null };
}
