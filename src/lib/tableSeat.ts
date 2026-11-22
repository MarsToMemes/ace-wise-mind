import type { TableSize } from "@/components/PokerTable";

/** Table en cours : nombre de sièges, siège du bouton, ton siège (-1 = pas encore placé). */
export interface TableSeat {
  size: TableSize;
  dealer: number;
  user: number;
}

/** Gardée d'une visite à l'autre : on ne replace le bouton qu'en changeant de table. */
export const SEAT_KEY = "ace.tableSeat";

const validSize = (n: unknown): n is TableSize => Number.isInteger(n) && (n as number) >= 2 && (n as number) <= 9;
const validIdx = (i: unknown, size: number) => Number.isInteger(i) && (i as number) >= -1 && (i as number) < size;

/** Main suivante à la même table : le bouton passe au siège suivant (celui de la petite blinde), tu gardes ta place. */
export function nextHandSeat(s: TableSeat): TableSeat {
  return { ...s, dealer: s.dealer < 0 ? -1 : (s.dealer + 1) % s.size };
}

export function loadSeat(): TableSeat | null {
  try {
    const s = JSON.parse(localStorage.getItem(SEAT_KEY) || "null");
    if (s && validSize(s.size) && validIdx(s.dealer, s.size) && validIdx(s.user, s.size) && s.dealer >= 0) {
      return { size: s.size, dealer: s.dealer, user: s.user };
    }
  } catch { /* stockage abîmé ou indisponible */ }
  return null;
}

/** null : on quitte la table, plus rien n'est gardé. */
export function saveSeat(s: TableSeat | null) {
  try {
    if (s && s.dealer >= 0) localStorage.setItem(SEAT_KEY, JSON.stringify(s));
    else localStorage.removeItem(SEAT_KEY);
  } catch { /* stockage indisponible */ }
}
