import {
  fullDeck, evaluateBest, detectDraws, classifyTexture,
  estimateEquity, adjustedScore, decide, potOdds, rangeAdvantage,
} from "./pokerEngine";

export type Street = "Preflop" | "Flop" | "Turn" | "River";
export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

export interface Scenario {
  hole: string[];
  board: string[];
  street: Street;
  position: Position;
  opponents: number;
  stack: number;
  pot: number;
  call: number;
  // engine derived
  equityPct: number;
  reqEquity: number | null;
  category: string;
  drawType: string;
  outs: number;
  texture: string;
  correctAction: "Fold" | "Call" | "Raise" | "Check";
  reason: string;
  adjScore: number;
}

const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const STREETS: Street[] = ["Preflop", "Flop", "Turn", "River"];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateScenario(): Scenario {
  const deck = shuffle(fullDeck());
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const boardLen = street === "Preflop" ? 0 : street === "Flop" ? 3 : street === "Turn" ? 4 : 5;
  const hole = deck.slice(0, 2);
  const board = deck.slice(2, 2 + boardLen);
  const position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
  const opponents = 1 + Math.floor(Math.random() * 5);
  const pot = [4, 8, 12, 20, 30, 50][Math.floor(Math.random() * 6)];
  // 70% chance facing a bet
  const facingBet = Math.random() < 0.7;
  const call = facingBet ? Math.max(1, Math.round(pot * (0.25 + Math.random() * 0.75))) : 0;
  const stack = 100;

  const all = [...hole, ...board];
  const ev = evaluateBest(all);
  const draws = detectDraws(hole, board);
  const texture = classifyTexture(board);
  const po = potOdds(call, pot);
  const equityPct = estimateEquity(draws.outs, board.length);
  const adjScore = adjustedScore({ baseScore: ev.score, outs: draws.outs, texture, position });
  const decision = decide({
    baseScore: ev.score,
    adjScore,
    outs: draws.outs,
    equityPct,
    potOddsPct: po ? po.reqEquity : null,
    boardLen: board.length,
  });

  return {
    hole, board, street, position, opponents, stack, pot, call,
    equityPct, reqEquity: po?.reqEquity ?? null,
    category: ev.category, drawType: draws.drawType, outs: draws.outs, texture,
    correctAction: decision.action,
    reason: decision.reason,
    adjScore,
  };
}

export type UserAction = "Fold" | "Call" | "Raise" | "Check";

export interface Evaluation {
  correct: boolean;
  evDiff: number; // big blinds, positive = your choice was good
  feedback: string;
}

// Approximate EV difference between user's choice and engine's recommendation.
export function evaluateDecision(s: Scenario, choice: UserAction): Evaluation {
  const correct = choice === s.correctAction;
  const eq = s.equityPct / 100;
  const req = (s.reqEquity ?? 0) / 100;

  // EV approximations (in BB units of pot)
  const evCall = s.call > 0 ? eq * (s.pot + s.call) - (1 - eq) * s.call : 0;
  const evFold = 0;
  // Raise EV: assume raise size = pot, fold equity ~ 25%
  const raiseSize = Math.max(s.call, s.pot);
  const fe = 0.25;
  const evRaise = fe * s.pot + (1 - fe) * (eq * (s.pot + 2 * raiseSize) - (1 - eq) * raiseSize);
  const evCheck = eq * s.pot;

  const evMap: Record<UserAction, number> = {
    Fold: evFold, Call: evCall, Raise: evRaise, Check: evCheck,
  };
  const userEv = evMap[choice];
  const bestEv = evMap[s.correctAction as UserAction] ?? 0;
  const evDiff = +(userEv - bestEv).toFixed(2);

  let feedback = "";
  if (correct) {
    feedback = `Correct! ${s.reason}`;
  } else {
    feedback = `Better play: ${s.correctAction}. ${s.reason}`;
    if (choice === "Fold" && eq > req + 0.05) {
      feedback += ` Folding gave up positive equity (${(eq * 100).toFixed(0)}% vs ${(req * 100).toFixed(0)}% required).`;
    } else if (choice === "Call" && s.correctAction === "Fold") {
      feedback += ` Calling here is -EV given pot odds.`;
    } else if (choice === "Raise" && (s.correctAction === "Fold" || s.correctAction === "Check")) {
      feedback += ` Aggression isn't justified by current strength/equity.`;
    }
  }

  return { correct, evDiff, feedback };
}

export interface Stats {
  total: number;
  correct: number;
  evSum: number;
  byAction: Record<UserAction, { picked: number; correct: number }>;
}

const STATS_KEY = "training-stats-v1";

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    total: 0, correct: 0, evSum: 0,
    byAction: {
      Fold: { picked: 0, correct: 0 },
      Call: { picked: 0, correct: 0 },
      Raise: { picked: 0, correct: 0 },
      Check: { picked: 0, correct: 0 },
    },
  };
}

export function saveStats(s: Stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {}
}

export function resetStats(): Stats {
  const s = loadStats();
  const fresh: Stats = {
    total: 0, correct: 0, evSum: 0,
    byAction: {
      Fold: { picked: 0, correct: 0 },
      Call: { picked: 0, correct: 0 },
      Raise: { picked: 0, correct: 0 },
      Check: { picked: 0, correct: 0 },
    },
  };
  saveStats(fresh);
  return fresh ?? s;
}
