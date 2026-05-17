// Bluff detection heuristics — sizing × texture × history × population/profile/position/stack.
// Base table sourced from Modern Poker Theory + population observations + solver baselines.

export type Street = "Flop" | "Turn" | "River";
export type Texture = "Dry" | "Semi-wet" | "Wet";
export type SizingCategory = "Min-bet" | "Small" | "Medium" | "Large" | "Overbet";
export type VillainType = "Nit" | "TAG" | "LAG" | "Maniac" | "Station" | "Whale" | "Unknown";
export type PositionRel = "IP" | "OOP";

export interface BluffAnalysis {
  isLikelyBluff: boolean;
  bluffFrequency: number;           // 0..100, final after all adjustments
  baseBluffFrequency: number;       // 0..100, before adjustments
  confidence: number;               // 0..100
  reasoning: string;
  heuristicUsed: string;
  adjustments: string[];            // human-readable adjustment trail
  recommendation: "Call" | "Fold";
  recommendationReasoning: string;
  potOddsPct?: number;              // 0..100 (if pot/size known)
}

export interface BluffInput {
  street: Street;
  sizeBB: number;
  potBB: number;
  texture: Texture;
  // history
  villainCbetFlop?: boolean;
  villainBarrelTurn?: boolean;
  isCheckRaise?: boolean;
  isDonkBet?: boolean;
  isDelayedCbet?: boolean;          // checked previous street, bets now
  isBlockBet?: boolean;             // tiny river bet
  isAllIn?: boolean;
  // board runout flags (river)
  flushCompleted?: boolean;
  straightCompleted?: boolean;
  paired?: boolean;
  scareCardBroadway?: boolean;
  brickRiver?: boolean;
  lowCard?: boolean;
  // context
  villainType?: VillainType;
  villainPosition?: PositionRel;
  villainStackBB?: number;
  isLive?: boolean;
}

export function classifySizing(sizeBB: number, potBB: number): SizingCategory {
  const pct = potBB > 0 ? (sizeBB / potBB) * 100 : 0;
  if (pct >= 125) return "Overbet";
  if (pct >= 75) return "Large";
  if (pct >= 40) return "Medium";
  if (pct >= 20) return "Small";
  return "Min-bet";
}

interface Base { bluff: number; confidence: number; heuristic: string; reasoning: string }

function baseHeuristic(inp: BluffInput): Base {
  const { street, texture, sizeBB, potBB } = inp;
  const sizing = classifySizing(sizeBB, potBB);

  // Special composite situations first
  if (inp.isBlockBet && street === "River") {
    return { bluff: 15, confidence: 85, heuristic: "River block bet",
      reasoning: "Tiny river bet (10–20% pot) — almost always value/blocker." };
  }
  if (street === "River" && inp.villainCbetFlop && inp.villainBarrelTurn) {
    return { bluff: 25, confidence: 85, heuristic: "Triple barrel",
      reasoning: "C-bet flop + barrel turn + river bet = condensed, value-heavy." };
  }
  if (inp.isCheckRaise) {
    if (street === "River" && sizing === "Small") {
      return { bluff: 25, confidence: 85, heuristic: "River CR vs small bet",
        reasoning: "Check-raise vs small bet = nutted or air; population underbluffs." };
    }
    if (street === "River" && sizing === "Overbet") {
      return { bluff: 40, confidence: 75, heuristic: "River CR vs overbet",
        reasoning: "Check-raise vs overbet — more balanced, some bluffs." };
    }
    return { bluff: street === "River" ? 30 : street === "Turn" ? 35 : 40, confidence: 80,
      heuristic: `${street} check-raise`,
      reasoning: "Polarized line; population underbluffs check-raises." };
  }
  if (inp.isDelayedCbet && street === "Turn") {
    return { bluff: 65, confidence: 75, heuristic: "Delayed c-bet",
      reasoning: "Checked flop then bet turn — often picked up equity or pure bluff." };
  }
  if (inp.isDonkBet && street === "Flop") {
    return { bluff: 60, confidence: 65, heuristic: "Flop donk bet",
      reasoning: "Donk lead on connected low board — deny equity, many bluffs." };
  }
  if (inp.isAllIn && street === "River") {
    const stack = inp.villainStackBB ?? 100;
    if (stack < 20) return { bluff: 40, confidence: 70, heuristic: "Short-stack all-in river",
      reasoning: "Short stack shove — desperate but limited fold equity." };
    if (stack > 100) return { bluff: 50, confidence: 65, heuristic: "Deep-stack all-in river",
      reasoning: "Deep all-in = huge polarized sizing, GTO balanced." };
  }

  // Street × sizing × texture lookup
  if (street === "River") {
    if (sizing === "Overbet") {
      if (texture === "Wet") return { bluff: 60, confidence: 80, heuristic: "River overbet on wet",
        reasoning: "Missed draws give natural bluffs; population overbluffs overbets." };
      if (texture === "Dry") return { bluff: 45, confidence: 75, heuristic: "River overbet on dry",
        reasoning: "Polarized but fewer natural bluffs on dry runout." };
      return { bluff: 52, confidence: 70, heuristic: "River overbet (semi-wet)",
        reasoning: "Balanced polarized spot." };
    }
    if (sizing === "Large") {
      if (texture === "Wet") return { bluff: 50, confidence: 75, heuristic: "River large bet on wet",
        reasoning: "Draws missed — GTO balanced large bet." };
      return { bluff: 35, confidence: 70, heuristic: "River large bet on dry",
        reasoning: "Mostly value with some balance bluffs." };
    }
    if (sizing === "Medium") return { bluff: 40, confidence: 65, heuristic: "River medium bet",
      reasoning: "Default medium sizing — moderately balanced." };
    if (sizing === "Small") return { bluff: 25, confidence: 80, heuristic: "River small bet",
      reasoning: "Value-heavy thin bet — wants to get called." };
    return { bluff: 15, confidence: 80, heuristic: "River min-bet",
      reasoning: "Block/min-bet — almost always value." };
  }

  if (street === "Turn") {
    if (inp.villainCbetFlop) {
      if (texture === "Wet") return { bluff: 45, confidence: 70, heuristic: "Turn barrel on wet",
        reasoning: "Continued aggression with value + draws." };
      if (texture === "Dry") return { bluff: 30, confidence: 75, heuristic: "Turn barrel on dry",
        reasoning: "Range condensed, value-heavy double barrel." };
      return { bluff: 37, confidence: 70, heuristic: "Turn barrel",
        reasoning: "Standard turn continuation." };
    }
    return { bluff: 40, confidence: 60, heuristic: "Turn bet (no prior cbet)",
      reasoning: "Probe/float — moderate bluff frequency." };
  }

  // Flop
  const ip = inp.villainPosition !== "OOP";
  if (ip) {
    if (texture === "Dry") return { bluff: 55, confidence: 65, heuristic: "Flop c-bet IP on dry",
      reasoning: "Range advantage drives high c-bet frequency." };
    if (texture === "Wet") return { bluff: 40, confidence: 70, heuristic: "Flop c-bet IP on wet",
      reasoning: "Board hits caller's range — more value-driven." };
    return { bluff: 50, confidence: 65, heuristic: "Flop c-bet IP semi-wet",
      reasoning: "Balanced c-bet spot." };
  }
  return { bluff: 45, confidence: 60, heuristic: "Flop c-bet OOP",
    reasoning: "OOP c-bet less frequent, more value-heavy." };
}

function clamp(x: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, x)); }

export function analyzeBluffDetailed(inp: BluffInput): BluffAnalysis {
  const base = baseHeuristic(inp);
  let bluff = base.bluff;
  const adj: string[] = [];

  // Texture runout adjustments (river-focused)
  if (inp.street === "River") {
    if (inp.flushCompleted)     { bluff += 10; adj.push("Flush completed +10%"); }
    if (inp.straightCompleted)  { bluff += 10; adj.push("Straight completed +10%"); }
    if (inp.paired)             { bluff -=  5; adj.push("Paired board −5%"); }
    if (inp.scareCardBroadway)  { bluff +=  5; adj.push("Broadway scare card +5%"); }
    if (inp.brickRiver)         { bluff -=  5; adj.push("Brick river −5%"); }
    if (inp.lowCard)            { bluff -=  5; adj.push("Low card −5%"); }
  }

  // Position adjustments
  if (inp.villainPosition === "IP")  { bluff += 5; adj.push("Villain IP +5%"); }
  if (inp.villainPosition === "OOP") { bluff -= 5; adj.push("Villain OOP −5%"); }

  // Stack depth
  const stack = inp.villainStackBB;
  if (stack != null) {
    if (inp.isAllIn && stack < 20)         { bluff -= 10; adj.push("All-in <20bb −10%"); }
    else if (inp.isAllIn && stack < 40)    { bluff -=  5; adj.push("All-in 20–40bb −5%"); }
    else if (stack > 200 && classifySizing(inp.sizeBB, inp.potBB) === "Overbet") {
      bluff += 10; adj.push("Very deep overbet +10%");
    } else if (stack > 100 && (classifySizing(inp.sizeBB, inp.potBB) === "Large" || classifySizing(inp.sizeBB, inp.potBB) === "Overbet")) {
      bluff += 5; adj.push("Deep stack large/overbet +5%");
    }
  }

  // Population tendencies (default online unless live)
  const sizing = classifySizing(inp.sizeBB, inp.potBB);
  if (sizing === "Overbet")             { bluff += 7;  adj.push("Population overbluffs overbets +7%"); }
  if (inp.isCheckRaise)                 { bluff -= 12; adj.push("Population underbluffs check-raises −12%"); }
  if (inp.street === "River" && inp.villainCbetFlop && inp.villainBarrelTurn) {
    bluff -= 15; adj.push("Population underbluffs triple barrels −15%");
  }
  if (inp.isDelayedCbet)                { bluff += 10; adj.push("Population overbluffs delayed c-bets +10%"); }
  if (inp.isLive && sizing === "Small") { bluff -= 10; adj.push("Live players underbluff small bets −10%"); }
  if (!inp.isLive && inp.street === "Turn") { bluff += 5; adj.push("Online overbluffs turns +5%"); }

  // Villain profile
  switch (inp.villainType) {
    case "Nit":     bluff -= 20; adj.push("Nit profile −20%"); break;
    case "LAG":     bluff += 10; adj.push("LAG profile +10%"); break;
    case "Maniac":  bluff += 25; adj.push("Maniac profile +25%"); break;
    case "Station": bluff -= 15; adj.push("Calling station −15%"); break;
    case "Whale":   bluff += 15; adj.push("Whale/fish +15%"); break;
    // TAG / Unknown → no shift
  }

  bluff = clamp(bluff);

  const potOddsPct = inp.potBB > 0 ? (inp.sizeBB / (inp.potBB + inp.sizeBB * 2)) * 100 : undefined;
  // CO recommendation: call when bluff% > pot odds break-even (need fewer bluffs than equity required)
  let recommendation: "Call" | "Fold" = "Fold";
  let recReason = "";
  if (potOddsPct != null) {
    if (bluff >= potOddsPct + 2) {
      recommendation = "Call";
      recReason = `Bluff freq ${bluff.toFixed(0)}% exceeds break-even ${potOddsPct.toFixed(1)}% — +EV bluff-catch.`;
    } else if (bluff <= potOddsPct - 2) {
      recommendation = "Fold";
      recReason = `Bluff freq ${bluff.toFixed(0)}% below break-even ${potOddsPct.toFixed(1)}% — fold marginal catchers.`;
    } else {
      recommendation = "Call";
      recReason = `Bluff freq ~ break-even (${bluff.toFixed(0)}% vs ${potOddsPct.toFixed(1)}%) — close, default call with bluff-catchers.`;
    }
  } else {
    recReason = "No pot/size given — recommendation based on bluff frequency only.";
    recommendation = bluff >= 35 ? "Call" : "Fold";
  }

  return {
    isLikelyBluff: bluff >= 50,
    bluffFrequency: bluff,
    baseBluffFrequency: base.bluff,
    confidence: base.confidence,
    reasoning: base.reasoning,
    heuristicUsed: base.heuristic,
    adjustments: adj,
    recommendation,
    recommendationReasoning: recReason,
    potOddsPct,
  };
}

// Backward-compatible simple signature used by the existing panel.
export function analyzeBluffLikelihood(
  street: Street,
  sizingType: string,
  texture: Texture,
  villainCbetFlop?: boolean,
  villainBarrelTurn?: boolean,
): BluffAnalysis {
  // Map old sizingType label back to a representative sizeBB/potBB ratio.
  const ratio: Record<string, number> = {
    "Min-bet": 0.15, Small: 0.30, Medium: 0.55, Large: 1.0, Overbet: 1.5,
  };
  const potBB = 100;
  const sizeBB = potBB * (ratio[sizingType] ?? 0.55);
  return analyzeBluffDetailed({
    street, sizeBB, potBB, texture,
    villainCbetFlop, villainBarrelTurn,
  });
}
