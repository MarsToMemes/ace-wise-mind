// Range Inference Engine — interprets action history into strategic intelligence.
import type { PlayerAction } from "@/components/ActionMenu";

export type Street = "Preflop" | "Flop" | "Turn" | "River";
export type RangeType = "polarized" | "merged" | "capped" | "linear" | "wide" | "unknown";

export interface OpponentRange {
  seatIdx: number;
  position?: string;
  estimatedStrength: number; // 0..100
  rangeType: RangeType;
  bluffFrequency: number;    // 0..1
  notes: string[];
}

export interface RangeReadout {
  opponents: OpponentRange[];
  // Aggregate of all live opponents
  aggregateStrength: number; // 0..100
  aggregateBluffFreq: number; // 0..1
  dominantRangeType: RangeType;
  notes: string[];
}

interface Inputs {
  actions: PlayerAction[];               // full chronological history
  liveOpponentSeats: number[];           // seats still in the hand (excluding hero)
  positions?: Record<number, string>;    // seatIdx -> label
  basePotBB?: number;                    // pot at start (for sizing %)
  boardCards?: string[];
  boardTexture?: "Dry" | "Semi-wet" | "Wet";
}

const STREET_ORDER: Street[] = ["Preflop", "Flop", "Turn", "River"];

/**
 * Estimate each live opponent's range from their action sequence.
 * Heuristics (street-aware):
 *   Preflop: open/3bet from EP -> strong; flat -> medium/speculative.
 *   Flop:    small bet -> wide/merged; large bet -> polarized; check -> weak/pot control.
 *   Turn:    barrel -> committed/strong; check after betting -> capped.
 *   River:   big bet -> polarized (nuts/bluff); small bet -> thin value/block.
 */
export function inferRanges(inp: Inputs): RangeReadout {
  const { actions, liveOpponentSeats, positions = {}, basePotBB = 0 } = inp;

  const opponents: OpponentRange[] = liveOpponentSeats.map(seat => {
    const own = actions.filter(a => a.seatIdx === seat);
    const notes: string[] = [];
    let strength = 50; // start neutral
    let bluffFreq = 0.15;
    let rangeType: RangeType = "unknown";

    if (own.length === 0) {
      notes.push("No actions yet — assume default range for position.");
      const pos = positions[seat];
      if (pos === "UTG" || pos === "MP" || pos === "UTG+1" || pos === "UTG+2") strength = 58;
      else if (pos === "CO" || pos === "HJ" || pos === "LJ") strength = 50;
      else if (pos === "BTN") strength = 45;
      else if (pos === "SB" || pos === "BB") strength = 42;
      return { seatIdx: seat, position: pos, estimatedStrength: strength, rangeType: "wide", bluffFrequency: bluffFreq, notes };
    }

    // Track street-by-street behavior
    let runningPot = Math.max(1, basePotBB);
    let lastBetterSelf = false; // did opponent bet/raise last street?
    let everRaised = false;
    let everBet = false;
    let calledStations = 0;

    for (const street of STREET_ORDER) {
      const acts = own.filter(a => a.street === street);
      const streetActsAll = actions.filter(a => a.street === street);
      const streetMaxBet = streetActsAll.reduce((m, a) => Math.max(m, a.amountBB || 0), 0);
      const cumBefore = runningPot;
      runningPot += streetActsAll.reduce((s, a) => s + (a.amountBB || 0), 0);

      if (acts.length === 0) {
        if (lastBetterSelf && street !== "Preflop") {
          // Opponent bet previous street and gave up here → capped
          notes.push(`${street}: skipped after aggressing — capped tendency.`);
          strength -= 8;
          rangeType = "capped";
          bluffFreq = Math.min(0.5, bluffFreq + 0.1);
          lastBetterSelf = false;
        }
        continue;
      }

      // Last action of opponent on this street drives interpretation
      const last = acts[acts.length - 1];
      const sizePct = cumBefore > 0 ? (last.amountBB / cumBefore) * 100 : 0;

      if (street === "Preflop") {
        const pos = positions[seat];
        if (last.type === "Raise" || last.type === "Bet") {
          everRaised = true;
          const isEP = pos === "UTG" || pos === "UTG+1" || pos === "UTG+2" || pos === "MP";
          strength += isEP ? 22 : 14;
          rangeType = "linear";
          bluffFreq = isEP ? 0.06 : 0.12;
          notes.push(`Preflop ${last.type} (${pos || "?"}) → strong/${isEP ? "tight EP" : "opening"} range.`);
          lastBetterSelf = true;
        } else if (last.type === "Call") {
          strength += 4;
          rangeType = "merged";
          bluffFreq = 0.1;
          notes.push("Preflop Call → medium / speculative range.");
          lastBetterSelf = false;
        } else if (last.type === "Check") {
          rangeType = "wide";
          notes.push("Preflop Check (BB) → wide defensive range.");
          lastBetterSelf = false;
        }
      } else {
        // Postflop streets
        if (last.type === "Bet" || last.type === "Raise") {
          everBet = true;
          if (last.type === "Raise") everRaised = true;
          if (sizePct >= 75) {
            // Large / overbet → polarized
            rangeType = "polarized";
            bluffFreq = street === "River" ? 0.35 : 0.28;
            strength += street === "River" ? 18 : 14;
            notes.push(`${street}: large bet (~${sizePct.toFixed(0)}% pot) → polarized (nuts or bluff).`);
          } else if (sizePct >= 40) {
            rangeType = street === "Turn" ? "linear" : "merged";
            bluffFreq = 0.18;
            strength += street === "Turn" ? 14 : 10;
            notes.push(`${street}: medium bet (~${sizePct.toFixed(0)}% pot) → committed/merged value range.`);
          } else {
            rangeType = "merged";
            bluffFreq = 0.22;
            strength += street === "River" ? 4 : 6;
            notes.push(`${street}: small bet (~${sizePct.toFixed(0)}% pot) → ${street === "River" ? "thin value / block" : "wide range bet"}.`);
          }
          lastBetterSelf = true;
        } else if (last.type === "Call") {
          calledStations++;
          // Caller's range is capped (no raise)
          rangeType = rangeType === "polarized" ? "polarized" : "capped";
          strength += street === "Turn" ? 6 : 4;
          bluffFreq = Math.max(0.05, bluffFreq - 0.05);
          notes.push(`${street}: Call → capped range (no nuts, no air).`);
          lastBetterSelf = false;
        } else if (last.type === "Check") {
          if (lastBetterSelf) {
            rangeType = "capped";
            strength -= 10;
            bluffFreq = Math.min(0.45, bluffFreq + 0.08);
            notes.push(`${street}: Check after aggressing → capped / giving up.`);
          } else {
            rangeType = rangeType === "unknown" ? "wide" : rangeType;
            strength -= 4;
            notes.push(`${street}: Check → weak / pot control.`);
          }
          lastBetterSelf = false;
        } else if (last.type === "Fold") {
          notes.push(`${street}: Fold (no longer in hand).`);
        }
      }
    }

    // Continued aggression bonus
    if (everBet && everRaised) {
      strength += 4;
      notes.push("Sustained aggression → committed range.");
    }
    if (calledStations >= 2) {
      strength = Math.max(strength, 60);
      notes.push("Multiple calls → made hand with showdown value.");
    }

    strength = Math.max(0, Math.min(100, strength));
    bluffFreq = Math.max(0, Math.min(1, bluffFreq));
    if (rangeType === "unknown") rangeType = "wide";

    return {
      seatIdx: seat,
      position: positions[seat],
      estimatedStrength: Math.round(strength),
      rangeType,
      bluffFrequency: +bluffFreq.toFixed(2),
      notes,
    };
  });

  // Aggregate: take strongest opponent (worst case for hero) but blend with avg
  const aggregateStrength = opponents.length === 0 ? 0 : Math.round(
    0.6 * Math.max(...opponents.map(o => o.estimatedStrength)) +
    0.4 * (opponents.reduce((s, o) => s + o.estimatedStrength, 0) / opponents.length),
  );
  const aggregateBluffFreq = opponents.length === 0 ? 0 :
    +(opponents.reduce((s, o) => s + o.bluffFrequency, 0) / opponents.length).toFixed(2);

  // Dominant range type → most common; tie-break to polarized > capped > merged > linear > wide
  const priority: RangeType[] = ["polarized", "capped", "linear", "merged", "wide", "unknown"];
  const counts: Partial<Record<RangeType, number>> = {};
  opponents.forEach(o => { counts[o.rangeType] = (counts[o.rangeType] || 0) + 1; });
  let dominantRangeType: RangeType = "unknown";
  let bestN = 0;
  for (const t of priority) {
    const n = counts[t] || 0;
    if (n > bestN) { bestN = n; dominantRangeType = t; }
  }

  const notes: string[] = [];
  if (opponents.length === 0) notes.push("No live opponents.");
  else {
    notes.push(`${opponents.length} opponent(s) — strongest est. ${Math.max(...opponents.map(o => o.estimatedStrength))}/100.`);
    notes.push(`Dominant range type: ${dominantRangeType}.`);
  }

  return { opponents, aggregateStrength, aggregateBluffFreq, dominantRangeType, notes };
}

/**
 * Translate a range readout into modifiers the decision engine can apply.
 *   strengthDelta: subtract from hero adjScore comparisons (opponent stronger → reduce hero edge).
 *   sizingPctDelta: nudge sizing % (negative when opponents look strong & capped against value, etc.).
 *   aggressionDelta: -1..+1 nudging propensity to bet/bluff (more bluff freq → more fold equity).
 */
export function rangeModifiers(r: RangeReadout): {
  strengthDelta: number;
  sizingPctDelta: number;
  aggressionDelta: number;
  reason: string;
} {
  if (r.opponents.length === 0) {
    return { strengthDelta: 0, sizingPctDelta: 0, aggressionDelta: 0, reason: "No opponents to model." };
  }
  const s = r.aggregateStrength;
  const bf = r.aggregateBluffFreq;

  // Stronger opponent ranges reduce our effective edge
  let strengthDelta = 0;
  if (s >= 70) strengthDelta = -12;
  else if (s >= 60) strengthDelta = -6;
  else if (s <= 35) strengthDelta = +6;

  // Sizing: vs polarized/strong opponents bet bigger for value, smaller as bluff;
  // vs capped opponents extract thin value with smaller sizings.
  let sizingPctDelta = 0;
  if (r.dominantRangeType === "polarized" && s >= 60) sizingPctDelta = +5;
  else if (r.dominantRangeType === "capped") sizingPctDelta = -8;
  else if (r.dominantRangeType === "wide") sizingPctDelta = -4;

  // Aggression: when opponents show capped ranges or skipped after aggressing, bluff more.
  let aggressionDelta = 0;
  if (r.dominantRangeType === "capped") aggressionDelta = +0.25;
  if (r.dominantRangeType === "polarized" && s >= 65) aggressionDelta -= 0.15;
  if (bf >= 0.3) aggressionDelta += 0.1;

  const reason = `Opp range ~${s}/100 (${r.dominantRangeType}, bluff ${(bf * 100).toFixed(0)}%).`;
  return { strengthDelta, sizingPctDelta, aggressionDelta, reason };
}
