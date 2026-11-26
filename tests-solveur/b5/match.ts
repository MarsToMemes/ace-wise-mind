// B5 — Matchs à plusieurs (3, 4 et 6 joueurs), joués par l'arbitre (A1), 6 sièges, 100 bb. Préflop fixé : un joueur
// ouvre à 2,5 bb, les autres de la ligne paient, le reste se couche. Cartes tirées dans les ranges de la ligne (table
// du solveur cash) quand elle y figure sans être rare, sinon dans « ouverture » et « call face à l'ouverture » ; toutes
// les mains tirées d'un coup, tirage recommencé en entier si deux mains partagent une carte (distribution jointe, D9).
// Duplicate tournant : la donne est rejouée autant de fois qu'il y a de joueurs, la version testée prenant chaque place.
// Score par partie = gain de la version testée − (somme des gains des joueurs de la ligne) / n : l'argent mort des
// blindes couchées est partagé à parts égales, et une version contre elle-même donne exactement 0.
// Contrôle à chaque main : somme des gains des 6 sièges = 0 (sans rake), au millionième de centime près : l'arbitre
// partage un pot à égalité exactement, et un pot partagé en trois n'a pas un nombre entier de centimes (calcul en virgule
// flottante : écart de l'ordre de 1e-13 centime).
import { getRange } from "@/engines/matchupRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { rank7 } from "@/engines/handEval7";
import { Table, c as cents, bbOf } from "../oracle/regles";
import { rng, DECK } from "../outils/hasard";
import type { MView, MAct, Choice, Kind, MStreet } from "./joueur";

export type MPlayer = { name: string; decide: (v: MView, r: () => number) => Choice };
export const POS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
/** Lignes jouées (ouvreur puis payeurs, dans l'ordre de parole), par nombre de joueurs. */
export const LINES: Record<number, string[][]> = {
  3: [["CO", "BTN", "BB"], ["BTN", "SB", "BB"], ["UTG", "BTN", "BB"], ["MP", "CO", "BB"], ["CO", "BTN", "SB"], ["UTG", "CO", "BB"]],
  4: [["CO", "BTN", "SB", "BB"], ["MP", "BTN", "SB", "BB"]],
  6: [["UTG", "MP", "CO", "BTN", "SB", "BB"]],
};

let game: unknown = null;
export function initRanges(cash100: unknown) { game = cash100; setSolverBaseGame(cash100 as never); }

type W = { cards: [string, string]; w: number }[];
const cache = new Map<string, { ranges: W[]; source: "ligne" | "ouverture et call" }>();
/** Ranges de tirage d'une ligne : celles de la table du solveur si la ligne y est sans être rare, sinon ouverture / call. */
export function lineDraw(line: string[]) {
  const key = line.join(">");
  const hit = cache.get(key);
  if (hit) return hit;
  const acts = line.map((p, i) => ({ seatIdx: POS.indexOf(p), street: "Preflop", type: i === 0 ? "Raise" : "Call", amountBB: 2.5 }));
  const lr = lineRanges(game as never, POS, acts, 100);
  const out = lr && !lr.rare
    ? { ranges: line.map(p => expandRange(lr.bySeat[POS.indexOf(p)], []) as W), source: "ligne" as const }
    : { ranges: line.map((p, i) => expandRange(getRange(i === 0 ? `open:${p}` : `call:${p}:vs:${line[0]}`).weights, []) as W), source: "ouverture et call" as const };
  cache.set(key, out);
  return out;
}

export interface MDeal { seed: number; line: string[]; seats: number[]; holes: [string, string][]; board: string[] }

const pickW = (cs: W, r: () => number) => {
  const tot = cs.reduce((t, c) => t + c.w, 0); let x = r() * tot;
  for (const c of cs) { x -= c.w; if (x <= 0) return c; }
  return cs[cs.length - 1];
};

export function dealN(seed: number, k: number, n: number): MDeal {
  const R = rng((seed ^ Math.imul(k + 1, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35)) >>> 0), r = R.next;
  const line = LINES[n][Math.floor(r() * LINES[n].length)];
  const { ranges } = lineDraw(line);
  for (let tries = 0; tries < 10000; tries++) {
    const holes = ranges.map(cs => pickW(cs, r).cards);
    const all = holes.flat();
    if (new Set(all).size !== all.length) continue;            // une carte partagée : on recommence tout le tirage
    const rest = R.shuffle(DECK.filter(x => !all.includes(x)));
    return { seed: k, line, seats: line.map(p => POS.indexOf(p)), holes, board: rest.slice(0, 5) };
  }
  throw new Error(`tirage impossible pour ${line.join(">")}`);
}

export interface MGame { net: number[]; sumCents: number; illegal: number; fallbacks: number; decisions: number }

/** Une main ; `bySeat[siège]` = joueur de ce siège (sièges de la ligne seulement). */
export function playGameN(d: MDeal, bySeat: Record<number, MPlayer>): MGame {
  const t = new Table({ n: 6, dealer: 3, stacks: Array(6).fill(100) });
  const hist: MAct[] = [];
  const holes: Record<number, [string, string]> = {};
  d.seats.forEach((s, i) => { holes[s] = d.holes[i]; });
  const opener = d.seats[0];
  while (!t.streetClosed()) {
    const s = t.toAct, potBefore = bbOf(t.pot);
    const kind: Kind = s === opener ? "raise" : d.seats.includes(s) ? "call" : "fold";
    const why = t.apply({ seat: s, kind, to: kind === "raise" ? cents(2.5) : undefined });
    if (why) throw new Error(`préflop impossible : ${why}`);
    hist.push({ street: "Preflop", seat: s, kind, to: bbOf(t.seats[s].street), potBefore });
  }
  const out: MGame = { net: Array(6).fill(0), sumCents: 0, illegal: 0, fallbacks: 0, decisions: 0 };
  const names = ["Flop", "Turn", "River"] as const;
  let boardLen = 3;
  t.nextStreet();
  const rr = rng((d.seed * 7919 + 31) >>> 0).next;
  for (let guard = 0; guard < 300; guard++) {
    if (t.handOver()) break;
    if (t.streetClosed()) { boardLen++; t.nextStreet(); continue; }
    const seat = t.toAct, L = t.legal()!, s = t.seats[seat];
    const street = names[boardLen - 3];
    const v: MView = {
      me: seat, pos: POS, live: t.live(), hole: holes[seat], board: d.board.slice(0, boardLen), street, startStack: 100,
      history: hist.map(h => ({ ...h })),
      pot: bbOf(t.pot), toCall: bbOf(Math.min(t.toCallOf(seat), s.stack)), remaining: bbOf(s.stack), effRemaining: bbOf(t.effective(seat)),
      myStreet: bbOf(s.street), currentBet: bbOf(t.currentBet),
      legal: { check: L.check, call: bbOf(L.call), bet: L.bet && { min: bbOf(L.bet.min), max: bbOf(L.bet.max) }, raise: L.raise && { minTo: bbOf(L.raise.minTo), maxTo: bbOf(L.raise.maxTo) } },
    };
    const ch = bySeat[seat].decide(v, rr);
    out.decisions++;
    if (ch.how && ch.how !== "solveur") out.fallbacks++;
    let kind: Kind = ch.kind;
    const potBefore = bbOf(t.pot);
    if (t.apply({ seat, kind, to: ch.to !== undefined ? cents(ch.to) : undefined })) {
      out.illegal++;
      kind = L.check ? "check" : "call";
      const why = t.apply({ seat, kind });
      if (why) throw new Error(`action de repli refusée : ${why}`);
    }
    hist.push({ street: street as MStreet, seat, kind, to: bbOf(t.seats[seat].street), potBefore });
  }
  const pay = t.payouts(seat => (holes[seat] && !t.seats[seat].folded ? rank7([...holes[seat], ...d.board]) : -1));
  let sum = 0;
  for (let seat = 0; seat < 6; seat++) { const x = pay[seat] - t.seats[seat].total; sum += x; out.net[seat] = bbOf(x); }
  out.sumCents = sum;
  return out;
}

/** Duplicate tournant : A prend chaque place de la ligne, B les autres. Score moyen de A par main (bb). */
export function duplicateN(d: MDeal, A: MPlayer, B: MPlayer) {
  let score = 0, sumFails = 0, illegal = 0, fallbacks = 0, decisions = 0;
  const n = d.seats.length;
  for (let r = 0; r < n; r++) {
    const bySeat: Record<number, MPlayer> = {};
    d.seats.forEach((s, i) => { bySeat[s] = i === r ? A : B; });
    const g = playGameN(d, bySeat);
    const T = d.seats.reduce((t, s) => t + g.net[s], 0);
    score += g.net[d.seats[r]] - T / n;
    if (Math.abs(g.sumCents) > 1e-6) sumFails++;
    illegal += g.illegal; fallbacks += g.fallbacks; decisions += g.decisions;
  }
  return { score: score / n, sumFails, illegal, fallbacks, decisions, games: n };
}
