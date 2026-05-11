// ICM overlay: bubble factor, distance from money, pay-jump heuristic,
// strategic recommendation per opposing stack class.

import type { TournamentState } from "@/lib/tournamentEngine";

export interface ICMOverlay {
  bubble: boolean;
  finalTable: boolean;
  distanceFromMoney: number; // players until paid (>=0)
  bubbleFactor: number; // 1.0 = no ICM, >1 tighten calls
  callEquityFloorPct: number; // minimum equity needed to call given ICM
  recommendation: string;
}

export function computeICMOverlay(state: TournamentState): ICMOverlay {
  const dist = Math.max(0, state.playersRemaining - state.payoutSpots);
  const bubble = state.stage === "bubble";
  const finalTable = state.stage === "final-table";

  let bubbleFactor = 1;
  if (bubble) bubbleFactor = state.icmPressure === "critical" ? 1.9 : 1.55;
  else if (finalTable) bubbleFactor = 1.35;
  else if (state.icmPressure === "high") bubbleFactor = 1.25;
  else if (state.icmPressure === "medium") bubbleFactor = 1.1;

  // Default profitable call = 50%. ICM tightens it.
  const callEquityFloorPct = Math.min(75, Math.round(50 * bubbleFactor));

  let rec = "Use chip EV.";
  if (bubble) {
    rec = "Bubble: attack medium stacks, avoid clashing with big stacks, never call off marginal.";
  } else if (finalTable) {
    rec = "Final table: ladder up — short stacks shove wider, medium stacks tighten calls.";
  } else if (dist <= state.payoutSpots) {
    rec = "Approaching money: tighten calls slightly, keep stealing fold-equity rich spots.";
  }

  return { bubble, finalTable, distanceFromMoney: dist, bubbleFactor, callEquityFloorPct, recommendation: rec };
}

export type StackClass = "short" | "medium" | "big";
export function classifyOpponentStack(seatBB: number, heroBB: number): StackClass {
  if (heroBB <= 0) return "medium";
  if (seatBB < heroBB * 0.5) return "short";
  if (seatBB > heroBB * 1.6) return "big";
  return "medium";
}

export function vsStackAdvice(s: StackClass, bubble: boolean): string {
  if (bubble) {
    if (s === "big") return "Avoid marginal spots — losing here is an ICM disaster.";
    if (s === "short") return "Attack — they need premium to call given ICM.";
    return "Standard pressure, both stacks feel ICM heat.";
  }
  if (s === "big") return "Pick spots carefully, they can call light.";
  if (s === "short") return "Apply pressure, fold equity is real.";
  return "Standard play vs comparable stack.";
}
