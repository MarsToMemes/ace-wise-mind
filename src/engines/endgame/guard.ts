import type { EndgameResult } from "@/engines/endgame/solve";
import type { Family } from "@/engines/playerStats";
import type { Strength } from "@/engines/showdown";

/**
 * Garde-fou du solveur de fin de main : contre un récréatif (fiche « passif » = station, « agressif » = maniaque),
 * on ne suit pas un bluff du solveur — ces joueurs ne se couchent pas assez pour qu'il rapporte.
 * Mesuré au banc d'essai du 20 nov. 2026 : +0,45 bb par situation contre ces profils.
 * Renvoie true quand l'action principale du solveur est une mise / relance / tapis avec une main sans valeur.
 */
export function bluffGuard(result: EndgameResult | null, family: Family | null | undefined, heroStrength: Strength): boolean {
  if (!result?.actions.length || heroStrength !== "bluff") return false;
  if (family !== "recPassif" && family !== "recAgressif") return false;
  const main = result.actions.reduce((b, a) => (a.freq > b.freq ? a : b), result.actions[0]);
  return main.kind === "bet" || main.kind === "raise" || main.kind === "allin";
}
