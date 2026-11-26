// Solveur de fin de main à la turn sur tous les cœurs (D41). Le chef (worker.ts) mène le calcul de la turn ; à chaque
// parcours, il envoie d'un coup toutes ses demandes de river aux ouvriers (une par nœud de hasard) : chaque ouvrier a
// construit le même arbre et ne calcule (et ne met à jour) que ses cartes. Le chef additionne dans l'ordre des cartes :
// même résultat au bit près qu'un calcul sur un cœur.
import { Solver, type ChanceAsk, type ChanceDelegate, type SolverOptions } from "@/engines/endgame/cfr";

export type CoreMsg =
  | { op: "init"; opts: SolverOptions; ks: number[] }
  | { op: "chance"; qs: ChanceAsk[] };

/** Un ouvrier : son solveur et ses cartes de river. */
export class EndgameCore {
  private s: Solver | null = null;
  private ks: number[] = [];
  handle(m: CoreMsg): unknown {
    if (m.op === "init") { this.s = new Solver(m.opts); this.ks = m.ks; return true; }
    return m.qs.map(q => { const vs = this.s!.chanceChildren(q, this.ks); return this.ks.map(k => vs[k]); });
  }
}

export interface Pool { size: number; call(w: number, m: CoreMsg): Promise<unknown>; close?(): void }

/** Cartes de river réparties à tour de rôle entre les ouvriers. */
export const shareCards = (nCards: number, workers: number) =>
  Array.from({ length: workers }, (_, w) => Array.from({ length: nCards }, (_, k) => k).filter(k => k % workers === w));

/** Prépare les ouvriers pour ce solveur et rend la fonction qui leur demande les sous-arbres de river. */
export async function startCores(pool: Pool, opts: SolverOptions, nCards: number): Promise<ChanceDelegate> {
  const parts = shareCards(nCards, pool.size);
  await Promise.all(parts.map((ks, w) => pool.call(w, { op: "init", opts, ks })));
  return async (qs: ChanceAsk[]) => {
    const res = (await Promise.all(parts.map((_, w) => pool.call(w, { op: "chance", qs })))) as Float32Array[][][];
    return qs.map((_, x) => {
      const out: Float32Array[] = [];
      parts.forEach((ks, w) => ks.forEach((k, y) => { out[k] = res[w][x][y]; }));
      return out;
    });
  };
}

/** Ouvriers dans le même programme (tests) : même protocole, sans Web Worker. */
export function inProcessPool(n: number): Pool {
  const cores = Array.from({ length: n }, () => new EndgameCore());
  // copie des messages, comme le ferait un vrai canal (structured clone)
  return { size: n, call: async (w, m) => cores[w].handle(structuredClone(m)) };
}

type Port = { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; close?(): void };

/** Côté chef : un ouvrier par canal (MessagePort) ; chaque appel attend la réponse portant son numéro. */
export function portPool(ports: Port[]): Pool {
  let id = 0;
  const waiting = new Map<number, (r: unknown) => void>();
  ports.forEach(p => { p.onmessage = (e: MessageEvent<{ id: number; r: unknown }>) => { waiting.get(e.data.id)?.(e.data.r); waiting.delete(e.data.id); }; });
  return {
    size: ports.length,
    call: (w, m) => new Promise(res => { const k = ++id; waiting.set(k, res); ports[w].postMessage({ id: k, m }); }),
    close: () => ports.forEach(p => { p.onmessage = null; p.close?.(); }),
  };
}

/** Côté ouvrier : répond aux messages du chef reçus sur ce canal. */
export function serveCore(port: Port) {
  const core = new EndgameCore();
  port.onmessage = (e: MessageEvent<{ id: number; m: CoreMsg }>) => port.postMessage({ id: e.data.id, r: core.handle(e.data.m) });
}

/** Nombre de cartes de river d'un spot (0 à la river : rien à répartir). */
export const riverCards = (opts: SolverOptions) => (opts.street === "Turn" ? 52 - opts.board.length : 0);
