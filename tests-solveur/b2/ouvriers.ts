// B2 — Les ouvriers du solveur de fin de main (D41), en fils de calcul Node : le même code que les Web Workers du site
// (src/engines/endgame/parallel.ts), empaqueté par esbuild dans un dossier temporaire.
import { Worker } from "node:worker_threads";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import type { Pool } from "@/engines/endgame/parallel";

let bundle: string | null = null;

async function workerFile(): Promise<string> {
  if (bundle) return bundle;
  const dir = mkdtempSync(join(tmpdir(), "banc-ouvriers-"));
  const entry = join(dir, "entree.ts");
  writeFileSync(entry, `import { parentPort } from "node:worker_threads";
import { EndgameCore } from "@/engines/endgame/parallel";
const core = new EndgameCore();
parentPort!.on("message", ({ id, m }) => parentPort!.postMessage({ id, r: core.handle(m) }));
`);
  bundle = join(dir, "ouvrier.cjs");
  await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", outfile: bundle, alias: { "@": resolve(process.cwd(), "src") }, logLevel: "error" });
  return bundle;
}

/** Autant d'ouvriers que le site en lance (un par cœur moins un, 8 au plus). */
export async function nodePool(n: number): Promise<Pool & { kill(): void }> {
  const file = await workerFile();
  const ws = Array.from({ length: n }, () => new Worker(file));
  let id = 0;
  const wait = new Map<number, (r: unknown) => void>();
  ws.forEach(w => w.on("message", (e: { id: number; r: unknown }) => { wait.get(e.id)?.(e.r); wait.delete(e.id); }));
  return { size: n, call: (w, m) => new Promise(res => { const k = ++id; wait.set(k, res); ws[w].postMessage({ id: k, m }); }), kill: () => ws.forEach(w => { void w.terminate(); }) };
}
