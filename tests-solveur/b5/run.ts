// B5 — Organisation : version actuelle et version précédente (git), paquets esbuild, donnes réparties sur les cœurs,
// matchs à 3, 4 et 6 joueurs, résultats en bb/100 avec intervalle de confiance à 95 %, contrôles à chaque main.
// Ces résultats ne prouvent pas un équilibre multiway.
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle, worktree } from "../b4/run";

export interface Stat { bb100: number; ci: number; sdPerHand: number }
export interface LigneB5 { n: number; A: string; B: string; deals: number; hands: number; s: Stat; sumFails: number; games: number; illegal: number; fallbacks: number; decisions: number; ms: number }

const root = resolve(process.cwd());
const stat = (xs: number[]): Stat => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  return { bb100: m * 100, ci: ((1.96 * sd) / Math.sqrt(n)) * 100, sdPerHand: sd };
};

export async function runB5(o: { seed: number; deals: number; selfDeals: number; old: string; tables: number[]; opponents: string[]; onProgress?: (s: string) => void }) {
  const tmp = mkdtempSync(join(tmpdir(), "banc-b5-"));
  const old = worktree(o.old);
  try {
    const cur = join(tmp, "actuelle.cjs"), prev = join(tmp, "ancienne.cjs"), worker = join(tmp, "ouvrier.cjs");
    await bundle(join(root, "tests-solveur/b5/joueur.ts"), join(root, "src"), cur);
    await bundle(join(root, "tests-solveur/b5/joueur.ts"), join(old, "src"), prev);
    await bundle(join(root, "tests-solveur/b5/ouvrier.ts"), join(root, "src"), worker);
    const oldName = `ancienne (${o.old})`;
    const versions = {
      actuelle: { bundle: cur, cash100: join(root, "public/solver/cash100.json") },
      [oldName]: { bundle: prev, cash100: existsSync(join(old, "public/solver/cash100.json")) ? join(old, "public/solver/cash100.json") : join(root, "public/solver/cash100.json") },
    };
    const W = Math.max(1, cpus().length - 1);
    const ws = Array.from({ length: W }, () => new Worker(worker, { workerData: { cash100: join(root, "public/solver/cash100.json"), versions } }));
    type R = { k: number; score: number; sumFails: number; illegal: number; fallbacks: number; decisions: number; games: number };
    let id = 0;
    const call = (w: Worker, msg: object) => new Promise<{ res: R[] }>((res, rej) => {
      const k = ++id;
      const on = (m: { id: number; error?: string }) => { if (m.id !== k) return; w.off("message", on); if (m.error) rej(new Error(m.error)); else res(m as never); };
      w.on("message", on); w.postMessage({ id: k, ...msg });
    });
    const play = async (A: string, B: string, n: number, deals: number) => {
      const ks = Array.from({ length: deals }, (_, k) => k), chunks: number[][] = [];
      for (let i = 0; i < ks.length; i += 10) chunks.push(ks.slice(i, i + 10));
      const out: R[] = [];
      await Promise.all(ws.map(async w => { for (let c = chunks.shift(); c; c = chunks.shift()) out.push(...(await call(w, { A, B, n, seed: o.seed, ks: c })).res); }));
      return out.sort((a, b) => a.k - b.k);
    };
    const lignes: LigneB5[] = [], self: { n: number; deals: number; maxAbs: number; sumFails: number; illegal: number }[] = [];
    for (const n of o.tables) {
      const s = await play("actuelle", "actuelle", n, o.selfDeals);
      self.push({ n, deals: s.length, maxAbs: Math.max(...s.map(x => Math.abs(x.score))), sumFails: s.reduce((t, x) => t + x.sumFails, 0), illegal: s.reduce((t, x) => t + x.illegal, 0) });
      for (const B0 of o.opponents) {
        const B = B0 === "ancienne" ? oldName : B0, t0 = Date.now();
        const res = await play("actuelle", B, n, o.deals);
        lignes.push({ n, A: "actuelle", B, deals: res.length, hands: res.reduce((t, x) => t + x.games, 0), s: stat(res.map(x => x.score)),
          sumFails: res.reduce((t, x) => t + x.sumFails, 0), games: res.reduce((t, x) => t + x.games, 0),
          illegal: res.reduce((t, x) => t + x.illegal, 0), fallbacks: res.reduce((t, x) => t + x.fallbacks, 0), decisions: res.reduce((t, x) => t + x.decisions, 0), ms: Date.now() - t0 });
        o.onProgress?.(`${n} joueurs, contre ${B} : terminé en ${Math.round((Date.now() - t0) / 1000)} s`);
      }
    }
    await Promise.all(ws.map(w => w.terminate()));
    return { lignes, self, workers: W };
  } finally {
    try { execFileSync("git", ["worktree", "remove", "--force", old], { cwd: root, stdio: "ignore" }); } catch { /* déjà supprimé */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}
