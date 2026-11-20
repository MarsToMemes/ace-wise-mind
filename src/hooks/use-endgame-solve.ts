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
      worker.current?.terminate();
      const w = new Worker(new URL("../engines/endgame/worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      w.onmessage = (e: MessageEvent<{ progress?: number; result?: EndgameResult | null; error?: string }>) => {
        const d = e.data;
        if (d.progress != null) { setState(s => ({ ...s, progress: d.progress! })); return; }
        if (d.error) { setState({ status: "error", progress: 0, result: null }); w.terminate(); return; }
        cache.set(key, d.result ?? null);
        setState({ status: d.result ? "done" : "none", progress: 1, result: d.result ?? null });
        w.terminate();
        if (worker.current === w) worker.current = null;
      };
      w.postMessage({ id: 1, input });
    }, 350);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
    // la clé résume l'entrée
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
