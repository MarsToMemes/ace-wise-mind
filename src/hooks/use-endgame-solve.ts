import { useEffect, useRef, useState } from "react";
import type { EndgameInput, EndgameResult } from "@/engines/endgame/solve";

export type EndgameStatus = "idle" | "running" | "done" | "none" | "error";
export interface EndgameState { status: EndgameStatus; progress: number; result: EndgameResult | null }

// une situation déjà calculée n'est pas recalculée
const cache = new Map<string, EndgameResult | null>();

/** Lance le solveur de fin de main dans un Web Worker dès que la situation change (clé). */
export function useEndgameSolve(input: Omit<EndgameInput, "onProgress"> | null, key: string): EndgameState {
  const [state, setState] = useState<EndgameState>({ status: "idle", progress: 0, result: null });
  const worker = useRef<Worker | null>(null);
  const cores = useRef<Worker[]>([]);
  const stopAll = () => {
    worker.current?.terminate();
    worker.current = null;
    cores.current.forEach(c => c.terminate());
    cores.current = [];
  };

  useEffect(() => {
    if (!input) { setState({ status: "idle", progress: 0, result: null }); return; }
    if (cache.has(key)) {
      const r = cache.get(key)!;
      setState({ status: r ? "done" : "none", progress: 1, result: r });
      return;
    }
    setState({ status: "running", progress: 0, result: null });
    // petite attente : on ne lance pas un calcul à chaque frappe
    const timer = setTimeout(() => {
      stopAll();
      const w = new Worker(new URL("../engines/endgame/worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      // turn : un ouvrier par cœur (moins un, 8 au plus) qui se partagent les cartes de river (D41)
      const cpus = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
      const nCores = input.street === "Turn" && cpus >= 3 ? Math.min(8, cpus - 1) : 0;
      cores.current = Array.from({ length: nCores }, () => new Worker(new URL("../engines/endgame/coreWorker.ts", import.meta.url), { type: "module" }));
      const ports = cores.current.map(c => { const ch = new MessageChannel(); c.postMessage({ port: ch.port2 }, [ch.port2]); return ch.port1; });
      w.onmessage = (e: MessageEvent<{ progress?: number; partial?: EndgameResult; result?: EndgameResult | null; error?: string }>) => {
        const d = e.data;
        if (d.progress != null) { setState(s => ({ ...s, progress: d.progress! })); return; }
        // premier conseil (turn, D41) : affiché tout de suite, le calcul continue
        if (d.partial) { setState(s => ({ ...s, status: "running", result: d.partial! })); return; }
        if (d.error) { setState({ status: "error", progress: 0, result: null }); stopAll(); return; }
        cache.set(key, d.result ?? null);
        setState({ status: d.result ? "done" : "none", progress: 1, result: d.result ?? null });
        stopAll();
      };
      w.postMessage({ id: 1, input, ports }, ports);
    }, 350);
    return () => {
      clearTimeout(timer);
      stopAll();
    };
    // la clé résume l'entrée
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
