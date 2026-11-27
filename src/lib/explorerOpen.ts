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

const R = "AKQJT98765432";
const fr1 = (x: number) => x.toFixed(1).replace(".", ",");
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

/**
 * Ce que dit la bibliothèque sur cette ouverture, calculé (aucun conseil écrit à la main) : % et combos, paire la plus
 * basse et as les plus bas ouverts au moins une fois sur deux, mains mixtes, tailles choisies.
 */
export function openFacts(v: ExplorerOpen, g: SolverGame): string[] {
  const open = (h: string) => { const f = v.matrix[h]?.frequencies; return (f?.raise ?? 0) + (f?.jam ?? 0); };
  const last = (hs: string[]) => hs.filter(h => open(h) >= 50).pop();
  const pair = last([...R].map(r => r + r));
  const axs = last([...R.slice(1)].map(r => `A${r}s`)), axo = last([...R.slice(1)].map(r => `A${r}o`));
  const mixed = Object.keys(v.matrix).filter(h => open(h) > 5 && open(h) < 95).length;
  const raises = v.acts.filter(a => a.startsWith("R")).map(a => `${a.slice(1).replace(".", ",")} bb`);
  const jams = Object.values(v.matrix).filter(d => (d.frequencies.jam ?? 0) > 0).length;
  return [
    `Ouvre ${fr1(v.pct)} % des mains (${fr1((v.pct / 100) * 1326)} combos sur 1 326, mains mixtes comptées à leur fréquence).`,
    pair ? `Paires ouvertes au moins une fois sur deux : de AA jusqu'à ${pair}.` : "Aucune paire ouverte une fois sur deux.",
    `As assortis jusqu'à ${axs ?? "—"}, as dépareillés jusqu'à ${axo ?? "—"} (ouverts au moins une fois sur deux).`,
    `${plural(mixed, "main")} jouée${mixed > 1 ? "s" : ""} en mixte (entre 5 et 95 %) : survole une case pour voir sa fréquence.`,
    `Relance à ${raises.join(" ou ") || "—"}, ${jams ? `tapis avec ${plural(jams, "main")}` : "jamais de tapis"}.`,
  ];
}

/** Source de la grille d'ouverture : la table du solveur et sa précision. */
export const openSource = (g: SolverGame) =>
  `Bibliothèque du solveur GTOpen · cash ${g.stack} bb${g.iterations ? ` · ${g.iterations} itérations` : ""}${g.gap !== undefined ? ` · écart ${g.gap.toFixed(4).replace(".", ",")} bb par main` : ""}.`;
