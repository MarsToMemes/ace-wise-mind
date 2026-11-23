// Tapis des joueurs suivis d'une main à l'autre à la même table (cash), gardés dans ce navigateur avec la table ;
// « Nouvelle table » les remet à 100 bb. Le règlement de chaque main (pots annexes, mise rendue, rake) est fait par
// le moteur de règles commun (lib/liveHand.ts → core/settle.ts). Le tapis effectif (toi contre le plus gros adversaire
// encore dans le coup) sert aux conseils.

export const STACKS_KEY = "ace.seatStacks";
export const DEFAULT_STACK = 100;

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
