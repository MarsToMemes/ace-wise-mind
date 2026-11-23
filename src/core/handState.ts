/**
 * Fiche canonique d'une main de cash game (NLHE) et ses contrôles, sans solveur.
 *
 * Construite à partir de ce que l'analyseur connaît (sièges, bouton, tapis, cartes, actions saisies),
 * elle rejoue la main et dit : le pot, ce que chacun a mis et garde, qui doit parler, combien il doit,
 * quelles actions et tailles sont légales, les pots annexes, et tout ce qui est impossible.
 * Pure : aucun état React, aucun stockage. Unités : grosses blindes (bb).
 *
 * Limites connues (lot 1) : pas de règle de « relance non rouverte » après un tapis incomplet ;
 * un pot annexe est calculé mais marqué non pris en charge pour le conseil.
 */
import { CASH_RAKE } from "@/core/rake";
import type { PlayerAction } from "@/components/ActionMenu";
import { seatLabel, type TableSize } from "@/components/PokerTable";
import { RANKS, SUITS } from "@/lib/pokerEngine";

export type Street = PlayerAction["street"];
const STREETS: Street[] = ["Preflop", "Flop", "Turn", "River"];
const BOARD_STREET: Record<number, Street> = { 0: "Preflop", 3: "Flop", 4: "Turn", 5: "River" };
const EPS = 1e-6;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Comment le rake est compté. pct en %, plafond en bb (null : pas de plafond ou inconnu). */
export interface RakeConvention {
  pct: number;
  capBB: number | null;
  /** true : pas de rake sur un pot gagné avant le flop. null : non précisé. */
  noFlopNoDrop: boolean | null;
  note: string;
}

/** Ce que chaque moteur du site compte aujourd'hui comme rake (constaté dans le code et la config de calcul). */
export const ENGINE_RAKE: Record<"preflopSolver" | "postflopAdvisor" | "endgameSolver", RakeConvention> = {
  preflopSolver: {
    pct: 5, capBB: 3, noFlopNoDrop: true,
    note: "Table cash 100 bb (GTOpen) : 5 % plafonné à 3 bb, pris sur les pots qui voient le flop. "
      + "Paramètre de calcul non inscrit dans public/solver/cash100.json.",
  },
  postflopAdvisor: { ...CASH_RAKE, noFlopNoDrop: true, note: "Conseiller postflop : rake cash (src/core/rake.ts) compté dans la cote ; aucun en tournoi." },
  endgameSolver: { ...CASH_RAKE, noFlopNoDrop: true, note: "Solveur de fin de main : rake cash (src/core/rake.ts) retiré du pot gagné ; aucun en tournoi." },
};

/** Ce que l'analyseur fournit. */
export interface HandInput {
  tableSize: TableSize;
  dealerIdx: number;
  heroIdx: number;
  /** Un tapis par siège, ou un seul nombre pour tous (le site ne connaît que le tien : supposé égal). */
  stacksBB: number | number[];
  sb?: number;
  bb?: number;
  anteBB?: number;
  hole: string[];
  board: string[];
  /** Actions dans l'ordre. Bet/Raise : montant « à » sur la street ; Call : montant payé. */
  actions: PlayerAction[];
  /** Sièges marqués couchés sans action saisie (mode « Couché » du site). */
  folded?: boolean[];
  /** Convention de rake de la partie jouée (inconnue si absente). */
  rake?: RakeConvention;
  /** Ranges associées aux sièges (référence seulement, lot 1). */
  ranges?: { seatIdx: number; slot: string; source: string }[];
}

export interface SeatState {
  idx: number;
  position: string;
  stackStartBB: number;
  /** Total mis dans la main (blindes et ante compris). */
  investedBB: number;
  /** Mis sur la street en cours. */
  streetBB: number;
  remainingBB: number;
  folded: boolean;
  allIn: boolean;
  /** A mis au moins un jeton dans le pot. */
  contributed: boolean;
}

/** Actions légales du joueur qui doit parler. Bet : montant ; Raise : montant « à ». */
export interface LegalActions {
  fold: boolean;
  check: boolean;
  call: number;
  bet: { min: number; max: number } | null;
  raise: { minTo: number; maxTo: number } | null;
}

export interface Violation {
  code: string;
  message: string;
  actionIdx?: number;
}

export interface HandState {
  variant: "NLHE";
  format: "cash";
  tableSize: TableSize;
  dealerIdx: number;
  heroIdx: number;
  sbIdx: number;
  bbIdx: number;
  blinds: { sb: number; bb: number; ante: number };
  /** true quand un seul tapis a été donné pour tous les sièges. */
  stacksAssumed: boolean;
  seats: SeatState[];
  hole: string[];
  board: string[];
  street: Street;
  history: PlayerAction[];
  pot: number;
  currentBet: number;
  lastRaiseBB: number;
  /** Siège qui doit parler, -1 si personne (street terminée, main finie ou tous à tapis). */
  toAct: number;
  toCall: number;
  legal: LegalActions | null;
  /**
   * Pots tels qu'ils sont maintenant : principal, annexes, et mise rendue (« refund » : partie d'une mise que personne
   * n'a payée, qui revient à son auteur). eligible : joueurs qui peuvent gagner ce pot (un joueur qui doit encore
   * parler peut encore les payer tous ; un joueur à tapis seulement ceux qu'il a couverts).
   */
  pots: Pot[];
  /** Pots contestés quand il y en a au moins deux (pots annexes), vide sinon. */
  sidePots: { amount: number; eligible: number[] }[];
  supported: boolean;
  unsupported: string[];
  rake: RakeConvention | null;
  ranges: { seatIdx: number; slot: string; source: string }[];
}

export interface Pot { amount: number; eligible: number[]; kind: "main" | "side" | "refund" }

/** Découpe ce que chacun a mis en pots, par niveaux de mise ; argent des joueurs couchés compris. */
export function computePots(seats: SeatState[], bettingOpen: boolean): Pot[] {
  const levels = [...new Set(seats.map(s => s.investedBB).filter(x => x > EPS))].sort((x, y) => x - y);
  const out: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    const amount = r2(seats.reduce((t, s) => t + Math.min(s.investedBB, L) - Math.min(s.investedBB, prev), 0));
    const contributors = seats.filter(s => s.investedBB > prev + EPS).map(s => s.idx);
    const eligible = seats.filter(s => !s.folded && (s.investedBB >= L - EPS || (bettingOpen && !s.allIn))).map(s => s.idx);
    prev = L;
    if (amount <= EPS) continue;
    if (!eligible.length) { if (out.length) out[out.length - 1].amount = r2(out[out.length - 1].amount + amount); continue; }
    const kind: Pot["kind"] = eligible.length === 1 && contributors.length === 1 && contributors[0] === eligible[0] ? "refund" : "side";
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.eligible.join() === eligible.join()) last.amount = r2(last.amount + amount);
    else out.push({ amount, eligible, kind });
  }
  const first = out.find(p => p.kind !== "refund");
  if (first) first.kind = "main";
  return out;
}

export interface BuildResult {
  state: HandState;
  errors: Violation[];
  warnings: Violation[];
  /** Aucune erreur (les avertissements n'empêchent pas une fiche d'être valide). */
  valid: boolean;
}

const VALID_CARD = new RegExp(`^[${RANKS.join("")}][${SUITS.join("")}]$`);

export function buildHandState(input: HandInput): BuildResult {
  const n = input.tableSize;
  const sb = input.sb ?? 0.5, bb = input.bb ?? 1, ante = input.anteBB ?? 0;
  const errors: Violation[] = [];
  const warnings: Violation[] = [];
  const err = (code: string, message: string, actionIdx?: number) => errors.push({ code, message, actionIdx });
  const warn = (code: string, message: string, actionIdx?: number) => warnings.push({ code, message, actionIdx });

  let stacks = Array.isArray(input.stacksBB) ? [...input.stacksBB] : Array(n).fill(input.stacksBB);
  if (stacks.length !== n) {
    err("STACKS_SIZE", `${stacks.length} tapis donnés pour ${n} sièges.`);
    stacks = Array.from({ length: n }, (_, i) => stacks[i] ?? stacks[0] ?? 0);
  }
  const hasDealer = input.dealerIdx >= 0 && input.dealerIdx < n;
  const dealer = hasDealer ? input.dealerIdx : 0;
  const sbIdx = n === 2 ? dealer : (dealer + 1) % n;
  const bbIdx = n === 2 ? (dealer + 1) % n : (dealer + 2) % n;

  const seats: SeatState[] = stacks.map((st, i) => ({
    idx: i, position: hasDealer ? seatLabel(i, dealer, n) : "",
    stackStartBB: st, investedBB: 0, streetBB: 0, remainingBB: st,
    folded: !!input.folded?.[i], allIn: false, contributed: false,
  }));
  let pot = 0;
  const put = (i: number, amt: number, street = true) => {
    const s = seats[i];
    const a = Math.min(Math.max(0, amt), s.remainingBB);
    s.investedBB = r2(s.investedBB + a);
    if (street) s.streetBB = r2(s.streetBB + a);
    s.remainingBB = r2(s.remainingBB - a);
    if (a > 0) s.contributed = true;
    if (s.remainingBB <= EPS) { s.remainingBB = 0; s.allIn = true; }
    pot = r2(pot + a);
  };

  let street: Street = "Preflop";
  let currentBet = 0, lastRaise = bb, lastActor = -1;
  let acted = new Set<number>();
  // Réouverture des enchères suivie par joueur (règle A, docs/DECISIONS.md D2) : la mise en cours et la taille de relance
  // complète au moment où le joueur a parlé ; il ne peut relancer que si les relances depuis atteignent ce montant.
  let seenBet = new Map<number, number>(), seenRaise = new Map<number, number>();
  const canRaise = (i: number) =>
    !seenBet.has(i) || currentBet - (seenBet.get(i) ?? 0) >= (seenRaise.get(i) ?? bb) - EPS;
  const noteAction = (i: number) => { seenBet.set(i, currentBet); seenRaise.set(i, lastRaise); };
  if (hasDealer) {
    if (ante > 0) seats.forEach(s => put(s.idx, ante, false));
    put(sbIdx, sb);
    put(bbIdx, bb);
    currentBet = Math.max(seats[sbIdx].streetBB, seats[bbIdx].streetBB);
  }

  const startOf = (st: Street) => st === "Preflop" ? (n === 2 ? dealer : (bbIdx + 1) % n) : (n === 2 ? bbIdx : (dealer + 1) % n);
  const nextToAct = (): number => {
    if (!hasDealer) return -1;
    const live = seats.filter(s => !s.folded);
    if (live.length <= 1) return -1;
    const canAct = live.filter(s => !s.allIn);
    if (!canAct.length) return -1;
    if (canAct.length === 1 && canAct[0].streetBB >= currentBet - EPS && (acted.has(canAct[0].idx) || live.length > canAct.length)) return -1;
    const from = lastActor >= 0 ? (lastActor + 1) % n : startOf(street);
    for (let k = 0; k < n; k++) {
      const s = seats[(from + k) % n];
      if (!s.folded && !s.allIn && (!acted.has(s.idx) || s.streetBB < currentBet - EPS)) return s.idx;
    }
    return -1;
  };
  const newStreet = (st: Street) => {
    street = st;
    seats.forEach(s => { s.streetBB = 0; });
    currentBet = 0; lastRaise = bb; lastActor = -1; acted = new Set();
    seenBet = new Map(); seenRaise = new Map();
  };

  input.actions.forEach((a, k) => {
    if (a.street !== street) {
      if (STREETS.indexOf(a.street) < STREETS.indexOf(street)) {
        err("STREET_ORDER", `Action au ${a.street} après une action au ${street}.`, k);
        return;
      }
      if (nextToAct() >= 0) warn("STREET_NOT_CLOSED", `Le ${street} n'était pas terminé quand le ${a.street} a commencé.`, k);
      newStreet(a.street);
    }
    const s = seats[a.seatIdx];
    if (!s) { err("BAD_SEAT", `Siège ${a.seatIdx} inexistant.`, k); return; }
    if (s.folded || s.allIn) { err("ACTOR_INACTIVE", `Le siège ${a.seatIdx + 1} est ${s.folded ? "couché" : "déjà à tapis"} et ne peut plus agir.`, k); return; }
    const expected = nextToAct();
    if (expected < 0) err("ROUND_CLOSED", `Plus personne ne doit parler au ${street}.`, k);
    else if (expected !== a.seatIdx) warn("OUT_OF_TURN", `Le siège ${a.seatIdx + 1} parle alors que c'était au siège ${expected + 1}.`, k);

    const toCall = Math.max(0, currentBet - s.streetBB);
    if (a.type === "Fold") {
      s.folded = true;
      acted.add(s.idx);
    } else if (a.type === "Check") {
      if (toCall > EPS) err("CHECK_FACING_BET", `Check impossible : il reste ${r2(toCall)} bb à payer.`, k);
      acted.add(s.idx);
    } else if (a.type === "Call") {
      if (toCall <= EPS) err("CALL_NOTHING", "Call impossible : il n'y a rien à payer.", k);
      else {
        const pay = Math.min(toCall, s.remainingBB);
        if (Math.abs(a.amountBB - pay) > 0.011) warn("CALL_AMOUNT", `Call saisi à ${a.amountBB} bb, il fallait ${r2(pay)} bb.`, k);
        put(s.idx, pay);
      }
      acted.add(s.idx);
    } else {
      let to = a.amountBB;
      const maxTo = r2(s.streetBB + s.remainingBB);
      if (a.type === "Bet" && currentBet > EPS) err("BET_FACING_BET", "Mise impossible : il y a déjà une mise à suivre (c'est une relance).", k);
      if (a.type === "Raise" && currentBet <= EPS) err("RAISE_WITHOUT_BET", "Relance impossible : personne n'a misé (c'est une mise).", k);
      if (to > maxTo + EPS) { err("OVER_STACK", `Montant ${to} bb au-delà du tapis (${maxTo} bb au plus).`, k); to = maxTo; }
      const allIn = to >= maxTo - EPS;
      if (currentBet > EPS && to > currentBet + EPS && !canRaise(s.idx)) {
        err("RAISE_NOT_REOPENED", `Relance impossible : depuis ta dernière action, les relances (${r2(currentBet - (seenBet.get(s.idx) ?? 0))} bb) n'atteignent pas une relance complète (${r2(seenRaise.get(s.idx) ?? bb)} bb). Payer ou se coucher.`, k);
      }
      if (currentBet > EPS) {
        if (to <= currentBet + EPS || (to - currentBet < lastRaise - EPS && !allIn)) {
          err("RAISE_BELOW_MIN", `Relance à ${to} bb : il faut au moins ${r2(currentBet + lastRaise)} bb.`, k);
        }
      } else if (!allIn && to < bb - EPS) {
        err("BET_BELOW_MIN", `Mise de ${to} bb : le minimum est ${bb} bb.`, k);
      }
      put(s.idx, to - s.streetBB);
      if (s.streetBB > currentBet + EPS) {
        const size = s.streetBB - currentBet;
        if (size >= lastRaise - EPS) lastRaise = r2(size);
        currentBet = s.streetBB;
        acted = new Set([s.idx]);
      } else acted.add(s.idx);
    }
    if (a.type !== "Fold") noteAction(s.idx);
    lastActor = s.idx;
  });

  // la street affichée suit le board, comme l'analyseur
  const boardStreet = BOARD_STREET[input.board.length];
  if (boardStreet && STREETS.indexOf(street) > STREETS.indexOf(boardStreet)) {
    err("BOARD_STREET", `Actions au ${street} alors que le board n'a que ${input.board.length} carte(s).`);
  } else if (boardStreet && boardStreet !== street) {
    if (nextToAct() >= 0) warn("STREET_NOT_CLOSED", `Le ${street} n'est pas terminé alors que le board est au ${boardStreet}.`);
    newStreet(boardStreet);
  }

  const toAct = nextToAct();
  let legal: LegalActions | null = null;
  let toCall = 0;
  if (toAct >= 0) {
    const s = seats[toAct];
    toCall = r2(Math.max(0, currentBet - s.streetBB));
    const rem = s.remainingBB;
    legal = {
      fold: true,
      check: toCall <= EPS,
      call: toCall > EPS ? r2(Math.min(toCall, rem)) : 0,
      bet: currentBet <= EPS && rem > EPS ? { min: r2(Math.min(bb, rem)), max: rem } : null,
      raise: currentBet > EPS && rem > toCall + EPS && canRaise(toAct)
        ? { minTo: r2(Math.min(currentBet + lastRaise, s.streetBB + rem)), maxTo: r2(s.streetBB + rem) }
        : null,
    };
  }

  // pots à tout moment : principal, annexes, mise rendue
  const pots = computePots(seats, toAct >= 0);
  const contested = pots.filter(p => p.kind !== "refund");
  const sidePots: HandState["sidePots"] = contested.length >= 2 ? contested.map(({ amount, eligible }) => ({ amount, eligible })) : [];

  const unsupported: string[] = [];
  if (!hasDealer) unsupported.push("NO_DEALER");

  const state: HandState = {
    variant: "NLHE", format: "cash", tableSize: n, dealerIdx: input.dealerIdx, heroIdx: input.heroIdx, sbIdx, bbIdx,
    blinds: { sb, bb, ante }, stacksAssumed: !Array.isArray(input.stacksBB), seats,
    hole: [...input.hole], board: [...input.board], street, history: [...input.actions],
    pot, currentBet, lastRaiseBB: lastRaise, toAct, toCall, legal, pots, sidePots,
    supported: unsupported.length === 0, unsupported,
    rake: input.rake ?? null, ranges: input.ranges ?? [],
  };
  for (const v of checkInvariants(state)) if (!errors.some(e => e.code === v.code)) errors.push(v);
  return { state, errors, warnings, valid: errors.length === 0 };
}

/** Contrôles d'une fiche, sans solveur : jetons, pot, cartes, cohérence des actions légales. */
export function checkInvariants(s: HandState): Violation[] {
  const out: Violation[] = [];
  const v = (code: string, message: string) => out.push({ code, message });
  const sum = (f: (x: SeatState) => number) => s.seats.reduce((t, x) => t + f(x), 0);

  if (Math.abs(s.pot - sum(x => x.investedBB)) > EPS) v("POT_MISMATCH", `Pot ${s.pot} bb, mises ${r2(sum(x => x.investedBB))} bb.`);
  if (Math.abs(sum(x => x.stackStartBB) - sum(x => x.remainingBB) - s.pot) > EPS) v("CHIPS_NOT_CONSERVED", "Tapis de départ ≠ tapis restants + pot.");
  if (s.seats.some(x => x.remainingBB < -EPS)) v("NEGATIVE_STACK", "Un tapis est négatif.");
  if (s.toCall < -EPS) v("NEGATIVE_TO_CALL", "Montant à payer négatif.");

  const cards = [...s.hole, ...s.board];
  if (cards.some(c => !VALID_CARD.test(c))) v("BAD_CARD", `Carte mal écrite : ${cards.filter(c => !VALID_CARD.test(c)).join(", ")}.`);
  const dup = cards.filter((c, i) => cards.indexOf(c) !== i);
  if (dup.length) v("DUPLICATE_CARD", `Carte en double : ${[...new Set(dup)].join(", ")}.`);
  if (!(s.board.length in BOARD_STREET)) v("BOARD_SIZE", `Board de ${s.board.length} cartes (0, 3, 4 ou 5 attendues).`);
  if (s.hole.length > 2) v("BAD_HOLE", `${s.hole.length} cartes en main.`);

  if (s.legal) {
    const L = s.legal;
    const bad = L.check !== (s.toCall <= EPS)
      || (L.call > EPS) === L.check
      || (L.bet && L.raise)
      || (L.bet && L.bet.min > L.bet.max + EPS)
      || (L.raise && L.raise.minTo > L.raise.maxTo + EPS);
    if (bad) v("LEGAL_INCONSISTENT", "Actions légales incohérentes avec le montant à payer.");
  }
  if (s.pots.length && Math.abs(s.pots.reduce((t, p) => t + p.amount, 0) - s.pot) > EPS) {
    v("POTS_SUM", "Les pots (principal, annexes, mise rendue) ne font pas le pot.");
  }
  return out;
}
