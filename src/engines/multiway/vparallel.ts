// Calcul réparti du solveur river à 3 (D20) : le haut de l'arbre d'enchères reste sur le fil principal, les sous-arbres
// du dessous sont confiés à des « ouvriers » (Web Workers dans le navigateur, worker_threads sous Node). Chaque ouvrier
// garde les regrets de ses sous-arbres. À chaque parcours, le fil principal calcule les probabilités d'arrivée en haut de
// l'arbre (elles ne dépendent que des regrets d'avant ce parcours), envoie les sous-arbres en parallèle, puis fait la
// remontée et les mises à jour du haut exactement comme le calcul d'un seul tenant : mêmes opérations, même ordre, donc
// mêmes résultats (vérifié par test).
import { VRiver3, type VSpec, type VProfile, type SolverState } from "@/engines/multiway/vriver3";
import { VRiverN } from "@/engines/multiway/vriverN";

/** Moteur de calcul : river à 3 joueurs (vriver3) ou exact à n joueurs (vriverN, D25). Mêmes méthodes. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Engine = VRiver3 | VRiverN;
const makeEngine = (spec: VSpec, algo?: "cfr+" | "dcfr") => (spec.ranges.length === 3 ? new VRiver3(spec, { algo }) : new VRiverN(spec, { algo }));
const players = (spec: VSpec) => spec.ranges.length;

type Job = { key: string; reach: Float64Array[] };
export type WorkerMsg =
  | { type: "init"; spec: VSpec; algo?: "cfr+" | "dcfr"; keys: string[] }
  | { type: "walk"; t: number; i: number; jobs: Job[] }
  | { type: "eval"; i: number; br: boolean; which: "avg" | "best"; jobs: Job[] }
  | { type: "snapshot" }
  | { type: "profile"; which: "avg" | "best" }
  | { type: "export" }
  | { type: "import"; state: SolverState };

/** Ce que fait un ouvrier ; partagé par toutes les façons de le lancer (même fil, Web Worker, worker_threads). */
export class WorkerCore {
  private v?: Engine;
  private ids: number[] = [];
  private avg?: VProfile;
  private best?: VProfile;
  handle(m: WorkerMsg): unknown {
    switch (m.type) {
      case "init":
        this.v = makeEngine(m.spec, m.algo);
        this.ids = m.keys.flatMap(k => this.v!.subtree(k).acts);
        return null;
      case "walk": {
        this.avg = undefined;
        this.v!.setIteration(m.t);
        return m.jobs.map(j => this.v!.walkKey(j.key, m.i, j.reach));
      }
      case "eval": {
        const prof = m.which === "best" ? this.best! : (this.avg ??= this.v!.averageProfile(this.ids));
        return m.jobs.map(j => this.v!.evalKey(j.key, m.i, j.reach, prof, m.br));
      }
      case "snapshot":
        this.best = this.avg ??= this.v!.averageProfile(this.ids);
        return null;
      case "export":
        return this.v!.exportState(this.ids);
      case "import":
        this.avg = undefined;
        this.v!.importState(m.state, this.ids);
        return null;
      case "profile": {
        const p = m.which === "best" ? this.best! : (this.avg ??= this.v!.averageProfile(this.ids));
        return [...p.entries()];
      }
    }
  }
}

/** Un groupe d'ouvriers. `call` envoie un message à l'ouvrier w et rend sa réponse. */
export interface VPool { size: number; call(w: number, msg: WorkerMsg): Promise<unknown>; close?(): void }

/** Ouvriers simulés dans le même fil : sert aux tests (mêmes résultats que les vrais ouvriers, sans parallélisme). */
export function inProcessPool(size: number): VPool {
  const cores = Array.from({ length: size }, () => new WorkerCore());
  return { size, call: async (w, msg) => cores[w].handle(msg) };
}

type Frame =
  | { kind: "job"; w: number; idx: number }
  | { kind: "node"; n: any; rp: Float64Array; sigma: Float64Array; kids: Frame[] };

export class VRiver3Parallel {
  readonly v: any;
  private owner = new Map<string, number>();
  private top = new Set<number>();
  private mainBest?: VProfile;
  iterations = 0;

  constructor(readonly spec: VSpec, readonly pool: VPool, readonly opts: { algo?: "cfr+" | "dcfr"; depth?: number } = {}) {
    this.v = makeEngine(spec, opts.algo);
  }

  /** Découpe l'arbre : descend jusqu'à avoir assez de sous-arbres, puis les répartit par nombre de fins de main. */
  async init() {
    const v = this.v, want = 4 * this.pool.size;
    let depth = this.opts.depth ?? 1, frontier: string[] = [];
    for (;; depth++) {
      frontier = []; this.top.clear();
      const rec = (key: string, d: number) => {
        const n = v.nodeOf(key);
        if (d === depth || n.t === "end") { frontier.push(key); return; }
        this.top.add(n.id);
        n.children.forEach(c => rec(v.keyOf(c), d + 1));
      };
      rec(v.keyOf(v.root), 0);
      if (this.opts.depth !== undefined || frontier.length >= want || frontier.every(k => k[0] === "e")) break;
    }
    const load = new Array(this.pool.size).fill(0), keys: string[][] = Array.from({ length: this.pool.size }, () => []);
    frontier.map(k => ({ k, c: v.subtree(k).ends })).sort((a, b) => b.c - a.c).forEach(({ k, c }) => {
      const w = load.indexOf(Math.min(...load));
      load[w] += c; keys[w].push(k); this.owner.set(k, w);
    });
    await Promise.all(keys.map((ks, w) => this.pool.call(w, { type: "init", spec: this.spec, algo: this.opts.algo, keys: ks })));
  }

  /** Descente : probabilités d'arrivée en haut de l'arbre, sous-arbres mis en file par ouvrier. */
  private descend(key: string, reach: Float64Array[], jobs: Job[][]): Frame {
    const v = this.v, n = v.nodeOf(key);
    if (n.t === "end" || !this.top.has(n.id)) {
      const w = this.owner.get(key)!;
      jobs[w].push({ key, reach });
      return { kind: "job", w, idx: jobs[w].length - 1 };
    }
    const p = n.player, N = v.handCount(p), sigma = v.strategyNow(n), rp = reach[p];
    const kids = n.children.map((c, a) => {
      const r = reach.slice(), w = new Float64Array(N);
      for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
      r[p] = w;
      return this.descend(v.keyOf(c), r, jobs);
    });
    return { kind: "node", n, rp, sigma, kids };
  }

  /** Remontée identique à VRiver3.walk (mêmes additions, même ordre). */
  private ascend(f: Frame, i: number, res: Float64Array[][], update: boolean, br = false, prof?: VProfile): Float64Array {
    if (f.kind === "job") return res[f.w][f.idx];
    const v = this.v, p = f.n.player, vals = f.kids.map(k => this.ascend(k, i, res, update, br, prof));
    if (p !== i) {
      const tot = new Float64Array(v.handCount(i));
      for (const val of vals) for (let x = 0; x < tot.length; x++) tot[x] += val[x];
      return tot;
    }
    if (update) return v.applyUpdate(f.n, i, f.rp, f.sigma, vals);
    const N = v.handCount(i), out = new Float64Array(N), sig = prof!.get(f.n.id)!;
    for (let x = 0; x < N; x++) {
      if (br) out[x] = Math.max(...vals.map(c => c[x]));
      else for (let a = 0; a < vals.length; a++) out[x] += sig[a * N + x] * vals[a][x];
    }
    return out;
  }

  private async traverse(i: number) {
    const jobs: Job[][] = Array.from({ length: this.pool.size }, () => []);
    const frame = this.descend(this.v.keyOf(this.v.root), this.v.rootReach(), jobs);
    const res = (await Promise.all(jobs.map((js, w) => (js.length ? this.pool.call(w, { type: "walk", t: this.iterations, i, jobs: js }) : Promise.resolve([]))))) as Float64Array[][];
    this.ascend(frame, i, res, true);
  }

  async run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.iterations++;
      this.v.setIteration(this.iterations);
      for (let i = 0; i < players(this.spec); i++) await this.traverse(i);
    }
  }

  /** Évaluation (valeur ou meilleure réponse) d'un profil : moyenne courante (« avg ») ou meilleure gardée (« best »). */
  private async evaluate(i: number, br: boolean, which: "avg" | "best"): Promise<number> {
    const v = this.v, prof = which === "best" ? this.mainBest! : v.averageProfile([...this.top]);
    // descente avec le profil évalué (et non la stratégie du moment)
    const jobs: Job[][] = Array.from({ length: this.pool.size }, () => []);
    const down = (key: string, reach: Float64Array[]): Frame => {
      const n = v.nodeOf(key);
      if (n.t === "end" || !this.top.has(n.id)) {
        const w = this.owner.get(key)!; jobs[w].push({ key, reach });
        return { kind: "job", w, idx: jobs[w].length - 1 };
      }
      const p = n.player, N = v.handCount(p), sig = prof.get(n.id)!, rp = reach[p];
      const kids = n.children.map((c, a) => {
        if (p === i) return down(v.keyOf(c), reach);
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = rp[x] * sig[a * N + x];
        r[p] = w;
        return down(v.keyOf(c), r);
      });
      return { kind: "node", n, rp, sigma: sig, kids };
    };
    const frame = down(v.keyOf(v.root), v.rootReach());
    const res = (await Promise.all(jobs.map((js, w) => (js.length ? this.pool.call(w, { type: "eval", i, br, which, jobs: js }) : Promise.resolve([]))))) as Float64Array[][];
    return v.totalOf(i, this.ascend(frame, i, res, false, br, prof));
  }

  async expectedValues(which: "avg" | "best" = "avg") { return Promise.all(Array.from({ length: players(this.spec) }, (_, i) => this.evaluate(i, false, which))); }
  async nashConv(which: "avg" | "best" = "avg") {
    const ev = await this.expectedValues(which), brv = await Promise.all(Array.from({ length: players(this.spec) }, (_, i) => this.evaluate(i, true, which)));
    return Math.max(0, brv.reduce((t, b, i) => t + b - ev[i], 0));
  }

  /** Profil complet (haut de l'arbre + sous-arbres des ouvriers). */
  async averageProfile(which: "avg" | "best" = "avg"): Promise<VProfile> {
    const out: VProfile = which === "best" ? new Map(this.mainBest) : this.v.averageProfile([...this.top]);
    const parts = (await Promise.all(Array.from({ length: this.pool.size }, (_, w) => this.pool.call(w, { type: "profile", which })))) as [number, Float64Array][][];
    for (const part of parts) for (const [id, s] of part) out.set(id, s);
    return out;
  }

  /** État complet (haut de l'arbre + ouvriers), pour la mémoire des spots (D21). */
  async exportState(): Promise<SolverState> {
    const top = this.v.exportState([...this.top]);
    const parts = (await Promise.all(Array.from({ length: this.pool.size }, (_, w) => this.pool.call(w, { type: "export" })))) as SolverState[];
    return { iterations: this.iterations, regret: [...top.regret, ...parts.flatMap(p => p.regret)], sum: [...top.sum, ...parts.flatMap(p => p.sum)] };
  }
  async importState(st: SolverState) {
    this.iterations = st.iterations;
    this.v.importState(st, [...this.top]);
    await Promise.all(Array.from({ length: this.pool.size }, (_, w) => this.pool.call(w, { type: "import", state: st })));
  }

  /** Comme VRiver3.solve : contrôle toutes les `every` itérations, garde la meilleure stratégie mesurée. */
  async solve(iterations: number, every = 100, maxMs = Infinity, stopAt = 0) {
    const t0 = Date.now(), checks: { iterations: number; nashConv: number; ms: number }[] = [];
    let nashConv = Infinity, at = 0;
    for (let done = 0; done < iterations && Date.now() - t0 < maxMs && nashConv > stopAt;) {
      const k = Math.min(every, iterations - done);
      await this.run(k); done += k;
      const nc = await this.nashConv("avg");
      checks.push({ iterations: this.iterations, nashConv: nc, ms: Date.now() - t0 });
      if (nc < nashConv) {
        nashConv = nc; at = this.iterations;
        this.mainBest = this.v.averageProfile([...this.top]);
        await Promise.all(Array.from({ length: this.pool.size }, (_, w) => this.pool.call(w, { type: "snapshot" })));
      }
    }
    return { profile: await this.averageProfile("best"), nashConv, iterations: at, checks };
  }
}
