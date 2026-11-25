// Ce que la page affiche et donne aux conseillers pour la main en cours : pot, montant à payer, tapis effectif, mise
// la plus haute de la street. Sorti tel quel de pages/Index.tsx (aucun changement de calcul) pour que le banc de test
// (tests-solveur/) puisse le comparer à un arbitre indépendant.
import type { PlayerAction } from "@/components/ActionMenu";
import { trackPot, type PotOptions, type PotState } from "@/lib/potTracker";
import { heroStakes, type HeroStakes } from "@/lib/heroStakes";
import { effectiveStack } from "@/lib/tableStacks";
import type { LiveHand } from "@/lib/liveHand";

export type Street = PlayerAction["street"];

export interface SiteViewInput {
  /** Main en cours ; `stacks` : tapis de départ de chaque siège (suivis) ou vide. */
  live: LiveHand;
  /** Tapis suivis siège par siège (cash, table en cours) ; sinon `stack` vaut pour tous. */
  tracked: boolean;
  /** Tapis choisi dans les options (bb). */
  stack: number;
  /** Pot et montant à suivre tapés à la main (quand la main n'est pas saisie dès le préflop). */
  potTyped: number;
  callTyped: number;
}

export interface SiteView {
  street: Street;
  sbIdx: number;
  bbIdx: number;
  potFromActions: boolean;
  potOpts: PotOptions;
  potState: PotState;
  /** Tapis effectif de départ (profondeur des tables). */
  effStack: number;
  stakes: HeroStakes | null;
  /** Pot de la table (tout ce qui a été mis). */
  tablePot: number;
  /** Pot que tu joues (sans la part d'un adversaire que tu ne peux pas couvrir). */
  dynamicPot: number;
  userToCall: number;
  /** Tapis effectif restant (affichage, SPR, conseiller). */
  effLeft: number;
  /** Mise la plus haute de la street. */
  currentBet: number;
  facingBet: boolean;
}

export const streetOf = (boardLen: number): Street =>
  boardLen === 3 ? "Flop" : boardLen === 4 ? "Turn" : boardLen === 5 ? "River" : "Preflop";

export function blindSeats(tableSize: number, dealerIdx: number) {
  // Heads-up (2 players): BTN posts SB, the other seat is BB
  const sbIdx = dealerIdx >= 0 ? (tableSize === 2 ? dealerIdx : (dealerIdx + 1) % tableSize) : -1;
  const bbIdx = dealerIdx >= 0 ? (tableSize === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % tableSize) : -1;
  return { sbIdx, bbIdx };
}

export function siteView(i: SiteViewInput): SiteView {
  const { live, tracked, stack, potTyped, callTyped } = i;
  const { tableSize, dealerIdx, userIdx, actions, folded } = live;
  const seatStacks = live.stacks;
  const street = streetOf(live.board.length);
  const { sbIdx, bbIdx } = blindSeats(tableSize, dealerIdx);
  // Main saisie dès le préflop → pot calculé ; main saisie à partir du flop → départ = pot tapé à la main.
  const potFromActions = actions.length > 0 ? actions[0].street === "Preflop" : street === "Preflop";
  const potOpts: PotOptions = {
    blinds: potFromActions && dealerIdx >= 0 ? { sbIdx, bbIdx } : null,
    startPot: potFromActions ? (dealerIdx >= 0 ? 0 : 1.5) : potTyped,
  };
  const potState = trackPot(actions, potOpts, street);
  const effStack = (() => {
    if (!tracked) return stack;
    const out = new Set(actions.filter(a => a.type === "Fold").map(a => a.seatIdx));
    folded.forEach((f, k) => { if (f) out.add(k); });
    const acted = new Set(actions.filter(a => a.type !== "Fold").map(a => a.seatIdx));
    // préflop : tous ceux qui peuvent encore jouer ; après le flop : ceux qui sont dans le coup
    const opps = Array.from({ length: tableSize }, (_, k) => k)
      .filter(k => k !== userIdx && !out.has(k) && (street === "Preflop" || acted.has(k)));
    return Math.round(effectiveStack(seatStacks, userIdx, opps) * 10) / 10;
  })();
  const currentBet = Array.from({ length: tableSize }, (_, k) => potState.contribs[k] ?? 0).reduce((m, v) => Math.max(m, v), 0);
  // ce qui est vraiment en jeu pour toi (moteur de règles) : tapis restants, à payer plafonné à ton tapis, pot que tu
  // peux gagner, relance encore possible ; avec le tapis saisi pour tous si les tapis ne sont pas suivis siège par siège
  const stakes = userIdx >= 0 && dealerIdx >= 0
    ? heroStakes({ ...live, stacks: tracked ? seatStacks : Array(tableSize).fill(stack) }) : null;
  const tablePot = potState.pot;
  // la part d'un adversaire que tu ne peux pas couvrir lui revient : elle n'est pas dans le pot que tu joues
  const dynamicPot = stakes ? Math.round((potState.pot - Math.max(0, stakes.fullPot - stakes.pot)) * 100) / 100 : potState.pot;
  const userToCall = userIdx >= 0 ? (stakes ? Math.min(potState.toCall(userIdx), stakes.remaining) : potState.toCall(userIdx)) : callTyped;
  const effLeft = stakes ? stakes.effective : effStack;
  // Une vraie mise / relance à payer (et pas seulement la grosse blinde)
  const blindLevel = street === "Preflop" && potFromActions && dealerIdx >= 0 ? 1 : 0;
  const facingBet = userIdx >= 0 ? userToCall > 0 && currentBet > blindLevel : userToCall > 0;
  return { street, sbIdx, bbIdx, potFromActions, potOpts, potState, effStack, stakes, tablePot, dynamicPot, userToCall, effLeft, currentBet, facingBet };
}

/** Bornes du menu d'action (components/ActionMenu.tsx) : relance minimale et tapis, en montant « relance à ». */
export function actionBounds(level: number, street: Street, stackBB: number): { minAmt: number; maxAmt: number } {
  const minAmt = level > 0 ? Math.max(level * 2, level + 1) : street === "Preflop" ? 2 : 1;
  // tapis = tout ce qui reste au joueur (un tapis plus court que la relance minimum reste permis)
  const maxAmt = stackBB > 0 ? stackBB : minAmt;
  return { minAmt, maxAmt };
}
