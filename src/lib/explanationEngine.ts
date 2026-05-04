// Deterministic explanation engine — builds structured, rule-based explanations
// from poker engine outputs. No AI / API required.
import type { EngineResult } from "@/components/EngineReadout";
import type { Lang } from "@/lib/i18n";

export type Street = "Preflop" | "Flop" | "Turn" | "River";

export interface ExplanationInputs {
  engine: EngineResult;
  street: Street;
  position: string;
  opponents: number;
  userToCall: number;
  pot: number;
  lang: Lang;
}

export interface Explanation {
  insights: string[];      // raw atomic insights
  opening: string;         // main reason
  supporting: string[];    // 2–3 supporting arguments
  conclusion: string;      // strategic conclusion
  fullText: string;        // assembled paragraph
}

// ---------- Tiny localized phrase pack ----------
type Phrase =
  | "strongHand" | "mediumHand" | "weakHand"
  | "flushDraw" | "straightDraw" | "comboDraw" | "overcards" | "noDraw"
  | "equityBeatsOdds" | "equityBelowOdds" | "noPriceFacing"
  | "evPositive" | "evMarginal" | "evNegative"
  | "dryBoard" | "semiWetBoard" | "wetBoard"
  | "flopPressure" | "turnPressure" | "riverPressure"
  | "smallBet" | "mediumBet" | "largeBet" | "overbet" | "facingCheck"
  | "multiway" | "headsUp"
  | "rangeAdvHero" | "rangeAdvVillain" | "rangeNeutral"
  | "concRaise" | "concCall" | "concCheck" | "concFold"
  | "openingBecause" | "and" | "additionally" | "context"
  | "profCont" | "profFold" | "marginalSpot";

const PHRASES: Record<Lang, Record<Phrase, string>> = {
  en: {
    strongHand: "you hold a strong made hand",
    mediumHand: "you hold a medium-strength hand",
    weakHand: "your hand is weak",
    flushDraw: "you have a flush draw",
    straightDraw: "you have a straight draw",
    comboDraw: "you have a combo draw with strong equity",
    overcards: "you only have overcards / minimal equity",
    noDraw: "you have no real draw",
    equityBeatsOdds: "your equity ({eq}%) exceeds the required pot odds ({req}%)",
    equityBelowOdds: "your equity ({eq}%) is below the required pot odds ({req}%)",
    noPriceFacing: "you are not facing a bet, so there is no price to pay",
    evPositive: "the call has positive expected value",
    evMarginal: "the spot is marginal in EV terms",
    evNegative: "the call shows negative expected value",
    dryBoard: "the board is dry",
    semiWetBoard: "the board is semi-connected",
    wetBoard: "the board is wet and dynamic",
    flopPressure: "on the flop, ranges are still wide",
    turnPressure: "on the turn, equities crystallize and barrels carry weight",
    riverPressure: "on the river, only value and bluffs remain — no implied odds",
    smallBet: "facing a small bet",
    mediumBet: "facing a medium-sized bet",
    largeBet: "facing a large bet",
    overbet: "facing an overbet — range is polarized",
    facingCheck: "no aggression in front of you",
    multiway: "the pot is multiway, which favors value over bluffs",
    headsUp: "the spot is heads-up, allowing more flexibility",
    rangeAdvHero: "you hold the range advantage",
    rangeAdvVillain: "the opponent holds the range advantage",
    rangeNeutral: "ranges are roughly balanced",
    concRaise: "Raising is the most profitable line.",
    concCall: "Calling is justified — continue and reassess on the next street.",
    concCheck: "Checking keeps the pot manageable and your range protected.",
    concFold: "Folding is the disciplined choice — preserve your stack for better spots.",
    openingBecause: "{action} is recommended because",
    and: "and",
    additionally: "Additionally,",
    context: "Context:",
    profCont: "this makes continuation profitable",
    profFold: "this makes folding the +EV decision",
    marginalSpot: "this is a marginal spot — lean on position and reads",
  },
  fr: {
    strongHand: "vous avez une main forte faite",
    mediumHand: "vous avez une main de force moyenne",
    weakHand: "votre main est faible",
    flushDraw: "vous avez un tirage couleur",
    straightDraw: "vous avez un tirage quinte",
    comboDraw: "vous avez un combo-tirage avec une forte équité",
    overcards: "vous n'avez que des overcards / équité minimale",
    noDraw: "vous n'avez pas de vrai tirage",
    equityBeatsOdds: "votre équité ({eq}%) dépasse la cote requise ({req}%)",
    equityBelowOdds: "votre équité ({eq}%) est inférieure à la cote requise ({req}%)",
    noPriceFacing: "vous ne faites face à aucune mise, donc aucun prix à payer",
    evPositive: "le call a une espérance positive",
    evMarginal: "la situation est marginale en termes d'EV",
    evNegative: "le call a une espérance négative",
    dryBoard: "le board est sec",
    semiWetBoard: "le board est semi-connecté",
    wetBoard: "le board est humide et dynamique",
    flopPressure: "au flop, les ranges sont encore larges",
    turnPressure: "au turn, les équités se cristallisent et les barrels pèsent lourd",
    riverPressure: "à la river, il ne reste que value et bluff — pas d'implied odds",
    smallBet: "face à une petite mise",
    mediumBet: "face à une mise moyenne",
    largeBet: "face à une grosse mise",
    overbet: "face à un overbet — range polarisée",
    facingCheck: "aucune agression devant vous",
    multiway: "le pot est multiway, ce qui favorise la value plutôt que le bluff",
    headsUp: "la situation est en heads-up, ce qui permet plus de flexibilité",
    rangeAdvHero: "vous avez l'avantage de range",
    rangeAdvVillain: "l'adversaire a l'avantage de range",
    rangeNeutral: "les ranges sont globalement équilibrées",
    concRaise: "Relancer est la ligne la plus profitable.",
    concCall: "Suivre est justifié — continuer et réévaluer au tour suivant.",
    concCheck: "Checker garde le pot gérable et protège votre range.",
    concFold: "Coucher est le choix discipliné — préservez votre stack pour de meilleurs spots.",
    openingBecause: "{action} est recommandé car",
    and: "et",
    additionally: "De plus,",
    context: "Contexte :",
    profCont: "ce qui rend la continuation profitable",
    profFold: "ce qui fait du fold la décision +EV",
    marginalSpot: "spot marginal — appuyez-vous sur la position et les lectures",
  },
};

const fmt = (s: string, vars: Record<string, string | number> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

const actionLabel = (a: string, lang: Lang) => {
  if (lang === "fr") return ({ Raise: "Relancer", Call: "Suivre", Check: "Checker", Fold: "Coucher" } as any)[a] || a;
  return a;
};

export function buildExplanation(inp: ExplanationInputs): Explanation {
  const { engine, street, opponents, userToCall, lang } = inp;
  const P = PHRASES[lang];
  const insights: string[] = [];

  // 1) Hand strength — prefer contextual classification over absolute score
  const adj = engine.adjScore;
  const cat = engine.handClass?.hand_category;
  let strengthInsight: string;
  if (cat === "Strong") strengthInsight = P.strongHand;
  else if (cat === "Medium") strengthInsight = P.mediumHand;
  else if (cat === "Draw") strengthInsight = P.comboDraw;
  else if (cat === "Weak") strengthInsight = P.weakHand;
  else if (adj >= 70) strengthInsight = P.strongHand;
  else if (adj >= 45) strengthInsight = P.mediumHand;
  else strengthInsight = P.weakHand;
  insights.push(strengthInsight);

  // 2) Draw
  const dt = (engine.drawType || "").toLowerCase();
  let drawInsight: string | null = null;
  if (dt.includes("flush") && dt.includes("straight")) drawInsight = P.comboDraw;
  else if (dt.includes("flush")) drawInsight = P.flushDraw;
  else if (dt.includes("straight") || dt.includes("open") || dt.includes("gutshot")) drawInsight = P.straightDraw;
  else if (engine.outs >= 2 && engine.outs < 6) drawInsight = P.overcards;
  else if (engine.outs === 0 && adj < 45) drawInsight = P.noDraw;
  if (drawInsight) insights.push(drawInsight);

  // 3) Math: equity vs pot odds + EV
  let mathInsight: string;
  let evInsight: string | null = null;
  if (engine.potOdds != null && engine.reqEquity != null) {
    const eq = Math.round(engine.equityPct);
    const req = +engine.reqEquity.toFixed(1);
    const diff = eq - req;
    if (diff >= 0) {
      mathInsight = fmt(P.equityBeatsOdds, { eq, req });
      evInsight = diff >= 8 ? P.evPositive : P.evMarginal;
    } else {
      mathInsight = fmt(P.equityBelowOdds, { eq, req });
      evInsight = diff <= -8 ? P.evNegative : P.evMarginal;
    }
  } else {
    mathInsight = P.noPriceFacing;
  }
  insights.push(mathInsight);
  if (evInsight) insights.push(evInsight);

  // 4) Board texture
  const tex = engine.texture;
  const texInsight = tex === "Dry" ? P.dryBoard : tex === "Wet" ? P.wetBoard : P.semiWetBoard;
  insights.push(texInsight);

  // 5) Street pressure
  const pressureInsight =
    street === "Flop" ? P.flopPressure :
    street === "Turn" ? P.turnPressure :
    street === "River" ? P.riverPressure : null;
  if (pressureInsight) insights.push(pressureInsight);

  // 6) Opponent bet sizing
  const potBefore = Math.max(1, inp.pot);
  const sizePct = userToCall > 0 ? (userToCall / potBefore) * 100 : 0;
  let bettingInsight: string;
  if (userToCall <= 0) bettingInsight = P.facingCheck;
  else if (sizePct > 100) bettingInsight = P.overbet;
  else if (sizePct >= 66) bettingInsight = P.largeBet;
  else if (sizePct >= 33) bettingInsight = P.mediumBet;
  else bettingInsight = P.smallBet;
  insights.push(bettingInsight);

  // 7) Multiway vs heads-up
  insights.push(opponents >= 2 ? P.multiway : P.headsUp);

  // 8) Range advantage
  const heroRA = Number(engine.heroRA);
  const villainRA = Number(engine.villainRA);
  const rangeInsight =
    heroRA - villainRA >= 8 ? P.rangeAdvHero :
    villainRA - heroRA >= 8 ? P.rangeAdvVillain : P.rangeNeutral;
  insights.push(rangeInsight);

  // ---- Sentence builder ----
  const action = engine.suggestedAction;
  const opening = `${fmt(P.openingBecause, { action: actionLabel(action, lang) })} ${mathInsight}, ${strengthInsight}.`;

  const supporting: string[] = [];
  if (drawInsight) supporting.push(capitalize(drawInsight) + ".");
  supporting.push(`${capitalize(bettingInsight)} ${lang === "fr" ? "sur un" : "on a"} ${stripArticle(texInsight, lang)}.`);
  if (pressureInsight) supporting.push(capitalize(pressureInsight) + ".");
  supporting.push(capitalize(rangeInsight) + ".");

  const conc =
    action === "Raise" ? P.concRaise :
    action === "Call"  ? P.concCall  :
    action === "Fold"  ? P.concFold  : P.concCheck;
  const tail = evInsight === P.evPositive ? ` ${capitalize(P.profCont)}.`
            : evInsight === P.evNegative ? ` ${capitalize(P.profFold)}.`
            : evInsight === P.evMarginal ? ` ${capitalize(P.marginalSpot)}.` : "";
  const conclusion = `${conc}${tail}`;

  const fullText = [opening, ...supporting.slice(0, 3), conclusion].join(" ");

  return { insights, opening, supporting: supporting.slice(0, 3), conclusion, fullText };
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function stripArticle(s: string, lang: Lang) {
  // "the board is dry" -> "dry board"; "le board est sec" -> "board sec"
  if (lang === "en") return s.replace(/^the board is\s+/i, "") + " board";
  return s.replace(/^le board est\s+/i, "board ");
}
