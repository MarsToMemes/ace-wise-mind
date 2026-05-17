// Bluff detection heuristics — sizing + texture + barrel history.

export interface BluffAnalysis {
  isLikelyBluff: boolean;
  bluffFrequency: number; // 0..100
  confidence: number;     // 0..100
  reasoning: string;
  heuristicUsed: string;
  recommendation: "Call" | "Fold";
  recommendationReasoning: string;
}

export function classifySizing(sizeBB: number, potBB: number): "Small" | "Medium" | "Large" | "Overbet" {
  const pct = potBB > 0 ? (sizeBB / potBB) * 100 : 0;
  if (pct >= 125) return "Overbet";
  if (pct >= 75) return "Large";
  if (pct >= 40) return "Medium";
  return "Small";
}

export function analyzeBluffLikelihood(
  street: "Flop" | "Turn" | "River",
  sizingType: string,
  texture: "Dry" | "Semi-wet" | "Wet",
  villainCbetFlop?: boolean,
  villainBarrelTurn?: boolean,
): BluffAnalysis {
  let bluffFrequency = 50;
  let confidence = 50;
  let reasoning = "";
  let heuristicUsed = "";
  let isLikelyBluff = false;

  if (street === "River" && villainCbetFlop && villainBarrelTurn) {
    bluffFrequency = 25; confidence = 85;
    heuristicUsed = "Triple barrel";
    reasoning = "Villain bet flop, turn, and river. Very value-heavy. ~25% bluffs.";
  } else if (street === "River" && sizingType === "Overbet") {
    if (texture === "Wet") {
      bluffFrequency = 60; confidence = 80; isLikelyBluff = true;
      heuristicUsed = "River overbet on wet board";
      reasoning = "Overbet on wet river after missed draws. Many natural bluffs (~60%).";
    } else {
      bluffFrequency = 45; confidence = 75;
      heuristicUsed = "River overbet on dry board";
      reasoning = "Overbet on dry river: polarized but fewer natural bluffs (~45%).";
    }
  } else if (street === "River" && sizingType === "Small") {
    bluffFrequency = 25; confidence = 80;
    heuristicUsed = "River small bet";
    reasoning = "Small river bet is value-heavy — villain wants calls (~25% bluffs).";
  } else if (street === "River" && sizingType === "Large") {
    bluffFrequency = texture === "Wet" ? 50 : 35;
    confidence = 75;
    isLikelyBluff = texture === "Wet";
    heuristicUsed = "River large bet";
    reasoning = texture === "Wet"
      ? "Large bet on wet river — missed draws give natural bluffs (~50%, balanced)."
      : "Large bet on dry river — mostly value (~35% bluffs).";
  } else if (street === "Turn" && villainCbetFlop) {
    bluffFrequency = texture === "Wet" ? 45 : 30;
    confidence = 70;
    heuristicUsed = "Turn barrel";
    reasoning = texture === "Wet"
      ? "Turn barrel on wet board — value + draws (~45% bluffs)."
      : "Turn barrel on dry board — value-heavy (~30% bluffs).";
  } else if (street === "Flop") {
    bluffFrequency = texture === "Dry" ? 55 : 40;
    confidence = 65;
    isLikelyBluff = texture === "Dry";
    heuristicUsed = "Flop c-bet";
    reasoning = texture === "Dry"
      ? "C-bet on dry flop — range advantage drives high bluff frequency (~55%)."
      : "C-bet on wet flop — board hits caller's range (~40% bluffs).";
  } else {
    heuristicUsed = "Default";
    reasoning = "No strong signal — assume balanced (~50%).";
  }

  return {
    isLikelyBluff,
    bluffFrequency,
    confidence,
    reasoning,
    heuristicUsed,
    recommendation: "Call",
    recommendationReasoning: "",
  };
}
