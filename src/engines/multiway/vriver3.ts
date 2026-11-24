// River à 3 joueurs « par vecteurs de mains » (étape 2 du solveur multiway) : un seul arbre d'enchères public ; à
// chaque nœud, une stratégie par main du joueur qui parle ; aux fins de main, valeur exacte sur la distribution jointe
// (produit des poids, aucune carte partagée : docs/DECISIONS.md D9). Mêmes règles que river3.ts (vérifié par tests),
// avec en plus plusieurs tailles de mise, relance au pot, tapis, réouverture par joueur (D2), pots annexes et rake
// réparti au prorata (moteur de règles, D4-D5). CFR+ alterné ; meilleure réponse exacte par main ; NashConv.
import type { Profile } from "@/engines/multiway/game";
import { computePots, type PotSeat as SeatState } from "@/core/pots";
import { rakeOf, type RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";
import type { RiverSpec } from "@/engines/multiway/river3";
import { HandTable, indepCfvN } from "@/engines/multiway/nTerminal";
import { buildBetTree, type TEnd, type PathAct } from "@/engines/multiway/betTree";

export interface VCombo { cards: [string, string]; w: number }
export interface VSpec {
  board: string[];
  /** Mains de chaque joueur (dans l'ordre de parole) et leur poids. */
  ranges: VCombo[][];
  potBB: number;
  stacks: number[];
  /** Tailles de mise en fraction du pot avant la mise. */
  bets: number[];
  /** Relance « au pot » permise. */
  raise: boolean;
  /** Tapis toujours proposé. */
  allin: boolean;
  /** Nombre maximal de mises et relances sur la street. */
  maxAggr: number;
  rake: RakeRule | null;
  /** Étape A1 (main réelle) : mises d'avant la river par joueur, argent des joueurs couchés, actions déjà jouées. */
  invested0?: number[];
  dead?: number[];
  path?: PathAct[];
  /** Joueurs déjà couchés avant la street (étape B1). */
  out?: boolean[];
}

export const fromRiverSpec = (s: RiverSpec): VSpec => ({
  board: s.board, potBB: s.potBB, stacks: s.stacks, bets: [s.betFrac], raise: false, allin: false, maxAggr: 1,
  rake: s.rake ?? null, ranges: s.ranges.map((r, p) => r.map((cards, k) => ({ cards, w: s.weights?.[p]?.[k] ?? 1 }))),
});

type Act = { t: "act"; id: number; player: number; hist: string; actions: string[]; children: VNode[] };
type End = { t: "end"; eid: number; refund: number[]; invested: number[]; pots: { net: number; elig: number[] }[]; coef?: [number, number, number][][] };
type VNode = Act | End;
export type VProfile = Map<number, Float64Array>;
export interface SolverState { iterations: number; regret: [number, Float64Array][]; sum: [number, Float64Array][];
  /** Turn (D32) : état du tirage des rivers, pour qu'un calcul repris tire les mêmes rivers. */
  seed?: number }

const EPS = 1e-9;
const r1 = (x: number) => Math.round(x * 10) / 10;

export class VRiver3 {
  readonly hands: VCombo[][];
  readonly root: VNode;
  private acts: Act[] = [];
  private ends: End[] = [];
  private byHist = new Map<string, Act>();
  private ranks: Int32Array[];
  private comp: Uint8Array[][];     // comp[p][q][hp * Nq + hq] : mains compatibles
  private Z = 0;
  private regret = new Map<number, Float64Array>();
  private sum = new Map<number, Float64Array>();
  iterations = 0;
  private readonly terminalMode: "fast" | "exact" | "indep" | "pair";
  private ht?: HandTable;
  private c1: Int32Array[];          // index (0-51) des deux cartes de chaque main
  private c2: Int32Array[];
  private order: Int32Array[];       // mains de chaque joueur triées par force croissante

  /** terminal : « auto » (défaut) prend le calcul exact quand les ranges sont si petites qu'il est plus rapide. */
  /** dcfr (défaut, D18) : Discounted CFR α=1,5 β=0 γ=2, comme le solveur tête-à-tête ; cfr+ reste disponible. */
  readonly algo: "cfr+" | "dcfr";
  private disc: [number, number, number] = [1, 1, 1];

  /** terminal « indep » : approximation « adversaires indépendants » (D23), pour mesurer son coût à 3 joueurs. */
  constructor(readonly spec: VSpec, opts: { terminal?: "fast" | "exact" | "auto" | "indep" | "pair"; algo?: "cfr+" | "dcfr" } = {}) {
    this.algo = opts.algo ?? "dcfr";
    const board = new Set(spec.board);
    this.hands = spec.ranges.map(r => r.filter(h => h.w > 0 && !board.has(h.cards[0]) && !board.has(h.cards[1])));
    this.ranks = this.hands.map(r => Int32Array.from(r, h => rank7([...h.cards, ...spec.board])));
    this.comp = [0, 1, 2].map(p => [0, 1, 2].map(q => {
      const a = this.hands[p], b = this.hands[q], m = new Uint8Array(a.length * b.length);
      a.forEach((x, i) => b.forEach((y, j) => { m[i * b.length + j] = x.cards.every(c => !y.cards.includes(c)) ? 1 : 0; }));
      return m;
    }));
    for (let i = 0; i < this.N(0); i++) for (let j = 0; j < this.N(1); j++) {
      if (!this.ok(0, 1, i, j)) continue;
      for (let k = 0; k < this.N(2); k++) if (this.ok(0, 2, i, k) && this.ok(1, 2, j, k)) this.Z += this.hands[0][i].w * this.hands[1][j].w * this.hands[2][k].w;
    }
    const ci = (c: string) => "23456789TJQKA".indexOf(c[0]) * 4 + "cdhs".indexOf(c[1]);
    this.c1 = this.hands.map(r => Int32Array.from(r, h => ci(h.cards[0])));
    this.c2 = this.hands.map(r => Int32Array.from(r, h => ci(h.cards[1])));
    this.order = this.ranks.map(rk => Int32Array.from(rk.keys()).sort((x, y) => rk[x] - rk[y]));
    const mode = opts.terminal ?? "auto";
    const pairs = Math.max(this.N(0) * this.N(1), this.N(0) * this.N(2), this.N(1) * this.N(2));
    this.terminalMode = mode === "auto" ? (pairs <= 150 ? "exact" : "fast") : mode;
    if (this.terminalMode === "indep" || this.terminalMode === "pair") this.ht = new HandTable(spec.board, this.hands.map(r => r.map(h => h.cards)));
    this.root = this.build();
  }

  private N = (p: number) => this.hands[p].length;
  private ok = (p: number, q: number, i: number, j: number) => this.comp[p][q][i * this.N(q) + j] === 1;

  // ---------------------------------------------------------------- arbre d'enchères public
  /** Même arbre que le solveur à n joueurs (betTree.ts) : vraies mises d'avant la river, argent mort, actions jouées. */
  private build(): VNode {
    const s = this.spec;
    const t = buildBetTree({ n: 3, potBB: s.potBB, stacks: s.stacks, bets: s.bets, raise: s.raise, allin: s.allin, maxAggr: s.maxAggr,
      rake: s.rake, invested0: s.invested0, dead: s.dead, path: s.path, out: s.out });
    this.acts = t.acts as Act[]; this.ends = t.ends as End[]; this.byHist = t.byHist as Map<string, Act>;
    return t.root as VNode;
  }

  // ---------------------------------------------------------------- valeurs aux fins de main
  /** Gain net de i avec les mains (h0, h1, h2) à cette fin de main. */
  private payoff(e: End, i: number, h: number[]): number {
    let v = e.refund[i] - e.invested[i];
    for (const pot of e.pots) {
      if (!pot.elig.includes(i)) continue;
      let best = -1, count = 0;
      for (const p of pot.elig) { const r = this.ranks[p][h[p]]; if (r > best) { best = r; count = 1; } else if (r === best) count++; }
      if (this.ranks[i][h[i]] === best) v += pot.net / count;
    }
    return v;
  }

  private terminal(e: End, i: number, reach: Float64Array[]) {
    // un adversaire n'arrive jamais ici : toutes les valeurs sont nulles (exact, aucun calcul)
    for (let p = 0; p < 3; p++) if (p !== i && !reach[p].some(w => w !== 0)) return new Float64Array(this.N(i));
    if (this.terminalMode === "indep" || this.terminalMode === "pair") return indepCfvN(this.ht!, e as unknown as TEnd, i, reach, this.terminalMode === "pair");
    return this.terminalMode === "fast" ? this.cfvFast(e, i, reach) : this.cfv(e, i, reach);
  }
  /** Pour les tests : valeur d'une fin de main par le calcul rapide ou par le calcul exact « toutes les combinaisons ». */
  terminalCfv(endIdx: number, i: number, reach: Float64Array[], method: "fast" | "exact") {
    const e = this.ends[endIdx];
    return method === "fast" ? this.cfvFast(e, i, reach) : this.cfv(e, i, reach);
  }

  /** Valeur contrefactuelle exacte, toutes les combinaisons de mains adverses (O(N³)) : sert de référence. */
  private cfv(e: End, i: number, reach: Float64Array[]): Float64Array {
    const [a, b] = [0, 1, 2].filter(p => p !== i);
    const out = new Float64Array(this.N(i));
    const h = [0, 0, 0];
    for (let x = 0; x < this.N(i); x++) {
      h[i] = x; let s = 0;
      for (let y = 0; y < this.N(a); y++) {
        const wa = reach[a][y];
        if (wa === 0 || !this.ok(i, a, x, y)) continue;
        h[a] = y;
        for (let z = 0; z < this.N(b); z++) {
          const wb = reach[b][z];
          if (wb === 0 || !this.ok(i, b, x, z) || !this.ok(a, b, y, z)) continue;
          h[b] = z;
          s += wa * wb * this.payoff(e, i, h);
        }
      }
      out[x] = s;
    }
    return out;
  }

  // ---------------------------------------------------------------- calcul rapide des fins de main (docs/DECISIONS.md D17)
  // Pour le joueur i, adversaires a et b (ordre des indices). On note F(x ; Sa, Sb) la somme, sur les mains y de a dans
  // Sa et z de b dans Sb compatibles entre elles et avec x, de reach_a(y)·reach_b(z). Chaque ensemble est « toutes les
  // mains » (A), « plus faibles que x » (L) ou « pas plus fortes que x » (E). Toute fin de main s'écrit comme une
  // combinaison de ces F (coefs) ; chaque F se calcule en O(52) par main grâce à l'inclusion-exclusion sur les cartes,
  // en parcourant les mains par force croissante.
  private coefs(e: End, i: number): [number, number, number][] {
    e.coef ??= [];
    const cached = e.coef[i];
    if (cached) return cached;
    const [a, b] = [0, 1, 2].filter(p => p !== i);
    const m = new Map<number, number>();
    const add = (ta: number, tb: number, c: number) => m.set(ta * 3 + tb, (m.get(ta * 3 + tb) ?? 0) + c);
    add(2, 2, e.refund[i] - e.invested[i]);
    for (const pot of e.pots) {
      if (!pot.elig.includes(i)) continue;
      const ha = pot.elig.includes(a), hb = pot.elig.includes(b), n = pot.net;
      // part de i : 1 s'il bat tout le monde, 1/2 ou 1/3 en cas d'égalité ; avec L = « plus faible », E = « pas plus fort »
      if (ha && hb) { add(0, 0, n / 3); add(1, 0, n / 6); add(0, 1, n / 6); add(1, 1, n / 3); }
      else if (ha) { add(0, 2, n / 2); add(1, 2, n / 2); }
      else if (hb) { add(2, 0, n / 2); add(2, 1, n / 2); }
      else add(2, 2, n);
    }
    const list: [number, number, number][] = [...m].filter(([, c]) => c !== 0).map(([k, c]) => [Math.floor(k / 3), k % 3, c]);
    e.coef[i] = list;
    return list;
  }

  // tampons réutilisés : emplacements 0-2 = joueur a (L, E, A), 3-5 = joueur b
  private fW = new Float64Array(6);
  private fC = Array.from({ length: 6 }, () => new Float64Array(52));
  private fP = Array.from({ length: 6 }, () => new Float64Array(52 * 52));
  private fRq = new Float64Array(3);
  private fRc = Array.from({ length: 3 }, () => new Float64Array(52));

  private cfvFast(e: End, i: number, reach: Float64Array[]): Float64Array {
    const terms = this.coefs(e, i);
    const [a, b] = [0, 1, 2].filter(p => p !== i);
    const { fW: W, fC: C, fP: P, fRq: Rq, fRc: Rc } = this;
    W.fill(0); Rq.fill(0);
    C.forEach(x => x.fill(0)); Rc.forEach(x => x.fill(0));
    const ra = reach[a], rb = reach[b], a1 = this.c1[a], a2 = this.c2[a], b1 = this.c1[b], b2 = this.c2[b];
    // les tables 52×52 sont nettoyées à la fin, seulement là où des mains ont été posées (tout effacer à chaque fois
    // rendrait le calcul plus lent que l'exact sur de petites ranges)
    const clean = () => {
      for (let y = 0; y < ra.length; y++) for (let t = 0; t < 3; t++) { P[t][a1[y] * 52 + a2[y]] = 0; P[t][a2[y] * 52 + a1[y]] = 0; }
      for (let z = 0; z < rb.length; z++) for (let t = 3; t < 6; t++) { P[t][b1[z] * 52 + b2[z]] = 0; P[t][b2[z] * 52 + b1[z]] = 0; }
    };
    const put = (slot: number, c1: number, c2: number, w: number) => {
      W[slot] += w; C[slot][c1] += w; C[slot][c2] += w; P[slot][c1 * 52 + c2] += w; P[slot][c2 * 52 + c1] += w;
    };
    // Par terme k : V[c] = Σd Pa[c,d]·Cb[d], U[c] = Σd Pb[c,d]·Ca[d], D = Σc Ca[c]·Cb[c], tenus à jour à chaque main
    // ajoutée pendant le balayage (D20) : il ne reste par main qu'une seule boucle de 52 cartes.
    const nT = terms.length, TA = terms.map(t => t[0]), TB = terms.map(t => t[1]);
    const V = terms.map(() => new Float64Array(52)), U = terms.map(() => new Float64Array(52)), D = new Float64Array(nT);
    let live = false;
    const putA = (t: number, y: number) => {
      const w = ra[y]; if (w === 0) return;
      const c1 = a1[y], c2 = a2[y];
      if (live) for (let k = 0; k < nT; k++) {
        if (TA[k] !== t) continue;
        const Cb = C[3 + TB[k]], Pb = P[3 + TB[k]], Vk = V[k], Uk = U[k];
        Vk[c1] += w * Cb[c2]; Vk[c2] += w * Cb[c1];
        for (let c = 0; c < 52; c++) Uk[c] += w * (Pb[c * 52 + c1] + Pb[c * 52 + c2]);
        D[k] += w * (Cb[c1] + Cb[c2]);
      }
      put(t, c1, c2, w);
      const q = w * P[5][c1 * 52 + c2];
      Rq[t] += q; Rc[t][c1] += q; Rc[t][c2] += q;
    };
    const putB = (t: number, z: number) => {
      const w = rb[z]; if (w === 0) return;
      const c1 = b1[z], c2 = b2[z];
      if (live) for (let k = 0; k < nT; k++) {
        if (TB[k] !== t) continue;
        const Ca = C[TA[k]], Pa = P[TA[k]], Vk = V[k], Uk = U[k];
        for (let c = 0; c < 52; c++) Vk[c] += w * (Pa[c * 52 + c1] + Pa[c * 52 + c2]);
        Uk[c1] += w * Ca[c2]; Uk[c2] += w * Ca[c1];
        D[k] += w * (Ca[c1] + Ca[c2]);
      }
      put(3 + t, c1, c2, w);
    };
    for (let z = 0; z < rb.length; z++) putB(2, z);
    for (let y = 0; y < ra.length; y++) putA(2, y);
    // au départ, seules les tables « toutes les mains » (A) sont remplies : les termes A×A se calculent une fois
    for (let k = 0; k < nT; k++) {
      if (TA[k] !== 2 || TB[k] !== 2) continue;
      const Ca = C[2], Pa = P[2], Cb = C[5], Pb = P[5], Vk = V[k], Uk = U[k];
      let d = 0;
      for (let c = 0; c < 52; c++) {
        d += Ca[c] * Cb[c];
        let sv = 0, su = 0;
        for (let e = 0; e < 52; e++) { sv += Pa[c * 52 + e] * Cb[e]; su += Pb[c * 52 + e] * Ca[e]; }
        Vk[c] = sv; Uk[c] = su;
      }
      D[k] = d;
    }
    live = true;

    const out = new Float64Array(this.N(i));
    const x1s = this.c1[i], x2s = this.c2[i];
    const evalGroup = (xs: ArrayLike<number>, from: number, to: number) => {
      for (let g = from; g < to; g++) {
        const x = xs[g], x1 = x1s[x], x2 = x2s[x], kx = x1 * 52 + x2, o1 = x1 * 52, o2 = x2 * 52;
        let v = 0;
        for (let k = 0; k < nT; k++) {
          const ta = TA[k], tb = TB[k], coef = terms[k][2];
          const Ca = C[ta], Pa = P[ta], Cb = C[3 + tb], Pb = P[3 + tb], tr = ta < tb ? ta : tb, Vk = V[k], Uk = U[k];
          const pa = Pa[kx], pb = Pb[kx];
          const T1 = (W[ta] - Ca[x1] - Ca[x2] + pa) * (W[3 + tb] - Cb[x1] - Cb[x2] + pb);
          const T2 = D[k] - (Ca[x1] * Cb[x1] + Vk[x1]) - (Ca[x2] * Cb[x2] + Vk[x2]) + pa * (Cb[x1] + Cb[x2]);
          const T3 = Rq[tr] - Rc[tr][x1] - Rc[tr][x2] + pa * pb;
          let h = 0;
          for (let d = 0; d < 52; d++) h += (Pb[o1 + d] + Pb[o2 + d]) * (Pa[o1 + d] + Pa[o2 + d]);
          const t4 = Uk[x1] + Uk[x2] - pb * (Ca[x1] + Ca[x2]) - h + 2 * pb * pa;
          v += coef * (T1 - T2 + T3 + t4);
        }
        out[x] = v;
      }
    };
    if (terms.every(([ta, tb]) => ta === 2 && tb === 2)) { evalGroup(Int32Array.from(out.keys()), 0, out.length); clean(); return out; }

    const oi = this.order[i], oa = this.order[a], ob = this.order[b];
    const ri = this.ranks[i], rka = this.ranks[a], rkb = this.ranks[b];
    let aL = 0, aE = 0, bL = 0, bE = 0;
    for (let g = 0; g < oi.length;) {
      const v = ri[oi[g]];
      let h = g; while (h < oi.length && ri[oi[h]] === v) h++;
      while (aL < oa.length && rka[oa[aL]] < v) putA(0, oa[aL++]);
      while (aE < oa.length && rka[oa[aE]] <= v) putA(1, oa[aE++]);
      while (bL < ob.length && rkb[ob[bL]] < v) putB(0, ob[bL++]);
      while (bE < ob.length && rkb[ob[bE]] <= v) putB(1, ob[bE++]);
      evalGroup(oi, g, h);
      g = h;
    }
    clean();
    return out;
  }

  /** Stratégie du moment (regret matching), sans tableaux intermédiaires. */
  private current(n: Act): Float64Array {
    const N = this.N(n.player), A = n.actions.length, t = this.regret.get(n.id), out = new Float64Array(A * N);
    if (!t) { out.fill(1 / A); return out; }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let a = 0; a < A; a++) { const r = t[a * N + x]; if (r > 0) s += r; }
      if (s > 0) for (let a = 0; a < A; a++) { const r = t[a * N + x]; out[a * N + x] = r > 0 ? r / s : 0; }
      else for (let a = 0; a < A; a++) out[a * N + x] = 1 / A;
    }
    return out;
  }

  // ---------------------------------------------------------------- CFR (DCFR par défaut, D18)
  private walk(n: VNode, i: number, reach: Float64Array[]): Float64Array {
    if (n.t === "end") return this.terminal(n, i, reach);
    const p = n.player, N = this.N(p), A = n.actions.length, sigma = this.current(n), rp = reach[p];
    if (p !== i) {
      const Ni = this.N(i), tot = new Float64Array(Ni);
      for (let a = 0; a < A; a++) {
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
        r[p] = w;
        const v = this.walk(n.children[a], i, r);
        for (let x = 0; x < Ni; x++) tot[x] += v[x];
      }
      return tot;
    }
    const vals: Float64Array[] = [];
    for (let a = 0; a < A; a++) {
      const r = reach.slice(), w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
      r[i] = w;
      vals.push(this.walk(n.children[a], i, r));
    }
    return this.applyUpdate(n, i, rp, sigma, vals);
  }

  /** Fin de la visite d'un nœud du joueur qui apprend : valeur de ses mains, mise à jour des regrets et de la moyenne. */
  applyUpdate(n: Act, i: number, rp: Float64Array, sigma: Float64Array, vals: Float64Array[]): Float64Array {
    const N = this.N(i), A = n.actions.length;
    const v = new Float64Array(N);
    for (let a = 0; a < A; a++) { const va = vals[a]; for (let x = 0; x < N; x++) v[x] += sigma[a * N + x] * va[x]; }
    let reg = this.regret.get(n.id), sum = this.sum.get(n.id);
    if (!reg) { reg = new Float64Array(A * N); this.regret.set(n.id, reg); }
    if (!sum) { sum = new Float64Array(A * N); this.sum.set(n.id, sum); }
    const [d0, d1, d2] = this.disc, dcfr = this.algo === "dcfr", it = this.iterations;
    for (let a = 0; a < A; a++) {
      const va = vals[a];
      for (let x = 0; x < N; x++) {
        const k = a * N + x, r = va[x] - v[x];
        if (dcfr) {
          const old = reg[k];
          reg[k] = (old > 0 ? old * d0 : old * d1) + r;
          sum[k] = sum[k] * d2 + rp[x] * sigma[k];
        } else {
          reg[k] = Math.max(0, reg[k] + r);
          sum[k] += it * rp[x] * sigma[k];
        }
      }
    }
    return v;
  }

  // ---------------------------------------------------------------- accès pour le calcul réparti (vparallel.ts)
  keyOf(n: VNode) { return n.t === "act" ? `a${n.id}` : `e${n.eid}`; }
  nodeOf(key: string): VNode { return key[0] === "a" ? this.acts[+key.slice(1)] : this.ends[+key.slice(1)]; }
  /** Fixe le numéro d'itération et les coefficients DCFR (identiques à run()). */
  setIteration(t: number) {
    this.iterations = t;
    const p = Math.pow(t - 1, 1.5);
    this.disc = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
  }
  walkKey(key: string, i: number, reach: Float64Array[]) { return this.walk(this.nodeOf(key), i, reach); }
  evalKey(key: string, i: number, reach: Float64Array[], prof: VProfile, br: boolean) { return this.evalWalk(this.nodeOf(key), i, reach, prof, br); }
  strategyNow(n: Act) { return this.current(n); }
  rootReach() { return this.reach0(); }
  totalOf(i: number, vec: Float64Array) { return this.total(i, vec); }
  handCount(p: number) { return this.N(p); }
  /** Nœuds de décision et nombre de fins de main sous un nœud (lui compris). */
  subtree(key: string): { acts: number[]; ends: number } {
    const acts: number[] = []; let ends = 0;
    const rec = (n: VNode) => { if (n.t === "end") { ends++; return; } acts.push(n.id); n.children.forEach(rec); };
    rec(this.nodeOf(key));
    return { acts, ends };
  }

  private reach0 = () => this.hands.map(r => Float64Array.from(r, h => h.w));

  run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      const t = ++this.iterations, p = Math.pow(t - 1, 1.5);
      this.disc = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
      for (let i = 0; i < 3; i++) this.walk(this.root, i, this.reach0());
    }
  }

  /**
   * Calcul avec contrôles : toutes les `every` itérations, mesure la NashConv exacte de la stratégie moyenne et garde la
   * meilleure (D18) — on ne publie jamais moins bien que le meilleur point atteint, même si la mesure remonte ensuite.
   */
  solve(iterations: number, every = 100, stopAt = 0) {
    const checks: { iterations: number; nashConv: number }[] = [];
    let profile = this.averageProfile(), nashConv = Infinity, at = 0;
    for (let done = 0; done < iterations && nashConv > stopAt;) {
      const k = Math.min(every, iterations - done);
      this.run(k); done += k;
      const avg = this.averageProfile(), nc = this.nashConv(avg);
      checks.push({ iterations: this.iterations, nashConv: nc });
      if (nc < nashConv) { nashConv = nc; profile = avg; at = this.iterations; }
    }
    return { profile, nashConv, iterations: at, checks };
  }

  /** État complet du calcul (pour la mémoire des spots, D21) : itération, regrets et sommes des stratégies. */
  exportState(ids?: number[]): SolverState {
    const keep = (m: Map<number, Float64Array>) => [...m].filter(([id]) => !ids || ids.includes(id)).map(([id, a]) => [id, Float64Array.from(a)] as [number, Float64Array]);
    return { iterations: this.iterations, regret: keep(this.regret), sum: keep(this.sum) };
  }
  /** Reprend un calcul exporté : la suite donne exactement ce qu'aurait donné un calcul jamais interrompu. */
  importState(st: SolverState, ids?: number[]) {
    this.iterations = st.iterations;
    for (const [id, a] of st.regret) if (!ids || ids.includes(id)) this.regret.set(id, Float64Array.from(a));
    for (const [id, a] of st.sum) if (!ids || ids.includes(id)) this.sum.set(id, Float64Array.from(a));
  }

  averageProfile(ids?: number[]): VProfile {
    const out: VProfile = new Map();
    for (const n of ids ? ids.map(id => this.acts[id]) : this.acts) {
      const N = this.N(n.player), A = n.actions.length, t = this.sum.get(n.id), o = new Float64Array(A * N);
      for (let x = 0; x < N; x++) {
        let s = 0;
        if (t) for (let a = 0; a < A; a++) s += t[a * N + x];
        if (t && s > 0) for (let a = 0; a < A; a++) o[a * N + x] = t[a * N + x] / s;
        else for (let a = 0; a < A; a++) o[a * N + x] = 1 / A;
      }
      out.set(n.id, o);
    }
    return out;
  }
  uniform(): VProfile {
    const out: VProfile = new Map();
    for (const n of this.acts) out.set(n.id, new Float64Array(n.actions.length * this.N(n.player)).fill(1 / n.actions.length));
    return out;
  }

  // ---------------------------------------------------------------- mesures exactes
  private evalWalk(n: VNode, i: number, reach: Float64Array[], prof: VProfile, br: boolean): Float64Array {
    if (n.t === "end") return this.terminal(n, i, reach);
    const N = this.N(n.player), sigma = prof.get(n.id)!;
    if (n.player !== i) {
      const tot = new Float64Array(this.N(i));
      n.children.forEach((c, a) => {
        const r = reach.slice(); r[n.player] = reach[n.player].map((w, x) => w * sigma[a * N + x]);
        this.evalWalk(c, i, r, prof, br).forEach((v, x) => { tot[x] += v; });
      });
      return tot;
    }
    const vals = n.children.map(c => this.evalWalk(c, i, reach, prof, br));
    const v = new Float64Array(N);
    for (let x = 0; x < N; x++) {
      if (br) v[x] = Math.max(...vals.map(col => col[x]));
      else for (let a = 0; a < vals.length; a++) v[x] += sigma[a * N + x] * vals[a][x];
    }
    return v;
  }
  private total(i: number, vec: Float64Array) { return this.hands[i].reduce((t, h, x) => t + h.w * vec[x], 0) / this.Z; }

  expectedValues(prof: VProfile): number[] {
    return [0, 1, 2].map(i => this.total(i, this.evalWalk(this.root, i, this.reach0(), prof, false)));
  }
  /** Somme des gains de déviation de chaque joueur (meilleure réponse exacte, main par main). */
  nashConv(prof: VProfile): number {
    const ev = this.expectedValues(prof);
    return Math.max(0, [0, 1, 2].reduce((t, i) => t + this.total(i, this.evalWalk(this.root, i, this.reach0(), prof, true)) - ev[i], 0));
  }

  // ---------------------------------------------------------------- outils de vérification
  infoKeys(): string[] {
    return this.acts.flatMap(n => this.hands[n.player].map(h => `${n.player}|${h.cards.join("")}|${n.hist}`));
  }
  /** Le même profil, lisible par l'arbre explicite de l'étape 1 (clé « joueur|cartes|historique »). */
  toExplicit(prof: VProfile): Profile {
    return info => {
      const [p, cards, hist] = info.split("|");
      const n = this.byHist.get(`${p}|${hist}`);
      if (!n) return undefined;
      const x = this.hands[+p].findIndex(h => h.cards.join("") === cards), N = this.N(+p), s = prof.get(n.id)!;
      return n.actions.map((_, a) => s[a * N + x]);
    };
  }
  terminalCount() { return this.ends.length; }
  /** Sur toutes les fins de main et toutes les distributions : somme des gains (≤ 0) et rake prélevé (≤ plafond). */
  conservationCheck() {
    let maxExcess = -Infinity, maxRake = 0;
    for (const e of this.ends) for (let x = 0; x < this.N(0); x++) for (let y = 0; y < this.N(1); y++) for (let z = 0; z < this.N(2); z++) {
      if (!this.ok(0, 1, x, y) || !this.ok(0, 2, x, z) || !this.ok(1, 2, y, z)) continue;
      const h = [x, y, z], s = [0, 1, 2].reduce((t, i) => t + this.payoff(e, i, h), 0);
      maxExcess = Math.max(maxExcess, s); maxRake = Math.max(maxRake, -s);
    }
    return { maxExcess, maxRake };
  }
}
