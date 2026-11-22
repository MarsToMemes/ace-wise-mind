import type { PlayerAction } from "@/components/ActionMenu";
import { seatLabel, type TableSize } from "@/components/PokerTable";

/** Historique des mains saisies sur le site, gardé dans le navigateur (pas de compte, pas de serveur). */
export const HISTORY_KEY = "ace.handHistory";
export const HISTORY_MAX = 500;
export const HISTORY_EVENT = "ace:hand-history";

/** Tout ce qu'il faut pour remettre une main dans l'analyseur. */
export interface HandSnapshot {
  tableSize: TableSize;
  dealerIdx: number;
  userIdx: number;
  hole: string[];
  flop: string[];
  turn: string | null;
  river: string | null;
  folded: boolean[];
  stack: number;
  pot: number;
  call: number;
  actions: PlayerAction[];
  shown: Record<number, string>;
}

export interface SavedHand extends HandSnapshot {
  id: string;
  /** Date d'enregistrement (ms). */
  at: number;
  /** Position du joueur (« BTN », « BB »…), vide si le bouton n'était pas placé. */
  hero: string;
}

const isHand = (x: unknown): x is SavedHand => {
  const h = x as SavedHand;
  return !!h && typeof h === "object" && typeof h.id === "string" && typeof h.at === "number"
    && Array.isArray(h.hole) && h.hole.length === 2 && Array.isArray(h.flop) && Array.isArray(h.actions)
    && Array.isArray(h.folded) && typeof h.tableSize === "number";
};

export function loadHands(): SavedHand[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isHand).sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

function write(list: SavedHand[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch { /* stockage plein ou indisponible */ }
  try { window.dispatchEvent(new Event(HISTORY_EVENT)); } catch { /* hors navigateur */ }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Enregistre une main (il faut au moins les deux cartes du joueur).
 * `replaceId` : la main avait été rouverte depuis l'historique, on la met à jour au lieu d'en ajouter une.
 */
export function saveHand(snap: HandSnapshot, opts: { at?: number; replaceId?: string } = {}): SavedHand | null {
  if (snap.hole.length !== 2) return null;
  const list = loadHands();
  const old = opts.replaceId ? list.find(h => h.id === opts.replaceId) : undefined;
  const hero = snap.dealerIdx >= 0 && snap.userIdx >= 0 ? seatLabel(snap.userIdx, snap.dealerIdx, snap.tableSize) : "";
  const saved: SavedHand = {
    ...structuredCloneSafe(snap),
    id: old?.id ?? newId(),
    at: old?.at ?? opts.at ?? Date.now(),
    hero,
  };
  write([saved, ...list.filter(h => h.id !== saved.id)].sort((a, b) => b.at - a.at));
  return saved;
}

export function deleteHand(id: string) {
  write(loadHands().filter(h => h.id !== id));
}

export function clearHands() {
  write([]);
}

function structuredCloneSafe<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const STREET_FR: Record<PlayerAction["street"], string> = { Preflop: "Préflop", Flop: "Flop", Turn: "Turn", River: "River" };

/**
 * Résumé lisible de la ligne : « UTG relance 2,5 · Toi relance 7,5 | Flop : UTG check · Toi mise 6 ».
 * Les folds des joueurs qui n'ont rien misé avant le flop sont omis (ils n'apprennent rien).
 */
export function summarizeLine(h: HandSnapshot): string {
  const name = (seat: number) => (seat === h.userIdx ? "Toi" : h.dealerIdx >= 0 ? seatLabel(seat, h.dealerIdx, h.tableSize) : `Siège ${seat + 1}`);
  const involved = new Set<number>();
  const parts: string[] = [];
  let street: PlayerAction["street"] | null = null;
  let cur: string[] = [];
  const flush = () => {
    if (!cur.length || !street) return;
    parts.push(street === "Preflop" ? cur.join(" · ") : `${STREET_FR[street]} : ${cur.join(" · ")}`);
    cur = [];
  };
  for (const a of h.actions) {
    if (a.street !== street) { flush(); street = a.street; }
    if (a.type === "Fold") {
      if (a.seatIdx === h.userIdx || a.street !== "Preflop" || involved.has(a.seatIdx)) cur.push(`${name(a.seatIdx)} se couche`);
      continue;
    }
    involved.add(a.seatIdx);
    const word = a.type === "Raise" ? `relance ${num(a.amountBB)}` : a.type === "Bet" ? `mise ${num(a.amountBB)}` : a.type === "Call" ? "paye" : "check";
    cur.push(`${name(a.seatIdx)} ${word}`);
  }
  flush();
  return parts.join(" | ");
}
