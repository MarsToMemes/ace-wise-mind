// Conditional Action Lines — pro-level decision tree generator.
// After each primary decision, produces 2–3 conditional future actions
// covering both turn-card outcomes and opponent-behavior responses.
// Every line includes: condition, action, explanation (why the strategy
// changes + how the opponent's range is affected).

import type { EngineResult } from "@/components/EngineReadout";
import type { Lang } from "@/lib/i18n";
import type { Street } from "@/lib/explanationEngine";

export interface ConditionalLine {
  condition: string;
  action: "Bet" | "Raise" | "Call" | "Check" | "Fold" | "Mixed";
  explanation: string;
}

export interface ConditionalInputs {
  engine: EngineResult;
  street: Street;
  position: string;
  opponents: number;
  userToCall: number;
  pot: number;
  lang: Lang;
  flushDrawOnBoard: boolean;
  straightDrawOnBoard: boolean;
}

const TXT = {
  en: {
    // Turn card conditions
    blank: "Blank turn (low brick, no draw completed)",
    scare: "Scare card (overcard / range-shifting)",
    flush: "Flush-completing card",
    straight: "Straight-completing card",
    // Opponent behavior conditions
    oppCheck: "Opponent checks to you",
    oppSmall: "Opponent leads small (<40% pot)",
    oppLarge: "Opponent leads large (≥66% pot)",
    oppRaise: "Opponent raises your bet",
    // Generic glue
    becauseRange: (s: string) => `villain's range now skews ${s}`,
  },
  fr: {
    blank: "Turn brique (carte basse, aucun tirage complété)",
    scare: "Scare card (overcard / décale les ranges)",
    flush: "Carte qui complète la couleur",
    straight: "Carte qui complète la quinte",
    oppCheck: "L'adversaire checke",
    oppSmall: "L'adversaire mise petit (<40% du pot)",
    oppLarge: "L'adversaire mise gros (≥66% du pot)",
    oppRaise: "L'adversaire relance votre mise",
    becauseRange: (s: string) => `la range du vilain s'oriente vers ${s}`,
  },
};

export function buildConditionalLines(inp: ConditionalInputs): ConditionalLine[] {
  const { engine, street, lang, flushDrawOnBoard, straightDrawOnBoard, opponents } = inp;
  const T = TXT[lang];
  const cat = engine.handClass?.hand_category;
  const action = engine.suggestedAction;
  const isFinalStreet = street === "River";
  const lines: ConditionalLine[] = [];

  // ---------- TURN CARD CONDITIONS (only relevant before the river) ----------
  if (!isFinalStreet) {
    // 1) Blank turn — strategy continuation
    if (cat === "Strong" || action === "Raise") {
      lines.push({
        condition: T.blank,
        action: "Bet",
        explanation: lang === "fr"
          ? `Continuer la value : la brique ne change ni votre force ni la range adverse, ${T.becauseRange("inchangée et toujours dominée")}. Conservez le sizing.`
          : `Keep barreling for value: a brick doesn't shift equities, and ${T.becauseRange("static, still dominated")}. Maintain sizing.`,
      });
    } else if (cat === "Draw") {
      lines.push({
        condition: T.blank,
        action: "Check",
        explanation: lang === "fr"
          ? `Sans amélioration ni changement de range, contrôlez le pot pour réaliser l'équité gratuitement.`
          : `No improvement and range stays the same — take a free card to realize equity cheaply.`,
      });
    } else {
      lines.push({
        condition: T.blank,
        action: "Check",
        explanation: lang === "fr"
          ? `La brique ne renforce personne ; gardez le pot petit, votre main garde de la valeur de showdown contre une range mergée.`
          : `Brick doesn't help either side — pot-control with showdown value vs a merged opponent range.`,
      });
    }

    // 2) Scare card
    lines.push({
      condition: T.scare,
      action: cat === "Strong" ? "Check" : action === "Raise" ? "Bet" : "Check",
      explanation: cat === "Strong"
        ? (lang === "fr"
          ? `L'overcard touche la range adverse — checkez pour bluff-catcher : la range vilain devient polarisée (top set ou air).`
          : `Overcard hits villain's range — check to bluff-catch as their range polarizes (top set or air).`)
        : action === "Raise"
        ? (lang === "fr"
          ? `Représentez la scare card : votre range perçue inclut cette overcard, ce qui force la range adverse à se capper.`
          : `Represent the scare card — your perceived range covers it, capping villain's continuing range.`)
        : (lang === "fr"
          ? `Abandonnez la pression : la carte favorise la range adverse, votre fold equity chute.`
          : `Give up pressure — card favors villain, fold equity collapses.`),
    });

    // 3) Flush or straight completion (pick whichever is live)
    if (flushDrawOnBoard) {
      lines.push({
        condition: T.flush,
        action: cat === "Strong" && engine.score < 110 ? "Check" : cat === "Draw" ? "Bet" : "Check",
        explanation: cat === "Strong" && engine.score < 110
          ? (lang === "fr"
            ? `Votre top pair / two pair perd de la valeur : la range adverse contient désormais des couleurs faites — pot control.`
            : `Top pair / two pair loses value: villain's continuing range now contains made flushes — pot control.`)
          : cat === "Draw"
          ? (lang === "fr"
            ? `Vous touchez votre tirage : misez pour la value, la range adverse contient encore des paires fortes qui paieront.`
            : `You hit your draw — bet for value; villain's range still includes strong pairs that pay.`)
          : (lang === "fr"
            ? `La couleur arrive : checkez et réévaluez, la range adverse se concentre sur les couleurs et bluffs polarisés.`
            : `Flush hits — check and reassess; villain's range condenses to flushes and polarized bluffs.`),
      });
    } else if (straightDrawOnBoard) {
      lines.push({
        condition: T.straight,
        action: cat === "Strong" && engine.score < 110 ? "Check" : "Check",
        explanation: lang === "fr"
          ? `La quinte se complète : vos top pairs perdent de la valeur, la range adverse intègre les quintes faites — contrôlez le pot.`
          : `Straight completes: top pairs devalue and villain's range now includes made straights — control the pot.`,
      });
    }
  }

  // ---------- OPPONENT BEHAVIOR CONDITIONS ----------
  // Always include 1-2 opponent-reaction lines (most useful for live planning).
  if (action === "Raise" || (action === "Check" && !isFinalStreet)) {
    // If we bet/raise: cover their possible responses
    if (action !== "Check") {
      lines.push({
        condition: T.oppRaise,
        action: cat === "Strong" ? "Call" : "Fold",
        explanation: cat === "Strong"
          ? (lang === "fr"
            ? `Suivez la relance : la range adverse devient polarisée (nuts ou pur bluff), votre main conserve assez d'équité pour bluff-catcher.`
            : `Call the raise — villain's range polarizes to nuts-or-bluff, your hand still has enough equity to bluff-catch.`)
          : (lang === "fr"
            ? `Couchez : la range adverse se resserre fortement vers la value, votre main est dominée trop souvent.`
            : `Fold — villain's range tightens heavily to value, your hand is dominated too often.`),
      });
    }
    lines.push({
      condition: T.oppCheck,
      action: cat === "Strong" ? "Bet" : cat === "Draw" ? "Bet" : "Check",
      explanation: cat === "Strong"
        ? (lang === "fr"
          ? `Misez pour la value : un check révèle une range cappée (paires moyennes / mains marginales) qui paiera 50–66% du pot.`
          : `Bet for value: a check exposes a capped range (medium pairs / marginals) that calls 50–66% pot.`)
        : cat === "Draw"
        ? (lang === "fr"
          ? `Bluffez : la range adverse est cappée, ajoutez de la fold equity à votre équité de tirage.`
          : `Fire as a semi-bluff: villain's range is capped — stack fold equity on top of your draw equity.`)
        : (lang === "fr"
          ? `Checkez behind : la range cappée adverse a quand même de la valeur de showdown, ne sur-bluffez pas.`
          : `Check behind: villain's capped range still has showdown value — don't over-bluff.`),
    });
  } else {
    // We're calling/folding/checking — cover their next-street pressure
    lines.push({
      condition: T.oppSmall,
      action: cat === "Weak" || cat === "Draw" ? "Call" : "Call",
      explanation: lang === "fr"
        ? `Petit sizing = range large et mergée ; payez au bon prix et réévaluez à la prochaine carte.`
        : `Small sizing = wide merged range — call at the right price and reassess on the next card.`,
    });
    lines.push({
      condition: T.oppLarge,
      action: cat === "Strong" ? "Call" : "Fold",
      explanation: cat === "Strong"
        ? (lang === "fr"
          ? `Une grosse mise polarise l'adversaire entre nuts et bluffs — votre force suffit pour bluff-catcher.`
          : `Large bet polarizes villain to nuts-or-bluff — your strength is enough to bluff-catch.`)
        : (lang === "fr"
          ? `Grosse mise = range polarisée et value lourde ; sans top of range, couchez.`
          : `Large bet = polarized, value-heavy range — without top of range, fold.`),
    });
  }

  // Multiway downgrade note appended to last line if relevant
  if (opponents >= 2 && lines.length) {
    const last = lines[lines.length - 1];
    last.explanation += lang === "fr"
      ? ` (Multiway : resserrez encore — les bluffs perdent leur valeur.)`
      : ` (Multiway: tighten further — bluffs lose value.)`;
  }

  // Cap to 3 lines max for clarity
  return lines.slice(0, 3);
}
