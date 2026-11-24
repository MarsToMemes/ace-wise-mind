// Solveur river à n joueurs par tirage des mains adverses (piste C, docs/DECISIONS.md D24), comme les solveurs de
// Pluribus. À chaque parcours pour le joueur i, on tire K jeux de mains pour ses adversaires (selon leurs poids, sans
// aucune carte partagée), puis on parcourt l'arbre : le joueur i garde le vecteur de toutes ses mains, chaque jeu tiré
// garde sa probabilité d'arriver là (produit des stratégies des adversaires pour les mains tirées). Aux fins de main,
// valeur de chaque main x de i contre les jeux tirés compatibles avec x. Exact en moyenne (aucune approximation des
// cartes), mais bruité : il faut plus d'itérations.
import { buildBetTree, type BetTree, type TAct, type TEnd, type TNode } from "@/engines/multiway/betTree";
import { HandTable } from "@/engines/multiway/nTerminal";
import type { VSpec, VProfile } from "@/engines/multiway/vriver3";

export interface Tuples {
  /** Pour chaque jeu tiré, la main de chaque joueur (−1 pour le joueur qui apprend). */
  hands: number[][];
  /** Cartes prises par chaque jeu : used[k*52 + carte]. */
  used: Uint8Array;
  ranks: Int32Array[];
}

/** Tire K jeux de mains adverses selon les poids `reach`, sans carte partagée (tirage rejeté sinon). */
export function sampleTuples(h: HandTable, i: number, reach: Float64Array[], K: number, rand: () => number): Tuples {
  const n = h.n, cum = reach.map(r => { const c = new Float64Array(r.length); let s = 0; r.forEach((w, k) => { s += w; c[k] = s; }); return c; });
  const draw = (p: number) => {
    const c = cum[p], x = rand() * c[c.length - 1];
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < x) lo = m + 1; else hi = m; }
    return lo;
  };
  const hands: number[][] = [], used = new Uint8Array(K * 52), ranks = Array.from({ length: n }, () => new Int32Array(K));
  for (let k = 0, guard = 0; k < K && guard < K * 10000; guard++) {
    const t: number[] = new Array(n).fill(-1), base = k * 52;
    let ok = true;
    for (let p = 0; p < n && ok; p++) {
      if (p === i) continue;
      const y = draw(p), a = h.c1[p][y], b = h.c2[p][y];
      if (used[base + a] || used[base + b]) ok = false;
      else { used[base + a] = 1; used[base + b] = 1; t[p] = y; }
    }
    if (!ok) { used.fill(0, base, base + 52); continue; }
    t.forEach((y, p) => { if (y >= 0) ranks[p][k] = h.ranks[p][y]; });
    hands.push(t); k++;
  }
  return { hands, used, ranks };
}

/**
 * Valeur de chaque main x de i à une fin de main, contre les jeux tirés, chaque jeu k pesant R[k] (1 par défaut).
 * Moyenne sur les jeux : estimation sans biais de la valeur exacte, à une constante près (la masse totale).
 */
export function sampledCfv(h: HandTable, e: TEnd, i: number, tu: Tuples, R?: Float64Array): Float64Array {
  const K = tu.hands.length, pots = e.pots.filter(pt => pt.elig.includes(i)), P = pots.length;
  const best = new Int32Array(K * P), cnt = new Int32Array(K * P);
  for (let k = 0; k < K; k++) for (let j = 0; j < P; j++) {
    let b = -1, c = 0;
    for (const p of pots[j].elig) {
      if (p === i) continue;
      const r = tu.ranks[p][k];
      if (r > b) { b = r; c = 1; } else if (r === b) c++;
    }
    best[k * P + j] = b; cnt[k * P + j] = c;
  }
  const base = e.refund[i] - e.invested[i], N = h.hands[i].length, out = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    const x1 = h.c1[i][x], x2 = h.c2[i][x], rx = h.ranks[i][x];
    let v = 0;
    for (let k = 0; k < K; k++) {
      const w = R ? R[k] : 1;
      if (w === 0 || tu.used[k * 52 + x1] || tu.used[k * 52 + x2]) continue;
      let pay = base;
      for (let j = 0; j < P; j++) {
        const b = best[k * P + j];
        if (rx > b) pay += pots[j].net;
        else if (rx === b) pay += pots[j].net / (cnt[k * P + j] + 1);
      }
      v += w * pay;
    }
    out[x] = v / K;
  }
  return out;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class VRiverMC {
  readonly tree: BetTree;
  readonly h: HandTable;
  readonly n: number;
  private weights: Float64Array[];
  private regret = new Map<number, Float64Array>();
  private sum = new Map<number, Float64Array>();
  private disc: [number, number, number] = [1, 1, 1];
  private rand: () => number;
  readonly samples: number;
  readonly algo: "lcfr" | "dcfr";
  iterations = 0;

  /** fixed : mêmes tirages à chaque itération (sert au diagnostic : sépare le bruit de l'erreur d'échantillon). */
  private fixed?: Tuples[];
  constructor(readonly spec: VSpec, opts: { samples?: number; seed?: number; algo?: "lcfr" | "dcfr"; fixed?: boolean } = {}) {
    this.n = spec.ranges.length;
    const board = new Set(spec.board);
    const kept = spec.ranges.map(r => r.filter(c => c.w > 0 && !board.has(c.cards[0]) && !board.has(c.cards[1])));
    this.h = new HandTable(spec.board, kept.map(r => r.map(c => c.cards)));
    this.weights = kept.map(r => Float64Array.from(r, c => c.w));
    this.tree = buildBetTree({ n: this.n, potBB: spec.potBB, stacks: spec.stacks, bets: spec.bets, raise: spec.raise, allin: spec.allin, maxAggr: spec.maxAggr, rake: spec.rake });
    this.samples = opts.samples ?? 64;
    this.algo = opts.algo ?? "lcfr";
    this.rand = mulberry(opts.seed ?? 1);
    if (opts.fixed) this.fixed = Array.from({ length: this.n }, (_, i) => sampleTuples(this.h, i, this.weights, this.samples, this.rand));
  }

  get hands() { return this.h.hands; }

  private current(n: TAct): Float64Array {
    const N = this.h.hands[n.player].length, A = n.actions.length, t = this.regret.get(n.id), out = new Float64Array(A * N);
    if (!t) { out.fill(1 / A); return out; }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let a = 0; a < A; a++) { const r = t[a * N + x]; if (r > 0) s += r; }
      if (s > 0) for (let a = 0; a < A; a++) { const r = t[a * N + x]; out[a * N + x] = r > 0 ? r / s : 0; }
      else for (let a = 0; a < A; a++) out[a * N + x] = 1 / A;
    }
    return out;
  }

  private walk(node: TNode, i: number, ri: Float64Array, R: Float64Array, tu: Tuples): Float64Array {
    const Ni = this.h.hands[i].length;
    if (!R.some(w => w !== 0)) return new Float64Array(Ni);
    if (node.t === "end") return sampledCfv(this.h, node, i, tu, R);
    const p = node.player, N = this.h.hands[p].length, A = node.actions.length, sigma = this.current(node);
    if (p !== i) {
      const tot = new Float64Array(Ni), K = R.length;
      for (let a = 0; a < A; a++) {
        const r2 = new Float64Array(K);
        for (let k = 0; k < K; k++) { const y = tu.hands[k][p]; r2[k] = R[k] * sigma[a * N + y]; }
        const v = this.walk(node.children[a], i, ri, r2, tu);
        for (let x = 0; x < Ni; x++) tot[x] += v[x];
      }
      return tot;
    }
    const vals: Float64Array[] = [];
    for (let a = 0; a < A; a++) {
      const w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = ri[x] * sigma[a * N + x];
      vals.push(this.walk(node.children[a], i, w, R, tu));
    }
    const v = new Float64Array(N);
    for (let a = 0; a < A; a++) for (let x = 0; x < N; x++) v[x] += sigma[a * N + x] * vals[a][x];
    let reg = this.regret.get(node.id), sum = this.sum.get(node.id);
    if (!reg) { reg = new Float64Array(A * N); this.regret.set(node.id, reg); }
    if (!sum) { sum = new Float64Array(A * N); this.sum.set(node.id, sum); }
    const [d0, d1, d2] = this.disc;
    for (let a = 0; a < A; a++) for (let x = 0; x < N; x++) {
      const k = a * N + x, old = reg[k];
      reg[k] = (old > 0 ? old * d0 : old * d1) + vals[a][x] - v[x];
      sum[k] = sum[k] * d2 + ri[x] * sigma[k];
    }
    return v;
  }

  run(iterations: number) {
    for (let it = 0; it < iterations; it++) {
      const t = ++this.iterations;
      if (this.algo === "lcfr") { const d = (t - 1) / t; this.disc = [d, d, d]; }
      else { const p = Math.pow(t - 1, 1.5); this.disc = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)]; }
      for (let i = 0; i < this.n; i++) {
        const tu = this.fixed ? this.fixed[i] : sampleTuples(this.h, i, this.weights, this.samples, this.rand);
        this.walk(this.tree.root, i, this.weights[i], new Float64Array(tu.hands.length).fill(1), tu);
      }
    }
  }

  /** Stratégie moyenne, mêmes numéros de nœuds que l'arbre de betTree (et que vriver3 à 3 joueurs). */
  averageProfile(): VProfile {
    const out: VProfile = new Map();
    for (const n of this.tree.acts) {
      const N = this.h.hands[n.player].length, A = n.actions.length, t = this.sum.get(n.id), o = new Float64Array(A * N);
      for (let x = 0; x < N; x++) {
        let s = 0;
        if (t) for (let a = 0; a < A; a++) s += t[a * N + x];
        for (let a = 0; a < A; a++) o[a * N + x] = t && s > 0 ? t[a * N + x] / s : 1 / A;
      }
      out.set(n.id, o);
    }
    return out;
  }
}
