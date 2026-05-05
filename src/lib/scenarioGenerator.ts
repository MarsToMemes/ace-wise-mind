import {
  fullDeck, evaluateBest, detectDraws, classifyTexture,
  estimateEquity, adjustedScore, decide, potOdds,
} from "./pokerEngine";

export type Street = "Preflop" | "Flop" | "Turn" | "River";
export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

export type RangeGuess =
  | "Very tight"
  | "Tight"
  | "Balanced"
  | "Loose aggressive"
  | "Bluff-heavy";

export const RANGE_GUESSES: RangeGuess[] = [
  "Very tight", "Tight", "Balanced", "Loose aggressive", "Bluff-heavy",
];

export type LeakTag =
  | "Range error"
  | "EV error"
  | "Overfolding"
  | "Overcalling"
  | "Bluff frequency error"
  | "Position misplay";

export const LEAK_TAGS: LeakTag[] = [
  "Range error", "EV error", "Overfolding", "Overcalling", "Bluff frequency error", "Position misplay",
];

export interface Scenario {
  hole: string[];
  board: string[];
  street: Street;
  position: Position;
  opponents: number;
  stack: number;
  pot: number;
  call: number;
  equityPct: number;
  reqEquity: number | null;
  category: string;
  drawType: string;
  outs: number;
  texture: string;
  correctAction: "Fold" | "Call" | "Raise" | "Check";
  reason: string;
  adjScore: number;
  // Engine-implied opponent range based on action faced + texture
  impliedOpponentRange: RangeGuess;
}

const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const STREETS: Street[] = ["Flop", "Turn", "River"]; // TODO: re-enable Preflop once hand rank table (AA/KK/AKs tiers) is implemented

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function impliedRange(call: number, pot: number, texture: string, position: Position): RangeGuess {
  if (call === 0) return "Balanced";
  const ratio = call / Math.max(1, pot);
  if (ratio > 1.0) return "Bluff-heavy"; // overbet = polarized, not tight
  if (ratio > 0.6 && texture === "Dry") return "Very tight";    // large bet dry = value-heavy
  if (ratio > 0.6 && texture === "Wet") return "Loose aggressive"; // large bet wet = could be draw
  if (ratio > 0.35) return "Balanced";
  if (["BTN", "CO"].includes(position)) return "Loose aggressive";
  return "Bluff-heavy";
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
    impliedOpponentRange: impliedRange(call, pot, texture, position),
  };
}

export type UserAction = "Fold" | "Call" | "Raise" | "Check";

export interface ActionEV {
  Fold: number;
  Call: number;
  Raise: number;
  Check: number;
}

export function computeActionEVs(s: Scenario): ActionEV {
  const eq = s.equityPct / 100;
  const evCall = s.call > 0 ? eq * (s.pot + s.call) - (1 - eq) * s.call : 0;
  const raiseSize = Math.max(s.call, s.pot);
  const fe = 0.25;
  const evRaise = fe * s.pot + (1 - fe) * (eq * (s.pot + 2 * raiseSize) - (1 - eq) * raiseSize);
  const evCheck = s.call > 0 ? -Infinity : eq * s.pot; // can't check facing a bet
  return {
    Fold: 0,
    Call: s.call > 0 ? evCall : 0,
    Raise: evRaise,
    Check: evCheck,
  };
}

export interface Evaluation {
  correct: boolean;
  evDiff: number;
  evUser: number;
  evOptimal: number;
  feedback: string;
  rangeCorrect: boolean | null;
  leakTags: LeakTag[];
  timeout?: boolean;
}

export function evaluateDecision(
  s: Scenario,
  choice: UserAction,
  rangeGuess: RangeGuess | null,
  timeout = false,
): Evaluation {
  const evs = computeActionEVs(s);
  const userEvRaw = evs[choice];
  const optimalEvRaw = evs[s.correctAction as UserAction] ?? 0;
  const userEv = isFinite(userEvRaw) ? userEvRaw : -s.pot; // illegal action penalty
  const optimalEv = isFinite(optimalEvRaw) ? optimalEvRaw : 0;
  const evDiff = +(userEv - optimalEv).toFixed(2);
  const correct = !timeout && choice === s.correctAction;

  const eq = s.equityPct / 100;
  const req = (s.reqEquity ?? 0) / 100;

  const rangeCorrect = rangeGuess === null ? null : rangeGuess === s.impliedOpponentRange;

  const tags: LeakTag[] = [];
  if (!correct) {
    if (Math.abs(evDiff) > 0.3) tags.push("EV error");
    if (choice === "Fold" && eq > req + 0.05) tags.push("Overfolding");
    if (choice === "Call" && s.correctAction === "Fold") tags.push("Overcalling");
    if (choice === "Raise" && (s.correctAction === "Fold" || s.correctAction === "Check")) tags.push("Bluff frequency error");
    if (["UTG", "MP"].includes(s.position) && choice === "Raise" && s.adjScore < 60) tags.push("Position misplay");
    if (["SB", "BB"].includes(s.position) && choice === "Raise" && s.correctAction !== "Raise") tags.push("Position misplay");
  }
  if (rangeCorrect === false) tags.push("Range error");

  let feedback: string;
  if (timeout) {
    feedback = `Time expired — auto-fold marked. Optimal play: ${s.correctAction}. ${s.reason}`;
  } else if (correct) {
    feedback = `Correct! ${s.reason}`;
  } else {
    feedback = `Better play: ${s.correctAction}. ${s.reason}`;
  }

  return {
    correct,
    evDiff,
    evUser: +userEv.toFixed(2),
    evOptimal: +optimalEv.toFixed(2),
    feedback,
    rangeCorrect,
    leakTags: tags,
    timeout,
  };
}

export interface Stats {
  total: number;
  correct: number;
  evSum: number;
  byAction: Record<UserAction, { picked: number; correct: number }>;
  leaks: Record<LeakTag, number>;
  rangeAttempts: number;
  rangeCorrect: number;
}

const STATS_KEY = "training-stats-v2";

const emptyLeaks = (): Record<LeakTag, number> =>
  LEAK_TAGS.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<LeakTag, number>);

const empty = (): Stats => ({
  total: 0, correct: 0, evSum: 0,
  byAction: {
    Fold: { picked: 0, correct: 0 },
    Call: { picked: 0, correct: 0 },
    Raise: { picked: 0, correct: 0 },
    Check: { picked: 0, correct: 0 },
  },
  leaks: emptyLeaks(),
  rangeAttempts: 0,
  rangeCorrect: 0,
});

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...empty(), ...parsed, leaks: { ...emptyLeaks(), ...(parsed.leaks || {}) } };
    }
  } catch {}
  return empty();
}

export function saveStats(s: Stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch {}
}

export function resetStats(): Stats {
  const fresh = empty();
  saveStats(fresh);
  return fresh;
}

// Generates a "what a strong player would do" replay sequence
export function buildOptimalLine(s: Scenario): string[] {
  const lines: string[] = [];
  lines.push(`Read board texture: ${s.texture}.`);
  lines.push(`Assess hand: ${s.category}${s.outs > 0 ? ` with ${s.drawType} (${s.outs} outs)` : ""}.`);
  if (s.reqEquity !== null) {
    lines.push(`Compare equity ${s.equityPct.toFixed(0)}% vs required ${s.reqEquity.toFixed(0)}%.`);
  } else {
    lines.push(`No bet faced — evaluate initiative from ${s.position}.`);
  }
  lines.push(`Assign opponent range: ${s.impliedOpponentRange}.`);
  lines.push(`Execute: ${s.correctAction}. ${s.reason}`);
  return lines;
}
