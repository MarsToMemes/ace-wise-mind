// Alpha Engine — Chen & Ankenman frequency math.
// All numbers are DERIVED, not looked up. Pure functions.

export interface AlphaResult {
  s: number;                  // bet / pot
  alpha: number;              // s / (1+s)  — optimal bluff freq & break-even fold freq
  mdf: number;                // 1 - alpha  — minimum defense frequency
  alphaPct: number;
  mdfPct: number;
  bluffsPerValueBet: number;  // alpha / (1 - alpha)
  bluffToValueRatio: string;  // "1 bluff per X value bets"
  breakEvenFoldPct: number;   // alpha * 100
  betSizeInPots: number;
  sizeLabel: string;          // "1/2 pot", "pot", "2x pot"…
}

export interface ExploitResult {
  exploit: "BLUFF" | "VALUE" | "EQUILIBRIUM";
  evBB: number;               // expected value per attempt, in current pot units
  message: string;
  villainFoldPct: number;
  alphaPct: number;
  gapPct: number;             // villainFold - alpha (positive => over-folding)
}

export function calculateAlpha(betSize: number, potSize: number): AlphaResult {
  const safePot = Math.max(potSize, 1e-9);
  const s = Math.max(0, betSize) / safePot;
  const alpha = s / (1 + s);
  const mdf = 1 - alpha;
  const bluffsPerValue = alpha / Math.max(1 - alpha, 1e-9);
  const valuePerBluff = bluffsPerValue > 0 ? 1 / bluffsPerValue : Infinity;

  return {
    s,
    alpha,
    mdf,
    alphaPct: alpha * 100,
    mdfPct: mdf * 100,
    bluffsPerValueBet: bluffsPerValue,
    bluffToValueRatio: isFinite(valuePerBluff)
      ? `1 bluff per ${valuePerBluff.toFixed(1)} value bets`
      : "pure value (no bluffs)",
    breakEvenFoldPct: alpha * 100,
    betSizeInPots: s,
    sizeLabel: sizeLabel(s),
  };
}

function sizeLabel(s: number): string {
  if (s <= 0) return "0";
  if (s < 0.3) return "1/4 pot";
  if (s < 0.4) return "1/3 pot";
  if (s < 0.58) return "1/2 pot";
  if (s < 0.8) return "2/3 pot";
  if (s < 1.2) return "pot";
  if (s < 1.7) return "1.5x pot";
  return `${s.toFixed(1)}x pot`;
}

// EV of bluffing: villain folds → win pot. Villain calls → lose bet.
// EV(bluff) = foldPct * pot - (1-foldPct) * bet
export function evOfBluff(potSize: number, betSize: number, villainFoldPct: number): number {
  const f = clamp01(villainFoldPct / 100);
  return f * potSize - (1 - f) * betSize;
}

// EV of an extra thin value bet: villain calls (worse) → win bet. Villain folds → win 0 extra.
// Simplified: EV(value) = (1 - foldPct) * bet - foldPct * 0
export function evOfValueBet(betSize: number, villainFoldPct: number): number {
  const f = clamp01(villainFoldPct / 100);
  return (1 - f) * betSize;
}

export function detectExploit(
  potSize: number,
  betSize: number,
  estimatedVillainFoldPct: number,
): ExploitResult {
  const { alpha, alphaPct } = calculateAlpha(betSize, potSize);
  const f = clamp01(estimatedVillainFoldPct / 100);
  const gap = (f - alpha) * 100;

  if (Math.abs(gap) < 2) {
    return {
      exploit: "EQUILIBRIUM",
      evBB: 0,
      villainFoldPct: f * 100,
      alphaPct,
      gapPct: gap,
      message: `Villain folds ${(f * 100).toFixed(0)}% ≈ α (${alphaPct.toFixed(0)}%). At equilibrium — any bluff breaks even.`,
    };
  }

  if (f > alpha) {
    const ev = evOfBluff(potSize, betSize, estimatedVillainFoldPct);
    return {
      exploit: "BLUFF",
      evBB: ev,
      villainFoldPct: f * 100,
      alphaPct,
      gapPct: gap,
      message: `Villain folds ${(f * 100).toFixed(0)}% vs α=${alphaPct.toFixed(0)}%. Bluff any two cards is +EV by ${ev.toFixed(2)} BB.`,
    };
  }

  const ev = evOfValueBet(betSize, estimatedVillainFoldPct);
  return {
    exploit: "VALUE",
    evBB: ev,
    villainFoldPct: f * 100,
    alphaPct,
    gapPct: gap,
    message: `Villain folds only ${(f * 100).toFixed(0)}% vs α=${alphaPct.toFixed(0)}%. Strip bluffs, thin-value harder — each call wins ${ev.toFixed(2)} BB on average.`,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Reference alpha table for the UI/coach.
export const ALPHA_TABLE: { sizePct: number; alphaPct: number; mdfPct: number; label: string }[] = [
  { sizePct: 25, alphaPct: 20, mdfPct: 80, label: "1/4 pot" },
  { sizePct: 33, alphaPct: 25, mdfPct: 75, label: "1/3 pot" },
  { sizePct: 50, alphaPct: 33, mdfPct: 67, label: "1/2 pot" },
  { sizePct: 67, alphaPct: 40, mdfPct: 60, label: "2/3 pot" },
  { sizePct: 100, alphaPct: 50, mdfPct: 50, label: "pot" },
  { sizePct: 150, alphaPct: 60, mdfPct: 40, label: "1.5x pot" },
  { sizePct: 200, alphaPct: 67, mdfPct: 33, label: "2x pot" },
];
