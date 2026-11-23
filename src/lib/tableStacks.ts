// Tapis des joueurs suivis d'une main à l'autre à la même table (cash) : chacun perd ce qu'il a misé, le gagnant
// prend le pot (rake déduit si le flop est vu, mise non payée rendue). Gardés dans ce navigateur avec la table ;
// « Nouvelle table » les remet à 100 bb. Le tapis effectif (toi contre le plus gros adversaire encore dans le coup)
// sert aux conseils.
import type { PlayerAction } from "@/components/ActionMenu";
import { trackPot, type PotOptions } from "@/lib/potTracker";
import { rakeOf, CASH_RAKE, type RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";

export const STACKS_KEY = "ace.seatStacks";
export const DEFAULT_STACK = 100;
const STREETS: PlayerAction["street"][] = ["Preflop", "Flop", "Turn", "River"];
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Total mis par chaque siège dans la main (blindes comprises). */
export function handContributions(actions: PlayerAction[], opts: PotOptions, size: number): number[] {
  const out = Array(size).fill(0);
  for (const st of STREETS) {
    const c = trackPot(actions, opts, st).contribs;
    for (const [seat, v] of Object.entries(c)) if (+seat < size) out[+seat] += v as number;
  }
  return out.map(r2);
}

/** Tapis après la main : mises retirées, mise non payée rendue, pot (moins le rake) partagé entre les gagnants. */
export function settleHand(stacks: number[], contrib: number[], winners: number[], o: { flopSeen: boolean; rake?: RakeRule }): number[] {
  const c = [...contrib];
  const order = c.map((v, i) => i).sort((a, b) => c[b] - c[a]);
  const refund = order.length > 1 ? c[order[0]] - c[order[1]] : 0;
  if (refund > 0) c[order[0]] -= refund;
  const pot = c.reduce((t, v) => t + v, 0);
  const net = pot - (o.flopSeen ? rakeOf(pot, o.rake ?? CASH_RAKE) : 0);
  const next = stacks.map((s, i) => s - contrib[i] + (i === order[0] ? refund : 0));
  for (const w of winners) next[w] += net / winners.length;
  return next.map(x => Math.max(0, Math.round(x * 1000) / 1000));
}

export type Outcome = { kind: "auto"; winners: number[] } | { kind: "ask"; candidates: number[] } | { kind: "incomplete" };

const CARD = /([2-9TJQKA])([shdc])/gi;
const cardsOf = (text: string) => [...(text ?? "").matchAll(CARD)].map(m => m[1].toUpperCase() + m[2].toLowerCase());

/**
 * Qui a gagné la main. Un seul joueur encore dans le coup : lui. Abattage (river posée) avec toutes les cartes
 * connues : le meilleur (ou les ex æquo). Sinon il faut demander, ou la main n'est pas finie.
 * Les joueurs sans action saisie sont couchés (comme pour le conseil) ; le bouton « Couché » compte aussi.
 */
export function handOutcome(h: {
  size: number; hero: number; heroCards: string[]; board: string[]; shown: Record<number, string>;
  folded: boolean[]; actions: PlayerAction[];
}): Outcome {
  const out = new Set<number>();
  for (let i = 0; i < h.size; i++) if (h.folded[i]) out.add(i);
  for (const a of h.actions) if (a.type === "Fold") out.add(a.seatIdx);
  const inHand = new Set(h.actions.filter(a => a.type !== "Fold").map(a => a.seatIdx));
  if (h.hero >= 0 && h.heroCards.length === 2) inHand.add(h.hero);
  const live = [...inHand].filter(s => !out.has(s)).sort((a, b) => a - b);
  if (live.length === 1) return { kind: "auto", winners: live };
  if (live.length === 0 || h.board.length < 5) return { kind: "incomplete" };
  const hands = live.map(s => (s === h.hero ? h.heroCards : cardsOf(h.shown[s])));
  if (hands.some(c => c.length !== 2)) return { kind: "ask", candidates: live };
  const ranks = hands.map(c => rank7([...c, ...h.board]));
  const best = Math.max(...ranks);
  return { kind: "auto", winners: live.filter((s, i) => ranks[i] === best) };
}

/** Tapis effectif : le plus petit entre toi et le plus gros adversaire encore dans le coup. */
export function effectiveStack(stacks: number[], hero: number, opponents: number[]): number {
  const mine = stacks[hero] ?? DEFAULT_STACK;
  const opp = opponents.map(s => stacks[s]).filter(x => Number.isFinite(x));
  return opp.length ? Math.min(mine, Math.max(...opp)) : mine;
}

export function loadStacks(size: number): number[] {
  try {
    const s = JSON.parse(localStorage.getItem(STACKS_KEY) || "null");
    if (s && Array.isArray(s.stacks) && s.stacks.length === size && s.stacks.every((x: unknown) => typeof x === "number" && x >= 0)) return [...s.stacks];
  } catch { /* stockage abîmé ou indisponible */ }
  return Array(size).fill(DEFAULT_STACK);
}

export function saveStacks(stacks: number[]) {
  try { localStorage.setItem(STACKS_KEY, JSON.stringify({ stacks })); } catch { /* stockage indisponible */ }
}
