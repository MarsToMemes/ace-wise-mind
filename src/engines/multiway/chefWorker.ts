// Web Worker « chef » du calcul multiway (D28) : mène le calcul au fil de l'eau avec les ouvriers reçus (canaux), garde
// les spots dans IndexedDB, envoie la progression à la page. La page ne calcule rien et ne se fige jamais.
import type { VSpec } from "@/engines/multiway/vriver3";
import { solveLive, type LiveOptions } from "@/engines/multiway/liveSolve";
import { portPool } from "@/engines/multiway/portPool";
import { IdbStore } from "@/engines/multiway/idbStore";
import { multiwayResult, turnResult } from "@/engines/multiway/nodeValues";
import { isTurnSpec } from "@/engines/multiway/liveSolve";
import { VTurnParallel } from "@/engines/multiway/vturnParallel";
import type { TurnSpec } from "@/engines/multiway/vturn";
import type { VProfile } from "@/engines/multiway/vriver3";
import type { VPool } from "@/engines/multiway/vparallel";

/** Turn : ce que rapporte chaque action, calculé par les ouvriers (D32). */
async function turnValuesOnAllCores(spec: TurnSpec, pool: VPool, prof: VProfile, w: { node: number; player: number }) {
  const par = new VTurnParallel(spec, pool);
  await par.init();
  return par.actionValues(prof, w.node, w.player);
}

export type ChefIn =
  | { type: "start"; spec: VSpec; opts: Pick<LiveOptions, "target" | "maxMs" | "every" | "maxIterations" | "watch">; ports: MessagePort[] }
  | { type: "stop" };

const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<ChefIn>) => void) | null };
let stop = false;
const store = new IdbStore();

ctx.onmessage = async e => {
  const m = e.data;
  if (m.type === "stop") { stop = true; return; }
  const pool = m.ports.length >= 2 ? portPool(m.ports) : undefined, t0 = Date.now();
  try {
    const res = await solveLive(m.spec, { ...m.opts, pool, store, shouldStop: () => stop, onProgress: p => ctx.postMessage({ type: "progress", p }) });
    // à la page : la stratégie du nœud suivi pour toutes les mains du joueur (pas tout l'arbre), et le résultat prêt à
    // afficher (actions de ta main, ce qu'elles rapportent, ta range ici)
    const w = m.opts.watch, node = w ? res.profile.get(w.node) : undefined;
    const meta = { nashConv: res.nashConv, iterations: res.iterations, ms: Date.now() - t0 };
    const report = !w || !res.profile.size ? undefined
      : isTurnSpec(m.spec) ? turnResult(m.spec, res.profile, w.node, w.player, w.hand, meta, pool ? await turnValuesOnAllCores(m.spec, pool, res.profile, w) : undefined)
      : multiwayResult(m.spec, res.profile, w.node, w.player, w.hand, meta);
    if (report && res.reason === "cache") report.fromMemory = true;
    ctx.postMessage({ type: "done", result: { nashConv: res.nashConv, iterations: res.iterations, reason: res.reason, ms: Date.now() - t0, resumedFrom: res.resumedFrom, node, report } });
  } catch (err) {
    ctx.postMessage({ type: "error", message: String(err) });
  } finally { pool?.close?.(); }
};
