// Nœuds vides de la bibliothèque préflop : la stratégie du solveur n'y arrive jamais (aucune main ne prend la ligne
// qui y mène), le calcul n'y a donc aucune solution. Liste utilisée par le script scripts/empty-nodes.ts (fixture de
// non-régression) et par le site pour dire « pas de solution pour cette ligne, conseil indicatif ».
import type { SolverGame } from "@/engines/solverSpots";

export interface EmptyNode { key: string; line: string; hero: string }

const fr = (x: string) => x.replace(".", ",");
/** « CO:R2.5 » → « CO relance 2,5 » ; F couché, C paie, X check, L limp, A tapis. */
export function readableLine(key: string): string {
  if (!key) return "(premier à parler)";
  return key.split(",").map(step => {
    const [pos, a] = step.split(":");
    const what = a === "F" ? "fold" : a === "C" ? "call" : a === "X" ? "check" : a === "L" ? "limp"
      : a.startsWith("R") ? `relance ${fr(a.slice(1))}` : a.startsWith("A") ? `tapis ${fr(a.slice(1))}` : a;
    return `${pos} ${what}`;
  }).join(", ");
}

export const isEmptySpot = (s: { h: Record<string, number[]> }) => Object.keys(s.h).length === 0;

export function emptyNodes(g: SolverGame): EmptyNode[] {
  return g.spots.filter(isEmptySpot).map(s => ({ key: s.k, line: readableLine(s.k), hero: s.a }));
}
