// Réglages du bloc Bounty KO, gardés dans le navigateur et partagés avec le solveur Jam/Fold.
import type { KoType } from "@/engines/bountyKo";

export interface BountySettings {
  buyIn: number;
  bountyPart: number;
  startingStack: number;
  bigBlind: number;
  villainBounty: number;
  type: KoType;
  covers: boolean;
  /** Dernière valeur calculée de la tête adverse, en BB (0 si on ne couvre pas). */
  lastBountyBB: number;
}

export const DEFAULT_BOUNTY: BountySettings = {
  buyIn: 10, bountyPart: 5, startingStack: 20000, bigBlind: 400,
  villainBounty: 5, type: "progressive", covers: true, lastBountyBB: 0,
};

const KEY = "ace:bounty:v1";

export function loadBounty(): BountySettings {
  try {
    return { ...DEFAULT_BOUNTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULT_BOUNTY };
  }
}

export function saveBounty(s: BountySettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("ace:bounty"));
  } catch {
    /* stockage indisponible */
  }
}
