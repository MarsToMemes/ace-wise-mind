// Tournament-aware poker engine
// Provides M-ratio, stage classification, ICM pressure, push/fold decisions and ICM-adjusted scoring.

export type TournamentType = "turbo" | "standard" | "deepstack" | "sitngo" | "hyper";
export type TournamentStage = "deep" | "middle" | "push-fold" | "bubble" | "final-table";
export type ICMPressure = "low" | "medium" | "high" | "critical";

export interface TournamentTypeConfig {
  id: TournamentType;
  label: string;
  blindIntervalMin: number;
  startingStackBB: number;
  anteFromLevel: number | null; // null => no ante
  payoutSpotsDefault: number;
  pushFoldThresholdM: number;
  description: string;
}

export const TOURNAMENT_TYPES: Record<TournamentType, TournamentTypeConfig> = {
  turbo: {
    id: "turbo",
    label: "Turbo MTT",
    blindIntervalMin: 5,
    startingStackBB: 50,
    anteFromLevel: 3,
    payoutSpotsDefault: 15,
    pushFoldThresholdM: 15,
    description: "Fast structure. Push/fold from M<15. High ICM pressure early.",
  },
  standard: {
    id: "standard",
    label: "Standard MTT",
    blindIntervalMin: 17,
    startingStackBB: 100,
    anteFromLevel: 4,
    payoutSpotsDefault: 15,
    pushFoldThresholdM: 10,
    description: "Classic structure. Push/fold from M<10. Standard ICM.",
  },
  deepstack: {
    id: "deepstack",
    label: "Deep Stack MTT",
    blindIntervalMin: 30,
    startingStackBB: 200,
    anteFromLevel: 6,
    payoutSpotsDefault: 15,
    pushFoldThresholdM: 8,
    description: "Postflop heavy early. Push/fold from M<8. ICM late.",
  },
  sitngo: {
    id: "sitngo",
    label: "Sit & Go (9-max)",
    blindIntervalMin: 8,
    startingStackBB: 50,
    anteFromLevel: null,
    payoutSpotsDefault: 3,
    pushFoldThresholdM: 12,
    description: "Top 3 paid. Extreme bubble ICM. Shove ranges shift hard.",
  },
  hyper: {
    id: "hyper",
    label: "Hyper-Turbo",
    blindIntervalMin: 3,
    startingStackBB: 25,
    anteFromLevel: null,
    payoutSpotsDefault: 3,
    pushFoldThresholdM: 20,
    description: "Push/fold from hand 1. M<20 = shove territory.",
  },
};

export interface TournamentState {
  type: TournamentType;
  stackChips: number;
  BB: number;
  SB: number;
  ante: number;
  playersAtTable: number;
  playersRemaining: number;
  payoutSpots: number;
  mRatio: number;
  stackBB: number;
  stage: TournamentStage;
  icmPressure: ICMPressure;
}

// M-ratio = stack / (BB + SB + ante * players_at_table)
export function computeMRatio(
  stack: number, BB: number, SB: number, ante: number, playersAtTable: number,
): number {
  const cost = Math.max(0.0001, BB + SB + ante * Math.max(0, playersAtTable));
  return stack / cost;
}

export function classifyStage(
  mRatio: number, playersRemaining: number, payoutSpots: number,
): TournamentStage {
  // Final table heuristic: 9 or fewer left
  if (playersRemaining > 0 && playersRemaining <= 9) return "final-table";
  // Bubble: within 1.5x of payout cutoff (e.g., 4 left, 3 paid)
  if (payoutSpots > 0 && playersRemaining > payoutSpots && playersRemaining <= Math.ceil(payoutSpots * 1.5) + 1) {
    return "bubble";
  }
  if (mRatio < 5) return "push-fold";
  if (mRatio < 10) return "push-fold";
  if (mRatio < 20) return "middle";
  return "deep";
}

export function classifyICMPressure(
  stage: TournamentStage,
  type: TournamentType,
  playersRemaining: number,
  payoutSpots: number,
): ICMPressure {
  if (stage === "bubble") {
    return type === "sitngo" || type === "hyper" ? "critical" : "high";
  }
  if (stage === "final-table") return "high";
  // Approaching the money
  if (payoutSpots > 0 && playersRemaining > 0 && playersRemaining <= payoutSpots * 2) {
    return type === "sitngo" ? "high" : "medium";
  }
  if (type === "turbo" || type === "hyper") {
    if (stage === "push-fold") return "high";
    if (stage === "middle") return "medium";
    return "low";
  }
  if (stage === "push-fold") return "medium";
  return "low";
}

// === Hand tier ===
const PAIRS_TIER: Record<string, "Premium" | "Strong" | "Playable" | "Marginal" | "Trash"> = {
  AA: "Premium", KK: "Premium", QQ: "Premium", JJ: "Premium",
  TT: "Strong", "99": "Strong", "88": "Strong",
  "77": "Playable", "66": "Playable", "55": "Playable",
  "44": "Marginal", "33": "Marginal", "22": "Marginal",
};

export function classifyHandTier(holeCards: string[]):
  "Premium" | "Strong" | "Playable" | "Marginal" | "Trash" {
  if (!holeCards || holeCards.length < 2) return "Trash";
  const RANKS = "23456789TJQKA";
  const r1 = holeCards[0][0], s1 = holeCards[0][1];
  const r2 = holeCards[1][0], s2 = holeCards[1][1];
  const v1 = RANKS.indexOf(r1) + 2, v2 = RANKS.indexOf(r2) + 2;
  const hi = Math.max(v1, v2), lo = Math.min(v1, v2);
  const suited = s1 === s2;
  if (v1 === v2) {
    const key = `${r1}${r2}`;
    return PAIRS_TIER[key] || "Trash";
  }
  // AK, AQ
  if (hi === 14 && lo === 13) return "Premium";
  if (hi === 14 && lo === 12) return suited ? "Premium" : "Strong";
  if (hi === 14 && lo === 11) return "Strong";
  if (hi === 14 && lo >= 9) return suited ? "Strong" : "Playable";
  if (hi === 14) return suited ? "Playable" : "Marginal";
  if (hi === 13 && lo === 12) return "Strong";
  if (hi === 13 && lo === 11) return "Strong";
  if (hi === 13 && lo === 10) return suited ? "Strong" : "Playable";
  if (hi === 13 && lo >= 9) return suited ? "Playable" : "Marginal";
  if (hi === 12 && lo === 11) return "Playable";
  if (hi === 12 && lo === 10) return "Playable";
  if (hi === 11 && lo === 10) return "Playable";
  // Suited connectors / suited gappers
  if (suited && hi - lo === 1 && lo >= 6) return "Playable";
  if (suited && hi - lo <= 2 && lo >= 7) return "Marginal";
  if (suited && hi >= 10) return "Marginal";
  return "Trash";
}

const POSITION_GROUPS: Record<string, "early" | "middle" | "late" | "blinds"> = {
  UTG: "early", "UTG+1": "early", "UTG+2": "early",
  MP: "middle", LJ: "middle", HJ: "middle",
  CO: "late", BTN: "late",
  SB: "blinds", BB: "blinds",
};

export function pushFoldDecision(
  holeCards: string[],
  position: string,
  mRatio: number,
  icmPressure: ICMPressure,
  opponents: number,
): { action: "Shove" | "Call-Shove" | "Fold"; reasoning: string; handTier: string } {
  const tier = classifyHandTier(holeCards);
  const posGroup = POSITION_GROUPS[position] || "late";

  // Threshold to widen shove range as M shrinks
  const veryShort = mRatio < 5;
  const short = mRatio < 10;

  // ICM tightening factor
  const icmTight = icmPressure === "critical" ? 2 : icmPressure === "high" ? 1 : 0;

  // Determine min tier required to shove from position
  const tierRank: Record<string, number> = {
    Premium: 4, Strong: 3, Playable: 2, Marginal: 1, Trash: 0,
  };
  const tRank = tierRank[tier];

  let requiredShove = 4; // default Premium only
  if (veryShort) {
    if (posGroup === "late" || posGroup === "blinds") requiredShove = 1;
    else if (posGroup === "middle") requiredShove = 2;
    else requiredShove = 3;
  } else if (short) {
    if (posGroup === "late") requiredShove = 2;
    else if (posGroup === "blinds") requiredShove = 2;
    else if (posGroup === "middle") requiredShove = 3;
    else requiredShove = 3;
  } else {
    requiredShove = 4;
  }
  requiredShove = Math.min(4, requiredShove + icmTight);

  // Multiway raises required tier
  if (opponents >= 3) requiredShove = Math.min(4, requiredShove + 1);

  if (tRank >= requiredShove) {
    return {
      action: "Shove",
      handTier: tier,
      reasoning: `${tier} hand from ${position} at M=${mRatio.toFixed(1)}. ICM ${icmPressure}. Shove maximizes fold equity and realizes equity when called.`,
    };
  }

  // Call-shove logic: only premium/strong call shoves under ICM
  const requiredCall = icmPressure === "critical" ? 4 : icmPressure === "high" ? 4 : 3;
  if (tRank >= requiredCall && short) {
    return {
      action: "Call-Shove",
      handTier: tier,
      reasoning: `${tier} hand strong enough to call a shove at M=${mRatio.toFixed(1)} with ${icmPressure} ICM pressure.`,
    };
  }

  return {
    action: "Fold",
    handTier: tier,
    reasoning: `${tier} hand below shove threshold from ${posGroup} position at M=${mRatio.toFixed(1)} with ${icmPressure} ICM pressure. Preserve stack.`,
  };
}

export function icmAdjustedScore(
  baseScore: number,
  icmPressure: ICMPressure,
  stage: TournamentStage,
): number {
  // Reduce aggression when survival matters more than chip EV
  let factor = 1;
  if (icmPressure === "critical") factor = 0.7;
  else if (icmPressure === "high") factor = 0.82;
  else if (icmPressure === "medium") factor = 0.92;
  if (stage === "bubble") factor *= 0.9;
  return Math.max(0, baseScore * factor);
}

export function buildTournamentState(input: {
  type: TournamentType;
  stackChips: number;
  BB: number;
  SB?: number;
  ante: number;
  playersAtTable: number;
  playersRemaining: number;
  payoutSpots: number;
}): TournamentState {
  const SB = input.SB ?? Math.round(input.BB / 2);
  const m = computeMRatio(input.stackChips, input.BB, SB, input.ante, input.playersAtTable);
  const stackBB = input.BB > 0 ? input.stackChips / input.BB : 0;
  const stage = classifyStage(m, input.playersRemaining, input.payoutSpots);
  const icmPressure = classifyICMPressure(stage, input.type, input.playersRemaining, input.payoutSpots);
  return {
    type: input.type,
    stackChips: input.stackChips,
    BB: input.BB,
    SB,
    ante: input.ante,
    playersAtTable: input.playersAtTable,
    playersRemaining: input.playersRemaining,
    payoutSpots: input.payoutSpots,
    mRatio: m,
    stackBB,
    stage,
    icmPressure,
  };
}

export function stageLabel(stage: TournamentStage): string {
  switch (stage) {
    case "deep": return "Deep";
    case "middle": return "Middle Stack";
    case "push-fold": return "Push-Fold";
    case "bubble": return "Bubble";
    case "final-table": return "Final Table";
  }
}
