// Mémoire des spots déjà calculés (D21, comme Pluribus et Modicum) : un spot déjà résolu avec la précision voulue
// revient instantanément ; résolu moins précisément, son calcul reprend là où il s'était arrêté (regrets et moyennes
// gardés), ce qui donne exactement le même résultat qu'un calcul jamais interrompu.
import { VRiver3, type VSpec, type VProfile, type SolverState } from "@/engines/multiway/vriver3";
import { VRiver3Parallel, type VPool } from "@/engines/multiway/vparallel";
import { VRiverN } from "@/engines/multiway/vriverN";

export interface SpotEntry {
  state: SolverState;
  best: { profile: [number, Float64Array][]; nashConv: number; iterations: number };
}
export interface SpotStore { get(key: string): SpotEntry | undefined; set(key: string, e: SpotEntry): void }

/** Mémoire vive, les plus anciens spots partent en premier au-delà de `max`. */
export class MemoryStore implements SpotStore {
  private m = new Map<string, SpotEntry>();
  constructor(readonly max = 20) {}
  get(key: string) {
    const e = this.m.get(key);
    if (e) { this.m.delete(key); this.m.set(key, e); }
    return e;
  }
  set(key: string, e: SpotEntry) {
    this.m.delete(key); this.m.set(key, e);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
  get size() { return this.m.size; }
}

/** Empreinte d'un spot : tout ce qui change le jeu (board, ranges, pot, tapis, tailles, rake, méthode). */
export function spotKey(spec: VSpec, algo = "dcfr"): string {
  const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
  const txt = JSON.stringify([algo, spec.board, spec.potBB, spec.stacks, spec.bets, spec.raise, spec.allin, spec.maxAggr, spec.rake,
    spec.invested0 ?? null, spec.dead ?? null, spec.path ?? null, spec.out ?? null,
    spec.ranges.map(r => r.map(c => `${c.cards[0]}${c.cards[1]}:${r9(c.w)}`))]);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let k = 0; k < txt.length; k++) { const c = txt.charCodeAt(k); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}-${txt.length}`;
}

export interface SolveSpotOptions {
  store?: SpotStore;
  /** Précision visée : NashConv sous cette part du pot (0,001 = 0,1 %). */
  target?: number;
  maxIterations?: number;
  every?: number;
  maxMs?: number;
  /** Ouvriers pour le calcul réparti (sinon calcul d'un seul tenant). */
  pool?: VPool;
}

export async function solveSpot(spec: VSpec, o: SolveSpotOptions = {}) {
  const target = (o.target ?? 0.001) * spec.potBB, key = spotKey(spec), prev = o.store?.get(key);
  if (prev && prev.best.nashConv <= target)
    return { profile: new Map(prev.best.profile) as VProfile, nashConv: prev.best.nashConv, iterations: prev.best.iterations, fromCache: true, resumedFrom: prev.state.iterations, checks: [] as { iterations: number; nashConv: number }[] };

  const max = o.maxIterations ?? 3000, every = o.every ?? 100;
  let res: { profile: VProfile; nashConv: number; iterations: number; checks: { iterations: number; nashConv: number }[] };
  let state: SolverState;
  if (o.pool) {
    const par = new VRiver3Parallel(spec, o.pool);
    await par.init();
    if (prev) await par.importState(prev.state);
    res = await par.solve(Math.max(0, max - par.iterations), every, o.maxMs ?? Infinity, target);
    state = await par.exportState();
  } else {
    const v = spec.ranges.length === 3 ? new VRiver3(spec) : new VRiverN(spec);
    if (prev) v.importState(prev.state);
    res = v.solve(Math.max(0, max - v.iterations), every, target);
    state = v.exportState();
  }
  const keepOld = prev && prev.best.nashConv <= res.nashConv;
  const best = keepOld ? prev!.best : { profile: [...res.profile], nashConv: res.nashConv, iterations: res.iterations };
  o.store?.set(key, { state, best });
  return { profile: new Map(best.profile) as VProfile, nashConv: best.nashConv, iterations: best.iterations, fromCache: false, resumedFrom: prev?.state.iterations ?? 0, checks: res.checks };
}
