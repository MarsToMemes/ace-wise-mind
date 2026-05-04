// Dynamic, modular explanation generator — composes 2–4 sentence
// coaching paragraphs from structured engine outputs. No fixed
// templates: each concept has multiple phrasings selected based on
// engine signals (and lightly randomized) so the same situation
// never reads identically twice.

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
  insights: string[];
  opening: string;
  supporting: string[];
  conclusion: string;
  fullText: string;
}

// ---------- Variant pools ----------
type Pools = Record<string, string[]>;

const POOLS: Record<Lang, Pools> = {
  en: {
    // Hand description
    hStrong: [
      "your hand sits at the top of your range",
      "you hold a hand that crushes most of villain's range",
      "you're ahead of the bulk of opponent combos",
    ],
    hMedium: [
      "your hand has showdown value but is not nutted",
      "you're somewhere in the middle of your range",
      "you hold a marginal made hand with bluff-catching potential",
    ],
    hWeak: [
      "you're behind the bulk of villain's continuing range",
      "your hand has little showdown equity here",
      "you're dominated by most of the opponent's combos",
    ],
    hDraw: [
      "you have real drawing equity to improve",
      "your hand plays as a semi-bluff with outs to a strong holding",
      "your equity comes from improving on later streets",
    ],
    // Math
    eqAbove: [
      "your equity ({eq}%) clears the required pot odds ({req}%)",
      "the math favors continuation: {eq}% equity vs {req}% needed",
      "you're getting the right price ({eq}% > {req}%)",
    ],
    eqBelow: [
      "your equity ({eq}%) falls short of the price ({req}%)",
      "the math is against you: {eq}% < {req}% needed",
      "you don't have the equity to justify the call ({eq}% vs {req}%)",
    ],
    eqNoBet: [
      "no bet is in front of you, so you're free to choose initiative",
      "without facing a bet, the question is whether to apply pressure",
      "you have the option to set the price yourself",
    ],
    // Context — texture
    texDry: [
      "the board is dry and static",
      "the texture is uncoordinated, favoring made hands",
      "this board hits few draws",
    ],
    texSemi: [
      "the board is semi-coordinated",
      "the texture has some draws but isn't fully wet",
      "the board carries moderate connectivity",
    ],
    texWet: [
      "the board is wet and dynamic",
      "this is a draw-heavy texture",
      "the board interacts with many ranges",
    ],
    // Context — players
    multiway: [
      "with multiple players in the pot, ranges tighten and bluffs lose value",
      "in a multiway pot, value beats bluff frequency",
      "more players means thinner edges and more nutted ranges",
    ],
    headsUp: [
      "heads-up dynamics let you leverage frequencies",
      "with one opponent, ranges are wider and bluffs more credible",
      "the heads-up nature opens room for creative lines",
    ],
    // Context — position
    ip: [
      "you act last with positional advantage",
      "being in position lets you control the pot",
      "position gives you informational edge",
    ],
    oop: [
      "playing out of position limits your options",
      "without position, your sizing decisions matter more",
      "being OOP makes pot control trickier",
    ],
    // Context — sizing
    smallBet: [
      "the bet is small, suggesting a wide range",
      "the sizing is light — opponent could be range-betting",
      "a small bet keeps villain's range wide",
    ],
    medBet: [
      "the medium sizing shows commitment without polarization",
      "the bet leans toward a merged value range",
      "this sizing usually represents real value",
    ],
    bigBet: [
      "the large sizing polarizes opponent's range",
      "this big bet means strong value or pure bluff",
      "the sizing suggests a polarized strategy",
    ],
    overbet: [
      "the overbet signals an extremely polarized range",
      "this overbet is either the nuts or air",
      "an overbet narrows villain to top value or bluffs",
    ],
    // Decisions
    cRaise: [
      "Raising maximizes value and denies equity.",
      "A raise builds the pot while you're ahead.",
      "Going for a raise is the most +EV line here.",
    ],
    cCall: [
      "Calling realizes your equity at the right price.",
      "A call keeps villain's bluffs in and protects your range.",
      "Continuing is justified — reassess on the next card.",
    ],
    cCheck: [
      "Checking controls the pot and keeps your range capped-protected.",
      "A check is the cleanest line here — no need to bloat the pot.",
      "Taking a free card preserves your equity without risk.",
    ],
    cFold: [
      "Folding is the disciplined release — save the chips for better spots.",
      "Letting it go now avoids a -EV continuation.",
      "A fold here is the mathematically correct choice.",
    ],
    // Range insight
    rStrong: ["villain's range looks condensed and strong", "opponent represents a tight, value-heavy range", "range reads as nutted and narrow"],
    rWide: ["villain's range is wide and uncapped", "opponent's range stays broad with many marginal combos", "range remains loose with plenty of air"],
    rPolar: ["the line polarizes villain to nuts or bluffs", "opponent is polarized between value and pure bluffs", "range splits into nuts-or-air"],
    rMerged: ["villain's range looks merged around medium value", "opponent shows a merged value range", "range is condensed around one-pair strength"],
    // Strategic intent
    iValue: ["targeting thin value from worse made hands", "extracting value while ahead of villain's continuing range", "betting for value against weaker calls"],
    iBluff: ["leveraging fold equity against capped ranges", "applying pressure as a pure bluff with backup outs", "representing a stronger range to fold out equity"],
    iSemibluff: ["semi-bluffing with equity to back it up", "applying pressure with a draw as backup", "combining fold equity and raw outs"],
    iProtect: ["protecting equity against draws and overcards", "denying free cards to villain's drawing combos", "charging draws while ahead"],
    iControl: ["controlling pot size with showdown value", "keeping the pot manageable with a bluff-catcher", "playing pot control to reach showdown cheaply"],
    iGiveup: ["cutting losses on a clearly losing branch", "releasing to avoid a -EV spot"],
    // Forward plan
    fNextValue: ["plan to barrel turn on cards that improve your range", "continue value-betting on bricks; slow down on scare cards", "size up on turn cards that favor your range"],
    fNextBluff: ["pick scare cards to barrel and give up on villain-favored runouts", "fire again on cards that hit your perceived range, check on bricks", "double-barrel cards that improve fold equity"],
    fNextDraw: ["if you hit, get value; if you brick, evaluate fold equity vs sizing", "on a hit, build the pot; on a brick, prefer check or small probe", "let turn equity guide aggression — bet hits, control bricks"],
    fNextControl: ["check most turns and reassess on the river", "play check-call on most turns, fold to large pressure", "keep the pot small and target showdown"],
    fNextFold: ["look for stronger spots elsewhere", "wait for a better board or a clearer range advantage"],
    // Glue
    becauseOpener: ["because", "since", "as"],
    additionally: ["Additionally,", "On top of that,", "Beyond the math,"],
  },
  fr: {
    hStrong: [
      "votre main est au sommet de votre range",
      "vous battez la majeure partie des combos adverses",
      "vous êtes devant l'essentiel de la range de continuation",
    ],
    hMedium: [
      "votre main a une valeur de showdown mais n'est pas nuts",
      "vous êtes au milieu de votre range",
      "vous avez une main marginale avec un potentiel de bluff-catch",
    ],
    hWeak: [
      "vous êtes derrière la plupart des combos adverses",
      "votre main a peu d'équité au showdown",
      "vous êtes dominé par la majorité de la range de l'adversaire",
    ],
    hDraw: [
      "vous avez une vraie équité de tirage pour améliorer",
      "votre main joue comme semi-bluff avec des outs solides",
      "votre équité vient des cartes à venir",
    ],
    eqAbove: [
      "votre équité ({eq}%) dépasse la cote requise ({req}%)",
      "les maths favorisent la continuation : {eq}% vs {req}% requis",
      "vous obtenez le bon prix ({eq}% > {req}%)",
    ],
    eqBelow: [
      "votre équité ({eq}%) est en dessous de la cote ({req}%)",
      "les maths sont contre vous : {eq}% < {req}% requis",
      "vous n'avez pas l'équité pour justifier le call ({eq}% vs {req}%)",
    ],
    eqNoBet: [
      "aucune mise devant vous, à vous de choisir l'initiative",
      "sans agression devant, la question est d'appliquer ou non la pression",
      "vous avez l'option de fixer vous-même le prix",
    ],
    texDry: [
      "le board est sec et statique",
      "la texture est non coordonnée, favorisant les mains faites",
      "ce board touche peu de tirages",
    ],
    texSemi: [
      "le board est semi-coordonné",
      "la texture comporte des tirages sans être totalement humide",
      "le board présente une connectivité modérée",
    ],
    texWet: [
      "le board est humide et dynamique",
      "c'est une texture pleine de tirages",
      "le board interagit avec beaucoup de ranges",
    ],
    multiway: [
      "avec plusieurs joueurs, les ranges se resserrent et les bluffs perdent de la valeur",
      "en pot multiway, la value domine la fréquence de bluff",
      "plus de joueurs = edges plus minces et ranges plus nutées",
    ],
    headsUp: [
      "en heads-up, vous pouvez exploiter les fréquences",
      "avec un seul adversaire, les ranges sont plus larges et les bluffs crédibles",
      "le heads-up ouvre la porte à des lignes créatives",
    ],
    ip: [
      "vous parlez en dernier avec l'avantage de position",
      "être en position vous laisse contrôler le pot",
      "la position vous donne un avantage informationnel",
    ],
    oop: [
      "jouer hors position limite vos options",
      "sans position, vos décisions de sizing pèsent davantage",
      "être OOP rend le pot control plus délicat",
    ],
    smallBet: [
      "la mise est petite, suggérant une range large",
      "le sizing est léger — l'adversaire fait peut-être un range bet",
      "une petite mise garde la range adverse large",
    ],
    medBet: [
      "le sizing moyen montre de l'engagement sans polarisation",
      "la mise penche vers une range value mergée",
      "ce sizing représente généralement de la vraie value",
    ],
    bigBet: [
      "la grosse mise polarise la range adverse",
      "cette grosse mise signifie value forte ou pur bluff",
      "le sizing suggère une stratégie polarisée",
    ],
    overbet: [
      "l'overbet signale une range extrêmement polarisée",
      "cet overbet, c'est les nuts ou de l'air",
      "un overbet réduit la range à top value ou bluffs",
    ],
    cRaise: [
      "Relancer maximise la value et dénie l'équité.",
      "Une relance construit le pot pendant que vous êtes devant.",
      "Aller chercher la relance est la ligne la plus +EV ici.",
    ],
    cCall: [
      "Suivre réalise votre équité au bon prix.",
      "Un call garde les bluffs adverses et protège votre range.",
      "Continuer est justifié — réévaluez à la prochaine carte.",
    ],
    cCheck: [
      "Checker contrôle le pot et protège votre range cappée.",
      "Un check est la ligne la plus propre — inutile de gonfler le pot.",
      "Prendre une carte gratuite préserve votre équité sans risque.",
    ],
    cFold: [
      "Coucher est la discipline qui paie — gardez vos jetons pour mieux.",
      "Laisser tomber maintenant évite une continuation -EV.",
      "Le fold ici est mathématiquement correct.",
    ],
    becauseOpener: ["parce que", "puisque", "étant donné que"],
    additionally: ["De plus,", "En complément,", "Au-delà des maths,"],
  },
};

// Deterministic-ish picker seeded by engine signals → varied but stable per state.
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}
function hashSeed(parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h;
}
const fmt = (s: string, vars: Record<string, string | number> = {}) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const actionLabel = (a: string, lang: Lang) => {
  if (lang === "fr") return ({ Raise: "Relancer", Call: "Suivre", Check: "Checker", Fold: "Coucher" } as any)[a] || a;
  return a;
};

export function buildExplanation(inp: ExplanationInputs): Explanation {
  const { engine, street, position, opponents, userToCall, pot, lang } = inp;
  const P = POOLS[lang];

  // Seed varies on every meaningful state change so phrasing rotates naturally.
  const seed = hashSeed([
    engine.suggestedAction, engine.handClass?.hand_category ?? "?",
    Math.round(engine.equityPct), Math.round(engine.reqEquity ?? -1),
    engine.texture, street, position, opponents, Math.round(userToCall),
  ]);
  const s2 = seed * 31 + 7;
  const s3 = seed * 131 + 11;
  const s4 = seed * 17 + 5;

  // ----- Module: hand description -----
  const cat = engine.handClass?.hand_category;
  const handPool =
    cat === "Strong" ? P.hStrong :
    cat === "Medium" ? P.hMedium :
    cat === "Draw"   ? P.hDraw   :
    cat === "Weak"   ? P.hWeak   :
    (engine.adjScore >= 70 ? P.hStrong : engine.adjScore >= 45 ? P.hMedium : P.hWeak);
  const handPhrase = pick(handPool, seed);

  // ----- Module: math -----
  let mathPhrase: string;
  let mathFavorable: boolean | null = null;
  if (engine.potOdds != null && engine.reqEquity != null) {
    const eq = Math.round(engine.equityPct);
    const req = +engine.reqEquity.toFixed(0);
    if (eq >= req) { mathPhrase = fmt(pick(P.eqAbove, s2), { eq, req }); mathFavorable = true; }
    else { mathPhrase = fmt(pick(P.eqBelow, s2), { eq, req }); mathFavorable = false; }
  } else {
    mathPhrase = pick(P.eqNoBet, s2);
  }

  // ----- Module: situation context -----
  const texPhrase =
    engine.texture === "Dry" ? pick(P.texDry, s3) :
    engine.texture === "Wet" ? pick(P.texWet, s3) :
    pick(P.texSemi, s3);
  const playersPhrase = opponents >= 2 ? pick(P.multiway, s3) : pick(P.headsUp, s3);
  const ip = ["BTN", "CO", "HJ"].includes(position);
  const positionPhrase = ip ? pick(P.ip, s4) : pick(P.oop, s4);

  // Sizing module — only meaningful when facing a bet
  let sizingPhrase: string | null = null;
  if (userToCall > 0) {
    const potBefore = Math.max(1, pot);
    const sizePct = (userToCall / potBefore) * 100;
    sizingPhrase =
      sizePct > 100 ? pick(P.overbet, s4) :
      sizePct >= 66 ? pick(P.bigBet, s4) :
      sizePct >= 33 ? pick(P.medBet, s4) :
                       pick(P.smallBet, s4);
  }

  // ----- Module: decision -----
  const action = engine.suggestedAction;
  const concPool =
    action === "Raise" ? P.cRaise :
    action === "Call"  ? P.cCall  :
    action === "Fold"  ? P.cFold  :
                          P.cCheck;
  const conclusion = pick(concPool, seed);

  // ----- Compose: 2–4 sentences -----
  const opener = pick(P.becauseOpener, s2);
  const opening =
    `${actionLabel(action, lang)} ${lang === "fr" ? "est recommandé" : "is recommended"} ` +
    `${opener} ${mathPhrase}, ${handPhrase}.`;

  // Pick 2 most relevant context modules to avoid bloat
  const contextCandidates = [texPhrase, playersPhrase, positionPhrase];
  if (sizingPhrase) contextCandidates.unshift(sizingPhrase);
  const contextPicked = contextCandidates.slice(0, 2);

  const additional = pick(P.additionally, s3);
  const supporting = [
    `${additional} ${contextPicked[0]}.`,
    contextPicked[1] ? `${cap(contextPicked[1])}.` : "",
  ].filter(Boolean);

  const insights = [handPhrase, mathPhrase, ...contextCandidates];
  const fullText = [opening, ...supporting, conclusion].join(" ");

  // Surface useful flag for callers (kept on insights for now).
  if (mathFavorable === false) insights.push("math:negative");
  else if (mathFavorable === true) insights.push("math:positive");

  return { insights, opening, supporting, conclusion, fullText };
}
