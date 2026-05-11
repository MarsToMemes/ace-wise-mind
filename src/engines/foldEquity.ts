// Fold Equity Engine
// FE = P(fold) * pot. Combined with showdown equity for semi-bluff EV.

import type { OpponentProfile } from "./opponentProfile";

export type FELevel = "high" | "medium" | "low" | "none";

export interface FEInput {
  potBB: number;
  betBB: number;
  opponents: number;
  heroStackBB: number;
  villainStackBB?: number;
  position: string;
  profile?: OpponentProfile;
  icmPressureBoost?: boolean;
  villainCommittedPct?: number; // 0..1
  showdownEquityPct?: number; // 0..100
}

export interface FEResult {
  estimatedFoldPct: number;
  breakEvenFoldPct: number;
  evOfBluffBB: number;
  evTotalBB: number;
  level: FELevel;
  reasoning: string;
}

const BASE_FOLD_BY_PROFILE: Record<string, number> = {
  station: 0.10,
  nit: 0.62,
  lag: 0.32,
  tag: 0.42,
  unknown: 0.40,
};

export function estimateFoldPct(inp: FEInput): number {
  let p = BASE_FOLD_BY_PROFILE[inp.profile ?? "unknown"];
  // Position: late > early (slight increase)
  if (["BTN", "CO"].includes(inp.position)) p += 0.05;
  if (["UTG", "UTG+1", "MP"].includes(inp.position)) p -= 0.04;
  // Multi-way collapses FE
  if (inp.opponents >= 2) p *= Math.pow(0.7, inp.opponents - 1);
  // Villain already committed
  if (inp.villainCommittedPct && inp.villainCommittedPct >= 0.4) p *= 0.45;
  // Stack jam dynamics: jamming a tiny stack ("please call me") reduces FE
  if (inp.heroStackBB <= 8 && inp.betBB >= inp.heroStackBB * 0.9) p *= 0.85;
  // ICM near bubble: medium stacks fold more
  if (inp.icmPressureBoost) p += 0.08;
  return Math.max(0.02, Math.min(0.92, p));
}

export function computeFE(inp: FEInput): FEResult {
  const fold = estimateFoldPct(inp);
  const pot = inp.potBB;
  const bet = inp.betBB;
  // Break-even fold% (pure bluff): bet / (bet + pot)
  const be = bet / (bet + pot);
  const evBluff = fold * pot - (1 - fold) * bet;
  const eq = (inp.showdownEquityPct ?? 0) / 100;
  // Combined EV with showdown (semi-bluff)
  const evCalled = eq * (pot + bet) - (1 - eq) * bet;
  const evTotal = fold * pot + (1 - fold) * evCalled;

  const level: FELevel =
    fold >= 0.55 ? "high"
    : fold >= 0.40 ? "medium"
    : fold >= 0.22 ? "low" : "none";

  const reasoning =
    `Fold≈${Math.round(fold * 100)}% · break-even ${Math.round(be * 100)}%. ` +
    (fold > be
      ? `Aggression is +EV by ${(evBluff).toFixed(2)}BB.`
      : `Pure bluff is -EV; needs ${(Math.round((be) * 100))}%+ folds.`) +
    (inp.showdownEquityPct ? ` Combined semi-bluff EV: ${evTotal.toFixed(2)}BB.` : "");

  return {
    estimatedFoldPct: Math.round(fold * 100),
    breakEvenFoldPct: Math.round(be * 100),
    evOfBluffBB: +evBluff.toFixed(2),
    evTotalBB: +evTotal.toFixed(2),
    level,
    reasoning,
  };
}
