// Moteur CFR du solveur de fin de main (Discounted CFR, vectorisé par main).
// Gains d'un joueur = jetons reçus du pot − jetons qu'il a mis dans le sous-jeu ;
// la somme des deux vaut toujours le pot de départ (jeu à somme constante).

import { rakeOf, type RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";
import { FULL_DECK, type Combo } from "@/engines/rangeVsRange";
import { buildTree, type ActNode, type ChanceNode, type EndStreet, type Node, type PathAct, type Sizes } from "@/engines/endgame/tree";

const CARD = new Map(FULL_DECK.map((c, i) => [c, i]));
const keyOf = (a: string, b: string) => (a < b ? a + b : b + a);

export interface Strength { val: Float64Array; order: Int32Array }
export interface HandSet {
  n: number;
  cards: [string, string][];
  c1: Int32Array; c2: Int32Array;
  weights: Float32Array;
  key: Map<string, number>;
  str?: Strength;
}

function strengthOf(h: HandSet, board: string[], blocked?: Uint8Array): Strength {
  const val = new Float64Array(h.n);
  for (let i = 0; i < h.n; i++) val[i] = blocked && blocked[i] ? -1 : rank7([...h.cards[i], ...board]);
  const order = Int32Array.from({ length: h.n }, (_, i) => i).sort((x, y) => val[x] - val[y]);
  return { val, order };
}

/** Combos jouables (sans carte du board), poids > 0 ; force calculée si le board a 5 cartes. */
export function makeHandSet(combos: Combo[], board: string[]): HandSet {
  const dead = new Set(board);
  const seen = new Map<string, number>();
  const cards: [string, string][] = [];
  const w: number[] = [];
  for (const c of combos) {
    if (!(c.w > 0) || dead.has(c.cards[0]) || dead.has(c.cards[1])) continue;
    const k = keyOf(c.cards[0], c.cards[1]);
    if (seen.has(k)) { w[seen.get(k)!] = Math.max(w[seen.get(k)!], c.w); continue; }
    seen.set(k, cards.length);
    cards.push([c.cards[0], c.cards[1]]);
    w.push(c.w);
  }
  const h: HandSet = {
    n: cards.length, cards,
    c1: Int32Array.from(cards, c => CARD.get(c[0])!), c2: Int32Array.from(cards, c => CARD.get(c[1])!),
    weights: Float32Array.from(w), key: seen,
  };
  if (board.length === 5) h.str = strengthOf(h, board);
  return h;
}

/** Pour chaque main de a, l'indice de la même main chez b (ou -1). */
export function crossIndex(a: HandSet, b: HandSet): Int32Array {
  return Int32Array.from(a.cards, c => b.key.get(keyOf(c[0], c[1])) ?? -1);
}

/** Somme des poids adverses compatibles avec chaque main (cartes bloquées retirées). */
function compatible(a: HandSet, b: HandSet, reach: Float32Array, same: Int32Array): Float64Array {
  const pc = new Float64Array(52);
  let tot = 0;
  for (let j = 0; j < b.n; j++) { const r = reach[j]; if (r) { tot += r; pc[b.c1[j]] += r; pc[b.c2[j]] += r; } }
  const out = new Float64Array(a.n);
  for (let i = 0; i < a.n; i++) out[i] = tot - pc[a.c1[i]] - pc[a.c2[i]] + (same[i] >= 0 ? reach[same[i]] : 0);
  return out;
}

export function foldCFV(a: HandSet, b: HandSet, reach: Float32Array, u: number, same = crossIndex(a, b)): Float32Array {
  const comp = compatible(a, b, reach, same);
  const out = new Float32Array(a.n);
  for (let i = 0; i < a.n; i++) out[i] = u * comp[i];
  return out;
}

export function showdownCFV(a: HandSet, b: HandSet, reach: Float32Array, uWin: number, uTie: number, uLose: number,
  same = crossIndex(a, b), sa = a.str!, sb = b.str!): Float32Array {
  const comp = compatible(a, b, reach, same);
  const win = new Float64Array(a.n), lose = new Float64Array(a.n);
  let pc = new Float64Array(52), tot = 0, j = 0;
  for (let ii = 0; ii < a.n; ii++) {
    const i = sa.order[ii], v = sa.val[i];
    while (j < b.n && sb.val[sb.order[j]] < v) {
      const o = sb.order[j++], r = reach[o];
      if (r) { tot += r; pc[b.c1[o]] += r; pc[b.c2[o]] += r; }
    }
    win[i] = tot - pc[a.c1[i]] - pc[a.c2[i]];
  }
  pc = new Float64Array(52); tot = 0; j = b.n - 1;
  for (let ii = a.n - 1; ii >= 0; ii--) {
    const i = sa.order[ii], v = sa.val[i];
    while (j >= 0 && sb.val[sb.order[j]] > v) {
      const o = sb.order[j--], r = reach[o];
      if (r) { tot += r; pc[b.c1[o]] += r; pc[b.c2[o]] += r; }
    }
    lose[i] = tot - pc[a.c1[i]] - pc[a.c2[i]];
  }
  const out = new Float32Array(a.n);
  for (let i = 0; i < a.n; i++) {
    if (sa.val[i] < 0) continue;
    const tie = comp[i] - win[i] - lose[i];
    out[i] = win[i] * uWin + tie * uTie + lose[i] * uLose;
  }
  return out;
}

/** Demande des valeurs des sous-arbres de river d'un nœud de hasard (calcul réparti, D41). */
export interface ChanceAsk { chance: number; i: 0 | 1; reach: Float32Array; mode: 0 | 1 | 2; d: [number, number, number] }
/** Toutes les demandes d'un parcours d'un coup (un aller-retour avec les ouvriers), réponses dans le même ordre. */
export type ChanceDelegate = (qs: ChanceAsk[]) => Promise<Float32Array[][]>;

export interface SolverOptions {
  street: EndStreet;
  board: string[];
  startPot: number;
  stack: number;
  ranges: [Combo[], Combo[]];
  path?: PathAct[];
  sizes?: Sizes;
  /** Rake retiré du pot gagné (cash). Absent : aucun (tournoi). */
  rake?: RakeRule | null;
}

/** Solveur d'un sous-jeu turn ou river en tête-à-tête. */
export class Solver {
  readonly root: Node;
  readonly pathNode: ActNode | null;
  readonly nodes: ActNode[];
  readonly hs: [HandSet, HandSet];
  readonly startPot: number;
  readonly rake: RakeRule | null;
  iterations = 0;
  private same: [Int32Array, Int32Array];
  private regret: Float32Array[];
  private sum: Float32Array[];
  private riverStr: [Strength, Strength][] = [];    // turn : force par carte de river
  private blocked: [Uint8Array, Uint8Array][] = [];  // turn : main contenant la carte de river
  private nChance = 44;
  /** Nœuds de hasard (turn), dans l'ordre de l'arbre : le même indice chez le chef et chez les ouvriers. */
  readonly chances: ChanceNode[] = [];
  private chanceIndex = new Map<Node, number>();

  constructor(o: SolverOptions) {
    const t = buildTree({ street: o.street, startPot: o.startPot, stack: o.stack, board: o.board, path: o.path, sizes: o.sizes });
    this.root = t.root; this.pathNode = t.pathNode; this.nodes = t.nodes;
    this.startPot = o.startPot;
    this.rake = o.rake ?? null;
    this.hs = [makeHandSet(o.ranges[0], o.board), makeHandSet(o.ranges[1], o.board)];
    this.same = [crossIndex(this.hs[0], this.hs[1]), crossIndex(this.hs[1], this.hs[0])];
    this.regret = this.nodes.map(n => new Float32Array(n.actions.length * this.hs[n.player].n));
    this.sum = this.nodes.map(n => new Float32Array(n.actions.length * this.hs[n.player].n));
    const collect = (n: Node) => {
      if (n.t === "chance") { this.chanceIndex.set(n, this.chances.length); this.chances.push(n); n.children.forEach(collect); }
      else if (n.t === "act") n.children.forEach(collect);
    };
    collect(this.root);
    if (o.street === "Turn") {
      const cards = FULL_DECK.filter(c => !o.board.includes(c));
      this.nChance = cards.length - 4;
      for (const card of cards) {
        const ci = CARD.get(card)!;
        const bl = this.hs.map(h => Uint8Array.from({ length: h.n }, (_, i) => (h.c1[i] === ci || h.c2[i] === ci ? 1 : 0))) as [Uint8Array, Uint8Array];
        this.blocked.push(bl);
        this.riverStr.push([strengthOf(this.hs[0], [...o.board, card], bl[0]), strengthOf(this.hs[1], [...o.board, card], bl[1])]);
      }
    }
  }

  private strategy(n: ActNode): Float32Array {
    const nA = n.actions.length, np = this.hs[n.player].n, r = this.regret[n.id];
    const s = new Float32Array(nA * np);
    for (let h = 0; h < np; h++) {
      let tot = 0;
      for (let a = 0; a < nA; a++) { const x = r[a * np + h]; if (x > 0) tot += x; }
      for (let a = 0; a < nA; a++) { const x = r[a * np + h]; s[a * np + h] = tot > 0 ? (x > 0 ? x / tot : 0) : 1 / nA; }
    }
    return s;
  }

  /** Stratégie moyenne d'un nœud : tableau [action * nMains + main]. */
  averageStrategy(n: ActNode): Float32Array {
    const nA = n.actions.length, np = this.hs[n.player].n, r = this.sum[n.id];
    const s = new Float32Array(nA * np);
    for (let h = 0; h < np; h++) {
      let tot = 0;
      for (let a = 0; a < nA; a++) tot += r[a * np + h];
      for (let a = 0; a < nA; a++) s[a * np + h] = tot > 0 ? r[a * np + h] / tot : 1 / nA;
    }
    return s;
  }

  private terminal(n: Node, i: 0 | 1, reach: Float32Array, ctx: number): Float32Array | null {
    const o = (1 - i) as 0 | 1;
    if (n.t === "fold") {
      // la mise non payée est rendue : le rake porte sur le pot égalisé
      const r = rakeOf(this.startPot + 2 * Math.min(n.c[0], n.c[1]), this.rake);
      const u = n.folder === i ? -n.c[i] : this.startPot + n.c[o] - r;
      return foldCFV(this.hs[i], this.hs[o], reach, u, this.same[i]);
    }
    if (n.t === "show") {
      const sa = ctx >= 0 ? this.riverStr[ctx][i] : this.hs[i].str!;
      const sb = ctx >= 0 ? this.riverStr[ctx][o] : this.hs[o].str!;
      const r = rakeOf(this.startPot + n.c[0] + n.c[1], this.rake);
      return showdownCFV(this.hs[i], this.hs[o], reach, this.startPot + n.c[o] - r, (this.startPot + n.c[0] + n.c[1] - r) / 2 - n.c[i], -n.c[i], this.same[i], sa, sb);
    }
    return null;
  }

  /**
   * Parcours de l'arbre, écrit une seule fois pour le calcul sur un cœur et pour le calcul réparti (D41) : à un nœud de
   * hasard (carte de river), il demande les valeurs des sous-arbres de chaque carte (`ChanceAsk`) ; le pilote les calcule
   * lui-même (`walk`) ou les fait calculer par les ouvriers (`walkAsync`). L'addition se fait ici, dans l'ordre des
   * cartes : le résultat est le même au bit près dans les deux cas.
   * mode : 0 = CFR (mise à jour), 1 = meilleure réponse, 2 = valeur des stratégies moyennes.
   */
  private *gen(n: Node, i: 0 | 1, reach: Float32Array, ctx: number, mode: 0 | 1 | 2, d: [number, number, number]): Generator<ChanceAsk, Float32Array, Float32Array[]> {
    const t = this.terminal(n, i, reach, ctx);
    if (t) return t;
    const ni = this.hs[i].n, o = (1 - i) as 0 | 1;
    if (n.t === "chance") {
      const vs = yield { chance: this.chanceIndex.get(n)!, i, reach, mode, d };
      const out = new Float32Array(ni);
      n.children.forEach((_ch, k) => {
        const bi = this.blocked[k][i], v = vs[k];
        for (let h = 0; h < ni; h++) if (!bi[h]) out[h] += v[h];
      });
      const inv = 1 / this.nChance;
      for (let h = 0; h < ni; h++) out[h] *= inv;
      return out;
    }
    const node = n as ActNode, nA = node.actions.length;
    if (node.player === i) {
      const sig = mode === 0 ? this.strategy(node) : this.averageStrategy(node);
      const vals: Float32Array[] = [];
      for (const ch of node.children) vals.push(yield* this.gen(ch, i, reach, ctx, mode, d));
      const out = new Float32Array(ni);
      if (mode === 1) {
        for (let h = 0; h < ni; h++) { let m = -Infinity; for (let a = 0; a < nA; a++) m = Math.max(m, vals[a][h]); out[h] = m; }
        return out;
      }
      for (let a = 0; a < nA; a++) for (let h = 0; h < ni; h++) out[h] += sig[a * ni + h] * vals[a][h];
      if (mode === 0) {
        const r = this.regret[node.id];
        for (let a = 0; a < nA; a++) for (let h = 0; h < ni; h++) {
          const k = a * ni + h, x = r[k];
          r[k] = (x > 0 ? x * d[0] : x * d[1]) + vals[a][h] - out[h];
        }
      }
      return out;
    }
    const no = this.hs[o].n;
    const sig = mode === 0 ? this.strategy(node) : this.averageStrategy(node);
    const out = new Float32Array(ni);
    const sum = this.sum[node.id];
    for (let a = 0; a < nA; a++) {
      const r2 = new Float32Array(no);
      let any = false;
      for (let j = 0; j < no; j++) { const x = reach[j] * sig[a * no + j]; r2[j] = x; if (x > 0) any = true; }
      if (mode === 0) for (let j = 0; j < no; j++) sum[a * no + j] = sum[a * no + j] * d[2] + r2[j];
      if (!any) continue;
      const v = yield* this.gen(node.children[a], i, r2, ctx, mode, d);
      for (let h = 0; h < ni; h++) out[h] += v[h];
    }
    return out;
  }

  /** Pilote sur un cœur : les cartes de river sont calculées ici, l'une après l'autre. */
  private walk(n: Node, i: 0 | 1, reach: Float32Array, ctx: number, mode: 0 | 1 | 2, d: [number, number, number]): Float32Array {
    const g = this.gen(n, i, reach, ctx, mode, d);
    let r = g.next();
    while (!r.done) r = g.next(this.chanceChildren(r.value as ChanceAsk));
    return r.value;
  }

  /**
   * Demandes de river qu'un parcours fera, dans l'ordre, sans rien calculer ni modifier : ce qui arrive à un nœud de
   * hasard ne dépend que des stratégies au-dessus (celles de l'adversaire, inchangées pendant le parcours), pas des
   * valeurs en dessous. Elles partent donc toutes ensemble aux ouvriers.
   */
  private collect(n: Node, i: 0 | 1, reach: Float32Array, mode: 0 | 1 | 2, d: [number, number, number], out: ChanceAsk[]) {
    if (n.t === "fold" || n.t === "show") return;
    if (n.t === "chance") { out.push({ chance: this.chanceIndex.get(n)!, i, reach, mode, d }); return; }
    const node = n as ActNode;
    if (node.player === i) { for (const ch of node.children) this.collect(ch, i, reach, mode, d, out); return; }
    const o = (1 - i) as 0 | 1, no = this.hs[o].n, nA = node.actions.length;
    const sig = mode === 0 ? this.strategy(node) : this.averageStrategy(node);
    for (let a = 0; a < nA; a++) {
      const r2 = new Float32Array(no);
      let any = false;
      for (let j = 0; j < no; j++) { const x = reach[j] * sig[a * no + j]; r2[j] = x; if (x > 0) any = true; }
      if (any) this.collect(node.children[a], i, r2, mode, d, out);
    }
  }

  /** Pilote réparti : toutes les cartes de river du parcours sont calculées d'un coup par `ask` (les ouvriers). */
  private async walkAsync(n: Node, i: 0 | 1, reach: Float32Array, ctx: number, mode: 0 | 1 | 2, d: [number, number, number], ask: ChanceDelegate): Promise<Float32Array> {
    const qs: ChanceAsk[] = [];
    this.collect(n, i, reach, mode, d, qs);
    const answers = qs.length ? await ask(qs) : [];
    const g = this.gen(n, i, reach, ctx, mode, d);
    let r = g.next(), k = 0;
    while (!r.done) {
      const q = r.value as ChanceAsk;
      if (k >= qs.length || qs[k].chance !== q.chance) throw new Error("calcul réparti : demandes de river dans un ordre inattendu");
      r = g.next(answers[k++]);
    }
    return r.value;
  }

  /** Valeurs des sous-arbres de river d'un nœud de hasard, pour les cartes `ks` (toutes par défaut). */
  chanceChildren(q: ChanceAsk, ks?: number[]): Float32Array[] {
    const node = this.chances[q.chance], o = (1 - q.i) as 0 | 1;
    const out: Float32Array[] = [];
    for (const k of ks ?? node.children.map((_, k) => k)) {
      const bo = this.blocked[k][o];
      const r2 = Float32Array.from(q.reach, (x, j) => (bo[j] ? 0 : x));
      out[k] = this.walk(node.children[k], q.i, r2, k, q.mode, q.d);
    }
    return out;
  }

  /** Itérations avec les ouvriers ; mêmes opérations, même ordre que `run`. */
  async runAsync(iters: number, deadline: number, ask: ChanceDelegate): Promise<number> {
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    let done = 0;
    for (; done < iters && now() < deadline; done++) {
      const t = ++this.iterations;
      const p = Math.pow(t - 1, 1.5);
      const d: [number, number, number] = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
      for (const i of [0, 1] as const) await this.walkAsync(this.root, i, Float32Array.from(this.hs[1 - i].weights), -1, 0, d, ask);
    }
    return done;
  }

  private async valueAsync(i: 0 | 1, mode: 1 | 2, ask: ChanceDelegate): Promise<number> {
    const o = (1 - i) as 0 | 1;
    const reach = Float32Array.from(this.hs[o].weights);
    const v = await this.walkAsync(this.root, i, reach, -1, mode, [1, 1, 1], ask);
    const comp = compatible(this.hs[i], this.hs[o], reach, this.same[i]);
    let num = 0, den = 0;
    for (let h = 0; h < this.hs[i].n; h++) { const w = this.hs[i].weights[h]; num += w * v[h]; den += w * comp[h]; }
    return den > 0 ? num / den : 0;
  }

  async exploitabilityPctAsync(ask: ChanceDelegate): Promise<number> {
    const e = ((await this.valueAsync(0, 1, ask)) - (await this.valueAsync(0, 2, ask)) + (await this.valueAsync(1, 1, ask)) - (await this.valueAsync(1, 2, ask))) / 2;
    return Math.max(0, (e / this.startPot) * 100);
  }

  valuesAsync(n: Node, i: 0 | 1, reach: Float32Array, ask: ChanceDelegate, ctx = -1): Promise<Float32Array> {
    return this.walkAsync(n, i, reach, ctx, 2, [1, 1, 1], ask);
  }

  /** Lance des itérations ; s'arrête aussi à l'heure limite (ms, horloge performance/Date). */
  run(iters: number, deadline = Infinity): number {
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    let done = 0;
    for (; done < iters && now() < deadline; done++) {
      const t = ++this.iterations;
      const p = Math.pow(t - 1, 1.5);
      const d: [number, number, number] = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
      for (const i of [0, 1] as const) this.walk(this.root, i, Float32Array.from(this.hs[1 - i].weights), -1, 0, d);
    }
    return done;
  }

  private value(i: 0 | 1, mode: 1 | 2): number {
    const o = (1 - i) as 0 | 1;
    const reach = Float32Array.from(this.hs[o].weights);
    const v = this.walk(this.root, i, reach, -1, mode, [1, 1, 1]);
    const comp = compatible(this.hs[i], this.hs[o], reach, this.same[i]);
    let num = 0, den = 0;
    for (let h = 0; h < this.hs[i].n; h++) { const w = this.hs[i].weights[h]; num += w * v[h]; den += w * comp[h]; }
    return den > 0 ? num / den : 0;
  }

  /**
   * Écart à l'équilibre, en % du pot de départ (0 = parfait) : gain moyen d'une meilleure réponse sur la stratégie
   * de chaque joueur. Avec le rake, la somme des gains n'est plus constante : on la mesure joueur par joueur.
   */
  exploitabilityPct(): number {
    const e = (this.value(0, 1) - this.value(0, 2) + this.value(1, 1) - this.value(1, 2)) / 2;
    return Math.max(0, (e / this.startPot) * 100);
  }

  /** Valeurs (non normalisées) de chaque main de i dans le sous-arbre n, stratégies moyennes. */
  values(n: Node, i: 0 | 1, reach: Float32Array, ctx = -1): Float32Array {
    return this.walk(n, i, reach, ctx, 2, [1, 1, 1]);
  }

  compatibleWeights(i: 0 | 1, reach: Float32Array): Float64Array {
    return compatible(this.hs[i], this.hs[1 - i], reach, this.same[i]);
  }
}
