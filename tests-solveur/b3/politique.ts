// B3 — Politique d'un joueur pour toute une range : le choix qu'il ferait avec chaque main, à un nœud donné. C'est ce
// que l'exploiteur a le droit de connaître (la stratégie), pas les cartes réelles.
//  - joueur simple ou site au flop et à la turn : on lui pose la question main par main (sa décision est déterministe :
//    le conseiller maison tire ses simulations avec une graine fixe) ;
//  - site à la river : le solveur résout le même jeu pour toutes les mains de sa range ; on le résout une fois et on lit
//    l'action la plus jouée par chaque main, exactement comme solveEndgame puis decide, garde-fou D46 compris (contrôlé main par main dans le
//    rapport). Une main absente de la range du solveur change le jeu (solveEndgame l'ajoute avec un petit poids) : on la
//    demande à decide, une par une.
import { Solver } from "@/engines/endgame/cfr";
import { ENDGAME_LIMITS } from "@/engines/endgame/solve";
import { decide, riverInput, riverChoice, riverGuard, ranges, type View, type Choice } from "../b4/joueur";
import { removeDead } from "@/engines/postflopRanges";

export type Hole = [string, string];
export const keyOf = (a: string, b: string) => (a < b ? a + b : b + a);
/** Clé d'un choix : genre, et montant « à » au centième pour une mise ou une relance. */
export const keyOfChoice = (c: Choice) => (c.kind === "bet" || c.kind === "raise" ? `${c.kind}:${Math.round((c.to ?? 0) * 100)}` : c.kind);

/** Résout la river une fois (mêmes réglages et même boucle que solveEndgame) ; null si solveEndgame aussi rendrait null. */
function riverOnce(v: View) {
  const inp = riverInput(v);
  const hero = inp.hero, vil = (1 - hero) as 0 | 1;
  const s = new Solver({ street: inp.street, board: inp.board, startPot: inp.startPot, stack: inp.stack, ranges: inp.ranges, path: inp.path, rake: inp.rake } as never);
  const target = s.pathNode;
  if (!target || target.player !== hero || !s.hs[vil].n) return null;
  const lim = ENDGAME_LIMITS.River, maxIter = lim.maxIter, goal = 0.3, chunk = 50, checkEvery = 50;
  while (s.iterations < maxIter) {
    const done = s.run(Math.min(chunk, maxIter - s.iterations), Infinity);
    if (done === 0) break;
    if (s.iterations % checkEvery === 0 && s.exploitabilityPct() <= goal) break;
  }
  const st = s.averageStrategy(target), n = s.hs[hero].n;
  const inRange = new Set(inp.ranges[hero].filter(c => c.w > 0).map(c => keyOf(c.cards[0], c.cards[1])));
  const [r0, r1] = ranges(v), mine = removeDead(v.me === 0 ? r0 : r1, v.board);   // pour le garde-fou (D46)
  return (h: Hole): Choice | null => {
    const k = keyOf(h[0], h[1]);
    const hi = s.hs[hero].key.get(k);
    if (!inRange.has(k) || hi === undefined) return null;
    let b = 0;
    for (let a = 1; a < target.actions.length; a++) if (st[a * n + hi] > st[b * n + hi]) b = a;
    return riverGuard({ ...v, hole: h }, riverChoice(v, target.actions[b]), mine);
  };
}

export interface PolicyStats { asked: number; riverSolves: number; riverOne: number }
export const pstats: PolicyStats = { asked: 0, riverSolves: 0, riverOne: 0 };

/** Choix du site pour chaque main (vue de l'adversaire, cartes remplacées). */
export function sitePolicy(v: View, hands: Hole[]): string[] {
  pstats.asked += hands.length;
  if (v.street === "River") {
    pstats.riverSolves++;
    const one = riverOnce(v);
    return hands.map(h => {
      const c = one?.(h);
      if (c) return keyOfChoice(c);
      pstats.riverOne++;
      return keyOfChoice(decide({ ...v, hole: h }));
    });
  }
  return hands.map(h => keyOfChoice(decide({ ...v, hole: h })));
}

/** Choix d'un joueur simple et déterministe pour chaque main. */
export const simplePolicy = (dec: (v: View, r: () => number) => Choice) => (v: View, hands: Hole[]) =>
  hands.map(h => keyOfChoice(dec({ ...v, hole: h }, () => 0.5)));
