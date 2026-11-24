// Web Worker « ouvrier » du calcul multiway (D28) : reçoit un canal vers le chef, puis calcule ce qu'il lui demande.
import { serveCore } from "@/engines/multiway/portPool";

self.onmessage = (e: MessageEvent<{ port?: MessagePort }>) => { if (e.data?.port) serveCore(e.data.port); };
