// Point d'entrée du solveur de fin de main : résout le sous-jeu de la street en cours,
// puis lit la stratégie de la main du héros au nœud où il doit jouer.

import type { Combo } from "@/engines/rangeVsRange";
import { relStrength } from "@/engines/postflopRanges";
import { detectDraws } from "@/lib/pokerEngine";
import { Solver, type SolverOptions, type ChanceDelegate } from "@/engines/endgame/cfr";
import type { RakeRule } from "@/core/rake";
import type { ActKind, ActNode, EndStreet, PathAct, Action, Sizes } from "@/engines/endgame/tree";

export interface EndgameInput {
  street: EndStreet;
  board: string[];
  startPot: number;
  stack: number;
  ranges: [Combo[], Combo[]];   // 0 = parle en premier, 1 = en position
  hero: 0 | 1;
  heroCards: [string, string];
  path: PathAct[];              // actions déjà jouées sur la street
  rake?: RakeRule | null;       // rake cash retiré du pot gagné (absent en tournoi)
  sizes?: Sizes;                // tailles de la street en cours (banc d'essai) ; absent : celles du site
  maxIter?: number;
  timeBudgetMs?: number;
  targetPct?: number;           // précision visée, % du pot
  onProgress?: (fraction: number) => void;
}

export interface EndgameAction { kind: ActKind; to: number; label: string; freq: number; ev: number }
export interface EndgameRangeLine { label: string; freq: number; with: string[] }
export interface EndgameResult {
  street: EndStreet;
  actions: EndgameAction[];
  range: EndgameRangeLine[];
  exploitPct: number;
  iterations: number;
  ms: number;
  /** Mains calculées par joueur (2 en tête-à-tête, plus en multiway). */
  combos: number[];
  /** Joueurs dans le coup (absent : 2). */
  players?: number;
  /** Perte moyenne de ta range en suivant la stratégie à ta décision (% du pot) : grande quand la ligne jouée est rare (D32). */
  localPct?: number;
  /** Rendu par la mémoire des spots (déjà calculé) : `ms` est alors le temps de relecture. */
  fromMemory?: boolean;
  heroInRange: boolean;
}

const fmt = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");

export function actionLabel(a: Action, n: ActNode): string {
  const put = a.to - n.s[n.player];
  if (a.kind === "check") return "Check";
  if (a.kind === "fold") return "Fold";
  if (a.kind === "call") return `Call ${fmt(put)} bb`;
  if (a.kind === "allin") return `Tapis ${fmt(put)} bb`;
  if (a.kind === "raise") return `Relance à ${fmt(a.to)} bb`;
  return `Mise ${Math.round((put / n.pot) * 100)} % = ${fmt(put)} bb`;
}

const keyOf = (a: string, b: string) => (a < b ? a + b : b + a);

/** Catégorie d'une main pour le résumé de la range (aussi utilisée par le solveur multiway). */
export function category(cards: [string, string], board: string[], street: EndStreet): string {
  const rel = relStrength(cards, board);
  if (rel >= 2) return "mains fortes";
  if (rel === 1) return "paires";
  if (street === "Turn" && detectDraws(cards, board).outs >= 8) return "tirages";
  return "pas de main";
}

/** Préparation commune (un cœur ou réparti) : ranges (ta main ajoutée si absente), solveur, nœud où tu joues. */
function prepare(inp: EndgameInput) {
  const hero = inp.hero, vil = (1 - hero) as 0 | 1;
  const ranges: [Combo[], Combo[]] = [inp.ranges[0], inp.ranges[1]];
  const hk = keyOf(inp.heroCards[0], inp.heroCards[1]);
  const heroInRange = ranges[hero].some(c => keyOf(c.cards[0], c.cards[1]) === hk && c.w > 0);
  if (!heroInRange) {
    const maxW = ranges[hero].reduce((m, c) => Math.max(m, c.w), 0) || 1;
    ranges[hero] = [...ranges[hero], { cards: inp.heroCards, w: maxW * 0.001 }];
  }
  const opts: SolverOptions = { street: inp.street, board: inp.board, startPot: inp.startPot, stack: inp.stack, ranges, path: inp.path, rake: inp.rake, sizes: inp.sizes };
  const s = new Solver(opts);
  const target = s.pathNode;
  const hi = s.hs[hero].key.get(hk);
  if (!target || target.player !== hero || hi === undefined || !s.hs[vil].n) return null;
  const maxIter = inp.maxIter ?? (inp.street === "River" ? 1500 : 500);
  const budget = inp.timeBudgetMs ?? (inp.street === "River" ? 3000 : 15000);
  const goal = inp.targetPct ?? 0.3;
  // la précision coûte deux parcours : on la mesure moins souvent à la turn
  const chunk = inp.street === "River" ? 50 : 10, checkEvery = 50;
  return { s, opts, hero, vil, hi, heroInRange, target, maxIter, budget, goal, chunk, checkEvery };
}
type Prepared = NonNullable<ReturnType<typeof prepare>>;

/** Portée de chaque joueur jusqu'au nœud où tu joues (stratégies moyennes). */
function pathReach(p: Prepared): [Float32Array, Float32Array] {
  const { s, target } = p;
  const reach: [Float32Array, Float32Array] = [Float32Array.from(s.hs[0].weights), Float32Array.from(s.hs[1].weights)];
  let node = s.root as ActNode;
  while (node !== target && node.onPath !== undefined) {
    const a = node.onPath, st = s.averageStrategy(node), n = s.hs[node.player].n, r = reach[node.player];
    for (let h = 0; h < n; h++) r[h] *= st[a * n + h];
    node = node.children[a] as ActNode;
  }
  return reach;
}

/** Résultat affiché : actions de ta main (fréquence, EV) et jeu de toute ta range à ce nœud. */
function assemble(inp: EndgameInput, p: Prepared, reach: [Float32Array, Float32Array], childVals: Float32Array[], exploit: number, t0: number): EndgameResult {
  const { s, target, hero, vil, hi, heroInRange } = p;
  const n = s.hs[hero].n;
  const st = s.averageStrategy(target);
  const comp = s.compatibleWeights(hero, reach[vil])[hi];
  const actions: EndgameAction[] = target.actions.map((a, k) => {
    const v = childVals[k][hi];
    return { kind: a.kind, to: a.to, label: actionLabel(a, target), freq: st[k * n + hi], ev: comp > 0 ? v / comp + target.c[hero] : 0 };
  });

  // comment joue toute la range du héros ici
  const cats = s.hs[hero].cards.map(c => category(c, inp.board, inp.street));
  const hr = reach[hero];
  const totalReach = hr.reduce((t, x) => t + x, 0);
  const range: EndgameRangeLine[] = target.actions.map((a, k) => {
    const byCat = new Map<string, number>();
    let tot = 0;
    for (let h = 0; h < n; h++) {
      const x = hr[h] * st[k * n + h];
      tot += x;
      byCat.set(cats[h], (byCat.get(cats[h]) ?? 0) + x);
    }
    const withCats = [...byCat.entries()].filter(([, x]) => tot > 0 && x / tot >= 0.2).sort((p2, q) => q[1] - p2[1]).slice(0, 2).map(([c]) => c);
    return { label: actionLabel(a, target), freq: totalReach > 0 ? tot / totalReach : 0, with: withCats };
  });

  return {
    street: inp.street, actions, range,
    exploitPct: exploit,
    iterations: s.iterations, ms: Date.now() - t0,
    combos: [s.hs[0].n, s.hs[1].n], heroInRange,
  };
}

const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function solveEndgame(inp: EndgameInput): EndgameResult | null {
  const t0 = Date.now();
  const p = prepare(inp);
  if (!p) return null;
  const { s, maxIter, budget, goal, chunk, checkEvery } = p;
  const deadline = clock() + budget;
  while (s.iterations < maxIter) {
    const done = s.run(Math.min(chunk, maxIter - s.iterations), deadline);
    inp.onProgress?.(Math.min(0.99, Math.max(s.iterations / maxIter, (Date.now() - t0) / budget)));
    if (done === 0) break;
    if (s.iterations % checkEvery === 0 && s.exploitabilityPct() <= goal) break;
  }
  const exploit = s.exploitabilityPct();
  const reach = pathReach(p);
  const childVals = p.target.children.map(c => s.values(c, p.hero, reach[p.vil]));
  return assemble(inp, p, reach, childVals, exploit, t0);
}

/**
 * Même calcul, les cartes de river réparties sur des ouvriers (D41) : `start` reçoit les options du solveur (pour que
 * chaque ouvrier construise le même arbre) et rend la fonction qui leur demande les sous-arbres de river.
 * Mêmes opérations dans le même ordre que solveEndgame : même résultat au bit près, plus vite.
 */
export async function solveEndgameAsync(inp: EndgameInput, start: (o: SolverOptions) => Promise<ChanceDelegate>): Promise<EndgameResult | null> {
  const t0 = Date.now();
  const p = prepare(inp);
  if (!p) return null;
  const { s, maxIter, budget, goal, chunk, checkEvery } = p;
  const ask = await start(p.opts);
  const deadline = clock() + budget;
  while (s.iterations < maxIter) {
    const done = await s.runAsync(Math.min(chunk, maxIter - s.iterations), deadline, ask);
    inp.onProgress?.(Math.min(0.99, Math.max(s.iterations / maxIter, (Date.now() - t0) / budget)));
    if (done === 0) break;
    if (s.iterations % checkEvery === 0 && (await s.exploitabilityPctAsync(ask)) <= goal) break;
  }
  const exploit = await s.exploitabilityPctAsync(ask);
  const reach = pathReach(p);
  const childVals: Float32Array[] = [];
  for (const c of p.target.children) childVals.push(await s.valuesAsync(c, p.hero, reach[p.vil], ask));
  return assemble(inp, p, reach, childVals, exploit, t0);
}
