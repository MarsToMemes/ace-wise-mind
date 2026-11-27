// B4 — Organisation : version actuelle et version précédente (extraite de git dans un dossier temporaire), paquets
// esbuild, donnes réparties sur des fils de calcul, résultats en bb/100 avec intervalle de confiance à 95 %.
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

export interface Ligne { A: string; B: string; deals: number; hands: number; raw: Stat; adj: Stat; fallbacks: number; illegal: number; decisions: number; reduction: number }
export interface Stat { bb100: number; ci: number; sdPerHand: number }

const root = resolve(process.cwd());

// modules ajoutés au site après une ancienne version : remplacés par un module vide dans le paquet de cette version
const OPTIONAL: Record<string, string> = { "engines/allInDefense": "tests-solveur/b4/sansDefense.ts" };

export async function bundle(entry: string, src: string, out: string) {
  await build({
    entryPoints: [entry], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "error",
    alias: { "@": src }, nodePaths: [join(root, "node_modules")], jsx: "automatic", loader: { ".css": "empty", ".svg": "empty", ".png": "empty" },
    define: { "import.meta.env": "{}" },
    plugins: [{
      name: "modules-optionnels",
      setup(b) {
        b.onResolve({ filter: /^@\/engines\/allInDefense$/ }, a => {
          const rel = a.path.slice(2);
          return existsSync(join(src, `${rel}.ts`)) ? { path: join(src, `${rel}.ts`) } : { path: join(root, OPTIONAL[rel]) };
        });
      },
    }],
  });
}

/** Dossier de travail git pour une ancienne version (supprimé à la fin). */
export function worktree(commit: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "banc-version-")), commit);
  execFileSync("git", ["worktree", "add", "--detach", dir, commit], { cwd: root, stdio: "ignore" });
  return dir;
}

const stat = (xs: number[]): Stat => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  // un point de duplicate = 2 mains : bb/100 mains = moyenne par paire / 2 × 100
  return { bb100: (m / 2) * 100, ci: ((1.96 * sd) / Math.sqrt(n) / 2) * 100, sdPerHand: sd / Math.SQRT2 };
};

export async function runB4(o: { seed: number; deals: number; old: string; matches: [string, string][]; selfDeals?: number }) {
  const tmp = mkdtempSync(join(tmpdir(), "banc-b4-"));
  const old = worktree(o.old);
  try {
    const cur = join(tmp, "actuelle.cjs"), prev = join(tmp, "ancienne.cjs"), worker = join(tmp, "ouvrier.cjs");
    await bundle(join(root, "tests-solveur/b4/joueur.ts"), join(root, "src"), cur);
    await bundle(join(root, "tests-solveur/b4/joueur.ts"), join(old, "src"), prev);
    await bundle(join(root, "tests-solveur/b4/ouvrier.ts"), join(root, "src"), worker);
    const versions = {
      actuelle: { bundle: cur, cash100: join(root, "public/solver/cash100.json") },
      [`ancienne (${o.old})`]: { bundle: prev, cash100: existsSync(join(old, "public/solver/cash100.json")) ? join(old, "public/solver/cash100.json") : join(root, "public/solver/cash100.json") },
    };
    const W = Math.max(1, cpus().length - 1);
    const ws = Array.from({ length: W }, () => new Worker(worker, { workerData: { cash100: join(root, "public/solver/cash100.json"), versions } }));
    let id = 0;
    const call = (w: Worker, msg: object) => new Promise<{ res: { k: number; raw: number; adj: number; fallbacks: number; illegal: number; decisions: number }[] }>((res, rej) => {
      const k = ++id;
      const on = (m: { id: number; res?: never; error?: string }) => { if (m.id !== k) return; w.off("message", on); if (m.error) rej(new Error(m.error)); else res(m as never); };
      w.on("message", on); w.postMessage({ id: k, ...msg });
    });
    const play = async (A: string, B: string, n: number, aivat: boolean) => {
      // petits paquets de donnes distribués aux fils libres
      const ks = Array.from({ length: n }, (_, k) => k), chunks: number[][] = [];
      for (let i = 0; i < ks.length; i += 10) chunks.push(ks.slice(i, i + 10));
      const out: Awaited<ReturnType<typeof call>>["res"] = [];
      await Promise.all(ws.map(async w => { for (let c = chunks.shift(); c; c = chunks.shift()) out.push(...(await call(w, { A, B, seed: o.seed, ks: c, aivat })).res); }));
      return out.sort((a, b) => a.k - b.k);
    };
    const lignes: Ligne[] = [];
    const self = await play("actuelle", "actuelle", o.selfDeals ?? 100, true);
    const selfMax = Math.max(...self.map(x => Math.abs(x.raw)));
    for (const [A, B0] of o.matches) {
      const B = B0 === "ancienne" ? `ancienne (${o.old})` : B0;
      const res = await play(A, B, o.deals, true);
      const raw = stat(res.map(x => x.raw)), adj = stat(res.map(x => x.adj));
      lignes.push({ A, B, deals: res.length, hands: 2 * res.length, raw, adj,
        fallbacks: res.reduce((t, x) => t + x.fallbacks, 0), illegal: res.reduce((t, x) => t + x.illegal, 0), decisions: res.reduce((t, x) => t + x.decisions, 0),
        reduction: raw.sdPerHand > 0 ? (adj.sdPerHand / raw.sdPerHand) ** 2 : 1 });
    }
    await Promise.all(ws.map(w => w.terminate()));
    return { lignes, self: { deals: self.length, maxAbs: selfMax }, workers: W };
  } finally {
    try { execFileSync("git", ["worktree", "remove", "--force", old], { cwd: root, stdio: "ignore" }); } catch { /* déjà supprimé */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}
