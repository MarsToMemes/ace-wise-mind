// Cash Game Preflop Engine — hand categorization + position & stack adaptive logic.
// Pure functions, no side effects. Designed to drive the cash-game HUD and coach.

export type CashHandCategory = "Premium" | "Strong" | "Speculative" | "Trap" | "Marginal";
export type PositionGroup = "EP" | "MP" | "LP" | "SB" | "BB";
export type StackDepth = "short" | "standard" | "deep";
export type CashAction = "Raise" | "3-bet" | "Call" | "Fold" | "Check";
export type EVQuality = "high" | "medium" | "low" | "negative";
export type RiskLevel = "low" | "medium" | "high";

export interface CashPreflopInput {
  hole: string[];                // e.g. ["As", "Kd"]
  position: string;              // UTG, MP, HJ, CO, BTN, SB, BB
  stackBB: number;               // hero effective stack in BB
  facingRaise: boolean;
  raiseSizeBB?: number;          // size of biggest raise to call
  opponents: number;             // live opponents at table
}

export interface CashPreflopOutput {
  category: CashHandCategory;
  handLabel: string;             // e.g. "AKo", "QJs", "77"
  positionGroup: PositionGroup;
  stackDepth: StackDepth;
  recommendedAction: CashAction;
  evQuality: EVQuality;
  risk: RiskLevel;
  bluffViability: "good" | "marginal" | "poor";
  realizedEquity: "high" | "medium" | "low";
  reason: string;
  warnings: string[];            // leak alerts ("Dominated hand", etc.)
  badges: string[];              // short HUD badges
}

const RANK_ORDER = "23456789TJQKA";

export function handLabel(hole: string[]): string {
  if (hole.length < 2) return "?";
  const r1 = hole[0][0];
  const r2 = hole[1][0];
  const s1 = hole[0][1];
  const s2 = hole[1][1];
  const i1 = RANK_ORDER.indexOf(r1);
  const i2 = RANK_ORDER.indexOf(r2);
  if (r1 === r2) return `${r1}${r2}`;
  const hi = i1 >= i2 ? r1 : r2;
  const lo = i1 >= i2 ? r2 : r1;
  return `${hi}${lo}${s1 === s2 ? "s" : "o"}`;
}

export function positionGroup(position: string): PositionGroup {
  const p = position.toUpperCase();
  if (p === "SB") return "SB";
  if (p === "BB") return "BB";
  if (p === "UTG" || p === "UTG+1" || p === "EP") return "EP";
  if (p === "MP" || p === "LJ") return "MP";
  if (p === "HJ" || p === "CO" || p === "BTN") return "LP";
  return "MP";
}

export function stackDepth(stackBB: number): StackDepth {
  if (stackBB < 40) return "short";
  if (stackBB > 150) return "deep";
  return "standard";
}

// Premium set
const PREMIUM = new Set(["AA", "KK", "QQ", "AKs", "AKo", "AQs"]);
// Strong playables
const STRONG = new Set(["JJ", "TT", "99", "88", "AQo", "AJs", "ATs", "KQs", "KJs", "QJs", "JTs"]);
// Speculative (suited connectors, small pairs, suited aces)
const SPECULATIVE = new Set([
  "77", "66", "55", "44", "33", "22",
  "T9s", "98s", "87s", "76s", "65s", "54s",
  "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
  "KTs", "QTs", "J9s", "T8s",
]);
// Dominated trap hands — weak offsuit broadways and weak offsuit aces/kings
const TRAP = new Set([
  "KTo", "KJo", "QJo", "QTo", "JTo", "J9o",
  "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
  "K9o", "K8o", "K7o", "J8o", "T9o", "T8o",
]);

export function categorize(label: string): CashHandCategory {
  if (PREMIUM.has(label)) return "Premium";
  if (STRONG.has(label)) return "Strong";
  if (SPECULATIVE.has(label)) return "Speculative";
  if (TRAP.has(label)) return "Trap";
  return "Marginal";
}

export function analyzePreflop(inp: CashPreflopInput): CashPreflopOutput {
  const label = handLabel(inp.hole);
  const cat = categorize(label);
  const pg = positionGroup(inp.position);
  const depth = stackDepth(inp.stackBB);
  const ip = pg === "LP";
  const oop = pg === "EP" || pg === "SB";

  const warnings: string[] = [];
  const badges: string[] = [];
  let action: CashAction = "Fold";
  let ev: EVQuality = "low";
  let risk: RiskLevel = "medium";
  let bluff: "good" | "marginal" | "poor" = "marginal";
  let realized: "high" | "medium" | "low" = "medium";
  let reason = "";

  // Bluff viability driven by position + depth
  bluff = ip ? (depth === "deep" ? "good" : "good") : depth === "short" ? "poor" : "marginal";
  realized = ip ? "high" : oop ? "low" : "medium";

  switch (cat) {
    case "Premium": {
      ev = "high"; risk = "low";
      action = inp.facingRaise ? "3-bet" : "Raise";
      reason = `${label} is a premium hand. Play it for value: open-raise unopened, 3-bet versus a raise. Build pot now.`;
      badges.push("Strong value raise");
      break;
    }
    case "Strong": {
      ev = "high"; risk = "low";
      if (pg === "EP") {
        action = inp.facingRaise ? (label === "JJ" || label === "TT" ? "Call" : "Fold") : "Raise";
        reason = `${label} is a strong opener from EP. Versus a raise, only continue with TT+ — avoid building big pots OOP with dominated kickers.`;
      } else if (ip) {
        action = inp.facingRaise ? (inp.raiseSizeBB && inp.raiseSizeBB > 4 ? "Call" : "3-bet") : "Raise";
        reason = `${label} plays great in position. Open-raise unopened; 3-bet small raises, flat larger ones to realize equity IP.`;
      } else {
        action = inp.facingRaise ? "Call" : "Raise";
        reason = `${label} is a strong playable. Open from MP, call vs a single raise but avoid 3-bet bloat OOP.`;
      }
      badges.push("Good implied odds");
      break;
    }
    case "Speculative": {
      risk = depth === "deep" ? "low" : depth === "short" ? "high" : "medium";
      ev = depth === "deep" && ip ? "high" : "medium";
      if (depth === "short") {
        action = inp.facingRaise ? "Fold" : ip ? "Call" : "Fold";
        reason = `Short stack (${inp.stackBB}BB): speculative hands lose value — no implied odds. Fold most of them unless cheap from LP.`;
        warnings.push("Short stack kills implied odds");
      } else if (ip) {
        action = inp.facingRaise
          ? (inp.raiseSizeBB && inp.raiseSizeBB <= 3.5 ? "Call" : "Fold")
          : "Raise";
        reason = `${label} is speculative — play it in position vs small raises with deep stacks. Strong implied odds with sets/suited equity.`;
      } else {
        action = "Fold";
        reason = `${label} realizes poorly OOP. Avoid "just seeing a flop" — passive OOP calls bleed money long term.`;
        warnings.push("OOP call leaks EV");
      }
      badges.push("Good implied odds");
      break;
    }
    case "Trap": {
      ev = "negative"; risk = "high"; bluff = "poor"; realized = "low";
      action = "Fold";
      reason = `${label} is a classic trap: dominated by stronger broadways/aces, weak top pairs, terrible reverse implied odds. Folding preserves EV — calling is a long-term losing play.`;
      warnings.push("Dominated hand");
      warnings.push("Reverse implied odds");
      badges.push("Dominated hand");
      badges.push("Fold recommended");
      break;
    }
    case "Marginal": {
      ev = "low"; risk = "medium";
      if (pg === "BB" && inp.facingRaise && inp.raiseSizeBB && inp.raiseSizeBB <= 3) {
        action = "Call";
        reason = `${label} is marginal but BB defense vs small raises is fine — closing the action with a price.`;
      } else if (ip && !inp.facingRaise) {
        action = "Raise";
        reason = `${label} is marginal — only playable as a steal from LP unopened. Fold to resistance.`;
      } else {
        action = "Fold";
        reason = `${label} is marginal and unprofitable in this spot. Don't pay to "see a flop" — discipline beats curiosity.`;
        warnings.push("Weak offsuit/marginal hand");
      }
      break;
    }
  }

  // Multiway adjustment — tighten speculative bluffs, widen value
  if (inp.opponents >= 3) {
    if (cat === "Speculative" && !ip) action = "Fold";
    if (cat === "Marginal") action = "Fold";
    badges.push("Multiway pot");
  }

  // Stack-depth context badge
  badges.push(depth === "short" ? "Short stack" : depth === "deep" ? "Deep stack" : "100BB standard");

  return {
    category: cat,
    handLabel: label,
    positionGroup: pg,
    stackDepth: depth,
    recommendedAction: action,
    evQuality: ev,
    risk,
    bluffViability: bluff,
    realizedEquity: realized,
    reason,
    warnings,
    badges,
  };
}
