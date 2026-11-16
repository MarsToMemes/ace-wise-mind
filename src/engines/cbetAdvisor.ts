// Conseil de c-bet au flop, déduit des principes GTO à partir de :
//  - l'avantage d'équité du relanceur (PFR),
//  - l'avantage de « mains fortes » (avantage de nuts),
//  - la texture (statique / dynamique), la position et le type de pot.
// Ce sont des règles de principe, pas la sortie d'un solveur.

import { BoardTexture } from "@/engines/boardTexture";
import { BoardAdvantage } from "@/engines/rangeVsRange";
import { PotType } from "@/engines/matchupRanges";

export const SIZE_TIERS = ["20-25%", "25-33%", "33-50%", "50-66%", "66-75%"] as const;
export type SizeTier = typeof SIZE_TIERS[number];

export interface CbetAdvice {
  frequencyPct: number;
  size: SizeTier;
  checkMostly: boolean;
  equityEdgePts: number;   // équité PFR − 50, en points
  nutEdgePts: number;      // % mains fortes PFR − payeur, en points
  reasons: string[];
  donk: { suggested: boolean; text: string };
}

export function adviseCbet(inp: {
  texture: BoardTexture;
  adv: BoardAdvantage;
  pfrInPosition: boolean;
  potType: PotType;
}): CbetAdvice {
  const { texture: t, adv, pfrInPosition: ip, potType } = inp;
  const eqEdge = Math.round((adv.pfrEquity * 100 - 50) * 10) / 10;
  const nutEdge = Math.round((adv.pfrStrongPct - adv.callerStrongPct) * 10) / 10;
  const reasons: string[] = [];

  // ---- fréquence
  let f = 50 + 2.2 * eqEdge + (ip ? 10 : -8) + (t.dynamic ? -8 : 8) + (potType === "3bet" ? 5 : 0);
  f = Math.max(20, Math.min(90, Math.round(f / 5) * 5));

  reasons.push(
    eqEdge >= 4 ? `Le relanceur a l'avantage d'équité (+${eqEdge} pts) : sa range touche mieux ce flop.`
    : eqEdge <= -2 ? `Le payeur a l'avantage d'équité (${eqEdge} pts) : ce flop touche mieux sa range.`
    : `Équité presque partagée (${eqEdge >= 0 ? "+" : ""}${eqEdge} pts).`,
  );
  reasons.push(ip
    ? "En position : on réalise mieux son équité, on peut miser plus souvent."
    : "Hors position : on réalise moins bien son équité, on checke davantage.");
  reasons.push(t.dynamic
    ? "Board dynamique : les cartes du turn changent beaucoup les forces, on protège moins avec des petites mises."
    : "Board statique : peu de tirages, une petite mise fréquente suffit à prendre de la valeur et à faire coucher les cartes hautes.");

  // ---- taille
  let tier: number;
  if (nutEdge >= 4 && t.dynamic) {
    tier = 4;
    reasons.push(`Avantage de nuts (+${nutEdge} pts) sur board dynamique : mise grosse et polarisée (fortes mains + bluffs avec tirages).`);
  } else if (eqEdge >= 4 && !t.dynamic) {
    tier = 1;
    reasons.push("Avantage d'équité sans gros avantage de nuts sur board statique : petite mise avec une grande partie de la range.");
  } else if (nutEdge >= 4) {
    tier = 3;
    reasons.push(`Avantage de nuts (+${nutEdge} pts) : taille moyenne à grosse.`);
  } else {
    tier = 2;
  }
  if (potType === "3bet") {
    tier = Math.max(0, tier - 1);
    reasons.push("Pot 3-betté : tapis plus court par rapport au pot, les mises sont plus petites.");
  }

  const checkMostly = f <= 35;
  if (checkMostly) reasons.push("Peu d'avantage : checker la majorité de la range, ne miser que les mains fortes et quelques bons tirages.");

  // ---- donk bet (le payeur joue avant le relanceur)
  const callerActsFirst = ip;
  const lowish = t.height === "middle" || t.height === "low";
  const suggested = callerActsFirst && nutEdge <= -2 && lowish;
  const donk = {
    suggested,
    text: suggested
      ? `Le payeur a plus de mains fortes (${Math.abs(nutEdge)} pts) sur ce board ${t.height === "low" ? "bas" : "médian"} : un donk bet petit (25-33 %) avec une partie de sa range peut avoir du sens.`
      : callerActsFirst
        ? "Pas de donk bet : le payeur checke au relanceur avec toute sa range."
        : "Donk bet impossible ici : le relanceur parle en premier.",
  };

  return { frequencyPct: f, size: SIZE_TIERS[tier], checkMostly, equityEdgePts: eqEdge, nutEdgePts: nutEdge, reasons, donk };
}
