// Brique 2 de l'évaluateur : sur des situations turn et river tirées au hasard (graine fixe), on fait parler le
// conseiller maison et le solveur de fin de main, avec les mêmes ranges que le site (ligne préflop jouée, filtrées
// par les actions) et le rake cash. Pour la main du joueur, on mesure si le conseil maison est une action que le
// solveur joue, et combien il coûte (bb) par rapport à la meilleure action du solveur.
import { SolverGame, TableAction } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { actsFirstPostflop } from "@/engines/matchupRanges";
import { advisePostflop, type PostflopAdvice, type HandRole } from "@/engines/postflopAdvisor";
import { filterByLine, filterByBet, removeDead, type LineEvent } from "@/engines/postflopRanges";
import { solveEndgame, type EndgameAction } from "@/engines/endgame/solve";
import type { PathAct } from "@/engines/endgame/tree";
import { expandRange, FULL_DECK, type Combo } from "@/engines/rangeVsRange";
import { CASH_RAKE } from "@/core/rake";
import { withSeed } from "@/bench/driftCases";

export interface Comparison {
  id: string; category: string; street: "Turn" | "River"; decision: string; role: string; pot: number;
  house: string; solver: string; loss: number; agree: boolean; describe: string;
}
export interface Summary { category: string; n: number; agreePct: number; lossBB: number; lossPctPot: number }

const ROLE_FR: Record<HandRole, string> = { nuts: "très forte", value: "value", draw: "tirage", showdown: "moyenne", air: "sans main" };
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const PAIRS: [string, string][] = [["BTN", "BB"], ["CO", "BB"], ["MP", "BB"], ["SB", "BB"], ["CO", "BTN"]];
const DECISIONS = ["première action", "après un check", "face à une mise de 75 %"] as const;

function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const pickW = (cs: Combo[], r: () => number) => { const tot = cs.reduce((t, c) => t + c.w, 0); let x = r() * tot; for (const c of cs) { x -= c.w; if (x <= 0) return c; } return cs[cs.length - 1]; };

/** Action du solveur qui correspond au conseil maison (index dans `acts`). */
export function mapHouseAction(adv: Pick<PostflopAdvice, "action"> & { sizeBB?: number }, acts: EndgameAction[], facing: boolean): number {
  const idx = (k: string) => acts.findIndex(a => a.kind === k);
  const closest = (kinds: string[], to: number) => {
    let best = -1, gap = Infinity;
    acts.forEach((a, i) => { if (kinds.includes(a.kind) && Math.abs(a.to - to) < gap) { gap = Math.abs(a.to - to); best = i; } });
    return best;
  };
  const a = adv.action;
  let i: number;
  if (a === "fold") i = idx("fold");
  else if (a === "call") i = idx("call");
  else if (a === "check") i = facing ? idx("call") : idx("check");
  else if (a === "checkRaise") i = facing ? closest(["raise", "allin"], adv.sizeBB ?? 0) : idx("check");
  else if (a === "jam") i = idx("allin");
  else if (a === "raise") i = closest(["raise", "allin"], adv.sizeBB ?? 0);
  else i = facing ? closest(["raise", "allin"], adv.sizeBB ?? 0) : closest(["bet", "allin"], adv.sizeBB ?? 0);
  return i >= 0 ? i : facing ? idx("call") : idx("check");
}

export function summarize(rows: Comparison[], key: (r: Comparison) => string = r => r.category): Summary[] {
  const by = new Map<string, Comparison[]>();
  for (const r of rows) by.set(key(r), [...(by.get(key(r)) ?? []), r]);
  return [...by.entries()].map(([category, rs]) => ({
    category, n: rs.length,
    agreePct: Math.round((rs.filter(r => r.agree).length / rs.length) * 100),
    lossBB: rs.reduce((t, r) => t + r.loss, 0) / rs.length,
    lossPctPot: rs.reduce((t, r) => t + (r.loss / r.pot) * 100, 0) / rs.length,
  }));
}

export interface CompareOptions {
  river: number; turn: number; seed?: number; iterations?: number; samples?: number;
  /** Turn : permet au solveur une relance au pot face à une mise (par défaut il n'a que le tapis). */
  turnRaise?: boolean;
}

export function compareAdvisorSolver(g: SolverGame, o: CompareOptions): Comparison[] {
  const out: Comparison[] = [];
  const plan: ("Turn" | "River")[] = [...Array(o.river).fill("River"), ...Array(o.turn).fill("Turn")];
  let k = 0;
  for (const street of plan) {
    for (let guard = 0; guard < 50; guard++) {
      const row = one(g, street, (o.seed ?? 1) * 100003 + k++, o.iterations ?? 250, o.samples ?? 600, !!o.turnRaise);
      if (row) { out.push(row); break; }
    }
  }
  return out;
}

function one(g: SolverGame, street: "Turn" | "River", seed: number, iterations: number, samples: number, turnRaise = false): Comparison | null {
  const r = rng(seed);
  const [opener, caller] = PAIRS[Math.floor(r() * PAIRS.length)];
  const oi = SIX.indexOf(opener), ci = SIX.indexOf(caller);
  const acts: TableAction[] = [{ seatIdx: oi, street: "Preflop", type: "Raise", amountBB: 2.5 }, { seatIdx: ci, street: "Preflop", type: "Call", amountBB: 2.5 }];
  const lr = lineRanges(g, SIX, acts, 100);
  if (!lr?.bySeat[oi] || !lr.bySeat[ci]) return null;
  const deck = [...FULL_DECK];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const board = deck.slice(0, street === "Turn" ? 4 : 5);
  const oopPos = actsFirstPostflop(opener, caller) ? opener : caller;
  const seatOf = (p: 0 | 1) => SIX.indexOf(p === 0 ? oopPos : oopPos === opener ? caller : opener);
  const posOf = (p: 0 | 1) => SIX[seatOf(p)];
  const dead = (opener !== "SB" && caller !== "SB" ? 0.5 : 0) + (opener !== "BB" && caller !== "BB" ? 1 : 0);
  let pot = 5 + dead, each = 2.5;
  const lines: [LineEvent[], LineEvent[]] = [[], []];
  const pfrP: 0 | 1 = posOf(0) === opener ? 0 : 1;
  const prev: ("Flop" | "Turn")[] = street === "River" ? ["Flop", "Turn"] : ["Flop"];
  for (const st of prev) {
    if (r() < 0.5) { lines[0].push({ street: st, act: "checkFirst" }); lines[1].push({ street: st, act: "checkBack" }); }
    else {
      const b = (st === "Flop" ? 0.33 : 0.75) * pot;
      lines[pfrP].push({ street: st, act: "bet" }); lines[(1 - pfrP) as 0 | 1].push({ street: st, act: "call" });
      pot += 2 * b; each += b;
    }
  }
  const stack = 100 - each;
  const rangeOf = (p: 0 | 1) => {
    const w = lr.bySeat[seatOf(p)];
    const top = Math.max(...Object.values(w));
    return filterByLine(expandRange(Object.fromEntries(Object.entries(w).map(([h, x]) => [h, x / top])), board), board, lines[p]);
  };
  const ranges: [Combo[], Combo[]] = [rangeOf(0), rangeOf(1)];
  const d = Math.floor(r() * 3);
  const hero: 0 | 1 = d === 0 ? 0 : 1;
  const v = (1 - hero) as 0 | 1;
  if (!ranges[hero].length || !ranges[v].length) return null;
  const heroCards = pickW(ranges[hero], r).cards as [string, string];
  const bet = Math.round(0.75 * pot * 10) / 10;
  const facing = d === 2;
  const path: PathAct[] = d === 0 ? [] : d === 1 ? [{ player: 0, kind: "check" }] : [{ player: 0, kind: "bet", to: bet }];
  let vRange = removeDead(ranges[v], heroCards);
  if (facing) vRange = filterByBet(vRange, board, street, 0.75);
  const prevSt = prev[prev.length - 1];
  const adv = withSeed(seed, () => advisePostflop({
    street, board, hole: heroCards, heroRange: ranges[hero], villainRange: vRange,
    heroInPosition: hero === 1, heroIsPfr: hero === pfrP, potBB: facing ? pot + bet : pot, toCallBB: facing ? bet : 0, heroStackBB: stack,
    opponents: 1, prevVillain: lines[v].find(e => e.street === prevSt)?.act, prevHero: lines[hero].find(e => e.street === prevSt)?.act,
    villainCheckedThisStreet: d === 1, samples, rake: CASH_RAKE,
  }));
  const res = solveEndgame({ street, board, startPot: pot, stack, ranges, hero, heroCards, path, maxIter: iterations, timeBudgetMs: 1e9, targetPct: 0, rake: CASH_RAKE, sizes: street === "Turn" && turnRaise ? { raise: true } : undefined });
  if (!res || !res.heroInRange || !res.actions.length) return null;
  const i = mapHouseAction(adv, res.actions, facing);
  if (i < 0) return null;
  const best = Math.max(...res.actions.map(a => a.ev));
  const top = res.actions.reduce((b, a, j) => (a.freq > res.actions[b].freq ? j : b), 0);
  const fr = (x: number) => Math.round(x * 100);
  return {
    id: `s${seed}`, category: `${street} · ${DECISIONS[d]}`, street, decision: DECISIONS[d], role: ROLE_FR[adv.role],
    pot: facing ? pot + bet : pot,
    house: `${res.actions[i].label} (${adv.verb})`,
    solver: res.actions.filter(a => a.freq >= 0.05).map(a => `${a.label} ${fr(a.freq)} %`).join(" / "),
    loss: Math.max(0, best - res.actions[i].ev),
    agree: res.actions[i].freq >= 0.2 || i === top,
    describe: `${opener} contre ${caller}, ${hero === 0 ? posOf(0) : posOf(1)} avec ${heroCards.join("")} sur ${board.join(" ")}`,
  };
}
