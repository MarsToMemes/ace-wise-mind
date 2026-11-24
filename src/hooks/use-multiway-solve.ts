import { useEffect, useState } from "react";
import type { VSpec } from "@/engines/multiway/vriver3";
import type { EndgameResult } from "@/engines/endgame/solve";
import type { LiveProgress } from "@/engines/multiway/liveSolve";
import { startLive } from "@/engines/multiway/liveClient";
import { isTurnSpec } from "@/engines/multiway/liveSolve";

/** Temps maximum : 60 s à la river, 90 s à la turn (1 % du pot en ≈ 54 s sur un Mac M5 à 10 cœurs, D31). */
export const maxMsFor = (spec: VSpec) => (isTurnSpec(spec) ? 90000 : 60000);

/** Spot multiway à calculer : le jeu, et la décision à afficher (nœud, joueur, main). */
export interface MultiwayJob { spec: VSpec; node: number; player: number; hand: number }
export type MultiwayStatus = "idle" | "running" | "done" | "rough" | "error";
export interface MultiwayState { status: MultiwayStatus; progress: LiveProgress | null; result: EndgameResult | null;
  /** Pourquoi le conseil n'est pas affiché (« rough ») : précision globale insuffisante, ou ligne rare (précision à ta décision). */
  why?: "global" | "local" }

/** Au-delà de cette précision (en % du pot), le conseil du solveur n'est pas affiché : conseil maison (D29). */
export const MULTIWAY_MAX_PCT = 1;
/** Au-delà de cette perte de ta range à ta décision (% du pot), la ligne jouée est jugée rare : conseil maison (D32). */
export const MULTIWAY_LOCAL_MAX_PCT = 1;

// une situation déjà calculée pendant la visite n'est pas recalculée (et la mémoire IndexedDB la garde après)
const cache = new Map<string, EndgameResult>();

/** Lance le solveur multiway (Web Workers, au fil de l'eau) dès que la situation change (clé). */
export function useMultiwaySolve(job: MultiwayJob | null, key: string): MultiwayState {
  const [state, setState] = useState<MultiwayState>({ status: "idle", progress: null, result: null });
  useEffect(() => {
    if (!job) { setState({ status: "idle", progress: null, result: null }); return; }
    const hit = cache.get(key);
    if (hit) { setState({ status: "done", progress: null, result: hit }); return; }
    setState({ status: "running", progress: null, result: null });
    let live = true;
    // petite attente : on ne lance pas un calcul à chaque frappe
    let run: ReturnType<typeof startLive> | null = null;
    const timer = setTimeout(() => {
      run = startLive(job.spec, { target: 0.001, maxMs: maxMsFor(job.spec), maxIterations: 5000, watch: { node: job.node, player: job.player, hand: job.hand } },
        p => { if (live) setState(s => ({ ...s, progress: p })); });
      run.done.then(d => {
        if (!live) return;
        const r = d.report ?? null;
        const local = r ? (r.localPct ?? 0) > MULTIWAY_LOCAL_MAX_PCT : false;
        if (r && r.exploitPct <= MULTIWAY_MAX_PCT && !local) { cache.set(key, r); setState(s => ({ ...s, status: "done", result: r })); }
        else setState(s => ({ ...s, status: "rough", result: r, why: r && r.exploitPct <= MULTIWAY_MAX_PCT ? "local" : "global" }));
      }, () => { if (live) setState({ status: "error", progress: null, result: null }); });
    }, 350);
    return () => { live = false; clearTimeout(timer); run?.cancel(); };
    // la clé résume la situation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
