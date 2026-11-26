// B1 — Meilleures réponses exactes, écrites à part (aucun import du site). Deux formes de jeu :
// 1) jeu explicite (Kuhn, Leduc) : nœuds de hasard, de décision regroupés par ensemble d'information, terminaux ;
// 2) river en tête-à-tête : arbre de mises fourni (celui du solveur mesuré : on mesure « aux frontières de cet arbre »),
//    mains et poids de chaque joueur, board ; gains, retraits de cartes et abattage calculés ici.
import { best } from "./evaluateur";

// ------------------------------------------------------------------ jeu explicite
export type JNode =
  | { t: "chance"; outcomes: { p: number; child: JNode }[] }
  | { t: "decision"; player: number; info: string; actions: string[]; children: JNode[] }
  | { t: "terminal"; payoffs: number[] };
export type JProfile = (info: string) => number[] | undefined;

const probsOf = (prof: JProfile, n: Extract<JNode, { t: "decision" }>) => prof(n.info) ?? n.actions.map(() => 1 / n.actions.length);

/** Valeur attendue de chaque joueur sous le profil. */
export function jValues(root: JNode, prof: JProfile, players: number): number[] {
  const go = (n: JNode): number[] => {
    if (n.t === "terminal") return n.payoffs;
    if (n.t === "chance") return n.outcomes.reduce((acc, o) => go(o.child).map((v, i) => acc[i] + o.p * v), Array(players).fill(0));
    const p = probsOf(prof, n);
    return n.children.reduce((acc, c, a) => (p[a] ? go(c).map((v, i) => acc[i] + p[a] * v) : acc), Array(players).fill(0));
  };
  return go(root);
}

/**
 * Valeur de la meilleure réponse du joueur i (les autres jouent le profil). Ensembles d'information traités du plus
 * profond au moins profond (rappel parfait) : à chacun, l'action qui maximise la somme, sur ses nœuds, de
 * (probabilité des autres et du hasard) × (valeur de l'enfant avec les choix déjà faits plus bas).
 */
export function jBestResponse(root: JNode, prof: JProfile, i: number): number {
  type D = Extract<JNode, { t: "decision" }>;
  const sets = new Map<string, { depth: number; nodes: { n: D; reach: number }[] }>();
  const collect = (n: JNode, reach: number, depth: number) => {
    if (n.t === "terminal") return;
    if (n.t === "chance") { n.outcomes.forEach(o => collect(o.child, reach * o.p, depth + 1)); return; }
    if (n.player === i) {
      const s = sets.get(n.info) ?? { depth, nodes: [] };
      s.depth = Math.max(s.depth, depth); s.nodes.push({ n, reach }); sets.set(n.info, s);
      n.children.forEach(c => collect(c, reach, depth + 1));
    } else {
      const p = probsOf(prof, n);
      n.children.forEach((c, a) => { if (p[a]) collect(c, reach * p[a], depth + 1); });
    }
  };
  collect(root, 1, 0);
  const choice = new Map<string, number>();
  const val = (n: JNode): number => {
    if (n.t === "terminal") return n.payoffs[i];
    if (n.t === "chance") return n.outcomes.reduce((v, o) => v + o.p * val(o.child), 0);
    if (n.player === i) {
      const a = choice.get(n.info);
      if (a === undefined) throw new Error(`ensemble ${n.info} pas encore décidé`);
      return val(n.children[a]);
    }
    const p = probsOf(prof, n);
    return n.children.reduce((v, c, a) => (p[a] ? v + p[a] * val(c) : v), 0);
  };
  [...sets.entries()].sort((x, y) => y[1].depth - x[1].depth).forEach(([info, s]) => {
    const k = s.nodes[0].n.actions.length;
    let bestA = 0, bestV = -Infinity;
    for (let a = 0; a < k; a++) {
      const v = s.nodes.reduce((t, { n, reach }) => t + reach * val(n.children[a]), 0);
      if (v > bestV + 1e-12) { bestV = v; bestA = a; }
    }
    choice.set(info, bestA);
  });
  return val(root);
}

// ------------------------------------------------------------------ river en tête-à-tête
export type RNode =
  | { t: "act"; id: number; player: 0 | 1; children: RNode[]; c: [number, number] }
  | { t: "fold"; folder: 0 | 1; c: [number, number] }
  | { t: "show"; c: [number, number] };
export interface RiverGame {
  root: RNode; board: string[]; startPot: number;
  hands: [[string, string][], [string, string][]];
  weights: [ArrayLike<number>, ArrayLike<number>];
  /** Stratégie d'un nœud : [action × nMains + main] pour le joueur qui parle. */
  strategy: (id: number) => ArrayLike<number>;
}

/** Gains de i (main h) contre o (main j) à un terminal : ce qu'il reçoit du pot moins ce qu'il a mis dans la river. */
export function payoff(g: RiverGame, n: RNode, i: 0 | 1, si: number, sj: number): number {
  const o = 1 - i;
  if (n.t === "fold") return n.folder === i ? -n.c[i] : g.startPot + n.c[o];
  if (n.t === "show") {
    if (si > sj) return g.startPot + n.c[o];
    if (si === sj) return (g.startPot + n.c[0] + n.c[1]) / 2 - n.c[i];
    return -n.c[i];
  }
  throw new Error("pas un terminal");
}

/**
 * Valeur de la stratégie (mode « ev ») ou de la meilleure réponse (mode « br ») du joueur i, moyennée sur la
 * distribution jointe des mains (poids × compatibilité des cartes).
 */
export function riverValue(g: RiverGame, i: 0 | 1, mode: "ev" | "br"): number {
  const o = (1 - i) as 0 | 1;
  const H = g.hands[i], J = g.hands[o];
  const si = H.map(h => best([...h, ...g.board])), sj = J.map(h => best([...h, ...g.board]));
  const compat = H.map(h => J.map(j => (j.some(c => h.includes(c)) ? 0 : 1)));
  // valeur (non normalisée) de chaque main de i : somme sur j de reach_o[j] × compat × gain
  const walk = (n: RNode, reachI: number[], reachO: number[]): number[] => {
    if (n.t !== "act") return H.map((_, h) => J.reduce((v, _j, j) => v + (compat[h][j] ? reachO[j] * payoff(g, n, i, si[h], sj[j]) : 0), 0));
    const s = g.strategy(n.id);
    if (n.player === i) {
      const vals = n.children.map((c, a) => walk(c, reachI.map((r, h) => r * s[a * H.length + h]), reachO));
      return H.map((_, h) => mode === "br"
        ? Math.max(...vals.map(v => v[h]))
        : vals.reduce((t, v, a) => t + s[a * H.length + h] * v[h], 0));
    }
    return n.children.reduce<number[]>((acc, c, a) => {
      const v = walk(c, reachI, reachO.map((r, j) => r * s[a * J.length + j]));
      return acc.map((x, h) => x + v[h]);
    }, H.map(() => 0));
  };
  const v = walk(g.root, H.map(() => 1), Array.from(g.weights[o]));
  let num = 0, den = 0;
  H.forEach((_, h) => {
    const w = g.weights[i][h];
    num += w * v[h];
    den += w * J.reduce((t, _j, j) => t + (compat[h][j] ? g.weights[o][j] : 0), 0);
  });
  return den ? num / den : 0;
}

/** Écart à l'équilibre (exploitabilité) en jetons : moyenne, sur les deux joueurs, du gain d'une meilleure réponse. */
export function riverExploitability(g: RiverGame): { br: [number, number]; ev: [number, number]; expl: number } {
  const ev: [number, number] = [riverValue(g, 0, "ev"), riverValue(g, 1, "ev")];
  const br: [number, number] = [riverValue(g, 0, "br"), riverValue(g, 1, "br")];
  return { br, ev, expl: (br[0] - ev[0] + br[1] - ev[1]) / 2 };
}
