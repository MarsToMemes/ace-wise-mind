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
