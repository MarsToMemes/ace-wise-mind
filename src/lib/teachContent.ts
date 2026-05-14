import { createElement as h, Fragment } from "react";
import type { TeachContent } from "@/components/TeachAccordion";

export const TEACH_ALPHA: TeachContent = {
  concept:
    "Alpha (α) est la fréquence de fold minimale qu'un défenseur doit céder pour qu'un bluff soit non-rentable. MDF (Minimum Defense Frequency) est son complément : la fréquence de défense minimale (1 − α).",
  formula: h(Fragment, null,
    h("div", null, "α = s / (1 + s),  où s = taille de la mise / pot."),
    h("div", { className: "mt-1 text-muted-foreground" }, "Pour une mise de 70% pot : α = 0.7 / 1.7 = 41.2%."),
    h("div", { className: "mt-1 text-muted-foreground" }, "Si l'adversaire folde plus de 41.2%, un bluff any-two devient +EV."),
  ),
  whenToUse: [
    "Décisions de défense river quand on a une bluff catcher.",
    "Estimation de la rentabilité d'un bluff sur une street donnée.",
    "Construction de ranges polarisées (ratio value/bluff).",
  ],
  whenToAvoid: [
    "Alpha suppose que toutes les mains de la range défenseur ont la même équité face au bluff — faux en pratique.",
    "Les blockers modifient la décision : tenir un bloqueur de valeur adverse augmente l'EV du bluff.",
    "En multiway, la formule à deux joueurs ne s'applique pas directement.",
    "MDF est un plancher théorique, pas un objectif : surdéfendre n'est jamais une erreur si les mains défendues ont assez d'équité.",
  ],
};

export const TEACH_GEOMETRIC: TeachContent = {
  concept:
    "Le sizing géométrique permet de mettre tout le stack à la river en gardant la même pression (même bet/pot ratio) à chaque street, ce qui maintient l'indifférence de l'adversaire street to street.",
  formula: h(Fragment, null,
    h("div", null, "R = (PF / PI)^(1/N) − 1"),
    h("div", { className: "mt-1 text-muted-foreground" }, "PF = pot final ciblé, PI = pot initial, N = streets restantes, R = ratio bet/pot à chaque street."),
  ),
  whenToUse: [
    "Mains de value fortes (équité > 75%) avec SPR 2-10.",
    "Adversaire susceptible de payer au moins 2 streets.",
    "Range polarisée où on veut maximiser le value bet sans varier le sizing.",
  ],
  whenToAvoid: [
    "Boards dynamiques où des cartes peuvent changer drastiquement les ranges (flush/quinte).",
    "Calling station : les sizings plus petits extraient plus.",
    "SPR > 12 : les bets géométriques deviennent énormes et perdent leur cohérence narrative.",
    "Range capée où on n'a pas assez de nuts pour justifier les overbets implicites.",
  ],
};

export const TEACH_JAMFOLD: TeachContent = {
  concept:
    "Comparer l'EV d'un shove préflop à l'EV d'un fold (EV fold = 0). Le shove est +EV si la fréquence de fold adverse compense l'équité quand il call.",
  formula: h(Fragment, null,
    h("div", null, "EV(jam) = F·P + (1−F)·[EQ·(P+2S) − S]"),
    h("div", { className: "mt-1 text-muted-foreground" }, "F = villain fold %, P = pot/dead money, EQ = équité quand call, S = jam size."),
  ),
  whenToUse: [
    "MTT short stack (5-15bb) : push/fold est la stratégie dominante.",
    "SNG bubble : intégrer ICM en plus du chipEV brut.",
    "Cash 4bet/5bet préflop avec stacks réduits.",
  ],
  whenToAvoid: [
    "Stacks profonds (> 25bb) : il existe presque toujours une option intermédiaire (raise/call, 3bet non-shove) supérieure.",
    "ICM ignoré : en MTT près de la bulle ou FT, le chipEV peut diverger massivement du $EV. Utilisez HRC ou ICMIZER.",
    "Multiway : la formule à deux joueurs ne s'applique plus.",
  ],
};

export const TEACH_EV: TeachContent = {
  concept:
    "L'EV (espérance de gain) compare combien on gagne en moyenne en suivant vs en se couchant. Décision rationnelle : suivre si EV > 0.",
  formula: h(Fragment, null,
    h("div", null, "EV(call) = EQ·(pot + bet) − (1−EQ)·bet"),
    h("div", { className: "mt-1 text-muted-foreground" }, "Pot odds requis : équité minimale = bet / (pot + 2·bet)"),
  ),
  whenToUse: [
    "Décision call/fold quand on peut estimer son équité face à la range adverse.",
    "Décision de chase un draw (équité ≈ outs × 2 pour 1 carte, × 4 pour 2 cartes).",
  ],
  whenToAvoid: [
    "L'équité estimée est rarement précise sans solver. Une estimation à ±5% peut changer la décision.",
    "Implied odds : si on a une main qui peut gagner plus sur les streets suivantes, l'EV brut sous-estime la décision.",
    "Reverse implied odds : si on risque de payer plus quand on touche mais qu'on perd, l'EV brut surestime.",
    "Position : OOP, l'équité réalisée est inférieure à l'équité brute.",
  ],
};

export const TEACH_BANKROLL: TeachContent = {
  concept:
    "Kelly détermine la fraction optimale de bankroll à risquer pour maximiser la croissance long terme. En poker, ça s'applique au sizing de bankroll (combien de buy-ins par limite), PAS à une main individuelle.",
  formula: h(Fragment, null,
    h("div", null, "f* = (b·p − q) / b"),
    h("div", { className: "mt-1 text-muted-foreground" }, "b = ratio gain/perte, p = probabilité de gain, q = 1−p, f* = fraction optimale de bankroll."),
    h("div", { className: "mt-1 text-muted-foreground" }, "En pratique poker : Half-Kelly est recommandé (variance massive, edge difficile à estimer)."),
  ),
  whenToUse: [
    "Décider du nombre de buy-ins minimum avant de move up de limite.",
    "Évaluer si la bankroll actuelle est suffisante pour la limite jouée.",
  ],
  whenToAvoid: [
    "Kelly suppose un edge stable et connu — au poker on surestime souvent son winrate.",
    "Risk of ruin réel est sensible à la std dev, élevée au poker (~80-120 bb/100 cash, plus en MTT).",
    "Tilt, downswings émotionnels et nécessité de retirer pour vivre justifient des bankrolls plus conservatives que Kelly pur.",
    "Pour les MTT, prévoir 200-500 buy-ins minimum (vs 30-50 cash) à cause de la variance.",
  ],
};

export const TEACH_RANGES: TeachContent = {
  concept:
    "Les ranges GTO baseline représentent les fréquences optimales d'open/3bet/défense par position, dérivées de solvers. Elles servent de point de référence à partir duquel construire des déviations exploitatives.",
  formula: h(Fragment, null,
    h("div", null, "Pas de formule unique."),
    h("div", { className: "mt-1 text-muted-foreground" }, "Ces ranges sont le résultat de simulations solver convergées (1M+ iterations) sur un setting donné (6-max 100bb cash, rake 5% cap 3bb)."),
  ),
  whenToUse: [
    "Comme baseline d'étude pour comprendre la \"forme\" d'une range par position.",
    "Comme point de départ pour construire ses propres ranges exploitatives.",
  ],
  whenToAvoid: [
    "Format différent (FR, heads-up, MTT à différents stack depths) : les ranges changent significativement.",
    "Niveau adverse : contre des fields très tight, ouvrir plus large devient profitable ; contre des fields très loose, resserrer les marginal hands.",
    "Rake structure différente : un rake élevé serre les ranges aux limites basses.",
  ],
};
