// Tournois KO / bounty : valeur d'une tête en big blinds et effet sur les décisions.
//
// Valeur d'un jeton : la part « prize pool » du buy-in divisée par le tapis de départ.
//   1 jeton = (buy-in − part bounty) / tapis de départ   (en €)
// Valeur de la tête de l'adversaire, si tu le couvres :
//   - KO classique : tout le bounty ;
//   - KO progressif : la moitié en cash tout de suite + l'autre moitié ajoutée à ta tête,
//     comptée à 40 % (il faudra encore qu'on te sorte pour qu'elle paie) ;
//   - KO mystère : la valeur moyenne saisie.
// Équité requise pour payer : mise / (pot + mise + bounty).

import { RangeWeights, ALL_HANDS } from "@/engines/myRanges";
import { equityVsRange } from "@/engines/preflopEquity";

export type KoType = "classic" | "progressive" | "mystery";
export const PROGRESSIVE_FUTURE_SHARE = 0.4;

export interface BountyInput {
  buyIn: number;          // € (hors rake)
  bountyPart: number;     // € du buy-in qui va aux bounties
  startingStack: number;  // jetons
  bigBlind: number;       // jetons
  villainBounty: number;  // € : tête actuelle de l'adversaire (ou valeur moyenne en mystère)
  type: KoType;
  covers: boolean;
}

export interface BountyValue {
  eurPerChip: number;
  cashNowEur: number;     // € touchés tout de suite
  effectiveEur: number;   // € comptés dans la décision
  bountyChips: number;
  bountyBB: number;
}

export function bountyValue(inp: BountyInput): BountyValue {
  const prizePart = Math.max(0.0001, inp.buyIn - inp.bountyPart);
  const eurPerChip = prizePart / Math.max(1, inp.startingStack);
  const head = Math.max(0, inp.villainBounty);
  const cashNowEur = inp.type === "progressive" ? head / 2 : head;
  const effectiveEur = !inp.covers ? 0
    : inp.type === "progressive" ? head / 2 + (head / 2) * PROGRESSIVE_FUTURE_SHARE
    : head;
  const bountyChips = effectiveEur / eurPerChip;
  return {
    eurPerChip,
    cashNowEur: inp.covers ? cashNowEur : 0,
    effectiveEur,
    bountyChips,
    bountyBB: bountyChips / Math.max(1, inp.bigBlind),
  };
}

/** Équité minimale (0..1) pour payer `callBB` dans un pot de `potBB` (mise adverse incluse). */
export function requiredEquity(callBB: number, potBB: number, bountyBB: number): number {
  const c = Math.max(0, callBB);
  return c / Math.max(1e-9, potBB + c + Math.max(0, bountyBB));
}

export type CallStatus = "call" | "bounty" | "fold";

export interface CallChart {
  reqNoBounty: number;
  reqWithBounty: number;
  equity: Record<string, number>;
  status: Record<string, CallStatus>;
}

/**
 * Pour chaque main : son équité contre la range de tapis adverse, et le verdict
 * « call » (même sans bounty), « bounty » (call seulement grâce au bounty) ou « fold ».
 * Deux passes : rapide pour toutes les mains, puis précise près des seuils.
 */
export function callChart(inp: {
  callBB: number;
  potBB: number;
  bountyBB: number;
  jamRange: RangeWeights;
  quick?: boolean;
}): CallChart {
  const reqNoBounty = requiredEquity(inp.callBB, inp.potBB, 0);
  const reqWithBounty = requiredEquity(inp.callBB, inp.potBB, inp.bountyBB);
  const fast = inp.quick ? 200 : 300;
  const precise = inp.quick ? 600 : 1800;
  const equity: Record<string, number> = {};
  const status: Record<string, CallStatus> = {};
  ALL_HANDS.forEach((h, i) => {
    let eq = equityVsRange(h, inp.jamRange, { samples: fast, seed: 100 + i });
    const near = Math.min(Math.abs(eq - reqNoBounty), Math.abs(eq - reqWithBounty)) < 0.04;
    if (near) eq = equityVsRange(h, inp.jamRange, { samples: precise, seed: 500 + i });
    equity[h] = eq;
    status[h] = eq >= reqNoBounty ? "call" : eq >= reqWithBounty ? "bounty" : "fold";
  });
  return { reqNoBounty, reqWithBounty, equity, status };
}
