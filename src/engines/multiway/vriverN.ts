// Solveur EXACT de la river à n joueurs (2 à 6), par vecteurs de mains (docs/DECISIONS.md D25). Même méthode que
// vriver3.ts (DCFR, mises à jour alternées, meilleure stratégie mesurée gardée), arbre d'enchères de betTree.ts, valeurs
// des fins de main exactes de nExact.ts (aucune approximation des cartes). Mêmes méthodes publiques que VRiver3, pour
// le calcul réparti (vparallel.ts) et la mémoire des spots (spotCache.ts).
import { buildBetTree, type BetTree, type TAct, type TEnd, type TNode } from "@/engines/multiway/betTree";
import { HandTable, indepCfvN, exactCfvN } from "@/engines/multiway/nTerminal";
import { exactCfvFast } from "@/engines/multiway/nExact";
import type { VSpec, VProfile, SolverState } from "@/engines/multiway/vriver3";

export class VRiverN {
  readonly tree: BetTree;
  readonly h: HandTable;
  readonly n: number;
  readonly root: TNode;
  private weights: Float64Array[];
  private regret = new Map<number, Float64Array>();
  private sum = new Map<number, Float64Array>();
  private disc: [number, number, number] = [1, 1, 1];
  private Z = 0;
  readonly algo: "cfr+" | "dcfr";
  readonly terminalMode: "exact" | "enum" | "indep";
  iterations = 0;

  /** terminal : « exact » (défaut, nExact), « enum » (énumération complète, pour les tests), « indep » (approximation). */
  constructor(readonly spec: VSpec, opts: { algo?: "cfr+" | "dcfr"; terminal?: "exact" | "enum" | "indep" } = {}) {
    this.n = spec.ranges.length;
    const board = new Set(spec.board);
    const kept = spec.ranges.map(r => r.filter(c => c.w > 0 && !board.has(c.cards[0]) && !board.has(c.cards[1])));
    this.h = new HandTable(spec.board, kept.map(r => r.map(c => c.cards)));
    this.weights = kept.map(r => Float64Array.from(r, c => c.w));
    this.tree = buildBetTree({ n: this.n, potBB: spec.potBB, stacks: spec.stacks, bets: spec.bets, raise: spec.raise, allin: spec.allin, maxAggr: spec.maxAggr, rake: spec.rake,
      invested0: spec.invested0, dead: spec.dead, path: spec.path });
    this.root = this.tree.root;
    this.algo = opts.algo ?? "dcfr";
    this.terminalMode = opts.terminal ?? "exact";
    // masse totale des distributions possibles (pour les valeurs moyennes) : valeur exacte d'un gain constant de 1
    const unit: TEnd = { t: "end", eid: -1, refund: new Array(this.n).fill(1), invested: new Array(this.n).fill(0), folded: new Array(this.n).fill(false), pots: [] };
    const v0 = this.terminal(unit, 0, this.weights);
    this.Z = this.weights[0].reduce((t, w, x) => t + w * v0[x], 0);
  }

  get hands() { return this.h.hands.map((r, p) => r.map((cards, x) => ({ cards, w: this.weights[p][x] }))); }
  handCount(p: number) { return this.h.hands[p].length; }
  terminalCount() { return this.tree.ends.length; }

  private terminal(e: TEnd, i: number, reach: Float64Array[]): Float64Array {
    for (let p = 0; p < this.n; p++) if (p !== i && !reach[p].some(w => w !== 0)) return new Float64Array(this.h.hands[i].length);
    if (this.terminalMode === "enum") return exactCfvN(this.h, e, i, reach);
    if (this.terminalMode === "indep") return indepCfvN(this.h, e, i, reach);
    return exactCfvFast(this.h, e, i, reach);
  }

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

  private walk(node: TNode, i: number, reach: Float64Array[]): Float64Array {
    if (node.t === "end") return this.terminal(node, i, reach);
    const p = node.player, N = this.h.hands[p].length, A = node.actions.length, sigma = this.current(node), rp = reach[p];
    if (p !== i) {
      const Ni = this.h.hands[i].length, tot = new Float64Array(Ni);
      for (let a = 0; a < A; a++) {
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
        r[p] = w;
        const v = this.walk(node.children[a], i, r);
        for (let x = 0; x < Ni; x++) tot[x] += v[x];
      }
      return tot;
    }
    const vals: Float64Array[] = [];
    for (let a = 0; a < A; a++) {
      const r = reach.slice(), w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
      r[i] = w;
      vals.push(this.walk(node.children[a], i, r));
    }
    return this.applyUpdate(node, i, rp, sigma, vals);
  }

  applyUpdate(n: TAct, i: number, rp: Float64Array, sigma: Float64Array, vals: Float64Array[]): Float64Array {
    const N = this.h.hands[i].length, A = n.actions.length, v = new Float64Array(N);
    for (let a = 0; a < A; a++) { const va = vals[a]; for (let x = 0; x < N; x++) v[x] += sigma[a * N + x] * va[x]; }
    let reg = this.regret.get(n.id), sum = this.sum.get(n.id);
    if (!reg) { reg = new Float64Array(A * N); this.regret.set(n.id, reg); }
    if (!sum) { sum = new Float64Array(A * N); this.sum.set(n.id, sum); }
    const [d0, d1, d2] = this.disc, dcfr = this.algo === "dcfr", it = this.iterations;
    for (let a = 0; a < A; a++) {
      const va = vals[a];
      for (let x = 0; x < N; x++) {
        const k = a * N + x, r = va[x] - v[x];
        if (dcfr) { const old = reg[k]; reg[k] = (old > 0 ? old * d0 : old * d1) + r; sum[k] = sum[k] * d2 + rp[x] * sigma[k]; }
        else { reg[k] = Math.max(0, reg[k] + r); sum[k] += it * rp[x] * sigma[k]; }
      }
    }
    return v;
  }

  setIteration(t: number) {
    this.iterations = t;
    const p = Math.pow(t - 1, 1.5);
    this.disc = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
  }
  rootReach() { return this.weights.map(w => Float64Array.from(w)); }

  run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.setIteration(this.iterations + 1);
      for (let i = 0; i < this.n; i++) this.walk(this.root, i, this.rootReach());
    }
  }

  averageProfile(ids?: number[]): VProfile {
    const out: VProfile = new Map();
    for (const n of ids ? ids.map(id => this.tree.acts[id]) : this.tree.acts) {
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

  private evalWalk(node: TNode, i: number, reach: Float64Array[], prof: VProfile, br: boolean): Float64Array {
    if (node.t === "end") return this.terminal(node, i, reach);
    const p = node.player, N = this.h.hands[p].length, sigma = prof.get(node.id)!;
    if (p !== i) {
      const tot = new Float64Array(this.h.hands[i].length);
      node.children.forEach((c, a) => {
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = reach[p][x] * sigma[a * N + x];
        r[p] = w;
        this.evalWalk(c, i, r, prof, br).forEach((v, x) => { tot[x] += v; });
      });
      return tot;
    }
    const vals = node.children.map(c => this.evalWalk(c, i, reach, prof, br)), v = new Float64Array(N);
    for (let x = 0; x < N; x++) {
      if (br) v[x] = Math.max(...vals.map(col => col[x]));
      else for (let a = 0; a < vals.length; a++) v[x] += sigma[a * N + x] * vals[a][x];
    }
    return v;
  }
  totalOf(i: number, vec: Float64Array) { return this.weights[i].reduce((t, w, x) => t + w * vec[x], 0) / this.Z; }
  expectedValues(prof: VProfile): number[] {
    return Array.from({ length: this.n }, (_, i) => this.totalOf(i, this.evalWalk(this.root, i, this.rootReach(), prof, false)));
  }
  nashConv(prof: VProfile): number {
    const ev = this.expectedValues(prof);
    return Math.max(0, ev.reduce((t, e, i) => t + this.totalOf(i, this.evalWalk(this.root, i, this.rootReach(), prof, true)) - e, 0));
  }

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

  // ---------------------------------------------------------------- accès pour le calcul réparti et la mémoire
  keyOf(n: TNode) { return n.t === "act" ? `a${n.id}` : `e${n.eid}`; }
  nodeOf(key: string): TNode { return key[0] === "a" ? this.tree.acts[+key.slice(1)] : this.tree.ends[+key.slice(1)]; }
  /** Valeur d'une fin de main (par son numéro) : le travail que le calcul réparti confie aux ouvriers. */
  terminalValues(eid: number, i: number, reach: Float64Array[]) { return this.terminal(this.tree.ends[eid], i, reach); }
  walkKey(key: string, i: number, reach: Float64Array[]) { return this.walk(this.nodeOf(key), i, reach); }
  evalKey(key: string, i: number, reach: Float64Array[], prof: VProfile, br: boolean) { return this.evalWalk(this.nodeOf(key), i, reach, prof, br); }
  strategyNow(n: TAct) { return this.current(n); }
  subtree(key: string): { acts: number[]; ends: number } {
    const acts: number[] = []; let ends = 0;
    const rec = (n: TNode) => { if (n.t === "end") { ends++; return; } acts.push(n.id); n.children.forEach(rec); };
    rec(this.nodeOf(key));
    return { acts, ends };
  }
  exportState(ids?: number[]): SolverState {
    const keep = (m: Map<number, Float64Array>) => [...m].filter(([id]) => !ids || ids.includes(id)).map(([id, a]) => [id, Float64Array.from(a)] as [number, Float64Array]);
    return { iterations: this.iterations, regret: keep(this.regret), sum: keep(this.sum) };
  }
  importState(st: SolverState, ids?: number[]) {
    this.iterations = st.iterations;
    for (const [id, a] of st.regret) if (!ids || ids.includes(id)) this.regret.set(id, Float64Array.from(a));
    for (const [id, a] of st.sum) if (!ids || ids.includes(id)) this.sum.set(id, Float64Array.from(a));
  }
}
