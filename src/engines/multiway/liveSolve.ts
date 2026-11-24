// Étape A2 (docs/DECISIONS.md D28) : calcul au fil de l'eau. Le solveur avance par morceaux de `every` itérations ;
// après chaque morceau, la précision (NashConv) est mesurée, la meilleure stratégie gardée, le conseil de la main suivie
// envoyé à l'écran, et l'état sauvé dans la mémoire des spots. Arrêt à la précision visée, au temps maximum, au nombre
// maximal d'itérations ou sur demande ; un calcul interrompu reprend exactement là où il s'était arrêté (mêmes
// opérations, même ordre : même résultat au bit près qu'un calcul jamais interrompu, testé).
import { VRiver3, type VSpec, type VProfile, type SolverState } from "@/engines/multiway/vriver3";
import { VRiverN } from "@/engines/multiway/vriverN";
import { VRiver3Parallel, VRiverNTerminalParallel, type VPool } from "@/engines/multiway/vparallel";
import { spotKey, type SpotEntry } from "@/engines/multiway/spotCache";
import { VTurnN, type TurnSpec } from "@/engines/multiway/vturn";
import { VTurnParallel } from "@/engines/multiway/vturnParallel";

/** Turn (D32) : méthode « turn seule », 16 rivers tirées par itération (le bon réglage avec les vraies ranges, D31). */
export const TURN_SAMPLE = 16;
export const isTurnSpec = (s: VSpec): s is TurnSpec => "river" in s;

/** Mémoire des spots asynchrone (IndexedDB dans le navigateur, mémoire vive pour les tests). */
export interface AsyncSpotStore { get(key: string): Promise<SpotEntry | undefined>; set(key: string, e: SpotEntry): Promise<void> }

export class AsyncMemoryStore implements AsyncSpotStore {
  private m = new Map<string, SpotEntry>();
  constructor(readonly max = 20) {}
  async get(key: string) {
    const e = this.m.get(key);
    if (e) { this.m.delete(key); this.m.set(key, e); }
    return e;
  }
  async set(key: string, e: SpotEntry) {
    this.m.delete(key); this.m.set(key, e);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
}

export interface LiveProgress {
  iterations: number;
  /** Précision de la meilleure stratégie mesurée, en % du pot (plus petit = plus précis). */
  nashConvPct: number;
  ms: number;
  /** Fréquence de chaque action pour la main suivie, au nœud suivi (meilleure stratégie mesurée). */
  strategy?: number[];
  done: boolean;
  reason?: LiveReason;
}
export type LiveReason = "target" | "max" | "time" | "stopped" | "cache";

export interface LiveOptions {
  pool?: VPool;
  store?: AsyncSpotStore;
  /** Précision visée : NashConv sous cette part du pot (0,001 = 0,1 %). */
  target?: number;
  maxIterations?: number;
  every?: number;
  maxMs?: number;
  /** Décision suivie : nœud de l'arbre, joueur, index de sa main. */
  watch?: { node: number; player: number; hand: number };
  onProgress?: (p: LiveProgress) => void;
  /** Demande d'arrêt, lue après chaque contrôle. */
  shouldStop?: () => boolean;
}

export interface LiveResult { profile: VProfile; nashConv: number; iterations: number; reason: LiveReason; resumedFrom: number; ms: number }

/** Les trois façons de calculer (d'un seul tenant, ouvriers par sous-arbres, ouvriers par fins de main), vues pareil. */
interface Runner {
  iterations(): number;
  init(): Promise<void>;
  run(k: number): Promise<void>;
  /** Précision de la stratégie moyenne actuelle, et cette stratégie (complète) si on la garde. */
  check(): Promise<{ nc: number; profile: () => Promise<VProfile> }>;
  exportState(): Promise<SolverState>;
  importState(s: SolverState): Promise<void>;
  handCount(p: number): number;
}

function runner(spec: VSpec, pool?: VPool): Runner {
  if (isTurnSpec(spec)) {
    if (!pool) {
      const v = new VTurnN(spec, { leaves: "showdown", sample: TURN_SAMPLE });
      return {
        iterations: () => v.iterations, init: async () => {}, run: async k => v.run(k),
        check: async () => { const avg = v.averageProfile(); return { nc: v.nashConv(avg), profile: async () => avg }; },
        exportState: async () => v.exportState(), importState: async s => v.importState(s), handCount: p => v.handCount(p),
      };
    }
    const par = new VTurnParallel(spec, pool, { sample: TURN_SAMPLE });
    return {
      iterations: () => par.iterations, init: () => par.init(), run: k => par.run(k),
      check: async () => { const avg = par.averageProfile(); return { nc: await par.nashConv(avg), profile: async () => avg }; },
      exportState: async () => par.exportState(), importState: async s => par.importState(s), handCount: p => par.v.handCount(p),
    };
  }
  if (!pool) {
    const v = spec.ranges.length === 3 ? new VRiver3(spec) : new VRiverN(spec);
    return {
      iterations: () => v.iterations, init: async () => {}, run: async k => v.run(k),
      check: async () => { const avg = v.averageProfile(); return { nc: v.nashConv(avg), profile: async () => avg }; },
      exportState: async () => v.exportState(), importState: async s => v.importState(s), handCount: p => v.handCount(p),
    };
  }
  if (spec.ranges.length === 3) {
    const par = new VRiver3Parallel(spec, pool);
    return {
      iterations: () => par.iterations, init: () => par.init(), run: k => par.run(k),
      check: async () => ({ nc: await par.nashConv("avg"), profile: () => par.averageProfile("avg") }),
      exportState: () => par.exportState(), importState: s => par.importState(s), handCount: p => par.v.handCount(p),
    };
  }
  const par = new VRiverNTerminalParallel(spec, pool);
  return {
    iterations: () => par.iterations, init: () => par.init(), run: k => par.run(k),
    check: async () => { const avg = par.averageProfile(); return { nc: await par.nashConv(avg), profile: async () => avg }; },
    exportState: async () => par.exportState(), importState: async s => par.importState(s), handCount: p => par.v.handCount(p),
  };
}

export async function solveLive(spec: VSpec, o: LiveOptions = {}): Promise<LiveResult> {
  const t0 = Date.now(), target = (o.target ?? 0.001) * spec.potBB, key = spotKey(spec), prev = await o.store?.get(key);
  const max = o.maxIterations ?? 3000, every = o.every ?? 100, maxMs = o.maxMs ?? Infinity;
  const pct = (nc: number) => (100 * nc) / spec.potBB;
  let r: Runner | undefined;
  const strategyOf = (prof: VProfile) => {
    const w = o.watch, s = w && prof.get(w.node);
    if (!w || !s) return undefined;
    const N = r ? r.handCount(w.player) : s.length, A = s.length / N;
    return Array.from({ length: A }, (_, a) => s[a * N + w.hand]);
  };
  if (prev && prev.best.nashConv <= target) {
    const profile = new Map(prev.best.profile) as VProfile;
    r = runner(spec);
    o.onProgress?.({ iterations: prev.best.iterations, nashConvPct: pct(prev.best.nashConv), ms: Date.now() - t0, strategy: strategyOf(profile), done: true, reason: "cache" });
    return { profile, nashConv: prev.best.nashConv, iterations: prev.best.iterations, reason: "cache", resumedFrom: prev.state.iterations, ms: Date.now() - t0 };
  }

  r = runner(spec, o.pool);
  await r.init();
  if (prev) await r.importState(prev.state);
  let best = prev ? { profile: new Map(prev.best.profile) as VProfile, nashConv: prev.best.nashConv, iterations: prev.best.iterations }
    : { profile: new Map() as VProfile, nashConv: Infinity, iterations: 0 };
  let reason: LiveReason = "max";
  while (r.iterations() < max) {
    // morceaux alignés sur les multiples de `every` : un calcul repris contrôle aux mêmes itérations
    await r.run(Math.min(every - (r.iterations() % every), max - r.iterations()));
    const c = await r.check();
    if (c.nc < best.nashConv) best = { profile: await c.profile(), nashConv: c.nc, iterations: r.iterations() };
    const it = r.iterations(), ms = Date.now() - t0;
    const stop: LiveReason | null = best.nashConv <= target ? "target" : it >= max ? "max" : ms >= maxMs ? "time" : o.shouldStop?.() ? "stopped" : null;
    await o.store?.set(key, { state: await r.exportState(), best: { profile: [...best.profile], nashConv: best.nashConv, iterations: best.iterations } });
    o.onProgress?.({ iterations: it, nashConvPct: pct(best.nashConv), ms, strategy: strategyOf(best.profile), done: !!stop, reason: stop ?? undefined });
    if (stop) { reason = stop; break; }
  }
  return { profile: best.profile, nashConv: best.nashConv, iterations: best.iterations, reason, resumedFrom: prev?.state.iterations ?? 0, ms: Date.now() - t0 };
}
