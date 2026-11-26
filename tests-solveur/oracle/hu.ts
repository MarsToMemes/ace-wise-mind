// B2 — Jeu tête-à-tête turn ou river, écrit à part (aucun import du site) : gains (avec rake éventuel), retraits de
// cartes, abattage avec l'évaluateur de l'arbitre, meilleure réponse exacte et solveur de référence (CFR+), sur un
// arbre de mises fourni (celui du solveur mesuré : on compare « aux frontières de cet arbre »).
import { best } from "./evaluateur";

export type HNode =
  | { t: "act"; id: number; player: 0 | 1; children: HNode[]; c: [number, number] }
  | { t: "fold"; folder: 0 | 1; c: [number, number] }
  | { t: "show"; c: [number, number] }
  | { t: "chance"; cards: string[]; children: HNode[] };
export interface Rake { pct: number; cap: number | null }
export interface HUSpec {
  root: HNode; board: string[]; startPot: number; rake: Rake | null;
  hands: [[string, string][], [string, string][]];
  weights: [ArrayLike<number>, ArrayLike<number>];
}
/** Stratégie d'un nœud : [action × nMains + main] du joueur qui parle. */
export type Strat = (id: number) => ArrayLike<number>;

const DECK = [..."23456789TJQKA"].flatMap(r => [..."shdc"].map(s => r + s));
const CI = new Map(DECK.map((c, i) => [c, i]));
const rakeOf = (pot: number, r: Rake | null) => (r ? Math.min((r.pct / 100) * pot, r.cap ?? Infinity) : 0);

interface Side { n: number; c1: Int32Array; c2: Int32Array; w: Float64Array; same: Int32Array }

export class HU {
  readonly side: [Side, Side];
  /** Forces : [ctx][joueur] ; ctx = -1 (river) → indice 0 ; turn : un ctx par carte de river (−1 si la main la contient). */
  private str = new Map<number, [Float64Array, Float64Array]>();
  readonly nChance: number;
  constructor(readonly g: HUSpec) {
    const mk = (p: 0 | 1): Side => {
      const h = g.hands[p];
      return { n: h.length, c1: Int32Array.from(h, x => CI.get(x[0])!), c2: Int32Array.from(h, x => CI.get(x[1])!), w: Float64Array.from(g.weights[p]), same: new Int32Array(h.length) };
    };
    this.side = [mk(0), mk(1)];
    const key = (x: [string, string]) => [x[0], x[1]].sort().join("");
    for (const p of [0, 1] as const) {
      const other = new Map(g.hands[1 - p].map((x, j) => [key(x), j]));
      g.hands[p].forEach((x, h) => { this.side[p].same[h] = other.get(key(x)) ?? -1; });
    }
    this.nChance = 52 - g.board.length - 4;
  }

  private strengths(ctx: number, card: string | null): [Float64Array, Float64Array] {
    let s = this.str.get(ctx);
    if (!s) {
      const board = card ? [...this.g.board, card] : this.g.board;
      s = [0, 1].map(p => Float64Array.from(this.g.hands[p], x => (card && x.includes(card) ? -1 : best([...x, ...board])))) as [Float64Array, Float64Array];
      this.str.set(ctx, s);
    }
    return s;
  }

  /** Masse adverse compatible avec chaque main de i (poids `reach` des mains de o). */
  compatMass(i: 0 | 1, reach: Float64Array): Float64Array { return this.compat(i, reach); }
  private compat(i: 0 | 1, reach: Float64Array): Float64Array {
    const a = this.side[i], b = this.side[1 - i];
    const card = new Float64Array(52); let tot = 0;
    for (let j = 0; j < b.n; j++) { const r = reach[j]; tot += r; card[b.c1[j]] += r; card[b.c2[j]] += r; }
    const out = new Float64Array(a.n);
    for (let h = 0; h < a.n; h++) out[h] = tot - card[a.c1[h]] - card[a.c2[h]] + (a.same[h] >= 0 ? reach[a.same[h]] : 0);
    return out;
  }

  /** Mains triées par force (celles du joueur i, puis celles de l'adversaire non bloquées), mises en cache. */
  private orders = new Map<string, [number[], number[]]>();
  private order(ctx: number, card: string | null, i: 0 | 1): [number[], number[]] {
    const k = `${ctx}|${i}`;
    let r = this.orders.get(k);
    if (!r) {
      const [s0, s1] = this.strengths(ctx, card);
      const si = i === 0 ? s0 : s1, so = i === 0 ? s1 : s0;
      r = [
        Array.from({ length: this.side[i].n }, (_, h) => h).sort((x, y) => si[x] - si[y]),
        Array.from({ length: this.side[1 - i].n }, (_, j) => j).filter(j => so[j] >= 0).sort((x, y) => so[x] - so[y]),
      ];
      this.orders.set(k, r);
    }
    return r;
  }

  /** Valeurs (non normalisées) des mains de i à un terminal. */
  private terminal(n: HNode, i: 0 | 1, reach: Float64Array, ctx: number, card: string | null): Float64Array {
    const o = (1 - i) as 0 | 1, P = this.g.startPot;
    if (n.t === "fold") {
      const u = n.folder === i ? -n.c[i] : P + n.c[o] - rakeOf(P + 2 * Math.min(n.c[0], n.c[1]), this.g.rake);
      const m = this.compat(i, reach);
      return m.map(x => x * u);
    }
    if (n.t !== "show") throw new Error("pas un terminal");
    const rk = rakeOf(P + n.c[0] + n.c[1], this.g.rake);
    const uW = P + n.c[o] - rk, uT = (P + n.c[0] + n.c[1] - rk) / 2 - n.c[i], uL = -n.c[i];
    const [s0, s1] = this.strengths(ctx, card);
    const si = i === 0 ? s0 : s1, so = i === 0 ? s1 : s0;
    const a = this.side[i], b = this.side[o];
    // balayage par force croissante : masse adverse plus faible, égale, avec correction des cartes partagées
    const [ii, oi] = this.order(ctx, card, i);
    const tot = this.compat(i, Float64Array.from(reach, (r, j) => (so[j] >= 0 ? r : 0)));
    const out = new Float64Array(a.n);
    const lessCard = new Float64Array(52), eqCard = new Float64Array(52);
    let less = 0, p = 0;
    for (let k = 0; k < ii.length;) {
      const v = si[ii[k]];
      let e = k; while (e < ii.length && si[ii[e]] === v) e++;
      if (v < 0) { k = e; continue; }
      while (p < oi.length && so[oi[p]] < v) { const j = oi[p++]; less += reach[j]; lessCard[b.c1[j]] += reach[j]; lessCard[b.c2[j]] += reach[j]; }
      let eq = 0; const touched: number[] = [];
      let q = p; while (q < oi.length && so[oi[q]] === v) { const j = oi[q++]; eq += reach[j]; eqCard[b.c1[j]] += reach[j]; eqCard[b.c2[j]] += reach[j]; touched.push(j); }
      for (let t = k; t < e; t++) {
        const h = ii[t];
        const win = less - lessCard[a.c1[h]] - lessCard[a.c2[h]];
        const sm = a.same[h];
        const tie = eq - eqCard[a.c1[h]] - eqCard[a.c2[h]] + (sm >= 0 && so[sm] === v ? reach[sm] : 0);
        const lose = tot[h] - win - tie;
        out[h] = win * uW + tie * uT + lose * uL;
      }
      for (const j of touched) { eqCard[b.c1[j]] -= reach[j]; eqCard[b.c2[j]] -= reach[j]; }
      k = e;
    }
    return out;
  }

  /**
   * Parcours générique. mode « ev » : valeur sous la stratégie de i ; « br » : meilleure réponse de i ; « cfr » : ajoute
   * les regrets (via `onRegret`) et renvoie les valeurs sous la stratégie courante.
   */
  walk(n: HNode, i: 0 | 1, reachI: Float64Array, reachO: Float64Array, strat: Strat, mode: "ev" | "br" | "cfr",
    onRegret?: (id: number, vals: Float64Array[], s: ArrayLike<number>, reachI: Float64Array) => void, ctx = -1, card: string | null = null): Float64Array {
    if (n.t === "fold" || n.t === "show") return this.terminal(n, i, reachO, ctx, card);
    const a = this.side[i], b = this.side[1 - i];
    if (n.t === "chance") {
      const acc = new Float64Array(a.n);
      n.cards.forEach((cd, k) => {
        const ci = CI.get(cd)!;
        const rO = Float64Array.from(reachO, (r, j) => (b.c1[j] === ci || b.c2[j] === ci ? 0 : r));
        const rI = Float64Array.from(reachI, (r, h) => (a.c1[h] === ci || a.c2[h] === ci ? 0 : r));
        const v = this.walk(n.children[k], i, rI, rO, strat, mode, onRegret, k, cd);
        for (let h = 0; h < a.n; h++) if (!(a.c1[h] === ci || a.c2[h] === ci)) acc[h] += v[h] / this.nChance;
      });
      return acc;
    }
    const s = strat(n.id), A = n.children.length;
    if (n.player === i) {
      const vals = n.children.map((c, k) => this.walk(c, i, Float64Array.from(reachI, (r, h) => r * s[k * a.n + h]), reachO, strat, mode, onRegret, ctx, card));
      const out = new Float64Array(a.n);
      for (let h = 0; h < a.n; h++) {
        if (mode === "br") { let m = -Infinity; for (let k = 0; k < A; k++) m = Math.max(m, vals[k][h]); out[h] = m; }
        else { let v = 0; for (let k = 0; k < A; k++) v += s[k * a.n + h] * vals[k][h]; out[h] = v; }
      }
      if (mode === "cfr") onRegret?.(n.id, vals, s, reachI);
      return out;
    }
    const out = new Float64Array(a.n);
    n.children.forEach((c, k) => {
      const v = this.walk(c, i, reachI, Float64Array.from(reachO, (r, j) => r * s[k * b.n + j]), strat, mode, onRegret, ctx, card);
      for (let h = 0; h < a.n; h++) out[h] += v[h];
    });
    return out;
  }

  /** Valeur moyenne pour i (normalisée par la masse de mains compatible). */
  value(i: 0 | 1, strat: Strat, mode: "ev" | "br"): number {
    const a = this.side[i], o = (1 - i) as 0 | 1;
    const v = this.walk(this.g.root, i, Float64Array.from(a.w), Float64Array.from(this.side[o].w), strat, mode);
    const m = this.compat(i, Float64Array.from(this.side[o].w));
    let num = 0, den = 0;
    for (let h = 0; h < a.n; h++) { num += a.w[h] * v[h]; den += a.w[h] * m[h]; }
    return den ? num / den : 0;
  }

  /** Exploitabilité (moyenne sur les deux joueurs du gain d'une meilleure réponse), en jetons, et valeurs. */
  exploitability(strat: Strat): { expl: number; ev: [number, number]; br: [number, number] } {
    const ev: [number, number] = [this.value(0, strat, "ev"), this.value(1, strat, "ev")];
    const br: [number, number] = [this.value(0, strat, "br"), this.value(1, strat, "br")];
    return { expl: (br[0] - ev[0] + br[1] - ev[1]) / 2, ev, br };
  }
}

/** Solveur de référence : CFR+ vectorisé par main, mises à jour alternées, moyenne pondérée par l'itération. */
export class RefSolver {
  private regret = new Map<number, Float64Array>();
  private sum = new Map<number, Float64Array>();
  private sizes = new Map<number, { A: number; n: number }>();
  iterations = 0;
  constructor(readonly hu: HU) {
    const visit = (n: HNode) => {
      if (n.t === "act") {
        const N = hu.side[n.player].n;
        this.sizes.set(n.id, { A: n.children.length, n: N });
        this.regret.set(n.id, new Float64Array(n.children.length * N));
        this.sum.set(n.id, new Float64Array(n.children.length * N));
        n.children.forEach(visit);
      } else if (n.t === "chance") n.children.forEach(visit);
    };
    visit(hu.g.root);
  }
  current: Strat = (id: number) => {
    const { A, n } = this.sizes.get(id)!, r = this.regret.get(id)!, s = new Float64Array(A * n);
    for (let h = 0; h < n; h++) {
      let t = 0; for (let a = 0; a < A; a++) t += Math.max(0, r[a * n + h]);
      for (let a = 0; a < A; a++) s[a * n + h] = t > 0 ? Math.max(0, r[a * n + h]) / t : 1 / A;
    }
    return s;
  };
  average: Strat = (id: number) => {
    const { A, n } = this.sizes.get(id)!, m = this.sum.get(id)!, s = new Float64Array(A * n);
    for (let h = 0; h < n; h++) {
      let t = 0; for (let a = 0; a < A; a++) t += m[a * n + h];
      for (let a = 0; a < A; a++) s[a * n + h] = t > 0 ? m[a * n + h] / t : 1 / A;
    }
    return s;
  };
  run(k: number) {
    for (let it = 0; it < k; it++) {
      this.iterations++;
      const w = this.iterations;
      for (const i of [0, 1] as const) {
        const cache = new Map<number, Float64Array>();
        const strat: Strat = id => { let s = cache.get(id); if (!s) { s = this.current(id) as Float64Array; cache.set(id, s); } return s; };
        const pend: [number, Float64Array[], ArrayLike<number>, Float64Array][] = [];
        this.hu.walk(this.hu.g.root, i, Float64Array.from(this.hu.side[i].w), Float64Array.from(this.hu.side[1 - i].w), strat, "cfr",
          (id, vals, s, reachI) => pend.push([id, vals, s, reachI]));
        for (const [id, vals, s, reachI] of pend) {
          const { A, n } = this.sizes.get(id)!, r = this.regret.get(id)!, m = this.sum.get(id)!;
          for (let h = 0; h < n; h++) {
            let v = 0; for (let a = 0; a < A; a++) v += s[a * n + h] * vals[a][h];
            for (let a = 0; a < A; a++) {
              r[a * n + h] = Math.max(0, r[a * n + h] + vals[a][h] - v);
              m[a * n + h] += w * reachI[h] * s[a * n + h];
            }
          }
        }
      }
    }
  }
}
