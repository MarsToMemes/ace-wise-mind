// B4 — Matchs en duplicate, joués par l'arbitre (A1) : chaque donne (positions, cartes des deux joueurs, board) est
// jouée deux fois, places échangées. Gains sans rake (on mesure qui gagne contre qui ; les joueurs « site » pensent avec
// le rake cash, comme sur la page). Correction de la chance façon AIVAT, partielle : à chaque carte du board (turn,
// river) quand les deux joueurs sont encore là, on retire (valeur avec la carte tombée − valeur moyenne sur toutes les
// cartes possibles), valeur = part de pot à l'abattage × pot. Sans biais quelle que soit la valeur choisie (la moyenne
// de la correction sur les cartes est nulle) ; elle réduit l'écart dû aux cartes, pas celui des décisions.
import { getRange, slotsFor } from "@/engines/matchupRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";
import { expandRange } from "@/engines/rangeVsRange";
import { rank7, categoryOf } from "@/engines/handEval7";
import { Table, c as cents, bbOf } from "../oracle/regles";
import { rng, DECK } from "../outils/hasard";
import type { View, Choice, HAct, Kind } from "./joueur";

export type Player = { name: string; decide: (v: View, r: () => number) => Choice };
export const PAIRS: [string, string][] = [["BTN", "BB"], ["CO", "BB"], ["MP", "BB"], ["SB", "BB"], ["CO", "BTN"], ["UTG", "BB"]];
const SEAT: Record<string, number> = { UTG: 0, MP: 1, CO: 2, BTN: 3, SB: 4, BB: 5 };

export interface Deal { seed: number; pfrPos: string; callPos: string; pfrCards: [string, string]; callCards: [string, string]; board: string[] }
export interface GameOut { net: [number, number]; corr: [number, number]; fallbacks: number; illegal: number; decisions: number }

const pickW = (cs: { cards: [string, string]; w: number }[], r: () => number) => {
  const tot = cs.reduce((t, c) => t + c.w, 0); let x = r() * tot;
  for (const c of cs) { x -= c.w; if (x <= 0) return c; }
  return cs[cs.length - 1];
};

export function initRanges(cash100: unknown) { setSolverBaseGame(cash100 as never); }

/** Donne k de la graine : positions, cartes tirées dans les ranges de la ligne (relance, call), board. */
export function deal(seed: number, k: number): Deal {
  const R = rng((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0), r = R.next;
  const [pfrPos, callPos] = PAIRS[Math.floor(r() * PAIRS.length)];
  const slots = slotsFor(pfrPos, callPos, "srp");
  const pr = expandRange(getRange(slots.pfr).weights, []), cr = expandRange(getRange(slots.caller).weights, []);
  const pfrCards = pickW(pr, r).cards;
  const callCards = pickW(cr.filter(x => !x.cards.some(y => pfrCards.includes(y))), r).cards;
  const rest = R.shuffle(DECK.filter(x => !pfrCards.includes(x) && !callCards.includes(x)));
  return { seed: k, pfrPos, callPos, pfrCards, callCards, board: rest.slice(0, 5) };
}

/** Part de pot de chaque joueur à l'abattage sur ce board (complété par toutes les rivers si 4 cartes). */
function shares(h0: string[], h1: string[], board: string[]): [number, number] {
  const run = (b: string[]): [number, number] => { const a = rank7([...h0, ...b]), c = rank7([...h1, ...b]); return a > c ? [1, 0] : a < c ? [0, 1] : [0.5, 0.5]; };
  if (board.length === 5) return run(board);
  const used = new Set([...h0, ...h1, ...board]);
  let s0 = 0, n = 0;
  for (const x of DECK) if (!used.has(x)) { s0 += run([...board, x])[0]; n++; }
  return [s0 / n, 1 - s0 / n];
}

/** Correction de la chance pour une carte tombée : (valeur avec cette carte − moyenne sur les cartes possibles) × pot. */
function chanceCorr(h0: string[], h1: string[], before: string[], card: string, pot: number): [number, number] {
  const used = new Set([...h0, ...h1, ...before]);
  let m0 = 0, n = 0;
  for (const x of DECK) if (!used.has(x)) { m0 += shares(h0, h1, [...before, x])[0]; n++; }
  const got = shares(h0, h1, [...before, card])[0];
  const d = (got - m0 / n) * pot;
  return [d, -d];
}

const isStrong = (hole: string[], board: string[]) => {
  // « paire top ou mieux, avec au moins une carte de la main » : la main fait mieux que le board seul
  const R = "23456789TJQKA", rk = (x: string) => R.indexOf(x[0]);
  const counts = Object.values(board.reduce<Record<string, number>>((m, b) => { m[b[0]] = (m[b[0]] ?? 0) + 1; return m; }, {})).sort((a, b) => b - a);
  const boardCat = counts[0] >= 3 ? 3 : counts[0] === 2 ? (counts[1] === 2 ? 2 : 1) : 0;
  const cat = categoryOf(rank7([...hole, ...board]));
  if (cat >= 2) return cat > boardCat;
  if (cat === 1 && boardCat === 0) {
    const top = Math.max(...board.map(rk));
    const pairRank = hole[0][0] === hole[1][0] ? rk(hole[0]) : hole.map(rk).find(x => board.some(b => rk(b) === x)) ?? -1;
    return pairRank >= top;
  }
  return false;
};

/** Profils simples (identiques pour toutes les versions). */
export const BASELINES: Player[] = [
  { name: "toujours call", decide: v => (v.toCall > 0 ? { kind: "call", how: "" } : { kind: "check", how: "" }) },
  {
    name: "serré", decide: v => {
      const strong = isStrong(v.hole, v.board);
      if (v.toCall > 0) return strong ? { kind: "call", how: "" } : { kind: "fold", how: "" };
      if (strong && v.legal.bet) return { kind: "bet", to: Math.min(v.legal.bet.max, Math.max(v.legal.bet.min, Math.round(0.66 * v.pot * 2) / 2)) + v.myStreet, how: "" };
      return { kind: "check", how: "" };
    },
  },
  {
    name: "agressif", decide: (v, r) => {
      if (v.toCall > 0) {
        if (v.legal.raise && r() < 0.35) return { kind: "raise", to: Math.min(v.legal.raise.maxTo, Math.max(v.legal.raise.minTo, 3 * v.currentBet)), how: "" };
        return r() < 0.85 ? { kind: "call", how: "" } : { kind: "fold", how: "" };
      }
      if (v.legal.bet && r() < 0.75) return { kind: "bet", to: Math.min(v.legal.bet.max, Math.max(v.legal.bet.min, Math.round(0.75 * v.pot * 2) / 2)) + v.myStreet, how: "" };
      return { kind: "check", how: "" };
    },
  },
];

/** Une main : `players[0]` joue la place du relanceur, `players[1]` celle du payeur. */
export function playGame(d: Deal, players: [Player, Player], aivat: boolean): GameOut {
  const t = new Table({ n: 6, dealer: 3, stacks: Array(6).fill(100) });
  const sp = SEAT[d.pfrPos], sc = SEAT[d.callPos];
  // préflop : tout le monde se couche, le relanceur ouvre à 2,5, le payeur paie
  while (!t.streetClosed()) {
    const s = t.toAct;
    const why = s === sp ? t.apply({ seat: s, kind: "raise", to: cents(2.5) }) : s === sc ? t.apply({ seat: s, kind: "call" }) : t.apply({ seat: s, kind: "fold" });
    if (why) throw new Error(`préflop impossible : ${why}`);
  }
  const holes: Record<number, [string, string]> = { [sp]: d.pfrCards, [sc]: d.callCards };
  const flopPot = bbOf(t.pot), preflopPut = 2.5;
  t.nextStreet();
  const oopSeat = t.toAct, ipSeat = oopSeat === sp ? sc : sp;
  const who = (seat: number): 0 | 1 => (seat === oopSeat ? 0 : 1);
  const pfr = who(sp);
  const playerOf = (seat: number) => (seat === sp ? players[0] : players[1]);
  const hist: HAct[] = [];
  const out: GameOut = { net: [0, 0], corr: [0, 0], fallbacks: 0, illegal: 0, decisions: 0 };
  const names = ["Flop", "Turn", "River"] as const;
  let boardLen = 3, streetStartPot = bbOf(t.pot), streetStartEff = bbOf(t.effective(oopSeat));
  const rr = rng((d.seed * 7919 + 17) >>> 0).next;
  for (let guard = 0; guard < 100; guard++) {
    if (t.handOver()) break;
    if (t.streetClosed()) {
      // carte suivante (turn puis river) : correction de la chance avant de la poser
      if (aivat) {
        const c2 = chanceCorr(holes[oopSeat], holes[ipSeat], d.board.slice(0, boardLen), d.board[boardLen], bbOf(t.pot));
        out.corr[0] += c2[0]; out.corr[1] += c2[1];
      }
      boardLen++; t.nextStreet();
      streetStartPot = bbOf(t.pot); streetStartEff = bbOf(t.effective(oopSeat));
      continue;
    }
    const seat = t.toAct, L = t.legal()!, s = t.seats[seat];
    const street = names[boardLen - 3];
    const v: View = {
      me: who(seat), pfr, pfrPos: d.pfrPos, callPos: d.callPos, hole: holes[seat], board: d.board.slice(0, boardLen), street,
      flopPot, preflopPut, startStack: 100, history: hist.map(h => ({ ...h })),
      pot: bbOf(t.pot), toCall: bbOf(Math.min(t.toCallOf(seat), s.stack)), remaining: bbOf(s.stack), effRemaining: bbOf(t.effective(seat)),
      myStreet: bbOf(s.street), currentBet: bbOf(t.currentBet), streetStartPot, streetStartEff,
      legal: { check: L.check, call: bbOf(L.call), bet: L.bet && { min: bbOf(L.bet.min), max: bbOf(L.bet.max) }, raise: L.raise && { minTo: bbOf(L.raise.minTo), maxTo: bbOf(L.raise.maxTo) } },
    };
    const ch = playerOf(seat).decide(v, rr);
    out.decisions++;
    if (ch.how && ch.how !== "solveur") out.fallbacks++;
    let kind: Kind = ch.kind;
    if (t.apply({ seat, kind, to: ch.to !== undefined ? cents(ch.to) : undefined })) {
      // action refusée par l'arbitre : comptée, puis remplacée par check ou call
      out.illegal++;
      kind = L.check ? "check" : "call";
      const why = t.apply({ seat, kind });
      if (why) throw new Error(`action de repli refusée : ${why}`);
    }
    hist.push({ street, who: who(seat), kind, to: bbOf(t.seats[seat].street) });
  }
  // board complet pour l'abattage (tapis avant la river) : chaque carte restante compte aussi dans la correction
  while (t.live().length > 1 && boardLen < 5) {
    if (aivat) { const c2 = chanceCorr(holes[oopSeat], holes[ipSeat], d.board.slice(0, boardLen), d.board[boardLen], bbOf(t.pot)); out.corr[0] += c2[0]; out.corr[1] += c2[1]; }
    boardLen++;
  }
  const pay = t.payouts(seat => (holes[seat] ? rank7([...holes[seat], ...d.board]) : -1));
  for (const seat of [sp, sc]) out.net[seat === sp ? 0 : 1] = bbOf(pay[seat] - t.seats[seat].total);
  // corrections rangées par place (relanceur, payeur), comme les gains
  if (oopSeat !== sp) out.corr = [out.corr[1], out.corr[0]];
  return out;
}

/**
 * Duplicate : A joue la donne aux deux places. Score de A (bb pour les deux mains) = (gain de A − gain de B) / 2, sommé
 * sur les deux parties : les blindes des joueurs couchés (argent mort, gagné par l'un ou l'autre) s'annulent, et une
 * version contre elle-même donne exactement 0. Brut, puis corrigé de la chance.
 */
export function duplicate(d: Deal, A: Player, B: Player, aivat: boolean) {
  const g1 = playGame(d, [A, B], aivat), g2 = playGame(d, [B, A], aivat);
  const raw = (g1.net[0] - g1.net[1]) / 2 + (g2.net[1] - g2.net[0]) / 2;
  const adj = raw - ((g1.corr[0] - g1.corr[1]) / 2 + (g2.corr[1] - g2.corr[0]) / 2);
  return { raw, adj, single: [g1.net[0], g2.net[1]], fallbacks: g1.fallbacks + g2.fallbacks, illegal: g1.illegal + g2.illegal, decisions: g1.decisions + g2.decisions };
}
