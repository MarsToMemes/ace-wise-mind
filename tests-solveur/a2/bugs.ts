// Classement des écarts trouvés : gravité, cause et correction proposée (NON appliquée : le code du site ne change
// qu'avec l'accord de l'utilisateur). Gravité : 1 = faux pour le jeu (montants, légalité) … 4 = convention de règle.
export interface Fiche { gravite: 1 | 2 | 3 | 4; cause: string; correction: string; cas?: string }

export const FICHES: { motif: RegExp; fiche: Fiche }[] = [
  {
    motif: /^pot affiché sur la table$|^pot que le héros peut gagner/,
    fiche: {
      gravite: 1, cas: "R1, R8",
      cause: "Quand un joueur paie avec moins que la mise (call à tapis), la table enregistre le montant affiché par le menu (la mise entière) ; le pot de la page (lib/potTracker.ts) additionne ces montants sans regarder les tapis. Le pot affiché et le pot utilisé par les conseils sont trop gros.",
      correction: "1) Menu d'action (PokerTable.tsx) : passer au menu « à payer » plafonné au tapis du siège (allInTo − ce qu'il a mis). 2) Page : prendre le pot du moteur de règles (replayLive) au lieu de trackPot quand les tapis sont suivis.",
    },
  },
  {
    motif: /^relance minimale du menu d'action$/,
    fiche: {
      gravite: 2, cas: "R3, R7",
      cause: "Le menu d'action (lib/siteView.ts actionBounds, ex-ActionMenu.tsx) fixe la relance minimale au double de la mise (max(2 × mise, mise + 1)). La règle : la mise plus la plus grande relance de la street. Après 2,5 : 4 (le menu impose 5) ; après une relance à 2 : 3 (le menu impose 4).",
      correction: "Calculer le minimum avec le moteur de règles (legal.raise.minTo de handState) et le passer au menu.",
    },
  },
  {
    motif: /^conseil (préflop )?alors que tu ne peux plus agir$/,
    fiche: {
      gravite: 2, cas: "R5, R10",
      cause: "La page affiche un conseil même quand la main est finie (river fermée, tout le monde à tapis) ou que tu es à tapis ; il peut être absurde (« Block bet 25 % = 0 BB »).",
      correction: "Dans la page : pas de conseil quand le moteur de règles dit que tu ne peux plus agir (main finie, ou tu es à tapis) ; afficher « Main terminée » à la place.",
    },
  },
  {
    motif: /^conseil préflop : relance impossible$/,
    fiche: {
      gravite: 2, cas: "R9",
      cause: "Le conseiller préflop (cashPreflopEngine) ne sait pas si une relance est encore possible : face au tapis du seul adversaire, il peut conseiller « Raise ».",
      correction: "Passer `canRaise` (heroStakes) au conseiller préflop et remplacer Raise / 3-bet par Call quand la relance est impossible.",
    },
  },
  {
    motif: /^conseil : relance sous le minimum$|^conseil au-delà de ton tapis$|^montant du tapis conseillé$/,
    fiche: {
      gravite: 2, cas: "R12",
      cause: "Le conseiller postflop calcule la relance à partir du montant à payer (≈ 3 × ce qu'il te reste à payer), sans compter ce que tu as déjà mis sur la street : dans un pot relancé plusieurs fois, il propose une relance plus petite que la relance minimale, parfois plus petite que la mise à suivre (« Check-raise à 4,5 BB » face à une relance à 5).",
      correction: "Dans postflopAdvisor : relance « à » = max(relance minimale du moteur, 3 × la mise de l'adversaire), bornée par ton tapis ; passer la relance minimale (legal.raise.minTo) en entrée.",
    },
  },
  {
    motif: /^conseil : mise sous le minimum de 1 bb$/,
    fiche: {
      gravite: 3, cas: "R11",
      cause: "Le conseiller postflop arrondit la mise à la demi-bb avec un plancher de 0,5 bb : dans un petit pot, il propose 0,5 bb, sous la mise minimale de 1 bb.",
      correction: "Plancher à 1 bb (ou au tapis restant s'il est plus petit) dans sizeOf (postflopAdvisor.ts).",
    },
  },
  {
    motif: /^relance permise alors que tous les autres sont à tapis$/,
    fiche: {
      gravite: 4,
      cause: "Le moteur de règles (handState) propose une relance face à un tapis quand tous les autres joueurs sont déjà à tapis (personne ne pourrait la payer). Les conseils utilisent déjà heroStakes.canRaise, qui l'interdit : sans effet sur les conseils, seulement sur une saisie.",
      correction: "Dans handState : pas de `raise` (ni de `bet`) quand aucun autre joueur encore dans le coup n'a de jetons.",
    },
  },
  {
    motif: /^BB à tapis pour moins d'une blinde/,
    fiche: {
      gravite: 4,
      cause: "Quand la BB a moins d'une grosse blinde (après l'ante éventuelle), le moteur fait payer aux autres ce qu'elle a posté ; la règle courante des casinos (TDA) fait payer la grosse blinde entière. Le pot de la page poste aussi 1,5 bb de blindes sans regarder les tapis. Situation rare en cash.",
      correction: "À trancher avec toi (règle de la salle). Puis : currentBet = 1 bb au préflop dans handState, et blindes plafonnées au tapis dans potTracker.",
    },
  },
];

export function ficheDe(check: string): Fiche {
  return FICHES.find(x => x.motif.test(check))?.fiche
    ?? { gravite: 1, cause: "Écart non classé : à examiner (rejouer la main).", correction: "À déterminer après examen." };
}
