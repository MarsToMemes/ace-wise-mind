// Zone System + Equilibrium Push/Fold Ranges
// M-ratio zones (Green / Yellow / Orange / Red) and stack-depth (BB) based push ranges
// for each position. Also handles BB-defense ranges vs push.

export type Zone = "green" | "yellow" | "orange" | "red";

export function classifyZone(mRatio: number): Zone {
  if (mRatio > 20) return "green";
  if (mRatio >= 10) return "yellow";
  if (mRatio >= 6) return "orange";
  return "red";
}

export function zoneLabel(z: Zone): string {
  return {
    green: "Green — Deep / Small-Ball Mode",
    yellow: "Yellow — Steal / Resteal Mode",
    orange: "Orange — Push/Fold Mode",
    red: "Red — Emergency Push/Fold",
  }[z];
}

export function zoneSummary(z: Zone): string {
  return {
    green: "Speculative hands playable, implied odds matter, build fear equity.",
    yellow: "Range tightens, 3-bet or fold replaces flat, ICM awareness activates.",
    orange: "Open-jam or fold from most positions. No set-mining, no flats.",
    red: "Pure push/fold. Mathematical equilibrium ranges only. Act before fold equity dies.",
  }[z];
}

// ----- Range parser -----
// Tokens: "77+", "ATs+", "AJo+", "KQs", "KJs", "A5s+", "K9s+", etc.
const RANKS = "23456789TJQKA";
const rankVal = (r: string) => RANKS.indexOf(r) + 2;

interface ParsedHand {
  hi: number;
  lo: number;
  pair: boolean;
  suited: boolean;
}

function parseHole(holeCards: string[]): ParsedHand | null {
  if (!holeCards || holeCards.length < 2) return null;
  const r1 = holeCards[0][0], s1 = holeCards[0][1];
  const r2 = holeCards[1][0], s2 = holeCards[1][1];
  const v1 = rankVal(r1), v2 = rankVal(r2);
  return {
    hi: Math.max(v1, v2),
    lo: Math.min(v1, v2),
    pair: v1 === v2,
    suited: s1 === s2,
  };
}

function tokenMatches(token: string, h: ParsedHand): boolean {
  token = token.trim();
  if (!token) return false;
  // Pair tokens: "77+", "55", "22+"
  if (/^[2-9TJQKA]{2}\+?$/.test(token) && token[0] === token[1]) {
    const v = rankVal(token[0]);
    const plus = token.endsWith("+");
    if (!h.pair) return false;
    return plus ? h.hi >= v : h.hi === v;
  }
  // Non-pair: "ATs+", "AJo+", "KQs", "KQo", "ATs", "K9s+", "A8o+"
  const m = token.match(/^([2-9TJQKA])([2-9TJQKA])(s|o)(\+?)$/);
  if (!m) return false;
  const hiR = rankVal(m[1]);
  const loR = rankVal(m[2]);
  const suit = m[3]; // s or o
  const plus = m[4] === "+";
  if (h.pair) return false;
  if (h.hi !== hiR) return false;
  if (suit === "s" && !h.suited) return false;
  if (suit === "o" && h.suited) return false;
  return plus ? h.lo >= loR : h.lo === loR;
}

export function inRange(holeCards: string[], rangeStr: string): boolean {
  const h = parseHole(holeCards);
  if (!h) return false;
  const tokens = rangeStr.split(",").map(t => t.trim()).filter(Boolean);
  return tokens.some(tok => tokenMatches(tok, h));
}

// ----- Equilibrium Push Ranges by position & BB depth -----
// Position groups: UTG, MP, CO, BTN, SB. BB has its own call-vs-push ranges.

type Pos = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

const PUSH_RANGES: Record<Pos, { bb: number; range: string }[]> = {
  UTG: [
    { bb: 15, range: "77+,ATs+,AJo+,KQs" },
    { bb: 10, range: "55+,A8s+,ATo+,KQs,KJs" },
    { bb: 8,  range: "33+,A5s+,A9o+,KTs+,KQo" },
    { bb: 6,  range: "22+,A2s+,A7o+,K9s+,KJo+,QTs+" },
  ],
  MP: [
    { bb: 15, range: "66+,A9s+,AJo+,KQs,KJs" },
    { bb: 10, range: "44+,A7s+,ATo+,KTs+,KQo" },
    { bb: 8,  range: "22+,A4s+,A8o+,K9s+,KJo,QJs" },
    { bb: 6,  range: "22+,A2s+,A6o+,K8s+,KTo+,QTs+" },
  ],
  CO: [
    { bb: 15, range: "55+,A8s+,ATo+,KTs+,KQo,QJs" },
    { bb: 10, range: "33+,A5s+,A9o+,K9s+,KJo+,QTs" },
    { bb: 8,  range: "22+,A2s+,A7o+,K8s+,KTo+,Q9s+" },
    { bb: 6,  range: "22+,A2s+,A4o+,K6s+,K9o+,Q8s+,JTs" },
  ],
  BTN: [
    { bb: 15, range: "33+,A5s+,A8o+,K9s+,KJo+,QJs,JTs" },
    { bb: 10, range: "22+,A2s+,A6o+,K8s+,KTo+,Q9s+,J9s+" },
    { bb: 8,  range: "22+,A2s+,A3o+,K5s+,K9o+,Q8s+,J8s+,T9s" },
    { bb: 6,  range: "22+,A2s+,A2o+,K2s+,K7o+,Q5s+,Q9o+,J7s+,J9o+,T7s+,T9o,97s+,87s,76s" },
  ],
  SB: [
    { bb: 15, range: "44+,A7s+,A9o+,KTs+,KQo,QJs" },
    { bb: 10, range: "22+,A3s+,A7o+,K9s+,KJo,QTs+" },
    { bb: 8,  range: "22+,A2s+,A5o+,K8s+,KTo+,Q9s+,JTs" },
    { bb: 6,  range: "22+,A2s+,A2o+,K6s+,K9o+,Q8s+,JTs" },
  ],
  BB: [], // BB uses call-vs-push, not open-push
};

// BB call ranges vs push, indexed by opener position
const BB_CALL_VS_PUSH: Record<string, string> = {
  BTN: "33+,A7s+,ATo+,K9s+,KQo,QJs",
  SB:  "44+,A8s+,AJo+,KTs+,KQo",
  CO:  "55+,A9s+,AJo+,KQs",
  HJ:  "66+,ATs+,AJo+,KQs",
  MP:  "77+,AJs+,AKo,KQs",
  UTG: "88+,AQs+,AKo",
};

const POS_NORMALIZE: Record<string, Pos> = {
  UTG: "UTG", "UTG+1": "UTG", "UTG+2": "UTG",
  MP: "MP", LJ: "MP", HJ: "MP",
  CO: "CO", BTN: "BTN", SB: "SB", BB: "BB",
};

export interface EquilibriumDecision {
  inPushRange: boolean;
  bracket: number | null; // BB depth bracket used
  rangeStr: string | null;
}

export function equilibriumPush(
  holeCards: string[], position: string, stackBB: number,
): EquilibriumDecision {
  const pos = POS_NORMALIZE[position] || "BTN";
  if (pos === "BB") return { inPushRange: false, bracket: null, rangeStr: null };
  const table = PUSH_RANGES[pos];
  // Pick widest bracket where stack <= bracket BB (closest from below)
  // Brackets are 15/10/8/6 — widening as stack shrinks.
  let chosen = table[0];
  for (const b of table) {
    if (stackBB <= b.bb) chosen = b;
  }
  // If stackBB > 15, we still allow tightest 15BB bracket reference but report not in pure push range
  if (stackBB > 15) {
    return { inPushRange: false, bracket: 15, rangeStr: table[0].range };
  }
  return {
    inPushRange: inRange(holeCards, chosen.range),
    bracket: chosen.bb,
    rangeStr: chosen.range,
  };
}

export function bbCallVsPush(
  holeCards: string[], openerPosition: string | null | undefined,
): { canCall: boolean; rangeStr: string | null } {
  if (!openerPosition) return { canCall: false, rangeStr: null };
  const range = BB_CALL_VS_PUSH[openerPosition] || BB_CALL_VS_PUSH.MP;
  return { canCall: inRange(holeCards, range), rangeStr: range };
}

// % of opens — informational for green-zone steal logic
export function zoneAggressionTarget(z: Zone, icmHigh: boolean): number {
  const base = { green: 28, yellow: 38, orange: 55, red: 70 }[z];
  return icmHigh ? Math.max(15, base - 12) : base;
}
