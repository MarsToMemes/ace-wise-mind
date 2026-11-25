// Ce que la page affiche et donne aux conseillers pour la main en cours : pot, montant à payer, tapis effectif, mise
// la plus haute de la street. Sorti tel quel de pages/Index.tsx (aucun changement de calcul) pour que le banc de test
// (tests-solveur/) puisse le comparer à un arbitre indépendant.
import type { PlayerAction } from "@/components/ActionMenu";
import { trackPot, type PotOptions, type PotState } from "@/lib/potTracker";
import { heroStakes, type HeroStakes } from "@/lib/heroStakes";
import { effectiveStack } from "@/lib/tableStacks";
import type { LiveHand } from "@/lib/liveHand";
import { buildHandState } from "@/core/handState";
import type { TableSize } from "@/components/PokerTable";

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
  /** Relance minimale (montant « à ») d'après le moteur de règles : mise en cours + plus grande relance de la street. */
  minRaiseTo: number | null;
  /** Tu ne peux plus agir (main finie, couché ou à tapis) : la raison, affichée à la place du conseil ; sinon null. */
  done: string | null;
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
  // pot de la table : celui du moteur de règles quand toute la main est saisie (un call à tapis ne met que ce que le
  // joueur a, même si la saisie a enregistré la mise entière) ; sinon le pot tapé à la main + les actions saisies
  const tablePot = potFromActions && stakes ? stakes.fullPot : potState.pot;
  // la part d'un adversaire que tu ne peux pas couvrir lui revient : elle n'est pas dans le pot que tu joues
  const dynamicPot = stakes ? Math.round((tablePot - Math.max(0, stakes.fullPot - stakes.pot)) * 100) / 100 : potState.pot;
  const userToCall = userIdx >= 0 ? (stakes ? Math.min(potState.toCall(userIdx), stakes.remaining) : potState.toCall(userIdx)) : callTyped;
  const effLeft = stakes ? stakes.effective : effStack;
  // Une vraie mise / relance à payer (et pas seulement la grosse blinde)
  const blindLevel = street === "Preflop" && potFromActions && dealerIdx >= 0 ? 1 : 0;
  const facingBet = userIdx >= 0 ? userToCall > 0 && currentBet > blindLevel : userToCall > 0;
  // moteur de règles sur les seules actions saisies (sans coucher d'office ceux qui n'ont pas encore parlé)
  const rules = dealerIdx >= 0 && potFromActions ? buildHandState({
    tableSize: tableSize as TableSize, dealerIdx, heroIdx: userIdx, stacksBB: tracked ? seatStacks : Array(tableSize).fill(stack),
    hole: live.hole, board: live.board, actions,
  }).state : null;
  const minRaiseTo = rules ? Math.round((rules.currentBet > 0 ? rules.currentBet + rules.lastRaiseBB : rules.blinds.bb) * 100) / 100 : null;
  let done: string | null = null;
  if (rules && userIdx >= 0) {
    const me = rules.seats[userIdx];
    const live2 = rules.seats.filter(x => !x.folded && !folded[x.idx]);
    const canBet = live2.filter(x => !x.allIn);
    if (me.folded || folded[userIdx]) done = "Tu t'es couché : plus de décision à prendre.";
    else if (me.allIn) done = "Tu es à tapis : plus de décision à prendre, la main se joue jusqu'au bout.";
    else if (live2.length <= 1) done = "Main terminée : tout le monde s'est couché.";
    else if (rules.toAct < 0 && (rules.street === "River" && live.board.length === 5 || canBet.length <= 1)) {
      done = canBet.length <= 1 ? "Main terminée : les autres joueurs sont à tapis, plus de mise possible." : "Main terminée : les enchères de la river sont closes.";
    }
  }
  return { street, sbIdx, bbIdx, potFromActions, potOpts, potState, effStack, stakes, tablePot, dynamicPot, userToCall, effLeft, currentBet, facingBet, minRaiseTo, done };
}

/** « À payer » proposé par le menu d'action pour un siège : jamais plus que ce qu'il lui reste (call à tapis). */
export function menuToCall(betLevel: number, contrib: number, allInTo?: number | null): number {
  const level = allInTo != null ? Math.min(betLevel, allInTo) : betLevel;
  return Math.round(Math.max(0, level - contrib) * 100) / 100;
}

/** Bornes du menu d'action (components/ActionMenu.tsx) : relance minimale et tapis, en montant « relance à » (D35). */
export function actionBounds(level: number, street: Street, stackBB: number, minRaiseTo?: number | null): { minAmt: number; maxAmt: number } {
  // relance minimale : celle du moteur de règles quand elle est connue ; sinon l'ancienne approximation
  const minAmt = minRaiseTo != null && minRaiseTo > 0 ? minRaiseTo : level > 0 ? Math.max(level * 2, level + 1) : street === "Preflop" ? 2 : 1;
  // tapis = tout ce qui reste au joueur (un tapis plus court que la relance minimum reste permis)
  const maxAmt = stackBB > 0 ? stackBB : minAmt;
  return { minAmt, maxAmt };
}
