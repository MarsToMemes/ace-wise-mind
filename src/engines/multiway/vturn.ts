// Étape B1 (docs/DECISIONS.md D30) : jeu turn + river à n joueurs, par vecteurs de mains (même méthode que vriverN).
// Mises de la turn calculées par CFR ; au bout de la turn, deux façons d'évaluer la suite :
//  - « exact » : chacune des rivers possibles, avec ses propres mises (une partie de river par ligne de la turn et par
//    carte, regrets gardés) : le vrai jeu, sert de référence (trop lourd pour un navigateur : D30) ;
//  - « showdown » : la méthode « turn seule » (profondeur limitée, comme Pluribus) : chacun va à l'abattage, valeur
//    moyenne sur toutes les rivers. Approximation, mesurée contre la référence.
// Un joueur couché à la turn garde ses cartes dans le paquet (elles comptent pour les rivers possibles).
import { buildBetTree, type BetTree, type TAct, type TEnd, type TNode } from "@/engines/multiway/betTree";
import { HandTable } from "@/engines/multiway/nTerminal";
import { exactCfvFast } from "@/engines/multiway/nExact";
import { VRiverN } from "@/engines/multiway/vriverN";
import type { VSpec, VProfile, SolverState } from "@/engines/multiway/vriver3";

export interface TurnSpec extends VSpec {
  /** Tailles de la river (au bout de la turn, feuilles « exactes »). */
  river: { bets: number[]; raise: boolean; allin: boolean; maxAggr: number };
}
type River = { card: string; h: HandTable; back: Int32Array[] };
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s));

export class VTurnN {
  readonly tree: BetTree;
  readonly n: number;
  readonly root: TNode;
  readonly hands: { cards: [string, string]; w: number }[][];
  readonly leaves: "exact" | "showdown";
  private weights: Float64Array[];
  private regret = new Map<number, Float64Array>();
  private sum = new Map<number, Float64Array>();
  private disc: [number, number, number] = [1, 1, 1];
  private rivers: River[];
  private K: number;
  private subs = new Map<string, VRiverN>();
  private Z = 0;
  /** Rivers tirées pour l'itération en cours (toutes si pas de tirage) et facteur qui garde les valeurs sans biais. */
  private active: number[] = [];
  private factor = 1;
  private seed = 1;
  readonly sample: number;
  /** Nombre de rivers évaluées pendant les itérations (mesure du travail). */
  riverEvals = 0;
  iterations = 0;

  /** sample : nombre de rivers tirées au hasard à chaque itération (sans biais ; la précision se mesure sur toutes). */
  constructor(readonly spec: TurnSpec, opts: { leaves: "exact" | "showdown"; sample?: number }) {
    this.n = spec.ranges.length;
    this.leaves = opts.leaves;
    const b = new Set(spec.board);
    this.hands = spec.ranges.map(r => r.filter(c => c.w > 0 && !b.has(c.cards[0]) && !b.has(c.cards[1])));
    this.weights = this.hands.map(r => Float64Array.from(r, c => c.w));
    this.tree = buildBetTree({ n: this.n, potBB: spec.potBB, stacks: spec.stacks, bets: spec.bets, raise: spec.raise, allin: spec.allin,
      maxAggr: spec.maxAggr, rake: spec.rake, invested0: spec.invested0, dead: spec.dead, path: spec.path, out: spec.out });
    this.root = this.tree.root;
    this.K = 52 - spec.board.length - 2 * this.n;
    this.rivers = DECK.filter(c => !b.has(c)).map(card => {
      const back = this.hands.map(r => Int32Array.from(r.flatMap((c, x) => (c.cards.includes(card) ? [] : [x]))));
      return { card, back, h: new HandTable([...spec.board, card], this.hands.map(r => r.filter(c => !c.cards.includes(card)).map(c => c.cards))) };
    });
    this.sample = Math.min(opts.sample ?? this.rivers.length, this.rivers.length);
    this.active = this.rivers.map((_, k) => k);
    const unit: TEnd = { t: "end", eid: -1, refund: new Array(this.n).fill(1), invested: new Array(this.n).fill(0), folded: new Array(this.n).fill(false), pots: [] };
    const m = this.showdown(unit, 0, this.weights, false);
    this.Z = this.weights[0].reduce((t, w, x) => t + w * m[x], 0);
  }

  handCount(p: number) { return this.hands[p].length; }

  /** Partie de river qui suit une fin de turn, pour une carte (créée à la première visite). */
  private sub(e: TEnd, ri: number): VRiverN {
    const key = `${e.eid}|${ri}`;
    let v = this.subs.get(key);
    if (!v) {
      const s = this.spec, inv0 = s.invested0 ?? new Array(this.n).fill(s.potBB / this.n);
      const inv = e.invested.map((x, p) => x - e.refund[p]);
      v = new VRiverN({
        board: [...s.board, this.rivers[ri].card], ranges: this.hands.map(r => r.map(c => ({ cards: c.cards, w: 1 }))),
        potBB: inv.reduce((t, x) => t + x, 0) + (s.dead ?? []).reduce((t, x) => t + x, 0),
        stacks: s.stacks.map((st, p) => st - (inv[p] - inv0[p])), rake: s.rake, ...s.river, invested0: inv, dead: s.dead, out: e.folded,
      });
      this.subs.set(key, v);
    }
    return v;
  }
  subgameCount() { return this.subs.size; }

  private toRiver(R: River, reach: Float64Array[]) {
    return reach.map((r, p) => { const b = R.back[p], o = new Float64Array(b.length); for (let k = 0; k < b.length; k++) o[k] = r[b[k]]; return o; });
  }
  private cfv(h: HandTable, e: TEnd, i: number, rc: Float64Array[]) {
    for (let p = 0; p < this.n; p++) if (p !== i && !rc[p].some(w => w !== 0)) return new Float64Array(h.hands[i].length);
    return exactCfvFast(h, e, i, rc);
  }
  /** Abattage au bout de la turn, valeur moyenne sur toutes les rivers. */
  private showdown(e: TEnd, i: number, reach: Float64Array[], sampled: boolean) {
    return this.showdownOn(e, i, reach, sampled ? this.active : null, sampled ? this.factor : 1, sampled);
  }
  private showdownOn(e: TEnd, i: number, reach: Float64Array[], active: number[] | null, f: number, count = false) {
    const out = new Float64Array(this.hands[i].length);
    for (const ri of active ?? this.rivers.map((_, k) => k)) {
      const R = this.rivers[ri];
      if (count) this.riverEvals++;
      const v = this.cfv(R.h, e, i, this.toRiver(R, reach)), b = R.back[i];
      for (let k = 0; k < b.length; k++) out[b[k]] += (v[k] * f) / this.K;
    }
    return out;
  }
  /** Valeur d'une fin de turn : abattage, ou chaque river avec ses mises (mise à jour des regrets, ou évaluation). */
  private leaf(e: TEnd, i: number, reach: Float64Array[], ev?: { br: boolean; subProf: Map<string, VProfile> }) {
    if (this.leaves === "showdown" || e.folded[i] || e.folded.filter(f => !f).length < 2) return this.showdown(e, i, reach, !ev);
    const out = new Float64Array(this.hands[i].length), f = ev ? 1 : this.factor;
    (ev ? this.rivers.map((_, k) => k) : this.active).forEach(ri => {
      const R = this.rivers[ri];
      if (!ev) this.riverEvals++;
      const v = this.sub(e, ri), rc = this.toRiver(R, reach), key = v.keyOf(v.root);
      let vals: Float64Array;
      if (ev) {
        const k = `${e.eid}|${ri}`;
        let p = ev.subProf.get(k);
        if (!p) { p = v.averageProfile(); ev.subProf.set(k, p); }
        vals = v.evalKey(key, i, rc, p, ev.br);
      } else { v.setIteration(this.iterations); vals = v.walkKey(key, i, rc); }
      const b = R.back[i];
      for (let k = 0; k < b.length; k++) out[b[k]] += (vals[k] * f) / this.K;
    });
    return out;
  }

  private current(n: TAct): Float64Array {
    const N = this.hands[n.player].length, A = n.actions.length, t = this.regret.get(n.id), out = new Float64Array(A * N);
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
    if (node.t === "end") return this.leaf(node, i, reach);
    const p = node.player, N = this.hands[p].length, A = node.actions.length, sigma = this.current(node), rp = reach[p];
    const vals: Float64Array[] = [];
    for (let a = 0; a < A; a++) {
      const r = reach.slice(), w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
      r[p] = w;
      vals.push(this.walk(node.children[a], i, r));
    }
    if (p !== i) { const tot = new Float64Array(this.hands[i].length); for (const v of vals) for (let x = 0; x < tot.length; x++) tot[x] += v[x]; return tot; }
    return this.applyUpdate(node, i, rp, sigma, vals);
  }
  applyUpdate(node: TAct, i: number, rp: Float64Array, sigma: Float64Array, vals: Float64Array[]): Float64Array {
    const N = this.hands[i].length, A = node.actions.length;
    const v = new Float64Array(N);
    for (let a = 0; a < A; a++) for (let x = 0; x < N; x++) v[x] += sigma[a * N + x] * vals[a][x];
    let reg = this.regret.get(node.id), sum = this.sum.get(node.id);
    if (!reg) { reg = new Float64Array(A * N); this.regret.set(node.id, reg); }
    if (!sum) { sum = new Float64Array(A * N); this.sum.set(node.id, sum); }
    const [d0, d1, d2] = this.disc;
    for (let a = 0; a < A; a++) for (let x = 0; x < N; x++) {
      const k = a * N + x, old = reg[k];
      reg[k] = (old > 0 ? old * d0 : old * d1) + vals[a][x] - v[x];
      sum[k] = sum[k] * d2 + rp[x] * sigma[k];
    }
    return v;
  }
  /** Passe à l'itération t : coefficients DCFR et rivers tirées. */
  setIteration(t: number) {
    this.iterations = t;
    const p = Math.pow(t - 1, 1.5);
    this.disc = [p / (p + 1), 0.5, Math.pow((t - 1) / t, 2)];
    this.draw();
  }
  run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.setIteration(this.iterations + 1);
      for (let i = 0; i < this.n; i++) this.walk(this.root, i, this.weights.map(w => Float64Array.from(w)));
    }
  }
  /** État complet (mémoire des spots) : regrets, moyennes, itérations et tirage des rivers. */
  exportState(): SolverState {
    const keep = (m: Map<number, Float64Array>) => [...m].map(([id, a]) => [id, Float64Array.from(a)] as [number, Float64Array]);
    return { iterations: this.iterations, regret: keep(this.regret), sum: keep(this.sum), seed: this.seed };
  }
  importState(st: SolverState) {
    this.iterations = st.iterations;
    if (st.seed !== undefined) this.seed = st.seed;
    for (const [id, a] of st.regret) this.regret.set(id, Float64Array.from(a));
    for (const [id, a] of st.sum) this.sum.set(id, Float64Array.from(a));
  }
  // ------------------------------------------------ accès pour le calcul réparti (vturnParallel.ts)
  strategyNow(n: TAct) { return this.current(n); }
  get drawn() { return { active: this.active, factor: this.factor }; }
  /** Valeur « abattage » d'une fin de turn (rivers données, toutes si null) : le travail confié aux ouvriers. */
  leafShowdown(eid: number, i: number, reach: Float64Array[], active: number[] | null, factor: number) {
    return this.showdownOn(this.tree.ends[eid], i, reach, active, factor);
  }
  /** Tire les rivers de l'itération (sans remise ; générateur fixe : calcul reproductible). */
  private draw() {
    const R = this.rivers.length, k = this.sample;
    if (k >= R) { this.active = this.rivers.map((_, j) => j); this.factor = 1; return; }
    const idx = this.rivers.map((_, j) => j);
    for (let j = 0; j < k; j++) {
      this.seed = (this.seed * 1103515245 + 12345) % 2147483648;
      const r = j + Math.floor((this.seed / 2147483648) * (R - j));
      [idx[j], idx[r]] = [idx[r], idx[j]];
    }
    this.active = idx.slice(0, k).sort((a, b) => a - b);
    this.factor = R / k;
  }
  averageProfile(): VProfile {
    const out: VProfile = new Map();
    for (const n of this.tree.acts) {
      const N = this.hands[n.player].length, A = n.actions.length, t = this.sum.get(n.id), o = new Float64Array(A * N);
      for (let x = 0; x < N; x++) {
        let s = 0;
        if (t) for (let a = 0; a < A; a++) s += t[a * N + x];
        for (let a = 0; a < A; a++) o[a * N + x] = t && s > 0 ? t[a * N + x] / s : 1 / A;
      }
      out.set(n.id, o);
    }
    return out;
  }
  private evalWalk(node: TNode, i: number, reach: Float64Array[], prof: VProfile, br: boolean, subProf: Map<string, VProfile>): Float64Array {
    if (node.t === "end") return this.leaf(node, i, reach, { br, subProf });
    const p = node.player, N = this.hands[p].length, sigma = prof.get(node.id)!;
    if (p !== i) {
      const tot = new Float64Array(this.hands[i].length);
      node.children.forEach((c, a) => {
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = reach[p][x] * sigma[a * N + x];
        r[p] = w;
        this.evalWalk(c, i, r, prof, br, subProf).forEach((v, x) => { tot[x] += v; });
      });
      return tot;
    }
    const vals = node.children.map(c => this.evalWalk(c, i, reach, prof, br, subProf)), v = new Float64Array(N);
    for (let x = 0; x < N; x++) {
      if (br) v[x] = Math.max(...vals.map(col => col[x]));
      else for (let a = 0; a < vals.length; a++) v[x] += sigma[a * N + x] * vals[a][x];
    }
    return v;
  }
  totalOf(i: number, vec: Float64Array) { return this.weights[i].reduce((t, w, x) => t + w * vec[x], 0) / this.Z; }
  rootReach() { return this.weights.map(w => Float64Array.from(w)); }
  expectedValues(prof: VProfile): number[] {
    const sp = new Map<string, VProfile>();
    return Array.from({ length: this.n }, (_, i) => this.totalOf(i, this.evalWalk(this.root, i, this.rootReach(), prof, false, sp)));
  }
  /** Précision sur tout le jeu de ce modèle (feuilles exactes : le vrai jeu turn + river). */
  nashConv(prof: VProfile): number {
    const ev = this.expectedValues(prof), sp = new Map<string, VProfile>();
    return Math.max(0, ev.reduce((t, e, i) => t + this.totalOf(i, this.evalWalk(this.root, i, this.rootReach(), prof, true, sp)) - e, 0));
  }
  solve(iterations: number, every = 100, stopAt = 0) {
    const checks: { iterations: number; nashConv: number }[] = [];
    let profile = this.averageProfile(), nashConv = Infinity;
    for (let done = 0; done < iterations && nashConv > stopAt;) {
      const k = Math.min(every, iterations - done);
      this.run(k); done += k;
      const avg = this.averageProfile(), nc = this.nashConv(avg);
      checks.push({ iterations: this.iterations, nashConv: nc });
      if (nc < nashConv) { nashConv = nc; profile = avg; }
    }
    return { profile, nashConv, checks };
  }

  /**
   * Valeur de chaque action pour chaque main du joueur qui parle au nœud (se coucher = 0), quand tout le monde suit
   * `prof` à la turn et la stratégie calculée à la river (feuilles exactes) : sert à mesurer un conseil dans le vrai jeu.
   */
  actionValues(prof: VProfile, nodeId: number, player: number): number[][] {
    const reach = this.reachAt(prof, nodeId, player), target = this.tree.acts[nodeId], sp = new Map<string, VProfile>();
    const vals = target.children.map(c => this.evalWalk(c, player, reach, prof, false, sp));
    return this.normalize(vals, target, player, reach);
  }
  /** Probabilités d'arrivée au nœud (adversaires seulement : valeurs « contrefactuelles »). */
  reachAt(prof: VProfile, nodeId: number, player: number): Float64Array[] {
    const path: { node: TAct; a: number }[] = [];
    const find = (nd: TNode): boolean => {
      if (nd.t === "end") return false;
      if (nd.id === nodeId) return true;
      for (let a = 0; a < nd.children.length; a++) { path.push({ node: nd, a }); if (find(nd.children[a])) return true; path.pop(); }
      return false;
    };
    if (!find(this.root)) throw new Error("nœud introuvable");
    const reach = this.rootReach();
    for (const { node, a } of path) {
      if (node.player === player) continue;
      const p = node.player, N = this.hands[p].length, s = prof.get(node.id)!, w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = reach[p][x] * s[a * N + x];
      reach[p] = w;
    }
    return reach;
  }
  /** Valeurs des actions divisées par la masse des mains adverses compatibles, plus ce que tu as déjà mis (se coucher = 0). */
  normalize(vals: Float64Array[], target: TAct, player: number, reach: Float64Array[]): number[][] {
    const unit: TEnd = { t: "end", eid: -1, refund: new Array(this.n).fill(1), invested: new Array(this.n).fill(0), folded: new Array(this.n).fill(false), pots: [] };
    const mass = this.showdown(unit, player, reach, false);
    return Array.from({ length: this.hands[player].length }, (_, x) => vals.map(va => (mass[x] > 0 ? va[x] / mass[x] + target.put[player] : 0)));
  }
}
