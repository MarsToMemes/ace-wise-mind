// Local deterministic coach — zero API calls.
// Translates engine outputs into a human-readable AIAnalysis.
import type { AIAnalysis } from "@/components/AIPanel";
import {
  calculateAlpha,
  optimalBluffToValueRatio,
  calculateMDF,
  maxFoldPercentage,
} from "@/lib/pokerEngine";

export interface CoachEngineInput {
  // Engine outputs (already computed client-side)
  action: "Raise" | "Call" | "Check" | "Fold" | string;
  reasoning?: string;
  handCategory?: string;
  adjScore?: number;
  baseScore?: number;
  outs?: number;
  drawType?: string;
  equityPct?: number;
  texture?: string;
  potOdds?: string | number | null;
  reqEquity?: number | null;
  heroRA?: number;
  villainRA?: number;
  sizing?: {
    heroAction: string;
    amountBB: number;
    pctMin: number;
    pctMax: number;
    intent: string;
    explanation: string;
    facingBet?: boolean;
    inPosition?: boolean;
  } | null;
  rangeReadout?: {
    aggregateStrength: number;
    dominantRangeType: string;
    aggregateBluffFreq: number;
    opponents: Array<{ position?: string; estimatedStrength: number; rangeType: string }>;
  } | null;
  // Context
  street: "Preflop" | "Flop" | "Turn" | "River";
  position: string;
  opponents: number;
  inPosition: boolean;
  // Tournament context (optional)
  tournament?: {
    type?: string;
    mRatio: number;
    stackBB: number;
    stage: string;
    icmPressure: "low" | "medium" | "high" | "critical";
    playersRemaining: number;
    payoutSpots: number;
    isNearBubble: boolean;
    isFinalTable: boolean;
    heroStackRelative: "big" | "medium" | "short";
    pushFold?: { action: string; reasoning: string; handTier: string } | null;
  } | null;
  lang?: "en" | "fr";
}

const fr = (lang?: string) => lang === "fr";

export function generateCoachAnalysis(inp: CoachEngineInput): AIAnalysis {
  const FR = fr(inp.lang);
  const t = inp.tournament;
  const action = (["Raise", "Call", "Check", "Fold"].includes(inp.action) ? inp.action : "Check") as
    "Raise" | "Call" | "Check" | "Fold";

  const adj = inp.adjScore ?? 50;
  const eq = inp.equityPct ?? 0;
  const reqEq = inp.reqEquity ?? null;
  const outs = inp.outs ?? 0;
  const ip = inp.inPosition;

  const sizingLine = inp.sizing
    ? FR
      ? `${inp.sizing.heroAction} ${inp.sizing.amountBB} BB (${inp.sizing.pctMin}–${inp.sizing.pctMax}% du pot) — ${inp.sizing.intent}. ${inp.sizing.explanation}`
      : `${inp.sizing.heroAction} ${inp.sizing.amountBB} BB (${inp.sizing.pctMin}–${inp.sizing.pctMax}% of pot) — ${inp.sizing.intent}. ${inp.sizing.explanation}`
    : FR ? "Pas de mise requise sur cette street." : "No bet required on this street.";

  const rr = inp.rangeReadout;
  const rangeLine = rr && rr.opponents.length
    ? FR
      ? `Force adverse agrégée ${rr.aggregateStrength}/100, range ${rr.dominantRangeType}, bluff ~${Math.round(rr.aggregateBluffFreq * 100)}%.`
      : `Aggregate opponent strength ${rr.aggregateStrength}/100, ${rr.dominantRangeType} range, ~${Math.round(rr.aggregateBluffFreq * 100)}% bluff.`
    : FR ? "Pas d'adversaire actif identifié." : "No active opponent identified.";

  // Tournament-aware reasoning
  const tournamentNote = t
    ? FR
      ? ` Contexte tournoi: M=${t.mRatio.toFixed(1)}, stack ${t.stackBB.toFixed(1)}BB, stage ${t.stage}, ICM ${t.icmPressure}${t.isNearBubble ? " (bulle)" : ""}${t.isFinalTable ? " (table finale)" : ""}.`
      : ` Tournament context: M=${t.mRatio.toFixed(1)}, ${t.stackBB.toFixed(1)}BB stack, ${t.stage} stage, ${t.icmPressure} ICM${t.isNearBubble ? " (bubble)" : ""}${t.isFinalTable ? " (final table)" : ""}.`
    : "";

  const equityLine = reqEq != null && eq
    ? FR
      ? `Équité ${eq}% vs équité requise ${reqEq}% (${eq >= reqEq ? "favorable" : "défavorable"}).`
      : `Equity ${eq}% vs required ${reqEq}% (${eq >= reqEq ? "favorable" : "unfavorable"}).`
    : FR ? `Équité estimée ${eq}%.` : `Estimated equity ${eq}%.`;

  const handLine = FR
    ? `Main: ${inp.handCategory ?? "?"} (score ajusté ${adj}). ${outs > 0 ? `Tirage ${inp.drawType} (~${outs} outs).` : ""}`
    : `Hand: ${inp.handCategory ?? "?"} (adj. score ${adj}). ${outs > 0 ? `Draw: ${inp.drawType} (~${outs} outs).` : ""}`;

  const textureLine = FR
    ? `Texture: ${inp.texture ?? "?"}. Position: ${ip ? "IP" : "OOP"} (${inp.position}). ${inp.opponents >= 2 ? "Multiway." : "Heads-up."}`
    : `Texture: ${inp.texture ?? "?"}. Position: ${ip ? "IP" : "OOP"} (${inp.position}). ${inp.opponents >= 2 ? "Multiway." : "Heads-up."}`;

  // GTO overlay: Alpha (when hero bets/raises) and MDF (when hero faces a bet)
  let gtoLine = "";
  const sz = inp.sizing;
  if (sz && sz.amountBB > 0 && (sz.heroAction === "Bet" || sz.heroAction === "Raise") && inp.street !== "Preflop") {
    const pctTarget = (sz.pctMin + sz.pctMax) / 200; // midpoint, % → decimal
    if (pctTarget > 0) {
      const potEstimate = sz.amountBB / pctTarget;
      const alpha = calculateAlpha(sz.amountBB, potEstimate);
      const ratio = optimalBluffToValueRatio(alpha);
      const interp = alpha < 0.25
        ? (FR ? " Petit bet → range peut contenir beaucoup de bluffs." : " Small bet → range can include many bluffs.")
        : alpha > 0.4
        ? (FR ? " Gros bet → range fortement orientée value." : " Large bet → range heavily weighted to value.")
        : (FR ? " Bet médian → mix équilibré value/bluff." : " Medium bet → balanced value/bluff mix.");
      gtoLine += FR
        ? ` Alpha = ${(alpha * 100).toFixed(1)}%. Pour 10 value bets, ${ratio.bluffs} bluffs pour rester équilibré.${interp}`
        : ` Alpha = ${(alpha * 100).toFixed(1)}%. For every 10 value bets, ${ratio.bluffs} bluffs to stay balanced.${interp}`;
    }
  }
  if (sz?.facingBet && reqEq != null && reqEq > 0 && reqEq < 100) {
    // potOdds = call/(pot+call) = reqEq/100 → MDF = 1 - potOdds
    const mdf = 1 - reqEq / 100;
    const fl = maxFoldPercentage(mdf);
    gtoLine += FR
      ? ` MDF: défends ≥ ${fl.mdf.toFixed(1)}% de ta range (fold max ${fl.maxFold.toFixed(1)}%).`
      : ` MDF: defend ≥ ${fl.mdf.toFixed(1)}% of your range (max fold ${fl.maxFold.toFixed(1)}%).`;
  }

  const reasoning = `${handLine} ${equityLine} ${textureLine}${tournamentNote} ${sizingLine}${gtoLine}`.replace(/\s+/g, " ").trim();

  // Push/fold override note
  const pfNote = t?.pushFold
    ? FR
      ? ` Push/Fold: ${t.pushFold.action} (${t.pushFold.handTier}). ${t.pushFold.reasoning}`
      : ` Push/Fold: ${t.pushFold.action} (${t.pushFold.handTier}). ${t.pushFold.reasoning}`
    : "";

  // Conditional lines
  const conditional: string[] = [];
  if (inp.street !== "River") {
    conditional.push(FR
      ? `Si la turn est blanche: ${adj >= 65 ? "continue à miser pour la value" : adj >= 45 ? "contrôle le pot" : "check/fold"}.`
      : `If turn is a blank: ${adj >= 65 ? "keep betting for value" : adj >= 45 ? "pot control" : "check/fold"}.`);
    conditional.push(FR
      ? `Si la turn complète un tirage (flush/quinte): ${ip ? "ralentis et évalue" : "check et défends petit"}.`
      : `If turn completes a draw (flush/straight): ${ip ? "slow down and reassess" : "check and defend small"}.`);
    conditional.push(FR
      ? `Si l'adversaire raise: ${adj >= 75 ? "3-bet pour la value" : adj <= 40 ? "fold" : "call et réévalue"}.`
      : `If opponent raises: ${adj >= 75 ? "3-bet for value" : adj <= 40 ? "fold" : "call and reassess"}.`);
  } else {
    conditional.push(FR
      ? `Si l'adversaire mise gros: ${adj >= 75 ? "call/raise pour value" : adj <= 45 ? "fold" : "bluff catch sélectif"}.`
      : `If opponent bets big: ${adj >= 75 ? "call/raise for value" : adj <= 45 ? "fold" : "selective bluff catch"}.`);
    conditional.push(FR ? "Si check à toi: décide value-bet vs check-back." : "If checked to you: decide value-bet vs check-back.");
  }
  if (t && t.mRatio < 13) {
    conditional.unshift(FR
      ? `M=${t.mRatio.toFixed(1)} < 13 → logique push/fold prioritaire sur les considérations postflop.`
      : `M=${t.mRatio.toFixed(1)} < 13 → push/fold logic overrides postflop considerations.`);
  }
  if (t?.isNearBubble) {
    conditional.unshift(FR
      ? "Bulle: réduis l'aggression sans cartes premium, l'ICM domine la décision."
      : "Bubble: reduce aggression without premium cards, ICM dominates the decision.");
  }

  const turnPlan = inp.street === "Preflop" || inp.street === "Flop"
    ? (adj >= 65 ? (FR ? "Continue à miser pour la value." : "Keep betting for value.")
      : outs >= 8 ? (FR ? "Barrel sur scare cards favorables." : "Barrel on favorable scare cards.")
      : (FR ? "Pot control par défaut." : "Default to pot control."))
    : (FR ? "Récap des décisions précédentes." : "Recap prior decisions.");

  const riverPlan = inp.street === "River"
    ? (FR ? "Décision finale — pas de street suivante." : "Final decision — no future street.")
    : (adj >= 70 ? (FR ? "Vise la value sur run-out brick." : "Target value on brick run-out.")
      : adj <= 35 ? (FR ? "Plan de give-up sans équité." : "Give-up plan without equity.")
      : (FR ? "Bluff-catch sélectif selon sizing." : "Selective bluff-catch based on sizing."));

  const youRep = FR
    ? `${ip ? "IP" : "OOP"} ${inp.position}: ${(inp.heroRA ?? 50) >= 55 ? "tu as l'avantage de range." : "ta range est plafonnée."}`
    : `${ip ? "IP" : "OOP"} ${inp.position}: ${(inp.heroRA ?? 50) >= 55 ? "you hold the range advantage." : "your range is capped."}`;

  const keyConcepts = [
    FR ? `Équité vs cote du pot (${eq}% vs ${reqEq ?? "n/a"}%)` : `Equity vs pot odds (${eq}% vs ${reqEq ?? "n/a"}%)`,
    FR ? `Avantage range Hero/Villain ${inp.heroRA ?? 50}/${inp.villainRA ?? 50}` : `Range advantage Hero/Villain ${inp.heroRA ?? 50}/${inp.villainRA ?? 50}`,
    FR ? `Texture: ${inp.texture}` : `Texture: ${inp.texture}`,
    inp.opponents >= 2
      ? (FR ? "Pot multiway: ranges plus serrées" : "Multiway pot: tighter ranges")
      : (FR ? "Heads-up: ranges plus larges" : "Heads-up: wider ranges"),
  ];
  if (t) {
    keyConcepts.push(FR
      ? `M-ratio ${t.mRatio.toFixed(1)} (${t.stage}) · ICM ${t.icmPressure}`
      : `M-ratio ${t.mRatio.toFixed(1)} (${t.stage}) · ICM ${t.icmPressure}`);
    if (t.isNearBubble) keyConcepts.push(FR ? "Pression bulle" : "Bubble pressure");
    if (t.isFinalTable) keyConcepts.push(FR ? "Table finale (paliers ICM)" : "Final table (ICM ladder)");
  }

  const mistakes = [
    adj <= 35
      ? (FR ? "Bluffer sans fold equity ni outs" : "Bluffing without fold equity or outs")
      : (FR ? "Slowplay quand value est à prendre" : "Slowplaying when value is available"),
    inp.sizing?.facingBet && reqEq != null && eq < (reqEq ?? 0)
      ? (FR ? "Payer à mauvais prix vs sizing adverse" : "Calling at a bad price vs opponent sizing")
      : (FR ? "Sizing déconnecté du board et de la range" : "Sizing disconnected from board and range"),
    FR ? "Ignorer la position dans la décision" : "Ignoring position in the decision",
  ];
  if (t && t.mRatio < 13) {
    mistakes.unshift(FR
      ? "Jouer du postflop avec M<13 au lieu de push/fold"
      : "Playing postflop with M<13 instead of push/fold");
  }
  if (t?.isNearBubble) {
    mistakes.unshift(FR
      ? "Sur-aggression à la bulle au lieu de protéger le min-cash"
      : "Over-aggression on the bubble instead of protecting min-cash");
  }

  return {
    decision_explanation: {
      action,
      reasoning: `${reasoning}${pfNote}`.trim(),
      confidence: Math.max(0.5, Math.min(0.95, adj / 100)),
    },
    street_strategy: {
      current_street_plan: `${inp.street}: ${sizingLine}`,
      turn_plan: turnPlan,
      river_plan: riverPlan,
    },
    conditional_lines: conditional,
    range_thinking: {
      what_you_represent: youRep,
      what_opponent_represents: rangeLine,
    },
    key_concepts: keyConcepts,
    mistakes_to_avoid: mistakes,
  };
}
