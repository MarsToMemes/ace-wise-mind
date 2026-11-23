// Lot 8 : promotion contrôlée des tables du solveur. Une nouvelle table est d'abord importée comme « candidate »
// (solver-candidates/, hors du site), contrôlée et comparée à la table en service ; elle ne la remplace qu'après
// accord, l'ancienne est archivée (solver-archive/) et peut être remise en service.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SolverGame, SolverIndexEntry, SolverSpot } from "@/engines/solverSpots";
import { checkSolverTable } from "@/core/solverTableCheck";
import { sanityChecks } from "@/bench/sanity";
import { computeDecisions, diffDecisions } from "@/bench/driftCases";

export const LIVE = "public/solver";
export const CANDIDATES = "solver-candidates";
export const ARCHIVE = "solver-archive";
const REFERENCE = "src/bench/reference.json";
const PERSONAL = /(\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\)/;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Manifest = any;

const fr1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

export function manifestProblems(m: Manifest, bytes: Buffer, g: SolverGame): string[] {
  const p: string[] = [];
  if (!m) return ["fiche d'origine absente"];
  if (m.schema !== 1) p.push("version de fiche inconnue");
  if (m.id !== g.id) p.push(`fiche d'une autre table (${m.id})`);
  if (m.table?.sha256 !== createHash("sha256").update(bytes).digest("hex")) p.push("empreinte (sha256) différente de la table");
  if (m.table?.spots !== g.spots.length) p.push("nombre de lignes différent de la table");
  if (m.solve?.iterations !== g.iterations || m.solve?.gap !== g.gap) p.push("calcul (itérations, écart) différent de la table");
  if (m.game?.stackBB !== g.stack || JSON.stringify(m.game?.positions) !== JSON.stringify(g.positions)) p.push("jeu (tapis, positions) différent de la table");
  if (typeof m.game?.rake?.pct !== "number") p.push("rake non précisé");
  if (!m.model?.realization) p.push("modèle d'après-flop non précisé");
  if (!/meilleure réponse/.test(m.solve?.gapDefinition ?? "")) p.push("définition de l'écart absente");
  if (!m.generator?.name || !m.generator?.commit) p.push("générateur (logiciel, version) non précisé");
  if (PERSONAL.test(JSON.stringify(m))) p.push("chemin personnel dans la fiche");
  return p;
}

export interface TableDiff {
  gained: string[]; lost: string[]; handsCompared: number; handsChanged: number;
  top: { k: string; a: string; before: string; after: string; delta: number; changed: number }[];
}

const mainAct = (s: SolverSpot, h: string) => { const p = s.h[h]; let b = 0; p.forEach((x, i) => { if (x > p[b]) b = i; }); return s.acts[b]; };
const freqText = (s: SolverSpot) => s.acts.map((a, i) => `${a} ${fr1(s.f[i])}`).join(" / ");

export function compareTables(cur: SolverGame, cand: SolverGame): TableDiff {
  const a = new Map(cur.spots.map(s => [s.k, s])), b = new Map(cand.spots.map(s => [s.k, s]));
  const d: TableDiff = { gained: [...b.keys()].filter(k => !a.has(k)).sort(), lost: [...a.keys()].filter(k => !b.has(k)).sort(), handsCompared: 0, handsChanged: 0, top: [] };
  for (const [k, s] of a) {
    const t = b.get(k);
    if (!t) continue;
    let changed = 0;
    for (const h of Object.keys(s.h)) if (t.h[h]) { d.handsCompared++; if (mainAct(s, h) !== mainAct(t, h)) changed++; }
    d.handsChanged += changed;
    const labels = new Set([...s.acts, ...t.acts]);
    const f = (x: SolverSpot, l: string) => (x.acts.includes(l) ? x.f[x.acts.indexOf(l)] : 0);
    const delta = Math.max(...[...labels].map(l => Math.abs(f(s, l) - f(t, l))));
    d.top.push({ k, a: s.a, before: freqText(s), after: freqText(t), delta, changed });
  }
  d.top.sort((x, y) => y.delta - x.delta || y.changed - x.changed);
  d.top = d.top.slice(0, 8);
  return d;
}

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** ok : rien de bloquant. warnings : à lire avant de décider (la mise en service demande alors un accord explicite). */
export interface Check { ok: boolean; blocking: string[]; warnings: string[]; report: string }

export function checkCandidate(root: string, id: string): Check {
  const cp = join(root, CANDIDATES, `${id}.json`), cm = join(root, CANDIDATES, `${id}.manifest.json`);
  if (!existsSync(cp)) return { ok: false, blocking: [`candidate ${id} introuvable dans ${CANDIDATES}/`], warnings: [], report: "" };
  const bytes = readFileSync(cp);
  const g = JSON.parse(bytes.toString("utf8")) as SolverGame;
  const m = existsSync(cm) ? read(cm) : null;
  const blocking = [
    ...manifestProblems(m, bytes, g).map(x => `Fiche : ${x}`),
    ...checkSolverTable(g).map(v => `Table : ${v.code} ${v.message}`),
    ...(g.kind === "cash" ? sanityChecks(g).filter(s => !s.ok).map(s => `Main évidente : ${s.name}`) : []),
  ];
  const L: string[] = [];
  const warnings: string[] = [];
  L.push(`Table candidate ${id} : ${g.spots.length} lignes, ${g.iterations ?? "?"} itérations, écart ${g.gap != null ? String(Math.round(g.gap * 10000) / 10000).replace(".", ",") : "?"} bb par main${m?.run?.dates ? `, calculée le ${m.run.dates}` : ""}`);
  L.push(blocking.length ? `Contrôles : ${plural(blocking.length, "problème")} bloquant(s)` : "Contrôles : OK (fiche, intégrité" + (g.kind === "cash" ? ", mains évidentes)" : ")"));
  for (const x of blocking) L.push(`  - ${x}`);
  const lp = join(root, LIVE, `${id}.json`);
  if (existsSync(lp)) {
    const cur = read(lp) as SolverGame;
    const d = compareTables(cur, g);
    L.push(`Lignes : ${cur.spots.length} → ${g.spots.length} (${plural(d.gained.length, "ligne")} gagnée${d.gained.length > 1 ? "s" : ""}, ${plural(d.lost.length, "ligne")} perdue${d.lost.length > 1 ? "s" : ""})`);
    L.push(`Mains dont l'action principale change : ${d.handsChanged} sur ${d.handsCompared} (${fr1((d.handsChanged / Math.max(1, d.handsCompared)) * 100)} %)`);
    const big = d.top.filter(t => t.delta >= 1);
    if (big.length) {
      L.push("Plus gros changements de fréquences :");
      for (const t of big) L.push(`  - ${t.k || "premier à parler"} (${t.a}) : ${t.before}  →  ${t.after}`);
    }
    const lostShare = d.lost.length / Math.max(1, cur.spots.length), changedShare = d.handsChanged / Math.max(1, d.handsCompared);
    if (lostShare > 0.05) warnings.push(`${d.lost.length} lignes perdues sur ${cur.spots.length} (${Math.round(lostShare * 100)} %) : ces situations n'auraient plus de conseil solveur`);
    if (changedShare > 0.05) warnings.push(`${Math.round(changedShare * 100)} % des mains changent d'action principale`);
    if (id === "cash100") {
      const dr = diffDecisions(computeDecisions(g), computeDecisions(cur));
      const n = dr.changed.length;
      if (n) warnings.push(`${n} décision${n > 1 ? "s" : ""} de référence change${n > 1 ? "nt" : ""}`);
      L.push(`Mains de référence : ${n} décision${n > 1 ? "s" : ""} de référence changée${n > 1 ? "s" : ""}`);
      for (const c of dr.changed) L.push(`  - ${c.what} : ${c.before} → ${c.after}`);
    }
  } else L.push("Aucune table en service sous ce nom : nouvelle table.");
  if (warnings.length) {
    L.push(`Points d'attention (${warnings.length}) :`);
    for (const w of warnings) L.push(`  - ${w}`);
  }
  return { ok: blocking.length === 0, blocking, warnings, report: L.join("\n") };
}

function setIndex(root: string, id: string, g: SolverGame) {
  const ip = join(root, LIVE, "index.json");
  const ix: SolverIndexEntry[] = existsSync(ip) ? read(ip) : [];
  const cip = join(root, CANDIDATES, "index.json");
  const fromCand = existsSync(cip) ? (read(cip) as SolverIndexEntry[]).find(e => e.id === id) : undefined;
  const i = ix.findIndex(e => e.id === id);
  const entry = { ...(i >= 0 ? ix[i] : fromCand ?? { id, kind: g.kind, label: `${g.kind} · ${g.stack} bb`, stack: g.stack }), spots: g.spots.length };
  if (i >= 0) ix[i] = entry; else ix.push(entry);
  writeFileSync(ip, JSON.stringify(ix, null, 1));
}

function writeReference(root: string, id: string) {
  if (id !== "cash100") return;
  const g = read(join(root, LIVE, `${id}.json`)) as SolverGame;
  mkdirSync(join(root, "src/bench"), { recursive: true });
  writeFileSync(join(root, REFERENCE), JSON.stringify({ version: 1, decisions: computeDecisions(g) }, null, 1) + "\n");
}

const moveLiveTo = (root: string, id: string, dir: string, copy: boolean) => {
  mkdirSync(dir, { recursive: true });
  for (const f of [`${id}.json`, `${id}.manifest.json`]) {
    const src = join(root, LIVE, f);
    if (existsSync(src)) (copy ? copyFileSync : renameSync)(src, join(dir, f));
  }
};

/** Met la candidate en service (seulement si le contrôle passe). `stamp` : date et heure, ex. 20261123-1200. */
export function applyCandidate(root: string, id: string, stamp: string, opts: { acceptWarnings?: boolean } = {}): { archivedTo: string; report: string } {
  const c = checkCandidate(root, id);
  if (!c.ok) throw new Error(`Candidate ${id} refusée : ${c.blocking.join(" ; ")}`);
  if (c.warnings.length && !opts.acceptWarnings) {
    throw new Error(`Candidate ${id} : ${c.warnings.length} point${c.warnings.length > 1 ? "s" : ""} d'attention à accepter d'abord (${c.warnings.join(" ; ")}).`);
  }
  const dir = join(root, ARCHIVE, `${id}-${stamp}`);
  moveLiveTo(root, id, dir, true);
  writeFileSync(join(dir, "rapport.txt"), c.report + "\n");
  for (const f of [`${id}.json`, `${id}.manifest.json`]) copyFileSync(join(root, CANDIDATES, f), join(root, LIVE, f));
  setIndex(root, id, read(join(root, LIVE, `${id}.json`)));
  for (const f of [`${id}.json`, `${id}.manifest.json`]) rmSync(join(root, CANDIDATES, f), { force: true });
  const cip = join(root, CANDIDATES, "index.json");
  if (existsSync(cip)) {
    const rest = (read(cip) as SolverIndexEntry[]).filter(e => e.id !== id);
    if (rest.length) writeFileSync(cip, JSON.stringify(rest, null, 1)); else rmSync(cip);
  }
  writeReference(root, id);
  return { archivedTo: dir, report: c.report };
}

/** Remet en service la dernière table archivée ; celle qu'on retire est gardée (…-retiree). */
export function rollback(root: string, id: string, stamp: string): { restoredFrom: string } {
  const adir = join(root, ARCHIVE);
  const dirs = existsSync(adir) ? readdirSync(adir).filter(d => d.startsWith(`${id}-`) && !/-(restauree|retiree)$/.test(d) && existsSync(join(adir, d, `${id}.json`))).sort().reverse() : [];
  if (!dirs.length) throw new Error(`Aucune table ${id} archivée à remettre en service.`);
  const from = join(adir, dirs[0]);
  moveLiveTo(root, id, join(adir, `${id}-${stamp}-retiree`), false);
  for (const f of [`${id}.json`, `${id}.manifest.json`]) if (existsSync(join(from, f))) copyFileSync(join(from, f), join(root, LIVE, f));
  renameSync(from, `${from}-restauree`);
  setIndex(root, id, read(join(root, LIVE, `${id}.json`)));
  writeReference(root, id);
  return { restoredFrom: `${from}-restauree` };
}
