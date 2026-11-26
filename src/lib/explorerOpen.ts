// Range Explorer, onglet « Open » : la range d'ouverture d'une position lue dans la bibliothèque du solveur, par la même
// fonction d'accès que le conseiller (getOpenRange). Fréquences de chaque main telles quelles (une main mixte à 40 %
// compte 0,4) ; % affiché = combos pondérés sur 1 326 (paire 6, assortie 4, dépareillée 12), pas le nombre de cases.
import type { MatrixHandData } from "@/components/RangeMatrix";
import type { PreflopAction } from "@/engines/preflopRanges";
import { getOpenRange, type SolverGame } from "@/engines/solverSpots";

const kindOf = (a: string): PreflopAction => (a.startsWith("R") ? "raise" : a.startsWith("A") ? "jam" : a === "C" || a === "L" ? "call" : "fold");
const combos = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);

export interface ExplorerOpen { matrix: Record<string, MatrixHandData>; pct: number; acts: string[] }

export function explorerOpen(pos: string, g: SolverGame | null): ExplorerOpen | null {
  const o = getOpenRange(pos, g);
  if (!o) return null;
  const matrix: Record<string, MatrixHandData> = {};
  for (const [hand, probs] of Object.entries(o.freqs)) {
    const frequencies: Partial<Record<PreflopAction, number>> = {};
    o.acts.forEach((a, i) => { const k = kindOf(a); frequencies[k] = (frequencies[k] ?? 0) + (probs[i] ?? 0); });
    matrix[hand] = { hand, combos: combos(hand), frequencies };
  }
  return { matrix, pct: o.pct, acts: o.acts };
}
