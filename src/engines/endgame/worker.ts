// Calcul du solveur de fin de main en arrière-plan (Web Worker) : la page ne se fige pas.
import { solveEndgame, type EndgameInput } from "@/engines/endgame/solve";

type Msg = { id: number; input: Omit<EndgameInput, "onProgress"> };
const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Msg>) => void) | null };

ctx.onmessage = (e) => {
  const { id, input } = e.data;
  try {
    const result = solveEndgame({ ...input, onProgress: progress => ctx.postMessage({ id, progress }) });
    ctx.postMessage({ id, result });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
