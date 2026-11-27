// Défense minimale face à un tapis en tête-à-tête (D46). Après un tapis, plus aucune décision : on paie avec la meilleure
// part de sa range, et seulement elle. Cette part vaut pot d'avant la mise / pot avec la mise (la « défense minimale ») :
// un bluff ne rapporte alors rien à l'adversaire, et sa value ne fait pas payer des mains trop faibles. La règle ne dépend
// pas de la range qu'on lui prête (c'est ce modèle que le banc B3 a exploité : trop de calls au flop et à la turn, trop de
// folds à la river). Classement des mains : force à l'abattage sur le board actuel, dans ta range (égalités pour moitié).
import { handPercentile } from "@/engines/postflopRanges";
import type { Combo } from "@/engines/rangeVsRange";

export interface AllInDefense { mdf: number; percentile: number; inTop: boolean }

/** Part de ta range à défendre : pot d'avant la mise de l'adversaire / pot avec sa mise (pot = tout l'argent au milieu). */
export const minimumDefense = (potBB: number, toCallBB: number) => (potBB > 0 ? Math.max(0, Math.min(1, (potBB - toCallBB) / potBB)) : 0);

/** Payer clôt les enchères : un seul adversaire, et plus de relance possible (il est à tapis, ou ton tapis ne couvre pas). */
export const isTerminalCall = (o: { toCallBB: number; heroStackBB: number; canRaise?: boolean; opponents: number }) =>
  o.opponents === 1 && o.toCallBB > 0 && (o.canRaise === false || o.toCallBB >= o.heroStackBB - 1e-6);

export function allInDefense(hole: string[], heroRange: Combo[], board: string[], potBB: number, toCallBB: number): AllInDefense {
  const mdf = minimumDefense(potBB, toCallBB);
  const percentile = handPercentile(hole, heroRange, board);
  return { mdf, percentile, inTop: percentile >= 1 - mdf };
}

/** Phrase affichée. */
export const defenseText = (d: AllInDefense) =>
  `Face à un tapis, défense minimale : tu paies avec les ${Math.round(100 * d.mdf)} % du haut de ta range ; ta main est au ${Math.round(100 * d.percentile)}e centile de ta range, donc ${d.inTop ? "dedans" : "en dessous"}.`;
