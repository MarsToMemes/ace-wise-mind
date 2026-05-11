// Geometric Sizing Calculator — Chen & Ankenman stack-off math.
// Solve R such that betting R*pot each street puts both players all-in on the
// final street. Pure functions.

export interface StreetSizing {
  street: number;          // 1, 2, 3
  betFraction: number;     // R (decimal, e.g. 0.75 = 75% pot)
  betSizeBB: number;       // actual bet size in BB
  potBeforeBB: number;     // pot before this bet
  potAfterBB: number;      // pot after both players match (call)
  stackAfterBB: number;    // remaining effective stack after this bet
  isAllIn: boolean;
}

export interface GeometricResult {
  growthRate: number;      // R as decimal
  growthPct: number;       // R * 100
  streets: StreetSizing[];
  finalPotBB: number;
  effectiveStackBB: number;
  spr: number;             // stack-to-pot ratio at start
  sprAdvice: string;
  applicable: boolean;     // false if SPR < 1 or > 15 etc.
  warning?: string;
}

export interface GeometricInput {
  currentPotBB: number;
  heroStackBB: number;
  villainStackBB: number;
  streetsRemaining: 1 | 2 | 3;
}

export function calculateGeometricSizing(inp: GeometricInput): GeometricResult {
  const pot = Math.max(inp.currentPotBB, 0.01);
  const effective = Math.max(0, Math.min(inp.heroStackBB, inp.villainStackBB));
  const streets = Math.max(1, Math.min(3, inp.streetsRemaining)) as 1 | 2 | 3;
  const finalPot = pot + effective * 2;
  const spr = effective / pot;

  let R: number;
  if (effective <= 0 || pot <= 0) {
    R = 0;
  } else {
    R = Math.pow(finalPot / pot, 1 / streets) - 1;
  }

  const sizings: StreetSizing[] = [];
  let runningPot = pot;
  let runningStack = effective;
  for (let i = 0; i < streets; i++) {
    const ideal = R * runningPot;
    const bet = Math.min(ideal, runningStack);
    const isAllIn = i === streets - 1 || bet >= runningStack - 1e-6;
    const potAfter = runningPot + bet * 2;
    sizings.push({
      street: i + 1,
      betFraction: R,
      betSizeBB: round1(bet),
      potBeforeBB: round1(runningPot),
      potAfterBB: round1(potAfter),
      stackAfterBB: round1(runningStack - bet),
      isAllIn,
    });
    runningPot = potAfter;
    runningStack = runningStack - bet;
  }

  // SPR advice
  let sprAdvice: string;
  let applicable = true;
  let warning: string | undefined;
  if (spr < 1) {
    sprAdvice = "SPR < 1: just jam — geometric sizing is overkill.";
    applicable = false;
    warning = "Stack too short — go all-in directly.";
  } else if (spr < 3) {
    sprAdvice = "Low SPR (1–3): bet large, jam by turn at latest.";
  } else if (spr <= 8) {
    sprAdvice = "Mid SPR (3–8): geometric sizing is ideal — perfect stack-off.";
  } else if (spr <= 12) {
    sprAdvice = "High SPR (8–12): geometric bets are large; verify range is polarized.";
  } else {
    sprAdvice = "Very high SPR (>12): geometric overbets fold villain's range. Use smaller sizing or fewer streets.";
    warning = "Consider sizing down — geometric here may price out villain's calls.";
  }

  return {
    growthRate: R,
    growthPct: R * 100,
    streets: sizings,
    finalPotBB: round1(finalPot),
    effectiveStackBB: round1(effective),
    spr: round2(spr),
    sprAdvice,
    applicable,
    warning,
  };
}

function round1(x: number) { return Math.round(x * 10) / 10; }
function round2(x: number) { return Math.round(x * 100) / 100; }
