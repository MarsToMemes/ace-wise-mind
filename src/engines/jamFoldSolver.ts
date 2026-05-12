// Jam-or-Fold solver — full EV math with mathematical justification.
// EV(jam) = f·P + (1−f)·[eq·(P + 2S) − S]
// EV(fold) = 0  (hero forfeits posted dead money)
//
// Where:
//   P  = current pot in BB (dead money: blinds, antes, prior bets)
//   S  = hero's effective jam size (BB)
//   f  = probability villain folds (0..1)
//   eq = hero equity when villain calls (0..1)

export interface JamFoldInput {
  potBB: number;          // dead money before the jam
  heroStackBB: number;    // hero effective stack to jam
  villainFoldPct: number; // 0..100 — assumed villain fold frequency
  equityWhenCalledPct: number; // 0..100 — hero equity vs villain's calling range
}

export interface JamFoldResult {
  evJam: number;          // BB
  evFold: number;         // always 0
  evDelta: number;        // evJam − evFold
  decision: "JAM" | "FOLD" | "INDIFFERENT";
  confidence: "high" | "medium" | "low";
  // Break-even thresholds derived from the EV equation
  minFoldEquityNeeded: number;     // %  — if eq=0, what fold% does hero need?
  minEquityWhenCalledNeeded: number; // % — if villain never folds (f=0), needed eq
  // Decomposition of EV
  ifFolds: { prob: number; winBB: number };
  ifCalledWins: { prob: number; winBB: number };
  ifCalledLoses: { prob: number; loseBB: number };
  // Risk:Reward
  riskBB: number;        // S
  rewardIfFoldBB: number; // P
  rewardIfShowdownBB: number; // P + S (net win if eq=1)
  // Justification text
  reasoning: string[];
}

export function solveJamFold(inp: JamFoldInput): JamFoldResult {
  const P = Math.max(0, inp.potBB);
  const S = Math.max(0, inp.heroStackBB);
  const f = clamp01(inp.villainFoldPct / 100);
  const eq = clamp01(inp.equityWhenCalledPct / 100);

  // Core EV
  const evCalled = eq * (P + 2 * S) - S; // eq*(P+S) - (1-eq)*S simplified
  const evJam = f * P + (1 - f) * evCalled;
  const evFold = 0;
  const evDelta = evJam - evFold;

  // Break-even fold% if hero has zero equity when called
  // EV = f*P + (1-f)*(0*(P+2S) - S) = f*P - (1-f)*S = 0
  // → f = S / (P + S)
  const minFoldEquityNeeded = (S / Math.max(1e-9, P + S)) * 100;

  // Break-even equity if villain never folds (f=0)
  // EV = eq*(P+2S) - S = 0 → eq = S / (P + 2S)
  const minEquityWhenCalledNeeded = (S / Math.max(1e-9, P + 2 * S)) * 100;

  const decision: JamFoldResult["decision"] =
    Math.abs(evDelta) < 0.05 ? "INDIFFERENT" : evDelta > 0 ? "JAM" : "FOLD";

  const confidence: JamFoldResult["confidence"] =
    Math.abs(evDelta) > 1.5 ? "high" : Math.abs(evDelta) > 0.4 ? "medium" : "low";

  const reasoning: string[] = [
    `EV(jam) = f·P + (1−f)·[eq·(P+2S) − S]`,
    `      = ${f.toFixed(2)}·${P.toFixed(1)} + ${(1 - f).toFixed(2)}·[${eq.toFixed(2)}·${(P + 2 * S).toFixed(1)} − ${S.toFixed(1)}]`,
    `      = ${(f * P).toFixed(2)} + ${((1 - f) * evCalled).toFixed(2)} = ${evJam.toFixed(2)} BB`,
    `Break-even fold% (if eq=0): S/(P+S) = ${minFoldEquityNeeded.toFixed(1)}%`,
    `Break-even eq when called (if f=0): S/(P+2S) = ${minEquityWhenCalledNeeded.toFixed(1)}%`,
  ];

  if (decision === "JAM") {
    if (f * P > Math.abs(evCalled) * (1 - f)) {
      reasoning.push("Most of EV comes from fold equity — this is a pressure jam, not an equity jam.");
    } else {
      reasoning.push("Most of EV comes from showdown equity when called — strong hand jam.");
    }
  } else if (decision === "FOLD") {
    if (inp.villainFoldPct < minFoldEquityNeeded) {
      reasoning.push(`Villain folds ${inp.villainFoldPct.toFixed(0)}% vs ${minFoldEquityNeeded.toFixed(0)}% needed — insufficient fold equity.`);
    }
    if (inp.equityWhenCalledPct < minEquityWhenCalledNeeded) {
      reasoning.push(`Equity when called ${inp.equityWhenCalledPct.toFixed(0)}% vs ${minEquityWhenCalledNeeded.toFixed(0)}% needed — too dominated.`);
    }
  } else {
    reasoning.push("EV(jam) ≈ EV(fold). At indifference — both actions break even.");
  }

  return {
    evJam,
    evFold,
    evDelta,
    decision,
    confidence,
    minFoldEquityNeeded,
    minEquityWhenCalledNeeded,
    ifFolds: { prob: f, winBB: P },
    ifCalledWins: { prob: (1 - f) * eq, winBB: P + S },
    ifCalledLoses: { prob: (1 - f) * (1 - eq), loseBB: S },
    riskBB: S,
    rewardIfFoldBB: P,
    rewardIfShowdownBB: P + S,
    reasoning,
  };
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
