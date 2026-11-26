// B3 — Analyse de la faille (à lancer à part) : npx vite-node --mode production tests-solveur/b3/analyser.ts
// Rejoue les donnes de B3 contre le site (mêmes graines : mêmes parties) avec le journal de l'analyste, sur tous les
// cœurs moins un, et écrit le résultat dans tests-solveur/rapports/AAAA-MM-JJ-HHMM-analyse-b3.md.
import { Worker } from "node:worker_threads";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "../b4/run";
import type { Reponse, Partie } from "./analyse";

const root = resolve(process.cwd());
const SEED = Number(process.env.GRAINE ?? 20261125), DEALS = Number(process.env.B3_DEALS ?? 400);
const tmp = mkdtempSync(join(tmpdir(), "banc-b3a-"));
const worker = join(tmp, "ouvrier.cjs");
await bundle(join(root, "tests-solveur/b3/ouvrier.ts"), join(root, "src"), worker);
const W = Math.max(1, cpus().length - 1);
const ws = Array.from({ length: W }, () => new Worker(worker, { workerData: { cash100: join(root, "public/solver/cash100.json") } }));
let id = 0;
const call = (w: Worker, msg: object) => new Promise<{ parties: Partie[]; reponses: Reponse[] }>((res, rej) => {
  const k = ++id;
  const on = (m: { id: number; error?: string }) => { if (m.id !== k) return; w.off("message", on); if (m.error) rej(new Error(m.error)); else res(m as never); };
  w.on("message", on); w.postMessage({ id: k, ...msg });
});
const chunks = Array.from({ length: DEALS }, (_, k) => [k]);
const parties: Partie[] = [], reponses: Reponse[] = [];
const t0 = Date.now();
let done = 0;
await Promise.all(ws.map(async w => { for (let c = chunks.shift(); c; c = chunks.shift()) { const r = await call(w, { op: "analyse", seed: SEED, ks: c }); parties.push(...r.parties); reponses.push(...r.reponses); if (++done % 40 === 0) console.log(`${done} / ${DEALS} donnes, ${Math.round((Date.now() - t0) / 1000)} s`); } }));
await Promise.all(ws.map(w => w.terminate()));
rmSync(tmp, { recursive: true, force: true });

const bb100 = (x: number) => ((x / (2 * DEALS)) * 100);   // contribution totale → bb pour 100 mains
const f1 = (x: number) => x.toFixed(1).replace(".", ","), pc = (x: number) => `${Math.round(100 * x)} %`;
const L: string[] = [`# Analyse de la faille trouvée par B3`, "", `Graine ${SEED}, ${DEALS} donnes (${2 * DEALS} mains), mêmes parties que B3 (sans correction de la chance). Total : ${f1(bb100(parties.reduce((t, p) => t + p.contrib, 0)))} bb/100 pour l'exploiteur.`, ""];
const group = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; };
L.push("## 1. D'où vient le gain", "", "| Fin de la main | Street | Mains | Contribution (bb/100) |", "|---|---|---|---|");
for (const [k, ps] of [...group(parties, p => `${p.fin} | ${p.street}`)].sort((a, b) => b[1].reduce((t, p) => t + p.contrib, 0) - a[1].reduce((t, p) => t + p.contrib, 0)))
  L.push(`| ${k} | ${ps.length} | ${f1(bb100(ps.reduce((t, p) => t + p.contrib, 0)))} |`);
L.push("", "| Dernière mise de l'exploiteur | Mains | Contribution (bb/100) |", "|---|---|---|");
for (const [k, ps] of [...group(parties, p => p.derniere)].sort((a, b) => b[1].reduce((t, p) => t + p.contrib, 0) - a[1].reduce((t, p) => t + p.contrib, 0)))
  L.push(`| ${k} | ${ps.length} | ${f1(bb100(ps.reduce((t, p) => t + p.contrib, 0)))} |`);
L.push("", "## 2. Les réponses du site aux mises de l'exploiteur", "",
  "« Prix » = part de pot qu'il faut pour payer ; « part réelle » = part de pot de la main du site contre la main que l'exploiteur avait vraiment ; « payer rapporte » = ce que payer aurait rapporté de plus que se coucher (exact face à un tapis). « Perte » = ce que les mauvais choix coûtent au site, en bb/100 : couchés qui auraient dû payer, payés qui auraient dû se coucher.", "",
  "| Street | Mise | Réponses | Couché | Payé | Relancé | Prix moyen | Part réelle moyenne | Perte des couchés (bb/100) | Perte des calls (bb/100) |", "|---|---|---|---|---|---|---|---|---|---|");
for (const [k, rs] of [...group(reponses, r => `${r.street} | ${r.taille}`)].sort()) {
  const n = rs.length, fold = rs.filter(r => r.act === "fold"), callR = rs.filter(r => r.act === "call"), rai = rs.filter(r => r.act === "raise");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const lostF = fold.reduce((t, r) => t + Math.max(0, r.gainPayer), 0), lostC = callR.reduce((t, r) => t + Math.max(0, -r.gainPayer), 0);
  L.push(`| ${k} | ${n} | ${pc(fold.length / n)} | ${pc(callR.length / n)} | ${pc(rai.length / n)} | ${pc(mean(rs.map(r => r.prix)))} | ${pc(mean(rs.map(r => r.part)))} | ${f1(bb100(lostF))} | ${f1(bb100(lostC))} |`);
}
const shoveFolds = reponses.filter(r => r.taille === "tapis" && r.act === "fold" && r.street !== "River");
L.push("", "## 3. Couchés face à un tapis (flop et turn) : par force de main", "", "| Main du site | Couchés | Part réelle moyenne | Prix moyen | Auraient dû payer | Perte (bb/100) | Équité selon le conseiller | Équité, range resserrée comme la page | La page aurait payé |", "|---|---|---|---|---|---|---|---|---|");
for (const [k, rs] of [...group(shoveFolds, r => r.cat)].sort((a, b) => b[1].length - a[1].length)) {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  L.push(`| ${k} | ${rs.length} | ${pc(mean(rs.map(r => r.part)))} | ${pc(mean(rs.map(r => r.prix)))} | ${pc(rs.filter(r => r.gainPayer > 0).length / rs.length)} | ${f1(bb100(rs.reduce((t, r) => t + Math.max(0, r.gainPayer), 0)))} | ${pc(mean(rs.map(r => r.modele)))} | ${pc(mean(rs.map(r => r.modelePage)))} | ${pc(rs.filter(r => r.actPage === "call" || r.actPage === "raise" || r.actPage === "jam").length / rs.length)} |`);
}
const dir = join(root, "tests-solveur", "rapports");
mkdirSync(dir, { recursive: true });
const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
const file = join(dir, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}-analyse-b3.md`);
writeFileSync(file, L.join("\n"));
writeFileSync(file.replace(/\.md$/, ".json"), JSON.stringify({ parties, reponses }));
console.log(L.join("\n"));
console.log(`\nRapport : ${file}`);
