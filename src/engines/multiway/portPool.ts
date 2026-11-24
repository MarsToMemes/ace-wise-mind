// Ouvriers du calcul réparti reliés par des canaux de messages (MessagePort) : dans le navigateur, la page crée un
// Web Worker « chef » (qui mène le calcul) et des Web Workers « ouvriers », puis les relie deux à deux par un canal.
// La page ne fait donc aucun calcul et ne se fige jamais.
import { WorkerCore, type VPool, type WorkerMsg } from "@/engines/multiway/vparallel";

type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; close?(): void };

/** Côté chef : un ouvrier par canal ; chaque appel attend la réponse portant son numéro. */
export function portPool(ports: Port[]): VPool {
  let id = 0;
  const waiting = new Map<number, (r: unknown) => void>();
  ports.forEach(p => { p.onmessage = (e: MessageEvent<{ id: number; r: unknown }>) => { waiting.get(e.data.id)?.(e.data.r); waiting.delete(e.data.id); }; });
  return {
    size: ports.length,
    call: (w, msg: WorkerMsg) => new Promise(res => { const k = ++id; waiting.set(k, res); ports[w].postMessage({ id: k, msg }); }),
    close: () => ports.forEach(p => { p.onmessage = null; p.close?.(); }),
  };
}

/** Côté ouvrier : répond aux messages du chef reçus sur ce canal. */
export function serveCore(port: Port) {
  const core = new WorkerCore();
  port.onmessage = (e: MessageEvent<{ id: number; msg: WorkerMsg }>) => port.postMessage({ id: e.data.id, r: core.handle(e.data.msg) });
}
