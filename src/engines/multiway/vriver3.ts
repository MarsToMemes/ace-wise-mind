// River à 3 joueurs « par vecteurs de mains » (étape 2 du solveur multiway) : un seul arbre d'enchères public ; à
// chaque nœud, une stratégie par main du joueur qui parle ; aux fins de main, valeur exacte sur la distribution jointe
// (produit des poids, aucune carte partagée : docs/DECISIONS.md D9). Mêmes règles que river3.ts (vérifié par tests),
// avec en plus plusieurs tailles de mise, relance au pot, tapis, réouverture par joueur (D2), pots annexes et rake
// réparti au prorata (moteur de règles, D4-D5). CFR+ alterné ; meilleure réponse exacte par main ; NashConv.
import type { Profile } from "@/engines/multiway/game";
import { computePots, type SeatState } from "@/core/handState";
import { rakeOf, type RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";
import type { RiverSpec } from "@/engines/multiway/river3";

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
}

export const fromRiverSpec = (s: RiverSpec): VSpec => ({
  board: s.board, potBB: s.potBB, stacks: s.stacks, bets: [s.betFrac], raise: false, allin: false, maxAggr: 1,
  rake: s.rake ?? null, ranges: s.ranges.map((r, p) => r.map((cards, k) => ({ cards, w: s.weights?.[p]?.[k] ?? 1 }))),
});

type Act = { t: "act"; id: number; player: number; hist: string; actions: string[]; children: VNode[] };
type End = { t: "end"; refund: number[]; invested: number[]; pots: { net: number; elig: number[] }[] };
type VNode = Act | End;
export type VProfile = Map<number, Float64Array>;

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

  constructor(readonly spec: VSpec) {
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
    this.root = this.build();
  }

  private N = (p: number) => this.hands[p].length;
  private ok = (p: number, q: number, i: number, j: number) => this.comp[p][q][i * this.N(q) + j] === 1;

  // ---------------------------------------------------------------- arbre d'enchères public
  private build(): VNode {
    const s = this.spec, n = 3;
    type St = { contrib: number[]; folded: boolean[]; acted: Set<number>; bet: number; full: number; aggr: number; seenBet: number[]; seenFull: number[]; hist: string };
    const rem = (st: St, p: number) => s.stacks[p] - st.contrib[p];
    const next = (st: St, from: number): number => {
      for (let k = 1; k <= n; k++) {
        const p = (from + k) % n;
        if (!st.folded[p] && rem(st, p) > EPS && (!st.acted.has(p) || st.contrib[p] < st.bet - EPS)) return p;
      }
      return -1;
    };
    const end = (st: St): End => {
      const seats = [0, 1, 2].map(p => ({
        idx: p, investedBB: s.potBB / n + st.contrib[p], folded: st.folded[p], allIn: rem(st, p) <= EPS,
      })) as SeatState[];
      const pots = computePots(seats, false);
      const contested = pots.filter(x => x.kind !== "refund");
      const T = contested.reduce((t, x) => t + x.amount, 0);
      const rake = s.rake && T > 0 ? rakeOf(T, s.rake) : 0;
      const refund = [0, 0, 0];
      pots.filter(x => x.kind === "refund").forEach(x => { refund[x.eligible[0]] += x.amount; });
      const node: End = { t: "end", refund, invested: seats.map(x => x.investedBB), pots: contested.map(x => ({ net: x.amount - (T > 0 ? (rake * x.amount) / T : 0), elig: x.eligible })) };
      this.ends.push(node);
      return node;
    };
    const go = (st: St, p: number): VNode => {
      if (p < 0 || st.folded.filter(f => !f).length <= 1) return end(st);
      const pot = s.potBB + st.contrib.reduce((a, b) => a + b, 0);
      const r = rem(st, p), toCall = Math.max(0, st.bet - st.contrib[p]);
      const options: { tok: string; to: number; type: "f" | "x" | "c" | "agg" }[] = [];
      const canAgg = st.aggr < s.maxAggr && r > toCall + EPS &&
        (st.seenBet[p] < 0 || st.bet - st.seenBet[p] >= st.seenFull[p] - EPS);
      const allInTo = st.contrib[p] + r;
      if (toCall <= EPS) {
        options.push({ tok: "p", to: st.contrib[p], type: "x" });
        if (canAgg) s.bets.forEach((f, k) => {
          const to = Math.min(r1(f * pot), allInTo);
          if (to >= allInTo - EPS && s.allin) return;              // couvert par le tapis
          if (!options.some(o => Math.abs(o.to - to) < EPS)) options.push({ tok: s.bets.length === 1 ? "b" : `b${k}`, to, type: "agg" });
        });
      } else {
        options.push({ tok: "f", to: st.contrib[p], type: "f" });
        options.push({ tok: "c", to: Math.min(st.bet, allInTo), type: "c" });
        if (canAgg && s.raise) {
          const to = Math.min(st.bet + pot + toCall, allInTo);
          if (!(to >= allInTo - EPS && s.allin)) options.push({ tok: "r", to, type: "agg" });
        }
      }
      if (canAgg && s.allin && allInTo > st.bet + EPS) options.push({ tok: "a", to: allInTo, type: "agg" });

      const node: Act = { t: "act", id: this.acts.length, player: p, hist: st.hist, actions: options.map(o => o.tok), children: [] };
      this.acts.push(node);
      this.byHist.set(`${p}|${st.hist}`, node);
      node.children = options.map(o => {
        const nx: St = { ...st, contrib: [...st.contrib], folded: [...st.folded], acted: new Set(st.acted), seenBet: [...st.seenBet], seenFull: [...st.seenFull], hist: st.hist + o.tok };
        if (o.type === "f") { nx.folded[p] = true; nx.acted.add(p); return go(nx, next(nx, p)); }
        nx.contrib[p] = o.to;
        if (o.type === "agg") {
          const inc = o.to - st.bet;
          if (inc >= st.full - EPS || st.bet <= EPS) nx.full = st.bet <= EPS ? o.to : inc;
          nx.bet = o.to; nx.aggr = st.aggr + 1; nx.acted = new Set([p]);
        } else nx.acted.add(p);
        nx.seenBet[p] = nx.bet; nx.seenFull[p] = nx.full;
        return go(nx, next(nx, p));
      });
      return node;
    };
    return go({ contrib: [0, 0, 0], folded: [false, false, false], acted: new Set(), bet: 0, full: 1, aggr: 0, seenBet: [-1, -1, -1], seenFull: [1, 1, 1], hist: "" }, 0);
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

  /** Valeur contrefactuelle de chaque main de i (pondérée par les mains adverses et leur probabilité d'arriver ici). */
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

  private strategy(n: Act, table: Map<number, Float64Array>, normalize: (row: number[]) => number[]): Float64Array {
    const N = this.N(n.player), A = n.actions.length, t = table.get(n.id), out = new Float64Array(A * N);
    for (let x = 0; x < N; x++) {
      const row = normalize(Array.from({ length: A }, (_, a) => (t ? t[a * N + x] : 0)));
      row.forEach((v, a) => { out[a * N + x] = v; });
    }
    return out;
  }
  private current = (n: Act) => this.strategy(n, this.regret, row => {
    const pos = row.map(x => Math.max(0, x)), s = pos.reduce((p, q) => p + q, 0);
    return s > 0 ? pos.map(x => x / s) : row.map(() => 1 / row.length);
  });

  // ---------------------------------------------------------------- CFR+
  private walk(n: VNode, i: number, reach: Float64Array[]): Float64Array {
    if (n.t === "end") return this.cfv(n, i, reach);
    const N = this.N(n.player), A = n.actions.length, sigma = this.current(n);
    if (n.player !== i) {
      const tot = new Float64Array(this.N(i));
      n.children.forEach((c, a) => {
        const r = reach.slice(); r[n.player] = reach[n.player].map((w, x) => w * sigma[a * N + x]);
        this.walk(c, i, r).forEach((v, x) => { tot[x] += v; });
      });
      return tot;
    }
    const vals = n.children.map((c, a) => {
      const r = reach.slice(); r[i] = reach[i].map((w, x) => w * sigma[a * N + x]);
      return this.walk(c, i, r);
    });
    const v = new Float64Array(N);
    for (let x = 0; x < N; x++) for (let a = 0; a < A; a++) v[x] += sigma[a * N + x] * vals[a][x];
    const reg = this.regret.get(n.id) ?? new Float64Array(A * N), sum = this.sum.get(n.id) ?? new Float64Array(A * N);
    for (let a = 0; a < A; a++) for (let x = 0; x < N; x++) {
      reg[a * N + x] = Math.max(0, reg[a * N + x] + vals[a][x] - v[x]);
      sum[a * N + x] += this.iterations * reach[i][x] * sigma[a * N + x];
    }
    this.regret.set(n.id, reg); this.sum.set(n.id, sum);
    return v;
  }

  private reach0 = () => this.hands.map(r => Float64Array.from(r, h => h.w));

  run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.iterations++;
      for (let i = 0; i < 3; i++) this.walk(this.root, i, this.reach0());
    }
  }

  averageProfile(): VProfile {
    const out: VProfile = new Map();
    for (const n of this.acts) out.set(n.id, this.strategy(n, this.sum, row => {
      const s = row.reduce((p, q) => p + q, 0);
      return s > 0 ? row.map(x => x / s) : row.map(() => 1 / row.length);
    }));
    return out;
  }
  uniform(): VProfile {
    const out: VProfile = new Map();
    for (const n of this.acts) out.set(n.id, new Float64Array(n.actions.length * this.N(n.player)).fill(1 / n.actions.length));
    return out;
  }

  // ---------------------------------------------------------------- mesures exactes
  private evalWalk(n: VNode, i: number, reach: Float64Array[], prof: VProfile, br: boolean): Float64Array {
    if (n.t === "end") return this.cfv(n, i, reach);
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
