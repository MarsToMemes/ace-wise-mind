// Web Worker « ouvrier » du solveur de fin de main à la turn (D41) : reçoit un canal vers le chef, puis calcule les
// sous-arbres de river de ses cartes.
import { serveCore } from "@/engines/endgame/parallel";

self.onmessage = (e: MessageEvent<{ port?: MessagePort }>) => { if (e.data?.port) serveCore(e.data.port); };
