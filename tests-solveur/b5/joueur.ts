// B5 — Le joueur « site » à plusieurs (3 à 6 joueurs), à partir du flop : le conseiller maison avec tous les
// adversaires encore en jeu, ranges construites comme la page (src/pages/Index.tsx, postflopCtx) : ranges de la ligne
// préflop jouée (table du solveur cash), sinon situations types ; adversaire principal = le dernier à avoir misé, sinon
// le premier encore en jeu ; chaque range filtrée par la ligne aux streets précédentes et par la street en cours.
// Empaqueté une fois par version du site (esbuild, « @ » → src de cette version), comme B4.
// Écart assumé : à 3 joueurs, la page passe la turn et la river à son solveur multiway (60 à 90 s par décision) ; ici,
// le conseiller maison partout (comme la page à 4 joueurs et plus).
import { getRange, slotsFor, actsFirstPostflop } from "@/engines/matchupRanges";
import { filterByLine, filterByBet, removeDead, type LineEvent } from "@/engines/postflopRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { topPercentRange } from "@/engines/preflopEquity";
import { CASH_RAKE } from "@/core/rake";

export type Kind = "fold" | "check" | "call" | "bet" | "raise";
export type MStreet = "Preflop" | "Flop" | "Turn" | "River";
/** Une action de la main : `to` = total mis sur la street après l'action, `potBefore` = pot juste avant. */
export interface MAct { street: MStreet; seat: number; kind: Kind; to: number; potBefore: number }
export interface MView {
  me: number; pos: string[]; live: number[]; hole: [string, string]; board: string[]; street: "Flop" | "Turn" | "River";
  startStack: number; history: MAct[];
  pot: number; toCall: number; remaining: number; effRemaining: number; myStreet: number; currentBet: number;
  legal: { check: boolean; call: number; bet: { min: number; max: number } | null; raise: { minTo: number; maxTo: number } | null };
}
export interface Choice { kind: Kind; to?: number; how: string }

let game: unknown = null;
export function init(cash100: unknown) { game = cash100; setSolverBaseGame(cash100 as never); }

const POST = ["Flop", "Turn", "River"] as const;
const TYPE: Record<Kind, string> = { fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise" };

export function decide(v: MView): Choice {
  const { me, board, hole } = v;
  const posOf = (s: number) => (s >= 0 ? v.pos[s] ?? "" : "");
  const heroPos = posOf(me);
  // adversaire principal : le dernier à avoir misé, sinon le premier encore en jeu (comme la page)
  let vSeat = -1;
  for (let i = v.history.length - 1; i >= 0; i--) { const a = v.history[i]; if (a.seat !== me && (a.kind === "bet" || a.kind === "raise")) { vSeat = a.seat; break; } }
  if (vSeat < 0) vSeat = v.history.find(a => a.seat !== me && v.live.includes(a.seat))?.seat ?? -1;
  const villainPos = vSeat >= 0 ? posOf(vSeat) || "BB" : heroPos === "BB" ? "BTN" : "BB";
  const pre = v.history.filter(a => a.street === "Preflop");
  const raises = pre.filter(a => a.kind === "raise" || a.kind === "bet");
  const lastRaiser = raises.length ? raises[raises.length - 1].seat : -1;
  const heroIsPfr = lastRaiser >= 0 ? lastRaiser === me : !actsFirstPostflop(heroPos, villainPos);
  const potType = raises.length >= 2 ? "3bet" : "srp";
  const slots = slotsFor(heroIsPfr ? heroPos : villainPos, heroIsPfr ? villainPos : heroPos, potType);
  const combos = (slot: string, pct: number) => { const w = getRange(slot).weights; return expandRange(Object.keys(w).length ? w : topPercentRange(pct), board); };
  const lr = lineRanges(game as never, v.pos, pre.filter(a => a.kind !== "fold").map(a => ({ seatIdx: a.seat, street: "Preflop", type: TYPE[a.kind], amountBB: a.to })), v.startStack);
  const fromLine = (seat: number) => {
    if (!lr || seat < 0) return null;
    const w = lr.bySeat[seat];
    const top = w ? Math.max(0, ...Object.values(w)) : 0;
    return top > 0 ? expandRange(Object.fromEntries(Object.entries(w).map(([h, x]) => [h, x / top])), board) : null;
  };
  const heroSlot = heroIsPfr ? slots.pfr : slots.caller, villainSlot = heroIsPfr ? slots.caller : slots.pfr;
  let heroRange = fromLine(me) ?? combos(heroSlot, 30);
  let villainRange = removeDead(fromLine(vSeat) ?? combos(villainSlot, 35), hole);
  const cur = POST.indexOf(v.street);
  const lineOf = (seat: number, first: boolean): LineEvent[] => POST.slice(0, cur).flatMap(st => {
    const acts = v.history.filter(a => a.street === st && a.seat === seat);
    const act = acts.some(a => a.kind === "bet" || a.kind === "raise") ? "bet" as const
      : acts.some(a => a.kind === "call") ? "call" as const
      : acts.some(a => a.kind === "check") ? (first ? "checkFirst" as const : "checkBack" as const) : null;
    return act ? [{ street: st, act }] : [];
  });
  const heroFirst = actsFirstPostflop(heroPos, villainPos);
  const heroLine = lineOf(me, heroFirst), villainLine = vSeat >= 0 ? lineOf(vSeat, !heroFirst) : [];
  heroRange = filterByLine(heroRange, board, heroLine);
  const thisStreet = (range: typeof villainRange, seat: number) => {
    const acts = v.history.filter(a => a.street === v.street && a.seat === seat);
    const aggr = [...acts].reverse().find(a => a.kind === "bet" || a.kind === "raise");
    if (aggr) return filterByBet(range, board, v.street, aggr.potBefore > 0 ? aggr.to / aggr.potBefore : 0.5);
    if (acts.some(a => a.kind === "call")) return filterByLine(range, board, [{ street: v.street, act: "call" }]);
    return range;
  };
  villainRange = filterByLine(villainRange, board, villainLine);
  if (vSeat >= 0) villainRange = thisStreet(villainRange, vSeat);
  const raiserPos = lastRaiser >= 0 ? posOf(lastRaiser) || villainPos : heroIsPfr ? heroPos : villainPos;
  const otherSeats = [...new Set(pre.filter(a => a.kind !== "fold").map(a => a.seat))].filter(s => s !== me && s !== vSeat && v.live.includes(s));
  const otherRanges = otherSeats.map(seat => {
    const p = posOf(seat);
    const slot = seat === lastRaiser || !p ? slotsFor(raiserPos, villainPos, potType).pfr : slotsFor(raiserPos, p, potType).caller;
    const first = actsFirstPostflop(p || villainPos, heroPos);
    return thisStreet(filterByLine(removeDead(fromLine(seat) ?? combos(slot, 35), hole), board, lineOf(seat, first)), seat);
  });
  const prev = cur > 0 ? POST[cur - 1] : null;
  const curActs = v.history.filter(a => a.street === v.street);
  const adv = advisePostflop({
    street: v.street, board, hole, heroRange, villainRange,
    heroInPosition: !heroFirst, heroIsPfr, potBB: v.pot, toCallBB: v.toCall, heroStackBB: v.effRemaining,
    canRaise: !!v.legal.raise, betLevel: v.currentBet, minRaiseTo: v.legal.raise?.minTo ?? null,
    heroCheckedThisStreet: curActs.some(a => a.seat === me && a.kind === "check") && !curActs.some(a => a.seat === me && (a.kind === "bet" || a.kind === "raise")),
    opponents: v.live.length - 1, otherRanges,
    prevVillain: prev ? villainLine.find(e => e.street === prev)?.act : undefined,
    prevHero: prev ? heroLine.find(e => e.street === prev)?.act : undefined,
    villainCheckedThisStreet: vSeat >= 0 && curActs.some(a => a.seat === vSeat && a.kind === "check"),
    rake: CASH_RAKE,
  } as never);
  return toChoice(v, adv.action as string, adv.sizeBB ?? 0, !!adv.allIn);
}

const clampTo = (v: MView, kind: "bet" | "raise", to: number): Choice => {
  const L = v.legal;
  if (kind === "bet" && L.bet) return { kind, to: Math.min(L.bet.max + v.myStreet, Math.max(L.bet.min + v.myStreet, to)), how: "" };
  if (L.raise) return { kind: "raise", to: Math.min(L.raise.maxTo, Math.max(L.raise.minTo, to)), how: "" };
  return L.check ? { kind: "check", how: "repli" } : { kind: "call", how: "repli" };
};

/** Conseil → action jouable (même traduction que le joueur de B4). */
function toChoice(v: MView, a: string, size: number, allIn: boolean): Choice {
  if (a === "fold") return v.legal.check ? { kind: "check", how: "fold→check" } : { kind: "fold", how: "" };
  if (a === "check") return v.legal.check ? { kind: "check", how: "" } : { kind: "call", how: "check→call" };
  if (a === "call") return v.legal.call > 0 ? { kind: "call", how: "" } : { kind: "check", how: "call→check" };
  if (a === "jam") return v.legal.raise ? { kind: "raise", to: v.legal.raise.maxTo, how: "" } : v.legal.bet ? { kind: "bet", to: v.legal.bet.max + v.myStreet, how: "" } : { kind: v.legal.check ? "check" : "call", how: "repli" };
  if (a === "raise" || a === "checkRaise") {
    if (v.toCall <= 0) return { kind: "check", how: "" };
    return allIn ? clampTo(v, "raise", v.legal.raise?.maxTo ?? 0) : clampTo(v, "raise", size);
  }
  if (v.toCall > 0) return { kind: "call", how: "mise→call" };
  return allIn ? clampTo(v, "bet", v.legal.bet?.max ?? 0) : clampTo(v, "bet", size);
}
