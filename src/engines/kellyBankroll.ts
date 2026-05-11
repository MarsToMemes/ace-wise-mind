// Kelly Bankroll & Per-Hand Kelly — Chen & Ankenman variance math.
// Two regimes:
//   1) PER-HAND Kelly: given equity vs a price (call/raise), how much of
//      bankroll is mathematically correct to risk on this single decision?
//   2) LONG-RUN Kelly: given win rate (bb/100) and std dev (bb/100),
//      what bankroll (in buy-ins) is needed for the current stake?

// ---------- Per-hand Kelly ----------

export interface PerHandKellyInput {
  equityPct: number;       // hero equity (0-100) when called / at showdown
  riskBB: number;          // amount hero risks (call or bet)
  rewardBB: number;        // amount hero wins if successful (pot won)
  bankrollBB: number;      // total bankroll in BB
}

export interface PerHandKellyResult {
  edge: number;            // expected fractional return per BB risked
  evBB: number;            // expected value in BB
  kellyFraction: number;   // optimal fraction of bankroll (full Kelly)
  halfKellyFraction: number;
  kellyBB: number;         // BB to risk under full Kelly
  halfKellyBB: number;     // BB to risk under half Kelly
  actualFraction: number;  // riskBB / bankrollBB
  verdict: "play" | "play-with-caution" | "overbet" | "fold";
  message: string;
}

/**
 * Per-decision Kelly fraction:
 *   b = reward/risk  (odds received)
 *   p = equity
 *   q = 1-p
 *   f* = (b*p - q) / b   (clipped to [0,1])
 */
export function perHandKelly(inp: PerHandKellyInput): PerHandKellyResult {
  const p = clamp01(inp.equityPct / 100);
  const q = 1 - p;
  const risk = Math.max(0, inp.riskBB);
  const reward = Math.max(0, inp.rewardBB);
  const b = risk > 0 ? reward / risk : 0;

  const rawKelly = b > 0 ? (b * p - q) / b : -1;
  const kellyFraction = Math.max(0, Math.min(1, rawKelly));
  const halfKellyFraction = kellyFraction / 2;

  const evBB = p * reward - q * risk;
  const edge = risk > 0 ? evBB / risk : 0;

  const bankroll = Math.max(1e-9, inp.bankrollBB);
  const actualFraction = risk / bankroll;

  let verdict: PerHandKellyResult["verdict"];
  let message: string;

  if (rawKelly <= 0 || evBB < 0) {
    verdict = "fold";
    message = `EV = ${evBB.toFixed(2)} BB. Negative-EV spot — Kelly says risk 0% of bankroll. Fold.`;
  } else if (actualFraction > kellyFraction * 1.5) {
    verdict = "overbet";
    message = `Risking ${(actualFraction * 100).toFixed(1)}% of bankroll vs Kelly optimum ${(kellyFraction * 100).toFixed(1)}%. Stake is too large relative to bankroll — variance will hurt.`;
  } else if (actualFraction > halfKellyFraction * 1.2) {
    verdict = "play-with-caution";
    message = `+EV (${evBB.toFixed(2)} BB) but over half-Kelly. Acceptable in cash, dangerous if results-oriented.`;
  } else {
    verdict = "play";
    message = `+EV (${evBB.toFixed(2)} BB). Half-Kelly recommends risking ${(halfKellyFraction * 100).toFixed(2)}% of bankroll = ${(halfKellyFraction * bankroll).toFixed(1)} BB.`;
  }

  return {
    edge,
    evBB,
    kellyFraction,
    halfKellyFraction,
    kellyBB: kellyFraction * bankroll,
    halfKellyBB: halfKellyFraction * bankroll,
    actualFraction,
    verdict,
    message,
  };
}

// ---------- Long-run Kelly (bankroll management) ----------

export interface LongRunKellyInput {
  winRateBB100: number;    // bb / 100 hands
  stdDevBB100: number;     // bb / 100 hands (typical 80-120)
  bankrollBuyins: number;  // current bankroll in 100bb buy-ins
  sampleSizeHands: number; // hands played
}

export interface LongRunKellyResult {
  fullKellyBuyins: number;
  halfKellyBuyins: number;
  riskOfRuin: { at10k: number; at50k: number; at100k: number };
  confidenceInterval95: { low: number; high: number };
  handsForOneBBConfidence: number;
  recommendation: string;
}

export function longRunKelly(inp: LongRunKellyInput): LongRunKellyResult {
  const wr = inp.winRateBB100;
  const sd = Math.max(1, inp.stdDevBB100);
  const variance = sd * sd;

  // Bankroll for full Kelly (per 100bb buy-in unit):
  //   B = variance / (2 * winRate)   gives ~exp(-1) RoR
  // For a stricter long-term target we use variance / winRate (per 100bb).
  const fullKellyBuyins = wr > 0 ? variance / (wr * 100) : Infinity;
  const halfKellyBuyins = fullKellyBuyins * 2;

  const ror = (n: number) => {
    if (wr <= 0) return 1;
    // Normal approx: RoR over n hands ≈ Φ(-mu/sigma) where mu = wr*n/100, sigma = sd*sqrt(n/100)
    const mu = (wr * n) / 100;
    const sigma = sd * Math.sqrt(n / 100);
    const z = -mu / sigma;
    return normalCDF(z);
  };

  const stdErr = sd / Math.sqrt(Math.max(1, inp.sampleSizeHands) / 100);
  const ci95Low = wr - 1.96 * stdErr;
  const ci95High = wr + 1.96 * stdErr;

  // Hands needed for ±1bb/100 95% CI: N = (1.96 * σ)^2
  const handsForOneBB = Math.pow(1.96 * sd, 2);

  let recommendation: string;
  if (wr <= 0) {
    recommendation = "Win rate ≤ 0 over your sample. Move down or fix leaks before sizing bankroll.";
  } else if (inp.bankrollBuyins >= halfKellyBuyins) {
    recommendation = `Bankroll covers half-Kelly (${halfKellyBuyins.toFixed(0)} buy-ins). Current stake is safe.`;
  } else if (inp.bankrollBuyins >= halfKellyBuyins / 2) {
    recommendation = `Below half-Kelly target (${halfKellyBuyins.toFixed(0)} buy-ins). Acceptable short-term, build bankroll before moving up.`;
  } else {
    recommendation = `Underrolled. Half-Kelly wants ${halfKellyBuyins.toFixed(0)} buy-ins; you have ${inp.bankrollBuyins.toFixed(1)}. Move down.`;
  }

  return {
    fullKellyBuyins,
    halfKellyBuyins,
    riskOfRuin: { at10k: ror(10000), at50k: ror(50000), at100k: ror(100000) },
    confidenceInterval95: { low: ci95Low, high: ci95High },
    handsForOneBBConfidence: handsForOneBB,
    recommendation,
  };
}

// ---------- helpers ----------

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Abramowitz & Stegun rational approximation to the standard normal CDF.
function normalCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  // erf approximation
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}
