// Conseil de mise après le flop (flop, turn, river), par principes GTO calculés à la volée :
// avantage d'équité et de mains fortes des ranges filtrées, place de la main dans la range,
// position, SPR et ligne jouée. Donne l'action, la taille en % du pot et en bb, la fréquence,
// le rôle de la main, les raisons et le plan. Ce n'est pas un solveur postflop.

import { rakeOf, type RakeRule } from "@/core/rake";
import { Combo } from "@/engines/rangeVsRange";
import { PostStreet, LineAct, rangeAdvantage, handPercentile, handEquityMulti, scaleEqThreshold, relStrength } from "@/engines/postflopRanges";
import { detectDraws } from "@/lib/pokerEngine";
import { analyzeBoard } from "@/engines/boardTexture";
import type { Adjust } from "@/engines/exploitEngine";

export type ActionKind = "bet" | "overbet" | "donk" | "probe" | "delayed" | "block" | "check" | "checkRaise" | "call" | "fold" | "raise" | "jam";
export type HandRole = "nuts" | "value" | "draw" | "showdown" | "air";

export const ROLE_LABEL: Record<HandRole, string> = {
  nuts: "très forte (haut de ta range)", value: "value", draw: "tirage", showdown: "main à abattage (moyenne)", air: "pas de main (bluff possible)",
};

export interface PostflopInput {
  street: PostStreet;
  board: string[];
  hole: string[];
  heroRange: Combo[];
  villainRange: Combo[];
  /** Ranges des AUTRES adversaires encore dans le coup (pots à 3 ou plus). */
  otherRanges?: Combo[][];
  heroInPosition: boolean;
  heroIsPfr: boolean;
  potBB: number;          // pot actuel (mises de la street incluses)
  toCallBB: number;       // 0 si personne n'a misé
  heroStackBB: number;
  opponents: number;      // adversaires encore dans le coup
  prevVillain?: LineAct;  // ce que l'adversaire a fait à la street précédente
  prevHero?: LineAct;
  villainCheckedThisStreet: boolean;
  villainAggressive?: boolean;
  adjust?: Partial<Adjust>;
  samples?: number;
  /** Rake cash retiré du pot gagné. Absent : aucun (tournoi). */
  rake?: RakeRule | null;
  /** Une relance est-elle encore possible ? Non face à un tapis (personne d'autre n'a de jetons) ou si ton tapis ne couvre pas la mise. Absent : oui. */
  canRaise?: boolean;
  /** As-tu checké sur cette street ? Une relance n'est un « check-raise » qu'après ton check. */
  heroCheckedThisStreet?: boolean;
  /** Mise la plus haute de la street (montant « à ») : base de la relance conseillée. Absent : le montant à payer. */
  betLevel?: number;
  /** Relance minimale (montant « à ») d'après le moteur de règles. */
  minRaiseTo?: number | null;
}

export interface PostflopAdvice {
  action: ActionKind;
  label: string;          // « Overbet 150 % = 18 BB »
  verb: string;           // « OVERBET »
  sizePct?: number;
  sizeBB?: number;
  allIn: boolean;
  pct: number;            // fréquence conseillée pour ta main
  mix: { label: string; pct: number }[];
  role: HandRole;
  reasons: string[];
  plan: string[];
  stats: { rangeEquity: number; handEquity: number; eqEdge: number; nutEdge: number; percentile: number; spr: number; required?: number };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r5 = (x: number) => Math.round(x / 5) * 5;
const halfBB = (x: number) => Math.round(x * 2) / 2;

/** Taille d'une mise : `pct` % du pot arrondi à la demi-bb, jamais sous la mise minimale de 1 bb ; tapis (tout ce qu'il
 *  te reste, au centième) au-delà de `jamAt` × ton tapis. `pct` rendu : la part du pot vraiment misée (D35). */
function sizeOf(pct: number, pot: number, stack: number, jamAt = 0.7) {
  const bb = Math.max(1, halfBB((pct / 100) * pot));
  const allIn = bb >= stack * jamAt;
  const sizeBB = allIn ? Math.round(stack * 100) / 100 : bb;
  return { sizeBB, allIn, pct: bb > halfBB((pct / 100) * pot) && pot > 0 ? Math.round((sizeBB / pot) * 100) : pct };
}

export function advisePostflop(inp: PostflopInput): PostflopAdvice {
  const { street, board, hole, heroInPosition: ip, potBB, toCallBB, heroStackBB } = inp;
  const adj = inp.adjust ?? {};
  const multiway = inp.opponents >= 2;
  const samples = inp.samples ?? 2500;

  const adv = rangeAdvantage(inp.heroRange, inp.villainRange, board, samples);
  const eqEdge = Math.round((adv.heroEquity * 100 - 50) * 10) / 10;
  const nutEdge = Math.round((adv.heroStrongPct - adv.villainStrongPct) * 10) / 10;
  const percentile = handPercentile(hole, inp.heroRange, board);
  // équité contre TOUS les adversaires encore dans le coup ; s'il manque des ranges, celle de l'adversaire principal les remplace
  const ranges = [inp.villainRange, ...(inp.otherRanges ?? [])].slice(0, 5);
  while (ranges.length < Math.min(5, inp.opponents)) ranges.push(inp.villainRange);
  const nOpp = ranges.length;
  const T = (t: number) => scaleEqThreshold(t, nOpp); // seuils pensés en tête-à-tête, ramenés au nombre d'adversaires
  const hEq = handEquityMulti(hole, ranges, board, Math.round(samples * 0.8));
  const rel = relStrength(hole, board);
  const outs = street === "River" ? 0 : detectDraws(hole, board).outs;
  const spr = potBB > 0 ? heroStackBB / potBB : 99;
  const dynamic = analyzeBoard(board.slice(0, 3)).dynamic;

  let role: HandRole =
    percentile >= 0.93 && rel >= 2 ? "nuts"
    : (percentile >= 0.7 && hEq >= T(0.5)) || hEq >= T(0.65) ? "value"
    : outs >= 8 ? "draw"
    : percentile >= 0.35 || hEq >= T(0.4) ? "showdown" : "air";
  if (multiway && role === "value" && hEq < T(0.6)) role = "showdown"; // seuil de value plus haut en multiway

  const stats = { rangeEquity: Math.round(adv.heroEquity * 1000) / 10, handEquity: Math.round(hEq * 1000) / 10, eqEdge, nutEdge, percentile: Math.round(percentile * 100), spr: Math.round(spr * 10) / 10 };
  const reasons: string[] = [];
  const plan: string[] = [];
  const pctStr = (p: number) => `${p} %`;

  // ------------------------------------------------------------------ face à une mise
  if (toCallBB > 0) {
    const finalPot = potBB + toCallBB;
    const required = toCallBB / (finalPot - rakeOf(finalPot, inp.rake)) + (adj.callThresholdDelta ?? 0) / 100;
    const reqPct = Math.round(required * 1000) / 10;
    const checkRaise = inp.heroCheckedThisStreet ?? (!ip && inp.villainCheckedThisStreet === false);
    const noRaise = inp.canRaise === false;
    // relance « à » ≈ 3 × la mise de l'adversaire (pas 3 × ce qu'il te reste à payer), jamais sous la relance minimale
    const raiseSize = () => {
      const to = Math.max(3 * (inp.betLevel ?? toCallBB), inp.minRaiseTo ?? 0);
      const z = sizeOf((to / potBB) * 100, potBB, heroStackBB, 0.45);
      return { sizeBB: !z.allIn && inp.minRaiseTo && z.sizeBB < inp.minRaiseTo ? inp.minRaiseTo : z.sizeBB, allIn: z.allIn };
    };
    const callLabel = `Call ${toCallBB} BB${toCallBB >= heroStackBB - 1e-6 ? " (tapis)" : ""}`;
    reasons.push(`Ton équité ${nOpp > 1 ? `contre les ${nOpp} adversaires` : "contre sa range"} : ${stats.handEquity} % ; il te faut ${reqPct} % pour payer.`);
    // face à un tapis (ou quand ton tapis ne couvre pas la mise) : seuls payer ou se coucher sont possibles
    if (noRaise && (role === "nuts" || (role === "value" && hEq >= T(0.75) && street === "Flop"))) {
      reasons.push("Ta main est en haut de ta range, mais plus aucune relance n'est possible ici : tu paies.");
      return { action: "call", verb: "CALL", label: callLabel, sizeBB: toCallBB, allIn: toCallBB >= heroStackBB - 1e-6, pct: 100, mix: [{ label: "Call", pct: 100 }], role, reasons, plan, stats: { ...stats, required: reqPct } };
    }
    // turn et river : il ne paie une relance qu'avec mieux ; seul le haut de ta range relance, une value moyenne paie
    // (banc maison / solveur : river, relances de value jouées 0 % du temps ; turn avec relance au pot permise,
    // le solveur paie dans 5 cas sur 6, −1,5 bb en moyenne). Le flop garde la relance de value.
    if (role === "nuts" || (role === "value" && hEq >= T(0.75) && street === "Flop")) {
      const { sizeBB, allIn } = raiseSize();
      reasons.push("Ta main est en haut de ta range : relance pour la value.");
      plan.push(allIn ? "Tu es engagé : tapis." : "S'il relance à son tour : tapis avec cette main.");
      return {
        action: allIn ? "jam" : "raise", verb: allIn ? "TAPIS" : checkRaise ? "CHECK-RAISE" : "RELANCE",
        label: allIn ? `Tapis ${sizeBB} BB` : `${checkRaise ? "Check-raise" : "Relance"} à ${sizeBB} BB (≈ 3× sa mise)`,
        sizeBB, sizePct: Math.round((sizeBB / potBB) * 100), allIn, pct: 85,
        mix: [{ label: allIn ? "Tapis" : "Relance", pct: 85 }, { label: "Call", pct: 15 }],
        role, reasons, plan, stats: { ...stats, required: reqPct },
      };
    }
    if (role === "draw" && street !== "River" && !noRaise) {
      const semi = Math.round(35 * (adj.heroBluffMult ?? 1));
      const { sizeBB, allIn } = raiseSize();
      const canCall = hEq >= required;
      reasons.push(`Tirage (${outs} outs) : ${canCall ? "la cote permet de payer" : "la cote ne suffit pas à payer seul"}, la relance en semi-bluff ajoute de la fold equity.`);
      plan.push("Si ton tirage rentre au turn/river : mise pour la value.");
      return {
        action: canCall ? "call" : "raise", verb: canCall ? "CALL" : "SEMI-BLUFF",
        label: canCall ? `Call ${toCallBB} BB` : `${checkRaise ? "Check-raise" : "Relance"} à ${sizeBB} BB en semi-bluff`,
        sizeBB: canCall ? toCallBB : sizeBB, allIn: !canCall && allIn, pct: canCall ? 100 - semi : semi + 20,
        mix: canCall ? [{ label: "Call", pct: 100 - semi }, { label: "Relance (semi-bluff)", pct: semi }] : [{ label: "Relance (semi-bluff)", pct: semi + 20 }, { label: "Fold", pct: 80 - semi }],
        role, reasons, plan, stats: { ...stats, required: reqPct },
      };
    }
    const margin = hEq - required;
    if (margin >= 0.03) {
      reasons.push("Ton équité dépasse la cote : payer est rentable.");
      plan.push(street === "River" ? "C'est la dernière décision." : "Street suivante : réévalue selon la carte et sa mise.");
      return { action: "call", verb: "CALL", label: callLabel, sizeBB: toCallBB, allIn: toCallBB >= heroStackBB - 1e-6, pct: 100, mix: [{ label: "Call", pct: 100 }], role, reasons, plan, stats: { ...stats, required: reqPct } };
    }
    if (margin >= -0.03) {
      reasons.push("Ton équité est juste à la limite de la cote : décision presque indifférente.");
      return { action: "call", verb: "CALL / FOLD", label: `${callLabel} (limite)`, sizeBB: toCallBB, allIn: false, pct: 50, mix: [{ label: "Call", pct: 50 }, { label: "Fold", pct: 50 }], role, reasons, plan, stats: { ...stats, required: reqPct } };
    }
    reasons.push("Ton équité est sous la cote : se coucher.");
    return { action: "fold", verb: "FOLD", label: "Coucher", allIn: false, pct: 100, mix: [{ label: "Fold", pct: 100 }], role, reasons, plan, stats: { ...stats, required: reqPct } };
  }

  // ------------------------------------------------------------------ personne n'a misé
  const firstToAct = !ip && !inp.villainCheckedThisStreet;
  const heroAggressorBefore = inp.prevHero === "bet" || (street === "Flop" && inp.heroIsPfr);
  let kind: ActionKind = "bet";
  let rangeFreq: number;

  // taille de base selon les avantages
  let tierPct: number;
  if (nutEdge >= 8 && street !== "Flop" && spr >= 1.2) {
    tierPct = street === "River" ? 150 : 125;
    kind = "overbet";
    reasons.push(`Gros avantage de mains fortes (+${nutEdge} pts) : range polarisée, overbet.`);
  } else if (nutEdge >= 4 && dynamic) {
    tierPct = 75;
    reasons.push(`Avantage de mains fortes (+${nutEdge} pts) sur board dynamique : mise grosse.`);
  } else if (eqEdge >= 0 && !dynamic) {
    tierPct = street === "Flop" ? 30 : 40;
    reasons.push("Avantage d'équité sur board statique : petite mise avec une grande partie de ta range.");
  } else {
    tierPct = 50;
    if (eqEdge < 0) reasons.push(`Ta range globale est un peu derrière (${eqEdge} pts) : tes mains moyennes checkent plus souvent, tes mains fortes misent.`);
  }
  rangeFreq = clamp(50 + 2.2 * eqEdge + (ip ? 10 : -8) + (heroAggressorBefore ? (adj.cbetFreqDelta ?? 0) : 0), 10, 90);

  if (firstToAct && !heroAggressorBefore) {
    // donk (le payeur mise en premier) ou probe (il a checké derrière à la street d'avant)
    if (inp.prevVillain === "checkBack") {
      kind = "probe"; tierPct = 55; rangeFreq = clamp(60 + eqEdge, 30, 85);
      reasons.unshift("Il a checké derrière à la street d'avant : sa range est limitée, attaque-la (probe).");
    } else if (nutEdge >= 3) {
      kind = "donk"; tierPct = nutEdge >= 6 ? 66 : 33; rangeFreq = clamp(25 + 3 * nutEdge, 20, 60);
      reasons.unshift(`Cette carte t'avantage (+${nutEdge} pts de mains fortes) : donk bet avec une partie de ta range.`);
    } else {
      kind = "check"; rangeFreq = 0;
      reasons.unshift("Tu parles en premier sans avantage : check à l'agresseur avec toute ta range.");
    }
  } else if (inp.heroIsPfr && inp.prevHero === "checkBack" && street !== "Flop") {
    kind = kind === "overbet" ? "overbet" : "delayed"; if (kind === "delayed") tierPct = 40;
    reasons.unshift("Tu as checké la street d'avant et il a checké aussi : c-bet retardé.");
  }

  // donk bet river avec une value moyenne : petite mise, une grosse ne se fait payer que par mieux
  // (banc maison / solveur : 33 % joué ~98 % du temps, 66 % jamais)
  if (kind === "donk" && street === "River" && role === "value") tierPct = 33;
  if ((adj.valueSizeTierDelta ?? 0) > 0 && (role === "nuts" || role === "value") && kind !== "check") tierPct = Math.round(tierPct * (1 + 0.35 * adj.valueSizeTierDelta!));
  if (multiway && kind !== "check") rangeFreq = Math.round(rangeFreq * 0.7);
  rangeFreq = r5(rangeFreq);
  const { sizeBB, allIn, pct: shownPct } = sizeOf(tierPct, potBB, heroStackBB);
  const bluffMult = adj.heroBluffMult ?? 1;

  // place de ta main dans ce plan
  const betVerb = allIn ? "TAPIS" : kind === "overbet" ? "OVERBET" : kind === "donk" ? "DONK BET" : kind === "probe" ? "PROBE" : kind === "delayed" ? "C-BET RETARDÉ" : "MISE";
  const betLabel = `${allIn ? "Tapis" : kind === "overbet" ? "Overbet" : kind === "donk" ? "Donk bet" : kind === "probe" ? "Probe" : kind === "delayed" ? "C-bet retardé" : "Mise"} ${allIn ? `${sizeBB} BB` : `${shownPct} % = ${sizeBB} BB`}`;
  const mk = (action: ActionKind, verb: string, label: string, pct: number, mix: PostflopAdvice["mix"]): PostflopAdvice =>
    ({ action, verb, label, pct, mix, sizePct: action === "check" ? undefined : shownPct, sizeBB: action === "check" ? undefined : sizeBB, allIn: action !== "check" && allIn, role, reasons, plan, stats });

  if (kind === "check") {
    if ((role === "nuts" || role === "value") && inp.villainAggressive) {
      plan.push(`S'il mise : check-raise à environ 3× sa mise.`);
      return mk("checkRaise", "CHECK (pour check-raise)", "Check, puis check-raise ≈ 3× sa mise", 70, [{ label: "Check (check-raise)", pct: 70 }, { label: "Check-call", pct: 30 }]);
    }
    if (role === "nuts") {
      // les nuts ne se contentent pas de payer : contre un joueur qui mise peu, mise toi-même ; sinon check pour relancer
      const lead = sizeOf(street === "River" ? 75 : 66, potBB, heroStackBB);
      const label = lead.allIn ? `Tapis ${lead.sizeBB} BB` : `Mise ${lead.pct} % = ${lead.sizeBB} BB`;
      reasons.push("Tu as les nuts : un simple check-call laisserait de la value. Mise toi-même : un joueur qui ne mise pas souvent ne fera pas grossir le pot pour toi.");
      plan.push(lead.allIn ? "Tu es engagé : tapis." : "S'il relance : tapis.");
      plan.push("Si tu choisis de checker : s'il mise, relance (check-raise ≈ 3× sa mise), ne te contente pas de payer.");
      return { ...mk("bet", lead.allIn ? "TAPIS" : "MISE", label, 65, [{ label, pct: 65 }, { label: "Check (check-raise)", pct: 35 }]), sizePct: lead.pct, sizeBB: lead.sizeBB, allIn: lead.allIn };
    }
    if (street === "River" && (role === "showdown" || (role === "value" && hEq < T(0.65)))) {
      const bp = inp.villainAggressive ? 60 : 35;
      const bs = sizeOf(25, potBB, heroStackBB);
      reasons.push("Main correcte mais pas assez forte pour une grosse mise : une petite mise prend un peu de value et évite une grosse mise de sa part.");
      // l'adversaire n'a presque plus rien derrière : la petite mise le met à tapis, et le libellé le dit
      const blockLabel = bs.allIn ? `Tapis ${bs.sizeBB} BB` : `Block bet ${bs.pct} % = ${bs.sizeBB} BB`;
      return { ...mk("block", bs.allIn ? "TAPIS" : "BLOCK BET", blockLabel, bp, [{ label: bs.allIn ? "Tapis" : `Block bet ${bs.pct} %`, pct: bp }, { label: "Check-call", pct: 100 - bp }]), sizePct: bs.pct, sizeBB: bs.sizeBB, allIn: bs.allIn };
    }
    plan.push(role === "air" ? "S'il mise : couche-toi (sauf gros tirage)." : "S'il mise : paie si ton équité dépasse la cote (le site te le dira).");
    return mk("check", "CHECK", "Check", 100, [{ label: "Check", pct: 100 }]);
  }

  // river, hors de position, en premier : l'overbet se joue avec le haut de ta range et des bluffs ; une value moyenne
  // checke pour payer (banc maison / solveur : overbet joué 0 % du temps ici, check meilleur qu'une mise de 75 %)
  if (role === "value" && kind === "overbet" && !ip && street === "River") {
    reasons.unshift("Ta range a l'avantage des mains fortes, mais ta main n'en fait pas partie : l'overbet est pour le haut de ta range. Check, et paie s'il mise.");
    plan.push("S'il mise : paie (ta main bat ses bluffs et une partie de sa value).");
    return mk("check", "CHECK", "Check (check-call)", 70, [{ label: "Check", pct: 70 }, { label: "Mise 33 %", pct: 30 }]);
  }
  if (role === "nuts" || role === "value") {
    const p = Math.max(80, rangeFreq);
    reasons.unshift(nOpp > 1 ? `Ta main est devant les ${nOpp} adversaires (${stats.handEquity} % d'équité, part équitable ${Math.round(100 / (nOpp + 1))} %) : mise pour la value.` : `Ta main est devant sa range (${stats.handEquity} % d'équité) : mise pour la value.`);
    plan.push("S'il relance : paie (ou tapis si le SPR est bas).");
    return mk(kind, betVerb, betLabel, p, [{ label: betLabel, pct: p }, { label: "Check", pct: 100 - p }]);
  }
  if (role === "draw") {
    const p = rangeFreq >= 45 ? Math.round(rangeFreq * bluffMult) : 25;
    reasons.push(`Tirage (${outs} outs) : bon semi-bluff, tu as de l'équité si on paie.`);
    plan.push("S'il relance : paie si la cote le permet, sinon couche-toi.");
    return mk(kind, p >= 50 ? betVerb : "CHECK / MISE", p >= 50 ? betLabel : "Check (ou mise en semi-bluff)", p >= 50 ? p : 100 - p, [{ label: betLabel, pct: p }, { label: "Check", pct: 100 - p }]);
  }
  // à la river, plus rien à protéger : miser une main moyenne ne se fait payer que par mieux (banc maison / solveur :
  // accord 0 % sur ces probes) ; elle passe donc par la règle générale des mains moyennes (check)
  if (role === "showdown" && (kind === "probe" || kind === "delayed") && street !== "River") {
    reasons.push("Sa range est limitée (il a checké) : ta main moyenne peut miser pour une value fine et protéger.");
    plan.push("S'il relance : couche-toi le plus souvent.");
    return mk(kind, betVerb, betLabel, 55, [{ label: betLabel, pct: 55 }, { label: "Check", pct: 45 }]);
  }
  if (role === "showdown") {
    const thin = rangeFreq >= 70 && street !== "River" ? 35 : 15;
    reasons.push("Main moyenne : elle gagne souvent à l'abattage, inutile de gonfler le pot.");
    plan.push("S'il mise : paie si ton équité dépasse la cote.");
    return mk("check", "CHECK", "Check (main à abattage)", 100 - thin, [{ label: "Check", pct: 100 - thin }, { label: betLabel, pct: thin }]);
  }
  // pas de main
  const bluff = Math.round((street === "River" ? (kind === "overbet" || tierPct >= 66 ? rangeFreq * 0.5 : rangeFreq * 0.3) : rangeFreq * 0.6) * bluffMult);
  if (bluff >= 40) {
    reasons.push("Ta main ne gagne pas à l'abattage : c'est un bon candidat au bluff dans ce plan.");
    plan.push("S'il paie : continue seulement sur une bonne carte (ou abandonne).");
    return mk(kind, `${betVerb} (bluff)`, `${betLabel} en bluff`, r5(bluff), [{ label: `${betLabel} (bluff)`, pct: r5(bluff) }, { label: "Check", pct: 100 - r5(bluff) }]);
  }
  reasons.push("Pas de main et peu de raison de bluffer ici : abandonne ce pot.");
  return mk("check", "CHECK", "Check (abandonne si il mise)", 100 - r5(bluff), [{ label: "Check", pct: 100 - r5(bluff) }, { label: `${betLabel} (bluff)`, pct: r5(bluff) }]);
}
