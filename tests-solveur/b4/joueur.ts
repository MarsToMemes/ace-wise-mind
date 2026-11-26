// B4 — Le joueur « site » : ce que la décision synthétique conseille, en tête-à-tête, à partir du flop. Ce fichier est
// empaqueté une fois par version du site (esbuild, « @ » → src de cette version) : le même joueur, deux versions du code.
//  - flop et turn : conseiller maison (advisePostflop), avec les ranges de la ligne jouée et le rake cash ;
//  - river : solveur de fin de main (solveEndgame), réglages du site, action la plus jouée par ta main (celle affichée).
// Écart assumé : à la turn, le site utilise le solveur (jusqu'à 30 s par décision) ; ici, le conseiller maison.
import { getRange, slotsFor } from "@/engines/matchupRanges";
import { filterByLine, filterByBet, removeDead, type LineEvent } from "@/engines/postflopRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { solveEndgame } from "@/engines/endgame/solve";
import { expandRange } from "@/engines/rangeVsRange";
import { topPercentRange } from "@/engines/preflopEquity";
import { CASH_RAKE } from "@/core/rake";

export type Kind = "fold" | "check" | "call" | "bet" | "raise";
export interface HAct { street: "Flop" | "Turn" | "River"; who: 0 | 1; kind: Kind; to: number }
/** Ce que voit le joueur. 0 = hors de position (parle en premier après le flop), 1 = en position. */
export interface View {
  me: 0 | 1; pfr: 0 | 1; pfrPos: string; callPos: string;
  hole: [string, string]; board: string[]; street: "Flop" | "Turn" | "River";
  /** Pot au début du flop et ce que chacun a mis avant le flop. */
  flopPot: number; preflopPut: number; startStack: number;
  /** Actions après le flop, dans l'ordre (montant « à » sur la street pour bet / raise / call). */
  history: HAct[];
  pot: number; toCall: number; remaining: number; effRemaining: number;
  myStreet: number; currentBet: number;
  /** Pot et tapis effectif au début de la street en cours (pour le solveur de la river). */
  streetStartPot: number; streetStartEff: number;
  legal: { check: boolean; call: number; bet: { min: number; max: number } | null; raise: { minTo: number; maxTo: number } | null };
}
export interface Choice { kind: Kind; to?: number; how: string }

export function init(cash100: unknown) { setSolverBaseGame(cash100 as never); }

const STREETS = ["Flop", "Turn", "River"] as const;

/** Ligne de chacun sur les streets terminées (comme le site : mise, call, check en premier, check derrière). */
function linesOf(v: View): [LineEvent[], LineEvent[]] {
  const out: [LineEvent[], LineEvent[]] = [[], []];
  for (const st of STREETS) {
    if (st === v.street) break;
    const acts = v.history.filter(a => a.street === st);
    for (const p of [0, 1] as const) {
      const mine = acts.filter(a => a.who === p);
      if (mine.some(a => a.kind === "bet" || a.kind === "raise")) out[p].push({ street: st, act: "bet" });
      else if (mine.some(a => a.kind === "call")) out[p].push({ street: st, act: "call" });
      else if (mine.some(a => a.kind === "check")) out[p].push({ street: st, act: acts[acts.length - 1]?.who === p ? "checkBack" : "checkFirst" });
    }
  }
  return out;
}

export function ranges(v: View): [ReturnType<typeof expandRange>, ReturnType<typeof expandRange>] {
  const slots = slotsFor(v.pfrPos, v.callPos, "srp");
  const raw = (slot: string, pct: number) => { const w = getRange(slot).weights; return expandRange(Object.keys(w).length ? w : topPercentRange(pct), v.board); };
  const base = v.pfr === 0 ? [raw(slots.pfr, 30), raw(slots.caller, 35)] : [raw(slots.caller, 35), raw(slots.pfr, 30)];
  const lines = linesOf(v);
  return [filterByLine(base[0], v.board, lines[0]), filterByLine(base[1], v.board, lines[1])];
}

const clampTo = (v: View, kind: "bet" | "raise", to: number): Choice => {
  const L = v.legal;
  if (kind === "bet" && L.bet) return { kind, to: Math.min(L.bet.max + v.myStreet, Math.max(L.bet.min + v.myStreet, to)), how: "" };
  if (L.raise) return { kind: "raise", to: Math.min(L.raise.maxTo, Math.max(L.raise.minTo, to)), how: "" };
  return L.check ? { kind: "check", how: "repli" } : { kind: "call", how: "repli" };
};

/**
 * Conseil maison pour cette vue. `pageLike` (analyse de B3 seulement) : comme la page, la range adverse est aussi
 * resserrée par la mise de la street en cours (filterByBet, taille rapportée au pot d'avant la mise) ; le joueur de
 * B4 et B3 ne le fait pas.
 */
export function adviceFor(v: View, pageLike = false) {
  const [r0, r1] = ranges(v);
  const o = (1 - v.me) as 0 | 1;
  let oppR = removeDead(v.me === 0 ? r1 : r0, [...v.board, ...v.hole]);
  const mineR = removeDead(v.me === 0 ? r0 : r1, v.board);
  if (pageLike) {
    const cur = v.history.filter(a => a.street === v.street);
    const k = cur.map(a => a.who === o && (a.kind === "bet" || a.kind === "raise")).lastIndexOf(true);
    if (k >= 0) {
      const a = cur[k], prevTo = cur.slice(0, k).filter(x => x.who === o).reduce((m, x) => Math.max(m, x.to), 0);
      const myTo = cur.slice(0, k).filter(x => x.who === v.me).reduce((m, x) => Math.max(m, x.to), 0);
      const potBefore = v.streetStartPot + prevTo + myTo;
      oppR = filterByBet(oppR, v.board, v.street, potBefore > 0 ? a.to / potBefore : 0.5);
    }
  }
  const lines = linesOf(v);
  const prevSt = v.street === "Turn" ? "Flop" : v.street === "River" ? "Turn" : null;
  const prev = (p: 0 | 1) => (prevSt ? lines[p].find(e => e.street === prevSt)?.act : undefined);
  const cur = v.history.filter(a => a.street === v.street);
  const adv = advisePostflop({
    street: v.street, board: v.board, hole: v.hole, heroRange: mineR, villainRange: oppR,
    heroInPosition: v.me === 1, heroIsPfr: v.pfr === v.me, potBB: v.pot, toCallBB: v.toCall, heroStackBB: v.effRemaining,
    canRaise: !!v.legal.raise, betLevel: v.currentBet, minRaiseTo: v.legal.raise?.minTo ?? null,
    heroCheckedThisStreet: cur.some(a => a.who === v.me && a.kind === "check"),
    opponents: 1, prevVillain: prev(o), prevHero: prev(v.me),
    villainCheckedThisStreet: cur.some(a => a.who === o && a.kind === "check"), rake: CASH_RAKE,
  } as never);
  return adv;
}

function advisor(v: View): Choice {
  const adv = adviceFor(v);
  const a = adv.action as string, size = adv.sizeBB ?? 0;
  if (a === "fold") return v.legal.check ? { kind: "check", how: "fold→check" } : { kind: "fold", how: "" };
  if (a === "check") return v.legal.check ? { kind: "check", how: "" } : { kind: "call", how: "check→call" };
  if (a === "call") return v.legal.call > 0 ? { kind: "call", how: "" } : { kind: "check", how: "call→check" };
  if (a === "jam") return v.legal.raise ? { kind: "raise", to: v.legal.raise.maxTo, how: "" } : v.legal.bet ? { kind: "bet", to: v.legal.bet.max + v.myStreet, how: "" } : { kind: v.legal.check ? "check" : "call", how: "repli" };
  if (a === "raise" || a === "checkRaise") {
    if (v.toCall <= 0) return { kind: "check", how: "" };            // « check, puis check-raise » : on checke
    return adv.allIn ? clampTo(v, "raise", v.legal.raise?.maxTo ?? 0) : clampTo(v, "raise", size);
  }
  // mises (bet, overbet, donk, probe, delayed, block) : montant ajouté
  if (v.toCall > 0) return { kind: "call", how: "mise→call" };
  return adv.allIn ? clampTo(v, "bet", v.legal.bet?.max ?? 0) : clampTo(v, "bet", size);
}

/** Entrée du solveur de la river pour cette vue (partagée avec B3). */
export function riverInput(v: View) {
  const [r0, r1] = ranges(v);
  const riverActs = v.history.filter(a => a.street === "River");
  return {
    street: "River" as const, board: v.board, startPot: v.streetStartPot, stack: v.streetStartEff, ranges: [r0, r1] as [typeof r0, typeof r1], hero: v.me, heroCards: v.hole,
    path: riverActs.map(a => (a.kind === "bet" || a.kind === "raise" ? { player: a.who, kind: a.kind, to: a.to } : { player: a.who, kind: a.kind })),
    rake: CASH_RAKE, timeBudgetMs: 1e9,
  };
}

function riverSolver(v: View): Choice | null {
  const res = solveEndgame(riverInput(v) as never);
  if (!res) return null;
  return riverChoice(v, res.actions.reduce((b, x) => (x.freq > b.freq ? x : b)));
}

/** Action la plus jouée par la main au solveur de la river → choix joué (partagé avec B3, qui lit toute la range d'un coup). */
export function riverChoice(v: View, best: { kind: string; to: number }): Choice {
  if (best.kind === "fold") return v.legal.check ? { kind: "check", how: "fold→check" } : { kind: "fold", how: "solveur" };
  if (best.kind === "check") return v.legal.check ? { kind: "check", how: "solveur" } : { kind: "call", how: "check→call" };
  if (best.kind === "call") return { kind: v.legal.call > 0 ? "call" : "check", how: "solveur" };
  const to = best.kind === "allin" ? (v.legal.raise?.maxTo ?? (v.legal.bet ? v.legal.bet.max + v.myStreet : 0)) : best.to;
  return clampTo(v, v.legal.raise ? "raise" : "bet", to);
}

export function decide(v: View): Choice {
  if (v.street === "River") { const c = riverSolver(v); if (c) return c; }
  return advisor(v);
}
