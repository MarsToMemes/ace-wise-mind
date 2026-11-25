// Spots calculés par le solveur GTOpen sur la machine de l'utilisateur
// (scripts/import_gtopen.py → public/solver/*.json, chargés à la demande).
//
// Une partie = un arbre préflop résolu (ex. MTT 6 joueurs 20 bb). Chaque spot est un
// nœud de décision : la ligne jouée avant (k), le joueur qui parle (a), ses actions et,
// pour chaque main de sa range, la probabilité (en %) de chaque action.

import type { RangeWeights } from "@/engines/myRanges";

export interface SolverSpot {
  k: string;        // ligne : "UTG:F,MP:R2" ("" = premier à parler)
  a: string;        // position qui parle
  acts: string[];   // F, X, C, L, R<to>, A<to>
  f: number[];      // fréquence globale de chaque action (%)
  h: Record<string, number[]>; // main → % par action (mains de sa range seulement)
  r?: 1;            // ligne rare : une action du chemin est jouée moins de 0,2 % du temps
}

export interface SolverGame {
  id: string;
  kind: "mtt" | "bvb" | "cash" | string;
  stack: number;
  ante: number;
  positions: string[];
  iterations?: number;
  gap?: number;
  spots: SolverSpot[];
}

export interface SolverIndexEntry { id: string; kind: string; label: string; stack: number; spots: number }

const cache = new Map<string, Promise<SolverGame>>();
const base = () => (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

export async function loadSolverIndex(): Promise<SolverIndexEntry[]> {
  const r = await fetch(`${base()}solver/index.json`);
  if (!r.ok) return [];
  return r.json();
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
/** « 2026-11-22 » → « 22 nov. 2026 » (sinon le texte tel quel). */
export function versionLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : d;
}

/** Date de calcul de la table (fiche d'origine), null si la table n'a pas de fiche. */
export async function loadSolverVersion(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${base()}solver/${id}.manifest.json`);
    if (!r.ok) return null;
    const m = await r.json();
    return typeof m?.run?.dates === "string" ? versionLabel(m.run.dates) : null;
  } catch {
    return null;
  }
}

export function loadSolverGame(id: string): Promise<SolverGame> {
  if (!cache.has(id)) {
    cache.set(id, fetch(`${base()}solver/${id}.json`).then(r => {
      if (!r.ok) throw new Error(`Spot solveur introuvable : ${id}`);
      return r.json();
    }));
  }
  return cache.get(id)!;
}

/** Pour les tests : injecte une partie déjà chargée. */
export function primeSolverGame(g: SolverGame) {
  cache.set(g.id, Promise.resolve(g));
}

export const findSpot = (g: SolverGame, key: string) => g.spots.find(s => s.k === key);

/** Clé de la ligne obtenue en jouant `act` depuis `spot`. */
export const childKey = (spot: SolverSpot, act: string) => (spot.k ? `${spot.k},` : "") + `${spot.a}:${act}`;

export const isRaise = (a: string) => a.startsWith("R");
export const isJam = (a: string) => a.startsWith("A");
export const isCall = (a: string) => a === "C";
export const isLimp = (a: string) => a === "L";

/** Range (poids 0..1) des mains qui prennent une action vérifiant `pick`. */
export function rangeOf(spot: SolverSpot, pick: (act: string) => boolean): RangeWeights {
  const idx = spot.acts.map((a, i) => (pick(a) ? i : -1)).filter(i => i >= 0);
  const out: RangeWeights = {};
  for (const [hand, probs] of Object.entries(spot.h)) {
    const p = idx.reduce((s, i) => s + (probs[i] ?? 0), 0) / 100;
    if (p > 0.005) out[hand] = Math.min(1, Math.round(p * 100) / 100);
  }
  return out;
}

/** Ligne « tout le monde se couche jusqu'à `pos` ». */
export function foldsTo(g: SolverGame, pos: string): string {
  const order = g.positions;
  const i = order.indexOf(pos);
  return order.slice(0, Math.max(0, i)).map(p => `${p}:F`).join(",");
}

/** Spot où `pos` parle en premier (tout le monde s'est couché avant). */
export const firstInSpot = (g: SolverGame, pos: string) => findSpot(g, foldsTo(g, pos));

/**
 * Spot où `pos` répond à l'action `openAct` (ex. "R2" ou "A20") de `opener`,
 * tous les autres joueurs entre les deux s'étant couchés.
 */
export function facingSpot(g: SolverGame, opener: string, openAct: (a: string) => boolean, pos: string): SolverSpot | undefined {
  const first = firstInSpot(g, opener);
  if (!first) return undefined;
  const act = first.acts.find(openAct);
  if (!act) return undefined;
  const order = g.positions;
  const between = order.slice(order.indexOf(opener) + 1, order.indexOf(pos));
  const key = [childKey(first, act), ...between.map(p => `${p}:F`)].join(",");
  return findSpot(g, key);
}

/** Libellé lisible d'une action courte. */
export function actLabel(a: string): string {
  if (a === "F") return "Fold";
  if (a === "X") return "Check";
  if (a === "C") return "Call";
  if (a === "L") return "Limp";
  if (isJam(a)) return `Tapis${a.length > 1 ? ` ${a.slice(1)} bb` : ""}`;
  if (isRaise(a)) return `Relance à ${a.slice(1)} bb`;
  return a;
}

/**
 * Suit une suite d'actions ([position, choix]) depuis le début ; tous les autres joueurs
 * se couchent. Renvoie le spot où `responder` doit ensuite agir.
 */
export function spotAfter(g: SolverGame, steps: [string, (a: string) => boolean][], responder: string): SolverSpot | undefined {
  let key = "";
  let i = 0;
  for (let guard = 0; guard < 40; guard++) {
    const s = findSpot(g, key);
    if (!s) return undefined;
    if (i >= steps.length && s.a === responder) return s;
    let act: string | undefined;
    if (i < steps.length && s.a === steps[i][0]) {
      act = s.acts.find(steps[i][1]);
      i++;
    } else {
      act = s.acts.find(a => a === "F");
    }
    if (!act) return undefined;
    key = childKey(s, act);
  }
  return undefined;
}

// --- Partie de référence utilisée par les ranges du site (cash 100 bb) ---
let baseGame: SolverGame | null = null;
export const setSolverBaseGame = (g: SolverGame | null) => { baseGame = g; };
export const getSolverBaseGame = () => baseGame;

const raiseOrJam = (a: string) => isRaise(a) || isJam(a);

/** Range d'une situation du site (open:POS, call:POS:vs:X, 3bet:POS:vs:X, call3bet:X:vs:Y) depuis le solveur. */
export function solverRangeForSlot(slot: string, g: SolverGame | null = baseGame): RangeWeights | null {
  if (!g) return null;
  const [kind, pos, , vs] = slot.split(":");
  let spot: SolverSpot | undefined;
  let pick: (a: string) => boolean;
  if (kind === "open") { spot = firstInSpot(g, pos); pick = raiseOrJam; }
  else if (kind === "call") { spot = spotAfter(g, [[vs, isRaise]], pos); pick = isCall; }
  else if (kind === "3bet") { spot = spotAfter(g, [[vs, isRaise]], pos); pick = raiseOrJam; }
  else if (kind === "call3bet") { spot = spotAfter(g, [[pos, isRaise], [vs, raiseOrJam]], pos); pick = isCall; }
  else return null;
  if (!spot) return null;
  const r = rangeOf(spot, pick);
  return Object.keys(r).length ? r : null;
}

// ---------------------------------------------------------------------------
// Retrouver le spot du solveur à partir de la table de l'analyseur
// ---------------------------------------------------------------------------
export interface TableAction { seatIdx: number; street: string; type: string; amountBB: number }

export interface SpotMatch {
  spot?: SolverSpot;
  /** Phrase lisible : « BB face au tapis du BTN » */
  title: string;
  notes: string[];
  reason?: string;
  /** true : la main saisie suit une ligne absente des calculs (pas une saisie incomplète). */
  missing?: boolean;
  /** Ligne jouée, sans les folds : « UTG relance 2,5 · MP tapis 100 ». */
  line?: string;
}

const ACT_FR = (a: string) => (a === "C" ? "paye" : a === "L" ? "limp" : a === "X" ? "check" : isJam(a) ? `tapis ${fmtLine(+a.slice(1))}` : isRaise(a) ? `relance ${fmtLine(+a.slice(1))}` : a);
const fmtLine = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Texte d'une ligne de l'arbre, folds omis. */
export function lineText(key: string): string {
  return key ? key.split(",").map(x => x.split(":")).filter(([, a]) => a !== "F").map(([p, a]) => `${p} ${ACT_FR(a)}`).join(" · ") : "";
}

// --- Cash : profondeurs calculées (D33) ---
/** Tapis proposés en cash ; seuls ceux marqués `ready` ont une table solveur. */
export const CASH_DEPTHS: { bb: number; ready: boolean }[] = [
  { bb: 20, ready: true }, { bb: 30, ready: true }, { bb: 50, ready: true }, { bb: 75, ready: true },
  { bb: 100, ready: true }, { bb: 150, ready: true }, { bb: 200, ready: false },
];
/** Écart toléré autour d'une table calculée, en part de son tapis (un tapis de 62 bb joue comme 50 bb). */
const CASH_TOLERANCE = 0.25;
const readyDepths = () => CASH_DEPTHS.filter(d => d.ready).map(d => d.bb);
const byDistance = (stackBB: number) => (a: number, b: number) => Math.abs(a - stackBB) - Math.abs(b - stackBB) || a - b;  // à égalité, la moins profonde

/**
 * Le tapis est-il couvert par une table cash ? La table la plus proche dans la tolérance ; hors tolérance : pas de
 * conseil solveur, et un message qui le dit (plutôt que servir une table d'une autre profondeur en silence).
 */
export function cashCoverage(stackBB: number): { ok: boolean; note: string | null; depth: number | null } {
  const ready = readyDepths();
  const near = ready.filter(d => Math.abs(d - stackBB) <= d * CASH_TOLERANCE).sort(byDistance(stackBB))[0];
  const fmt = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (near === undefined) {
    return { ok: false, depth: null, note: `La bibliothèque cash n'est calculée qu'à ${ready.map(d => `${d} bb`).join(", ")} (ton tapis : ${fmt(stackBB)} bb) : pas de conseil solveur à cette profondeur.` };
  }
  return { ok: true, depth: near, note: near === stackBB ? null : `Conseil calculé à ${near} bb (ton tapis : ${fmt(stackBB)} bb).` };
}

/** Table cash dont viennent les ranges du site (lignes préflop, c-bet, multiway) : toujours la plus proche du tapis. */
export const cashBaseId = (stackBB: number) => `cash${cashCoverage(stackBB).depth ?? [...readyDepths()].sort(byDistance(stackBB))[0]}`;

/** Choisit la partie calculée la plus adaptée (format + tapis le plus proche). */
export function pickGame(index: SolverIndexEntry[], kind: string, stackBB: number): SolverIndexEntry | undefined {
  const list = index.filter(e => e.kind === kind);
  return [...list].sort((a, b) => Math.abs(a.stack - stackBB) - Math.abs(b.stack - stackBB))[0];
}

export function toSolverAct(spot: SolverSpot, a: TableAction, stackBB: number): string | undefined {
  const has = (x: string) => spot.acts.includes(x);
  if (a.type === "Fold") return has("F") ? "F" : undefined;
  if (a.type === "Check") return has("X") ? "X" : spot.acts.find(isCall);
  if (a.type === "Call") return has("C") ? "C" : has("L") ? "L" : has("X") ? "X" : undefined;
  // Bet / Raise : tapis si la mise engage l'essentiel du tapis, sinon la relance la plus proche
  const jam = spot.acts.find(isJam);
  const raises = spot.acts.filter(isRaise);
  if (jam && (a.amountBB >= stackBB * 0.6 || !raises.length)) return jam;
  if (!raises.length) return jam;
  return raises.sort((x, y) => Math.abs(+x.slice(1) - a.amountBB) - Math.abs(+y.slice(1) - a.amountBB))[0];
}

const fmtBB = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Phrase qui dit comment une mise saisie a été ramenée à l'arbre calculé (null si elle y est déjà). */
export function approxNote(pos: string, a: TableAction, act: string, stackBB: number): string | null {
  if ((a.type !== "Bet" && a.type !== "Raise") || !(a.amountBB > 0)) return null;
  const what = `${a.type === "Bet" ? "Mise" : "Relance"} de ${pos} à ${fmtBB(a.amountBB)} bb`;
  if (isJam(act)) return a.amountBB < stackBB * 0.95 ? `${what} comptée comme tapis.` : null;
  const size = +act.slice(1);
  if (isRaise(act) && Math.abs(a.amountBB - size) > size * 0.05) return `${what} comptée comme ${fmtBB(size)} bb (taille calculée la plus proche).`;
  return null;
}

export type CoverageLevel = "exact" | "approx" | "rare";
export interface Coverage { level: CoverageLevel; details: string[] }
export const RARE_NOTE = "Ligne que la stratégie du solveur ne joue presque jamais : le calcul l'a peu entraînée, conseil indicatif.";

/**
 * Fiabilité du conseil trouvé : « rare » si la ligne n'est presque jamais jouée par la stratégie,
 * « approx » si la main saisie a été rapprochée de l'arbre (taille, tapis, places, profondeur), sinon « exact ».
 */
export function coverageOf(m: SpotMatch, stackNote?: string | null): Coverage {
  const details = [...m.notes, ...(stackNote ? [stackNote] : [])];
  if (m.spot?.r) return { level: "rare", details: [RARE_NOTE, ...details] };
  return { level: details.length ? "approx" : "exact", details };
}

function describe(spot: SolverSpot): string {
  const acts = spot.k ? spot.k.split(",").map(s => s.split(":")) : [];
  const aggressive = acts.filter(([, a]) => a !== "F" && a !== "X");
  if (!aggressive.length) return `${spot.a} parle en premier (tout le monde s'est couché)`;
  const words = aggressive.map(([p, a]) => `${isJam(a) ? "tapis" : isRaise(a) ? "relance" : a === "L" ? "limp" : "call"} ${p}`);
  return `${spot.a} face à : ${words.join(", ")}`;
}

/**
 * Suit les actions préflop saisies sur la table jusqu'à la décision du héros.
 * `seatPos` donne la position 6-max de chaque siège (UTG+1 → UTG, LJ/HJ → MP…).
 * Les joueurs sans action saisie avant le héros sont supposés s'être couchés.
 */
export function matchSpot(g: SolverGame, seatPos: string[], heroSeat: number, actions: TableAction[], stackBB: number): SpotMatch {
  const heroPos = seatPos[heroSeat];
  const notes: string[] = [];
  if (!heroPos || !g.positions.includes(heroPos)) return { title: "", notes, reason: "Place le bouton et ton siège sur la table." };
  const pre = actions.filter(a => a.street === "Preflop" && seatPos[a.seatIdx]);
  const used = new Set<number>();
  if (new Set(seatPos.filter(Boolean)).size < seatPos.filter(Boolean).length) notes.push("Table à plus de 6 joueurs : places en plus regroupées sur les positions du 6-max.");
  let key = "";
  for (let guard = 0; guard < 40; guard++) {
    const spot = findSpot(g, key);
    if (!spot) {
      if (used.size === 0) return { title: "", notes, reason: "Tout le monde se serait couché avant toi : saisis sur la table l'action d'au moins un joueur." };
      return { title: "", notes, reason: "Cette ligne n'a pas été calculée (trop rare dans la stratégie du solveur).", missing: true, line: lineText(key) };
    }
    const remainingOthers = pre.some((a, i) => !used.has(i) && seatPos[a.seatIdx] !== heroPos);
    const nextIdx = pre.findIndex((a, i) => !used.has(i) && seatPos[a.seatIdx] === spot.a);
    if (spot.a === heroPos) {
      const heroIsLast = nextIdx === -1 || !pre.some((a, i) => i > nextIdx && !used.has(i) && seatPos[a.seatIdx] !== heroPos);
      if (heroIsLast || !remainingOthers) return { spot, title: describe(spot), notes };
    }
    let act: string | undefined;
    if (nextIdx >= 0) {
      act = toSolverAct(spot, pre[nextIdx], stackBB);
      used.add(nextIdx);
      if (!act) {
        const a = pre[nextIdx];
        const what = a.type === "Call" ? "paye" : a.type === "Check" ? "check" : a.type === "Fold" ? "se couche" : `relance ${fmtLine(a.amountBB)}`;
        return { title: "", notes, reason: `Action de ${spot.a} absente de l'arbre calculé.`, missing: true, line: [lineText(spot.k), `${spot.a} ${what}`].filter(Boolean).join(" · ") };
      }
      const approx = approxNote(spot.a, pre[nextIdx], act, stackBB);
      if (approx) notes.push(approx);
    } else {
      act = spot.acts.includes("F") ? "F" : spot.acts.includes("X") ? "X" : undefined;
      if (!act) return { title: "", notes, reason: "Ligne incomplète." };
    }
    key = childKey(spot, act);
  }
  return { title: "", notes, reason: "Ligne trop longue." };
}

/** Conseil pour une main : actions triées par fréquence. */
export function adviceForHand(spot: SolverSpot, hand: string): { act: string; pct: number }[] | null {
  const p = spot.h[hand];
  if (!p) return null;
  return spot.acts.map((act, i) => ({ act, pct: p[i] ?? 0 })).filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct);
}
