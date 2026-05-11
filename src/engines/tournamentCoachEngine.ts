// Advanced local Tournament Coach engine.
// Specialized for MTT/SNG/Turbo/Hyper-turbo. Stack-depth aware, ICM aware,
// push/fold reasoning, mistake detection, decision quality scoring.
// Emits the same AIAnalysis shape consumed by <AIPanel /> so the UI is unchanged.

import type { AIAnalysis } from "@/components/AIPanel";
import type { TournamentState, TournamentType } from "@/lib/tournamentEngine";
import { classifyZone, equilibriumPush, bbCallVsPush, zoneLabel, type Zone } from "./zoneSystem";
import { computeFE, type FEResult } from "./foldEquity";
import { computeICMOverlay, type ICMOverlay } from "./icmOverlay";
import { PROFILES, type OpponentProfile } from "./opponentProfile";

export type StackDepth = "deep" | "medium" | "short" | "critical";
export type DecisionAction = "PUSH" | "CALL" | "FOLD" | "RESHOVE" | "RAISE" | "CHECK";
export type RiskLevel = "Low" | "Medium" | "High";
export type EVQuality = "Strong" | "Medium" | "Marginal" | "Negative";

export interface TournamentCoachInput {
  // Tournament context
  state: TournamentState;
  // Hand & position
  holeCards: string[];
  position: string;
  street: "Preflop" | "Flop" | "Turn" | "River";
  opponents: number;
  // Engine outputs (already computed)
  handTier?: "Premium" | "Strong" | "Playable" | "Marginal" | "Trash";
  handCategory?: string;
  adjScore?: number;
  baseScore?: number;
  outs?: number;
  drawType?: string;
  equityPct?: number;
  texture?: string;
  reqEquity?: number | null;
  inPosition: boolean;
  // Push/fold engine output (preflop only)
  pushFold?: { action: "Shove" | "Call-Shove" | "Fold"; reasoning: string; handTier: string } | null;
  // Postflop sizing recommendation
  sizing?: {
    heroAction: string;
    amountBB: number;
    pctMin: number;
    pctMax: number;
    intent: string;
    explanation: string;
    facingBet?: boolean;
  } | null;
  // Opener position (preflop) if known
  openerPosition?: string | null;
  // Hero faces aggression?
  facingAggression?: boolean;
  // Opponent profile (default unknown)
  opponentProfile?: OpponentProfile;
  // Pot context for fold equity (BB)
  potBB?: number;
  betBB?: number;
  lang?: "en" | "fr";
}

export function classifyStackDepth(stackBB: number): StackDepth {
  if (stackBB >= 40) return "deep";
  if (stackBB >= 15) return "medium";
  if (stackBB >= 10) return "short";
  return "critical";
}

const FR = (l?: string) => l === "fr";

const T = {
  depthLabel: (d: StackDepth, fr: boolean) => fr
    ? ({ deep: "Stack profond", medium: "Stack moyen", short: "Short stack", critical: "Stack critique" }[d])
    : ({ deep: "Deep stack", medium: "Medium stack", short: "Short stack", critical: "Critical stack" }[d]),
};

function recommendedAggression(depth: StackDepth, icm: TournamentState["icmPressure"]): number {
  // 0..100
  let base = depth === "deep" ? 55 : depth === "medium" ? 70 : depth === "short" ? 80 : 90;
  if (icm === "critical") base -= 25;
  else if (icm === "high") base -= 15;
  else if (icm === "medium") base -= 7;
  return Math.max(20, Math.min(95, base));
}

function decisionQuality(
  action: DecisionAction,
  depth: StackDepth,
  state: TournamentState,
  hasFoldEquity: boolean,
  tierRank: number, // 0 trash .. 4 premium
): { ev: EVQuality; risk: RiskLevel; aggression: number; pressure: number } {
  const pressure = state.icmPressure === "critical" ? 95
    : state.icmPressure === "high" ? 75
    : state.icmPressure === "medium" ? 50 : 25;

  let ev: EVQuality = "Medium";
  let risk: RiskLevel = "Medium";
  let aggression = 50;

  if (action === "FOLD") {
    risk = "Low";
    ev = tierRank >= 3 && depth !== "critical" ? "Marginal" : "Medium";
    aggression = 10;
  } else if (action === "PUSH") {
    aggression = 95;
    risk = depth === "critical" ? "Medium" : depth === "short" ? "Medium" : "High";
    ev = (tierRank >= 2 && hasFoldEquity) ? "Strong" : tierRank >= 1 ? "Medium" : "Marginal";
  } else if (action === "RESHOVE") {
    aggression = 90;
    risk = "High";
    ev = tierRank >= 3 ? "Strong" : tierRank >= 2 ? "Medium" : "Marginal";
  } else if (action === "CALL") {
    aggression = 35;
    risk = depth === "critical" ? "High" : "Medium";
    ev = tierRank >= 3 ? "Medium" : "Marginal";
  } else if (action === "RAISE") {
    aggression = 75;
    risk = "Medium";
    ev = tierRank >= 2 ? "Strong" : "Medium";
  } else {
    aggression = 25;
    risk = "Low";
    ev = "Medium";
  }
  if (state.icmPressure === "critical" && (action === "CALL" || action === "PUSH")) {
    risk = "High";
  }
  return { ev, risk, aggression, pressure };
}

function pickPrimaryAction(inp: TournamentCoachInput, depth: StackDepth): DecisionAction {
  if (inp.street === "Preflop") {
    // Equilibrium push range (red/orange zones)
    const zone = classifyZone(inp.state.mRatio);
    if (zone === "red" || zone === "orange") {
      const eq = equilibriumPush(inp.holeCards, inp.position, inp.state.stackBB);
      if (eq.inPushRange) return inp.facingAggression ? "RESHOVE" : "PUSH";
      // BB defense vs push
      if (inp.position === "BB" && inp.facingAggression) {
        const bb = bbCallVsPush(inp.holeCards, inp.openerPosition ?? null);
        if (bb.canCall) return "CALL";
      }
      return "FOLD";
    }
    if (inp.pushFold) {
      if (inp.pushFold.action === "Shove") return inp.facingAggression ? "RESHOVE" : "PUSH";
      if (inp.pushFold.action === "Call-Shove") return "CALL";
      return "FOLD";
    }
    const tier = inp.handTier ?? "Trash";
    if (depth === "deep") {
      if (tier === "Premium" || tier === "Strong") return "RAISE";
      if (tier === "Playable" && inp.inPosition) return "RAISE";
      return "FOLD";
    }
    if (depth === "medium") {
      if (tier === "Premium" || tier === "Strong") return "RAISE";
      if (tier === "Playable" && inp.inPosition) return "RAISE";
      return "FOLD";
    }
    if (tier === "Premium") return "PUSH";
    if (tier === "Strong" && (inp.inPosition || depth === "critical")) return "PUSH";
    return "FOLD";
  }
  // postflop: lean on adjScore / equity
  const adj = inp.adjScore ?? 50;
  const eq = inp.equityPct ?? 0;
  const reqEq = inp.reqEquity ?? null;
  if (adj >= 70) return "RAISE";
  if (reqEq != null && eq >= reqEq) return "CALL";
  if (adj <= 35) return "FOLD";
  return "CHECK";
}

function tierRank(tier?: string): number {
  return ({ Premium: 4, Strong: 3, Playable: 2, Marginal: 1, Trash: 0 } as Record<string, number>)[tier ?? "Trash"] ?? 0;
}

const POS_GROUP: Record<string, "early" | "middle" | "late" | "blinds"> = {
  UTG: "early", "UTG+1": "early", "UTG+2": "early",
  MP: "middle", LJ: "middle", HJ: "middle",
  CO: "late", BTN: "late",
  SB: "blinds", BB: "blinds",
};

function dominationRisk(holeCards: string[], openerGroup?: string): string | null {
  if (!holeCards || holeCards.length < 2) return null;
  const RANKS = "23456789TJQKA";
  const r1 = holeCards[0][0], r2 = holeCards[1][0];
  const v1 = RANKS.indexOf(r1) + 2, v2 = RANKS.indexOf(r2) + 2;
  const hi = Math.max(v1, v2), lo = Math.min(v1, v2);
  const suited = holeCards[0][1] === holeCards[1][1];
  // Classic dominated combos vs early/middle opens
  if (openerGroup === "early" || openerGroup === "middle") {
    if (hi === 13 && lo === 10 && !suited) return "KTo is frequently dominated by AK/AQ/KQ/KJ from early ranges.";
    if (hi === 14 && lo <= 10 && !suited) return "Weak ace offsuit (Ax) is dominated by stronger aces in early ranges.";
    if (hi === 12 && lo <= 10) return "QT/QJ class is dominated by AQ/KQ from early opens.";
    if (hi === 11 && lo <= 9) return "JT-/J9 class loses to better Jx/Tx from tight opens.";
  }
  return null;
}

export function generateTournamentCoach(inp: TournamentCoachInput): AIAnalysis {
  const fr = FR(inp.lang);
  const depth = classifyStackDepth(inp.state.stackBB);
  const zone: Zone = classifyZone(inp.state.mRatio);
  const icmOverlay: ICMOverlay = computeICMOverlay(inp.state);
  const profile: OpponentProfile = inp.opponentProfile ?? "unknown";
  const profileGuide = PROFILES[profile];
  const action = pickPrimaryAction(inp, depth);
  const rank = tierRank(inp.handTier);
  const hasFE = depth !== "deep";
  const dq = decisionQuality(action, depth, inp.state, hasFE, rank);
  const aggressionTarget = recommendedAggression(depth, inp.state.icmPressure);

  // Fold-equity readout when we have a pot context and we're aggressive
  let fe: FEResult | null = null;
  if ((action === "PUSH" || action === "RESHOVE" || action === "RAISE") && (inp.potBB ?? 0) > 0) {
    fe = computeFE({
      potBB: inp.potBB!,
      betBB: inp.betBB ?? inp.state.stackBB,
      opponents: inp.opponents,
      heroStackBB: inp.state.stackBB,
      position: inp.position,
      profile,
      icmPressureBoost: inp.state.icmPressure === "high" || inp.state.icmPressure === "critical",
      showdownEquityPct: inp.equityPct,
    });
  }

  // Equilibrium-range note (preflop, short/critical)
  const eqRange = inp.street === "Preflop" ? equilibriumPush(inp.holeCards, inp.position, inp.state.stackBB) : null;


  const stage = inp.state.stage;
  const stageNote = (() => {
    if (stage === "bubble") return fr ? "Bulle: protège ton min-cash, tighten" : "Bubble: protect min-cash, tighten ranges";
    if (stage === "final-table") return fr ? "Table finale: ICM domine, paliers de prize" : "Final table: ICM dominates the ladder";
    if (stage === "push-fold") return fr ? "Zone push/fold active" : "Push/fold zone active";
    if (stage === "middle") return fr ? "Mid stage: cherche les vols" : "Mid stage: hunt steals";
    return fr ? "Deep stage: stratégie postflop standard" : "Deep stage: standard postflop strategy";
  })();

  const depthNote = (() => {
    const d = T.depthLabel(depth, fr);
    if (depth === "deep") return fr ? `${d} (${inp.state.stackBB.toFixed(1)}BB): poker postflop, mains spéculatives jouables IP.` :
      `${d} (${inp.state.stackBB.toFixed(1)}BB): postflop poker, speculative hands playable in position.`;
    if (depth === "medium") return fr ? `${d} (${inp.state.stackBB.toFixed(1)}BB): plus d'aggression preflop, vols et 3-bets.` :
      `${d} (${inp.state.stackBB.toFixed(1)}BB): more preflop aggression, steals and 3-bets.`;
    if (depth === "short") return fr ? `${d} (${inp.state.stackBB.toFixed(1)}BB): logique push/fold, fold equity prioritaire, peu de flat-call.` :
      `${d} (${inp.state.stackBB.toFixed(1)}BB): push/fold logic, fold equity is the priority, very few flats.`;
    return fr ? `${d} (${inp.state.stackBB.toFixed(1)}BB): push ou fold, jamais limp, presque jamais flat.` :
      `${d} (${inp.state.stackBB.toFixed(1)}BB): push or fold, never limp, almost never flat.`;
  })();

  // WHY explanation
  const why: string[] = [];
  const tierLabel = inp.handTier ?? "Unknown";
  if (action === "FOLD") {
    if (depth === "short" || depth === "critical") {
      why.push(fr
        ? `Avec ${inp.state.stackBB.toFixed(1)}BB en ${inp.position}, ${tierLabel} ne génère pas assez de fold equity ni d'équité réalisée.`
        : `At ${inp.state.stackBB.toFixed(1)}BB from ${inp.position}, ${tierLabel} lacks both fold equity and equity realization.`);
    } else {
      why.push(fr
        ? `${tierLabel} en ${inp.position} face à ${inp.opponents} adversaire(s): EV négatif sur la durée.`
        : `${tierLabel} from ${inp.position} vs ${inp.opponents} opponents: negative EV long-term.`);
    }
    const dom = dominationRisk(inp.holeCards, POS_GROUP[inp.openerPosition ?? ""]);
    if (dom) why.push(fr ? "Risque de domination: " + dom : "Domination risk: " + dom);
  } else if (action === "PUSH" || action === "RESHOVE") {
    why.push(fr
      ? `Shove > call: tu maximises la fold equity (${inp.state.stackBB.toFixed(1)}BB) et tu réalises ton équité quand payé.`
      : `Shove beats calling: you maximize fold equity at ${inp.state.stackBB.toFixed(1)}BB and realize equity when called.`);
    if (depth === "critical") why.push(fr
      ? "Sub-10BB: pas de plan postflop, le shove est la seule ligne EV+."
      : "Sub-10BB: no postflop plan, shoving is the only EV+ line.");
  } else if (action === "CALL") {
    why.push(fr
      ? `${tierLabel} assez fort pour réaliser de l'équité face à un shove/raise dans cette dynamique.`
      : `${tierLabel} strong enough to realize equity vs a shove/raise in this dynamic.`);
  } else if (action === "RAISE") {
    why.push(fr
      ? "Open/3-bet pour la value et le contrôle d'initiative."
      : "Open/3-bet for value and initiative.");
  }

  // Conditional lines
  const cond: string[] = [];
  if (inp.street === "Preflop") {
    cond.push(fr ? `Si raise devant en early: tighten — ${tierLabel} se fait dominer.` :
      `If early-position open in front: tighten — ${tierLabel} gets dominated.`);
    cond.push(fr ? "Si limpeurs devant: isole large depuis BTN/CO avec tier Playable+." :
      "If limpers in front: isolate wide from BTN/CO with Playable+ tier.");
    if (depth === "short" || depth === "critical") {
      cond.push(fr ? `Si pushé devant: call seulement avec Premium/Strong à ICM ${inp.state.icmPressure}.` :
        `If shoved into: call only with Premium/Strong at ICM ${inp.state.icmPressure}.`);
    }
  } else {
    cond.push(fr ? "Si turn blanche: continue ta ligne (value/pot control selon force)." :
      "If blank turn: continue your line (value or pot control by strength).");
    cond.push(fr ? "Si scare card complète un tirage: ralentis OOP, polarise IP." :
      "If scare card completes a draw: slow down OOP, polarize IP.");
  }
  if ((inp.state.playersRemaining <= 9) || stage === "final-table") {
    cond.unshift(fr ? "Final table: applique l'ICM, cible les short-stacks et évite les flips inutiles." :
      "Final table: apply ICM, target short stacks, avoid unnecessary flips.");
  } else if (stage === "bubble") {
    cond.unshift(fr ? "Bulle: vole les blinds des moyens, évite les confrontations avec les big stacks." :
      "Bubble: steal mid-stack blinds, avoid clashing with big stacks.");
  }
  // Heads-up
  if (inp.opponents <= 1) {
    cond.push(fr ? "Heads-up: élargis tes pushes/raises agressivement, réduis les folds preflop." :
      "Heads-up: widen pushes/raises aggressively, fold less preflop.");
  }

  // Mistakes
  const mistakes: string[] = [];
  if (depth === "short" || depth === "critical") {
    mistakes.push(fr ? "Limper short-stacké au lieu de push/fold." : "Limping short-stacked instead of push/fold.");
    mistakes.push(fr ? "Flat-call dominé en perdant la fold equity." : "Flat-calling dominated, losing fold equity.");
  }
  if (depth === "deep" || depth === "medium") {
    mistakes.push(fr ? "Trop de calls passifs preflop sans plan postflop." : "Too many passive preflop calls without a postflop plan.");
  }
  mistakes.push(fr ? "Attendre des premiums en laissant les blinds te grignoter." : "Waiting for premiums while blinds eat your stack.");
  mistakes.push(fr ? "Payer off des mains dominées (Ax faible, Kx faible) en early." : "Calling off dominated hands (weak Ax/Kx) vs early opens.");
  if (inp.state.icmPressure === "high" || inp.state.icmPressure === "critical") {
    mistakes.push(fr ? "Sur-aggression sans tenir compte de l'ICM (paliers de prize)." :
      "Over-aggression ignoring ICM (prize ladders).");
  }

  // Key concepts (HUD-ish chips)
  const keyConcepts: string[] = [
    fr ? `Stack: ${inp.state.stackBB.toFixed(1)}BB · M=${inp.state.mRatio.toFixed(1)}` :
      `Stack: ${inp.state.stackBB.toFixed(1)}BB · M=${inp.state.mRatio.toFixed(1)}`,
    fr ? `Profondeur: ${T.depthLabel(depth, true)}` : `Depth: ${T.depthLabel(depth, false)}`,
    fr ? `Stage: ${stage}` : `Stage: ${stage}`,
    fr ? `ICM: ${inp.state.icmPressure}` : `ICM: ${inp.state.icmPressure}`,
    fr ? `Aggression cible: ${aggressionTarget}/100` : `Target aggression: ${aggressionTarget}/100`,
    fr ? `Décision: ${dq.ev} EV · Risque ${dq.risk}` : `Decision: ${dq.ev} EV · ${dq.risk} risk`,
  ];
  if (depth === "critical") keyConcepts.push(fr ? "ZONE DANGER" : "DANGER ZONE");
  if (stage === "bubble") keyConcepts.push(fr ? "Pression bulle" : "Bubble pressure");
  if ((inp.state.playersRemaining <= 9)) keyConcepts.push(fr ? "Paliers ICM (FT)" : "ICM ladder (FT)");
  keyConcepts.push(fr ? `Zone: ${zone.toUpperCase()}` : `Zone: ${zone.toUpperCase()} — ${zoneLabel(zone).split(" — ")[1] ?? ""}`);
  keyConcepts.push(fr ? `Vilain: ${profileGuide.label}` : `Villain: ${profileGuide.label}`);
  keyConcepts.push(fr ? `Bubble factor: ${icmOverlay.bubbleFactor.toFixed(2)}x` : `Bubble factor: ${icmOverlay.bubbleFactor.toFixed(2)}x`);
  keyConcepts.push(fr ? `Floor d'équité call: ${icmOverlay.callEquityFloorPct}%` : `Call equity floor: ${icmOverlay.callEquityFloorPct}%`);
  if (fe) keyConcepts.push(fr ? `Fold equity: ${fe.level.toUpperCase()} (${fe.estimatedFoldPct}%)` : `Fold equity: ${fe.level.toUpperCase()} (${fe.estimatedFoldPct}%)`);
  if (eqRange && eqRange.bracket && inp.state.stackBB <= 15) {
    keyConcepts.push(fr ? `Range ${inp.position} ${eqRange.bracket}BB: ${eqRange.inPushRange ? "IN" : "OUT"}` :
      `${inp.position} ${eqRange.bracket}BB push: ${eqRange.inPushRange ? "IN" : "OUT"}`);
  }

  // Opponent-profile-driven mistakes / lines
  if (!profileGuide.bluffOK) {
    mistakes.push(fr ? `Bluffer un ${profileGuide.label}: il paie trop large.` : `Bluffing a ${profileGuide.label}: they call too wide.`);
  }
  cond.push(fr ? `Vilain (${profileGuide.label}): ${profileGuide.exploit}` : `Villain (${profileGuide.label}): ${profileGuide.exploit}`);

  // Range thinking
  const youRep = (() => {
    if (action === "PUSH" || action === "RESHOVE") {
      return fr
        ? `${inp.position} short: range polarisée pushes (paires + Ax + suited connectors selon M).`
        : `${inp.position} short: polarized shove range (pairs + Ax + suited connectors by M).`;
    }
    if (action === "RAISE") {
      return fr
        ? `${inp.position} ${depth}: range linéaire d'open, tu représentes la force.`
        : `${inp.position} ${depth}: linear opening range, you represent strength.`;
    }
    return fr ? `${inp.position}: tu représentes une range mid/cap.` : `${inp.position}: you represent a mid/capped range.`;
  })();
  const oppRep = inp.openerPosition
    ? (fr ? `Ouvreur ${inp.openerPosition} (${POS_GROUP[inp.openerPosition] ?? "late"}): range serrée, paires + broadways forts.`
          : `Opener ${inp.openerPosition} (${POS_GROUP[inp.openerPosition] ?? "late"}): tight range, pairs + strong broadways.`)
    : (fr ? "Adversaire non identifié: assume une range standard pour la position." :
            "No identified opponent: assume position-standard range.");

  const decisionLabel = action === "PUSH" ? "PUSH"
    : action === "RESHOVE" ? "RE-SHOVE"
    : action === "CALL" ? "CALL"
    : action === "FOLD" ? "FOLD"
    : action === "RAISE" ? "RAISE"
    : "CHECK";

  const reasoning = [
    depthNote,
    stageNote + ".",
    why.join(" "),
    inp.pushFold ? `${inp.pushFold.action} (${inp.pushFold.handTier}): ${inp.pushFold.reasoning}` : "",
    inp.sizing && inp.street !== "Preflop"
      ? (fr ? `Sizing: ${inp.sizing.heroAction} ${inp.sizing.amountBB}BB (${inp.sizing.pctMin}-${inp.sizing.pctMax}% pot) — ${inp.sizing.intent}.`
            : `Sizing: ${inp.sizing.heroAction} ${inp.sizing.amountBB}BB (${inp.sizing.pctMin}-${inp.sizing.pctMax}% pot) — ${inp.sizing.intent}.`)
      : "",
  ].filter(Boolean).join(" ");

  const confidence = (() => {
    let c = 0.6;
    if (action === "PUSH" && rank >= 3) c = 0.9;
    if (action === "FOLD" && rank <= 1) c = 0.85;
    if (action === "RAISE" && rank >= 3) c = 0.85;
    if (depth === "critical") c = Math.max(c, 0.8);
    return c;
  })();

  const currentPlan = (() => {
    if (inp.street === "Preflop") {
      if (action === "PUSH" || action === "RESHOVE") return fr
        ? `Shove all-in maintenant (${inp.state.stackBB.toFixed(1)}BB). Pas de plan postflop nécessaire.`
        : `Shove all-in now (${inp.state.stackBB.toFixed(1)}BB). No postflop plan required.`;
      if (action === "RAISE") return fr ? "Open-raise 2.2-2.5x, plan c-bet sélectif sur boards favorables." :
        "Open-raise 2.2-2.5x, plan a selective c-bet on favorable boards.";
      if (action === "CALL") return fr ? "Call et joue postflop en réalisant ton équité IP." :
        "Call and play postflop realizing equity IP.";
      return fr ? "Fold proprement, préserve le stack pour un meilleur spot." :
        "Clean fold, preserve stack for a better spot.";
    }
    if (inp.sizing) {
      return fr
        ? `${inp.sizing.heroAction} ${inp.sizing.amountBB}BB (${inp.sizing.intent}). ${inp.sizing.explanation}`
        : `${inp.sizing.heroAction} ${inp.sizing.amountBB}BB (${inp.sizing.intent}). ${inp.sizing.explanation}`;
    }
    return fr ? "Pot control / value selon la force." : "Pot control / value by strength.";
  })();

  const turnPlan = inp.street === "Preflop" || inp.street === "Flop"
    ? (rank >= 3 || (inp.adjScore ?? 50) >= 65
      ? (fr ? "Barrel pour la value sur turn favorable." : "Barrel for value on favorable turn.")
      : (fr ? "Pot control par défaut, prends la gratuit s'il check." : "Default pot control, take free card if checked to."))
    : (fr ? "Récap des décisions précédentes." : "Recap prior decisions.");

  const riverPlan = inp.street === "River"
    ? (fr ? "Décision finale: value ou bluff catch sélectif selon sizing." :
            "Final decision: value or selective bluff catch by sizing.")
    : (rank >= 3 ? (fr ? "Value bet thin sur run-out brick." : "Thin value bet on brick run-out.")
                 : (fr ? "Give-up sans équité, sinon bluff catch sélectif." : "Give up without equity, otherwise selective bluff catch."));

  const conf = Math.round(confidence * 100);
  const headerAction = `${decisionLabel} · ${dq.ev} EV · ${dq.risk} Risk · Aggro ${dq.aggression}/100 · Pressure ${dq.pressure}/100`;

  return {
    decision_explanation: {
      action: headerAction,
      reasoning: `${reasoning} (${fr ? "Confiance" : "Confidence"} ${conf}%).`,
      confidence,
    },
    street_strategy: {
      current_street_plan: `${inp.street}: ${currentPlan}`,
      turn_plan: turnPlan,
      river_plan: riverPlan,
    },
    conditional_lines: cond,
    range_thinking: {
      what_you_represent: youRep,
      what_opponent_represents: oppRep,
    },
    key_concepts: keyConcepts,
    mistakes_to_avoid: mistakes,
  };
}
