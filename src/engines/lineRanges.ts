// Ranges d'entrée après le flop, tirées de la ligne préflop vraiment jouée : on suit la main dans la table
// du solveur et, pour chaque joueur, on multiplie la fréquence de chacune de ses actions, main par main.
// Un pot 4-betté, un pot à trois ou une taille de relance différente donnent ainsi leurs propres ranges.
import type { RangeWeights } from "@/engines/myRanges";
import { SolverGame, TableAction, findSpot, childKey, isJam, isRaise, toSolverAct, approxNote } from "@/engines/solverSpots";

export type LinePotType = "limp" | "srp" | "3bet" | "4bet";
export interface LineRanges {
  /** Range (poids 0..1) de chaque siège encore dans le coup après le préflop. */
  bySeat: Record<number, RangeWeights>;
  potType: LinePotType;
  /** Rapprochements faits pour suivre la ligne (taille ramenée à l'arbre…). */
  notes: string[];
  /** Une étape de la ligne n'est presque jamais jouée par la stratégie : ranges indicatives. */
  rare: boolean;
}

/** null si la ligne sort des calculs (le site garde alors ses situations types). */
export function lineRanges(g: SolverGame, seatPos: string[], actions: TableAction[], stackBB: number): LineRanges | null {
  const pre = actions.filter(a => a.street === "Preflop" && seatPos[a.seatIdx]);
  if (!pre.length) return null;
  const used = new Set<number>();
  const bySeat: Record<number, RangeWeights> = {};
  const notes: string[] = [];
  let raises = 0, rare = false, key = "";

  const apply = (seat: number, spot: NonNullable<ReturnType<typeof findSpot>>, act: string) => {
    if (act === "F") { delete bySeat[seat]; return; }
    const i = spot.acts.indexOf(act);
    const cur = bySeat[seat];
    const next: RangeWeights = {};
    for (const [h, p] of Object.entries(spot.h)) {
      const x = (cur ? cur[h] ?? 0 : 1) * (p[i] ?? 0) / 100;
      if (x > 0.001) next[h] = x;
    }
    bySeat[seat] = next;
  };

  for (let guard = 0; guard < 60; guard++) {
    const spot = findSpot(g, key);
    if (!spot) {
      if (used.size === pre.length) break; // la street préflop est close
      return null;                         // ligne absente des calculs
    }
    if (spot.r) rare = true;
    const nextIdx = pre.findIndex((a, i) => !used.has(i) && seatPos[a.seatIdx] === spot.a);
    let act: string | undefined, seat: number;
    if (nextIdx >= 0) {
      const a = pre[nextIdx];
      used.add(nextIdx);
      seat = a.seatIdx;
      act = toSolverAct(spot, a, stackBB);
      if (!act) return null;
      const n = approxNote(spot.a, a, act, stackBB);
      if (n) notes.push(n);
    } else {
      // pas d'action saisie pour ce joueur : il se couche (ou checke s'il ne peut pas se coucher)
      act = spot.acts.includes("F") ? "F" : spot.acts.includes("X") ? "X" : undefined;
      if (!act) return null;
      const inHand = Object.keys(bySeat).map(Number).find(s => seatPos[s] === spot.a);
      seat = inHand ?? seatPos.indexOf(spot.a);
    }
    if (isRaise(act) || isJam(act)) raises++;
    apply(seat, spot, act);
    key = childKey(spot, act);
  }
  const potType: LinePotType = raises === 0 ? "limp" : raises === 1 ? "srp" : raises === 2 ? "3bet" : "4bet";
  return { bySeat, potType, notes, rare };
}
