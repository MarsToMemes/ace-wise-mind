// Étape B2 (D32) : quelle action mettre en avant pour ta main. D'habitude, la plus jouée par le solveur. Mais si le
// calcul s'est arrêté avant d'avoir réglé ta main (la plus jouée rapporte nettement moins que la meilleure), c'est la
// plus rentable qui est mise en avant, avec une explication. Et si les deux meilleures rapportent presque pareil, on le dit.
import type { EndgameAction } from "@/engines/endgame/solve";

const bb = (x: number) => `${x >= 0 ? "+" : ""}${(Math.round(x * 10) / 10).toString().replace(".", ",")} bb`;
const short = (label: string) => label.replace(/ = .*/, "");

/** Écart sous lequel deux actions « rapportent presque pareil » : 0,1 bb ou 0,5 % du pot. */
export const evTolerance = (pot: number) => Math.max(0.1, 0.005 * pot);

export function pickMain(actions: EndgameAction[], pot: number): { main: EndgameAction; note?: string; close?: string } {
  const tol = evTolerance(pot);
  const frequent = actions.reduce((b, a) => (a.freq > b.freq ? a : b), actions[0]);
  const byEv = [...actions].sort((a, b) => b.ev - a.ev), best = byEv[0];
  const main = frequent.ev < best.ev - tol ? best : frequent;
  const note = main === frequent ? undefined
    : `Le calcul n'a pas fini de régler ta main : l'action la plus jouée (${short(frequent.label)}, ${Math.round(frequent.freq * 100)} %) rapporte ${(Math.round((best.ev - frequent.ev) * 10) / 10).toString().replace(".", ",")} bb de moins que ${short(best.label)}, mise en avant.`;
  const second = byEv[1];
  const close = second && best.ev - second.ev <= tol
    ? `Presque indifférent : ${short(best.label)} (${bb(best.ev)}) et ${short(second.label)} (${bb(second.ev)}) rapportent presque pareil.` : undefined;
  return { main, note, close };
}
