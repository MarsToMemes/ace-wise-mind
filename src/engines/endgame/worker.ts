// Calcul du solveur de fin de main en arrière-plan (Web Worker) : la page ne se fige pas. À la turn, avec des ouvriers
// (canaux reçus de la page), les cartes de river sont réparties sur tous les cœurs (D41) ; même résultat, plus vite.
import { solveEndgame, solveEndgameAsync, type EndgameInput } from "@/engines/endgame/solve";
import { portPool, riverCards, startCores } from "@/engines/endgame/parallel";

type Msg = { id: number; input: Omit<EndgameInput, "onProgress">; ports?: MessagePort[] };
const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Msg>) => void) | null };

ctx.onmessage = async (e) => {
  const { id, input, ports } = e.data;
  const pool = ports && ports.length >= 2 && input.street === "Turn" ? portPool(ports) : null;
  try {
    const onProgress = (progress: number) => ctx.postMessage({ id, progress });
    const result = pool
      ? await solveEndgameAsync({ ...input, onProgress }, o => startCores(pool, o, riverCards(o)))
      : solveEndgame({ ...input, onProgress });
    ctx.postMessage({ id, result, workers: pool?.size ?? 0 });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  } finally { pool?.close?.(); }
};
