// Étape B2 (D31) : la turn « turn seule » sur tous les cœurs. Comme le calcul réparti par fin de main de la river (D26) :
// le fil principal parcourt l'arbre de la turn et garde les regrets ; la valeur « abattage » de chaque fin de turn
// (moyenne sur les rivers) est confiée aux ouvriers, par petits paquets repris au fil de l'eau. Mêmes opérations dans le
// même ordre : mêmes résultats au bit près que le calcul d'un seul tenant (testé).
import { VTurnN, type TurnSpec } from "@/engines/multiway/vturn";
import type { VProfile } from "@/engines/multiway/vriver3";
import type { VPool } from "@/engines/multiway/vparallel";
import type { TAct, TNode } from "@/engines/multiway/betTree";

type Job = { eid: number; i: number; reach: Float64Array[] };
type F = { kind: "end"; k: number } | { kind: "node"; n: TAct; rp: Float64Array; sigma: Float64Array; kids: F[] };

export class VTurnParallel {
  readonly v: VTurnN;
  constructor(readonly spec: TurnSpec, readonly pool: VPool, opts: { sample?: number } = {}) { this.v = new VTurnN(spec, { leaves: "showdown", sample: opts.sample }); }
  get iterations() { return this.v.iterations; }
  async init() { await Promise.all(Array.from({ length: this.pool.size }, (_, w) => this.pool.call(w, { type: "turninit", spec: this.spec }))); }

  private collect(i: number, prof?: VProfile) {
    const v = this.v, jobs: Job[] = [];
    const down = (node: TNode, reach: Float64Array[]): F => {
      if (node.t === "end") { jobs.push({ eid: node.eid, i, reach }); return { kind: "end", k: jobs.length - 1 }; }
      const p = node.player, N = v.handCount(p), sigma = prof ? prof.get(node.id)! : v.strategyNow(node), rp = reach[p];
      const kids = node.children.map((c, a) => {
        if (prof && p === i) return down(c, reach);
        const r = reach.slice(), w = new Float64Array(N);
        for (let x = 0; x < N; x++) w[x] = rp[x] * sigma[a * N + x];
        r[p] = w;
        return down(c, r);
      });
      return { kind: "node", n: node, rp, sigma, kids };
    };
    return { frame: down(v.root, v.rootReach()), jobs };
  }

  private async compute(jobs: Job[], active: number[] | null, factor: number): Promise<Float64Array[]> {
    const S = this.pool.size, size = Math.max(1, Math.min(4, Math.ceil(jobs.length / (S * 4))));
    const out = new Array<Float64Array>(jobs.length);
    let next = 0;
    const worker = async (w: number) => {
      while (next < jobs.length) {
        const from = next; next = Math.min(jobs.length, next + size);
        const res = await this.pool.call(w, { type: "turnvals", jobs: jobs.slice(from, next), active, factor }) as Float64Array[];
        res.forEach((r, j) => { out[from + j] = r; });
      }
    };
    await Promise.all(Array.from({ length: S }, (_, w) => worker(w)));
    return out;
  }

  private ascend(f: F, i: number, vals: Float64Array[], mode: "update" | "ev" | "br", prof?: VProfile): Float64Array {
    if (f.kind === "end") return vals[f.k];
    const v = this.v, kids = f.kids.map(k => this.ascend(k, i, vals, mode, prof)), p = f.n.player;
    if (p !== i) {
      const tot = new Float64Array(v.handCount(i));
      for (const c of kids) for (let x = 0; x < tot.length; x++) tot[x] += c[x];
      return tot;
    }
    if (mode === "update") return v.applyUpdate(f.n, i, f.rp, f.sigma, kids);
    const N = v.handCount(i), out = new Float64Array(N), sig = prof!.get(f.n.id)!;
    for (let x = 0; x < N; x++) {
      if (mode === "br") out[x] = Math.max(...kids.map(c => c[x]));
      else for (let a = 0; a < kids.length; a++) out[x] += sig[a * N + x] * kids[a][x];
    }
    return out;
  }

  async run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.v.setIteration(this.v.iterations + 1);
      const { active, factor } = this.v.drawn;
      for (let i = 0; i < this.v.n; i++) {
        const { frame, jobs } = this.collect(i);
        this.ascend(frame, i, await this.compute(jobs, active, factor), "update");
      }
    }
  }
  averageProfile() { return this.v.averageProfile(); }
  private async value(i: number, prof: VProfile, br: boolean) {
    const { frame, jobs } = this.collect(i, prof);
    return this.v.totalOf(i, this.ascend(frame, i, await this.compute(jobs, null, 1), br ? "br" : "ev", prof));
  }
  async expectedValues(prof: VProfile) { const out: number[] = []; for (let i = 0; i < this.v.n; i++) out.push(await this.value(i, prof, false)); return out; }
  async nashConv(prof: VProfile) {
    const ev = await this.expectedValues(prof); let t = 0;
    for (let i = 0; i < this.v.n; i++) t = t + (await this.value(i, prof, true)) - ev[i];
    return Math.max(0, t);
  }
}
