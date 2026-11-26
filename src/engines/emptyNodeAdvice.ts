// Nœud vide de la bibliothèque préflop (la stratégie du solveur n'y arrive jamais : aucune solution calculée) :
//  - le site le dit : « Pas de solution pour cette ligne · conseil indicatif », jamais un conseil présenté comme du GTO ;
//  - périmètre de la règle de cohérence (problème 2c) : call terminal en tête-à-tête (un adversaire à tapis, tous les
//    autres couchés : payer clôt les enchères) et range de tapis de l'adversaire connue par la bibliothèque (son nœud à
//    lui n'est pas vide). L'équité affichée ET la décision viennent de cette même range et des mêmes montants :
//    EV(call) = équité × (pot final − rake) − ce que tu paies ; tu paies si EV(call) > 0, sinon tu te couches.
//    Équité : tirage préflop avec graine fixe (égalités comptées pour moitié), cartes bloquées retirées.
//  - hors périmètre : le conseil reste celui du moteur de base, avec l'étiquette.
import { matchSpot, type SolverGame, type TableAction } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { equityVsRange } from "@/engines/preflopEquity";
import { readableLine } from "@/engines/emptyNodes";
import { rakeOf, type RakeRule } from "@/core/rake";

export const EMPTY_NODE_LABEL = "Pas de solution pour cette ligne · conseil indicatif";
/** Tirages de l'équité sur le site (≈ 22 ms, ±0,4 point). */
export const SITE_SAMPLES = 20000;

export interface EmptyNodeAdvice {
  key: string; line: string;
  scope: "call-terminal" | "hors périmètre";
  why?: string;
  /** Position de l'adversaire à tapis. */
  shover?: string;
  equity?: number; required?: number; ev?: number; action?: "Call" | "Fold";
  call?: number; finalPot?: number; rake?: number;
}

export interface EmptyNodeInput {
  game: SolverGame | null; seatPos: string[]; heroSeat: number; actions: TableAction[]; stackBB: number;
  /** Classe de la main du héros : AKo, 55… */
  hand: string;
  /** Pot avant ton call (tout l'argent déjà mis), ce qu'il te reste à payer, ton tapis restant. */
  potBB: number; toCallBB: number; heroStackBB: number;
  rake: RakeRule | null; samples?: number;
}

/** null : pas un nœud vide (le solveur a une réponse, ou la ligne n'est pas dans la bibliothèque). */
export function emptyNodeAdvice(o: EmptyNodeInput): EmptyNodeAdvice | null {
  if (!o.game || o.heroSeat < 0) return null;
  const m = matchSpot(o.game, o.seatPos, o.heroSeat, o.actions, o.stackBB);
  if (!m.spot || Object.keys(m.spot.h).length) return null;
  const key = m.spot.k, hero = m.spot.a, base = { key, line: readableLine(key) };
  const steps = key.split(",").map(s => s.split(":") as [string, string]);
  const folded = new Set(steps.filter(([, a]) => a === "F").map(([p]) => p));
  const live = new Set([...steps.map(([p]) => p), hero].filter(p => !folded.has(p)));
  const lastJam = steps.map(([, a]) => a.startsWith("A")).lastIndexOf(true);
  const shover = lastJam >= 0 ? steps[lastJam][0] : "";
  const terminal = lastJam >= 0 && shover !== hero && steps.slice(lastJam + 1).every(([, a]) => a === "F") && live.size === 2 && live.has(shover);
  if (!terminal) return { ...base, scope: "hors périmètre", why: "pas un call terminal en tête-à-tête" };
  const lr = lineRanges(o.game, o.seatPos, o.actions.filter(a => a.street === "Preflop" && a.type !== "Fold"), o.stackBB);
  const seat = o.seatPos.findIndex((p, i) => p === shover && lr?.bySeat[i]);
  const range = seat >= 0 ? lr!.bySeat[seat] : null;
  if (!range || !Object.keys(range).length) return { ...base, scope: "hors périmètre", shover, why: "range de tapis inconnue" };
  const equity = equityVsRange(o.hand, range, { samples: o.samples ?? SITE_SAMPLES, seed: 7 });
  const call = Math.min(o.toCallBB, o.heroStackBB);
  const excess = Math.max(0, o.toCallBB - o.heroStackBB);       // part du tapis adverse que tu ne couvres pas : rendue
  const finalPot = o.potBB - excess + call;
  const rake = rakeOf(finalPot, o.rake);                          // le board est donné jusqu'au bout : rake prélevé
  const ev = equity * (finalPot - rake) - call;
  return { ...base, scope: "call-terminal", shover, equity, required: call / (finalPot - rake), ev, action: ev > 0 ? "Call" : "Fold", call, finalPot, rake };
}
