// B3 — Organisation : paquet esbuild du fil de calcul, donnes réparties sur les cœurs, contrôles, résultats en bb/100
// avec intervalle de confiance à 95 %. Rapporté comme borne basse de ce qu'un adversaire parfait gagnerait, jamais
// comme score de qualité.
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import type { LbrStats } from "./lbr";

export interface Stat { bb100: number; ci: number; sdPerHand: number }
export interface LigneB3 {
  cible: string; deals: number; hands: number; raw: Stat; adj: Stat; illegal: number; decisions: number; ms: number;
  stats: LbrStats; policy: { asked: number; riverSolves: number; riverOne: number };
}
export interface CheckRiver { same: number; diff: number; nodes: number; fails: string[]; deals: number }

const root = resolve(process.cwd());
const stat = (xs: number[]): Stat => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  return { bb100: (m / 2) * 100, ci: ((1.96 * sd) / Math.sqrt(n) / 2) * 100, sdPerHand: sd / Math.SQRT2 };
};

export async function runB3(o: { seed: number; deals: number; baselineDeals: number; checkDeals: number; onProgress?: (s: string) => void }) {
  const tmp = mkdtempSync(join(tmpdir(), "banc-b3-"));
  try {
    const worker = join(tmp, "ouvrier.cjs");
    await build({
      entryPoints: [join(root, "tests-solveur/b3/ouvrier.ts")], bundle: true, platform: "node", format: "cjs", outfile: worker, logLevel: "error",
      alias: { "@": join(root, "src") }, nodePaths: [join(root, "node_modules")], jsx: "automatic", loader: { ".css": "empty", ".svg": "empty", ".png": "empty" },
      define: { "import.meta.env": "{}" },
    });
    const W = Math.max(1, cpus().length - 1);
    const ws = Array.from({ length: W }, () => new Worker(worker, { workerData: { cash100: join(root, "public/solver/cash100.json") } }));
    let id = 0;
    const call = <T>(w: Worker, msg: object) => new Promise<T>((res, rej) => {
      const k = ++id;
      const on = (m: { id: number; error?: string }) => { if (m.id !== k) return; w.off("message", on); if (m.error) rej(new Error(m.error)); else res(m as T); };
      w.on("message", on); w.postMessage({ id: k, ...msg });
    });
    type Res = { res: { k: number; raw: number; adj: number; illegal: number; decisions: number }[]; stats: LbrStats; policy: LigneB3["policy"] };
    const lignes: LigneB3[] = [];
    // 1) contrôle de la river lue en un seul calcul (donnes à part, prises au-delà de celles de la mesure)
    const ckKs = Array.from({ length: o.checkDeals }, (_, k) => 100000 + k);
    const cks = await Promise.all(ws.map((w, i) => call<{ check: Omit<CheckRiver, "deals"> }>(w, { op: "check", seed: o.seed, ks: ckKs.filter((_, j) => j % W === i) })));
    const check: CheckRiver = { same: 0, diff: 0, nodes: 0, fails: [], deals: ckKs.length };
    for (const c of cks) { check.same += c.check.same; check.diff += c.check.diff; check.nodes += c.check.nodes; check.fails.push(...c.check.fails); }
    o.onProgress?.(`contrôle river : ${check.same} identiques, ${check.diff} différents`);
    // 2) l'exploiteur contre chaque cible
    for (const [cible, n] of [["toujours call", o.baselineDeals], ["serré", o.baselineDeals], ["site", o.deals]] as const) {
      const t0 = Date.now();
      const ks = Array.from({ length: n }, (_, k) => k), chunks: number[][] = [];
      const size = cible === "site" ? 1 : 10;
      for (let i = 0; i < ks.length; i += size) chunks.push(ks.slice(i, i + size));
      const out: Res["res"] = [];
      const st: LbrStats = { decisions: 0, observed: 0, horsRange: 0, vide: 0, actions: {}, reponses: {} };
      const pol = { asked: 0, riverSolves: 0, riverOne: 0 };
      let done = 0;
      await Promise.all(ws.map(async w => {
        for (let c = chunks.shift(); c; c = chunks.shift()) {
          const r = await call<Res>(w, { op: "play", target: cible, seed: o.seed, ks: c, aivat: true });
          out.push(...r.res);
          st.decisions += r.stats.decisions; st.observed += r.stats.observed; st.horsRange += r.stats.horsRange; st.vide += r.stats.vide;
          for (const [a, x] of Object.entries(r.stats.actions)) st.actions[a] = (st.actions[a] ?? 0) + x;
          for (const [a, m] of Object.entries(r.stats.reponses)) for (const [k, x] of Object.entries(m)) { const d = (st.reponses[a] ??= {}); d[k] = (d[k] ?? 0) + x; }
          pol.asked += r.policy.asked; pol.riverSolves += r.policy.riverSolves; pol.riverOne += r.policy.riverOne;
          done += c.length;
          if (cible === "site" && done % 20 === 0) o.onProgress?.(`${cible} : ${done} / ${n} donnes, ${Math.round((Date.now() - t0) / 1000)} s`);
        }
      }));
      out.sort((a, b) => a.k - b.k);
      lignes.push({ cible, deals: out.length, hands: 2 * out.length, raw: stat(out.map(x => x.raw)), adj: stat(out.map(x => x.adj)),
        illegal: out.reduce((t, x) => t + x.illegal, 0), decisions: out.reduce((t, x) => t + x.decisions, 0), ms: Date.now() - t0, stats: st, policy: pol });
      o.onProgress?.(`${cible} terminé`);
    }
    await Promise.all(ws.map(w => w.terminate()));
    return { lignes, check, workers: W };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
