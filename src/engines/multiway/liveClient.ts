// Côté page (D28) : lance le calcul multiway dans des Web Workers (un chef + des ouvriers reliés par des canaux).
// Ouvriers : un par cœur moins un, 8 au plus (le gain plafonne vers ×2,6 sur un Mac M5, D26) ; aucun sous 3 cœurs.
import type { VSpec } from "@/engines/multiway/vriver3";
import type { LiveProgress, LiveReason } from "@/engines/multiway/liveSolve";
import type { ChefIn } from "@/engines/multiway/chefWorker";

export interface LiveDone { nashConv: number; iterations: number; reason: LiveReason; ms: number; resumedFrom: number; node?: Float64Array }
export interface LiveRun { done: Promise<LiveDone>; /** arrêt propre au prochain contrôle (état gardé) */ stop(): void; /** arrêt immédiat */ cancel(): void; workers: number }

/** Contrôles plus fréquents à 4 joueurs (itérations plus longues) pour afficher vite un premier conseil. */
export const everyFor = (players: number) => (players >= 4 ? 10 : 50);

export function startLive(spec: VSpec, opts: Extract<ChefIn, { type: "start" }>["opts"], onProgress: (p: LiveProgress) => void): LiveRun {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  const n = cores >= 3 ? Math.min(8, cores - 1) : 0;
  const chef = new Worker(new URL("./chefWorker.ts", import.meta.url), { type: "module" });
  const workers = Array.from({ length: n }, () => new Worker(new URL("./coreWorker.ts", import.meta.url), { type: "module" }));
  const ports = workers.map(w => { const c = new MessageChannel(); w.postMessage({ port: c.port2 }, [c.port2]); return c.port1; });
  const kill = () => { chef.terminate(); workers.forEach(w => w.terminate()); };
  const done = new Promise<LiveDone>((res, rej) => {
    chef.onmessage = (e: MessageEvent<{ type: string; p?: LiveProgress; result?: LiveDone; message?: string }>) => {
      const d = e.data;
      if (d.type === "progress") onProgress(d.p!);
      else if (d.type === "done") { kill(); res(d.result!); }
      else { kill(); rej(new Error(d.message)); }
    };
    chef.onerror = ev => { kill(); rej(new Error(ev.message)); };
  });
  chef.postMessage({ type: "start", spec, opts: { every: everyFor(spec.ranges.length), ...opts }, ports } satisfies ChefIn, ports);
  return { done, stop: () => chef.postMessage({ type: "stop" } satisfies ChefIn), cancel: kill, workers: n };
}
