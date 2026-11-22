// Lacunes : situations où le conseil est moins fiable que le solveur (ligne non calculée, profondeur sans table,
// rapprochement, ligne rare, flop ou pot multiway sans solveur, garde-fou). Gardées dans ce navigateur seulement,
// pour choisir les prochains calculs ; rien n'est envoyé. L'export n'a lieu que sur un clic.
import { RARE_NOTE, type Coverage } from "@/engines/solverSpots";

export const GAPS_KEY = "ace.gaps";
export const GAPS_MAX = 200;
export const GAPS_EVENT = "ace:gaps";
const HANDS_KEPT = 20;

export type GapKind = "missing" | "depth" | "approx" | "rare" | "flop" | "multiway" | "guard";
export interface Gap { key: string; kind: GapKind; label: string }
export interface GapEntry extends Gap {
  count: number;      // mains distinctes où elle est apparue
  hands: string[];    // dernières mains concernées (identifiants de l'historique), la plus récente d'abord
  first: number;
  last: number;
}

export interface GapInput {
  street: "Preflop" | "Flop" | "Turn" | "River";
  hasHand: boolean;                 // deux cartes du joueur entrées
  stackBB: number;
  depthOk: boolean;                 // une table cash couvre ce tapis
  preflop?: { title?: string; coverage?: Coverage } | null;
  preflopMissing?: string | null;   // ligne préflop non calculée (texte)
  postflop?: boolean;               // un conseil après le flop est affiché
  multiway?: boolean;               // turn/river à 3 joueurs ou plus : pas de solveur de fin de main
  guard?: boolean;                  // garde-fou : bluff du solveur remplacé
}

/** Lacunes du conseil affiché. */
export function gapsOf(i: GapInput): Gap[] {
  if (!i.hasHand) return [];
  const out: Gap[] = [];
  if (i.street === "Preflop") {
    if (!i.depthOk) {
      const bb = Math.round(i.stackBB);
      out.push({ key: `depth|${bb}`, kind: "depth", label: `Tapis de ${bb} bb : pas de table cash à cette profondeur` });
      return out;
    }
    if (i.preflopMissing) {
      out.push({ key: `missing|${i.preflopMissing}`, kind: "missing", label: `Ligne préflop non calculée : ${i.preflopMissing}` });
    }
    const cov = i.preflop?.coverage;
    if (cov?.level === "rare") {
      const t = i.preflop?.title ?? "";
      out.push({ key: `rare|${t}`, kind: "rare", label: `Ligne rare : ${t}` });
    }
    if (cov && cov.level !== "exact") {
      for (const d of cov.details) if (d !== RARE_NOTE) out.push({ key: `approx|${d}`, kind: "approx", label: d });
    }
    return out;
  }
  if (!i.postflop) return out;
  if (i.street === "Flop") out.push({ key: "flop", kind: "flop", label: "Flop : pas de solveur, conseil maison" });
  if (i.multiway) out.push({ key: "multiway", kind: "multiway", label: "Turn ou river à 3 joueurs ou plus : pas de solveur, conseil maison" });
  if (i.guard) out.push({ key: "guard", kind: "guard", label: "Garde-fou : bluff du solveur remplacé contre un récréatif" });
  return out;
}

const isEntry = (x: unknown): x is GapEntry => {
  const g = x as GapEntry;
  return !!g && typeof g.key === "string" && typeof g.label === "string" && typeof g.count === "number" && Array.isArray(g.hands);
};
const order = (a: GapEntry, b: GapEntry) => b.count - a.count || b.last - a.last;

export function loadGaps(): GapEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(GAPS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isEntry).sort(order) : [];
  } catch {
    return [];
  }
}

function write(list: GapEntry[]) {
  try { localStorage.setItem(GAPS_KEY, JSON.stringify([...list].sort(order).slice(0, GAPS_MAX))); } catch { /* stockage plein ou indisponible */ }
  try { window.dispatchEvent(new Event(GAPS_EVENT)); } catch { /* hors navigateur */ }
}

/** Ajoute les lacunes vues dans une main (chacune comptée une fois par main). */
export function recordGaps(gaps: Gap[], handId: string, at = Date.now()) {
  if (!gaps.length) return;
  const list = loadGaps();
  const byKey = new Map(list.map(g => [g.key, g]));
  for (const g of new Map(gaps.map(x => [x.key, x])).values()) {
    const e = byKey.get(g.key);
    if (!e) {
      byKey.set(g.key, { ...g, count: 1, hands: [handId], first: at, last: at });
      continue;
    }
    if (!e.hands.includes(handId)) e.count += 1;
    e.hands = [handId, ...e.hands.filter(h => h !== handId)].slice(0, HANDS_KEPT);
    e.last = Math.max(e.last, at);
    e.label = g.label;
  }
  write([...byKey.values()]);
}

export function clearGaps() {
  write([]);
}

/** Fichier d'export (sans les identifiants de mains). */
export function exportGaps(at = Date.now()): string {
  const gaps = loadGaps().map(({ kind, label, count, first, last }) => ({ kind, label, count, first, last }));
  return JSON.stringify({ version: 1, exportedAt: at, gaps }, null, 1);
}

type Act = { seatIdx: number; type?: string };

/** Le joueur vient d'ajouter son action (une seule action de plus, la sienne) : le conseil d'avant compte. */
export function heroJustActed(prevLen: number, actions: Act[], userIdx: number): boolean {
  return actions.length === prevLen + 1 && actions[actions.length - 1]?.seatIdx === userIdx;
}

/** Main laissée alors que c'était au joueur d'agir (il n'a pas agi en dernier et ne s'est pas couché). */
export function endsOnHeroDecision(actions: Act[], userIdx: number): boolean {
  return !actions.some(a => a.seatIdx === userIdx && a.type === "Fold") && actions[actions.length - 1]?.seatIdx !== userIdx;
}
