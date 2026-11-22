// Brique 3 de l'évaluateur : un jeu fixe de mains types. Chaque version du site y donne ses décisions ; on les
// compare à la référence enregistrée (reference.json) pour repérer toute décision qui change sans qu'on l'ait voulu.
// Le hasard du conseiller après le flop est fixé (même graine à chaque fois) pour que le résultat soit reproductible.
import { SolverGame, TableAction, matchSpot, adviceForHand, coverageOf } from "@/engines/solverSpots";
import { advisePostflop, type PostflopInput } from "@/engines/postflopAdvisor";
import { solveEndgame } from "@/engines/endgame/solve";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { CASH_RAKE } from "@/core/rake";

export interface Decision { id: string; what: string; result: string }
export interface Reference { version: 1; decisions: Decision[] }
export interface Drift { changed: { id: string; what: string; before: string; after: string }[]; added: Decision[]; removed: Decision[] }

/** Exécute fn avec un Math.random reproductible (mulberry32), puis remet l'original. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = orig; }
}

const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"]; // sièges 0..5
const A = (seatIdx: number, type: string, amountBB = 0): TableAction => ({ seatIdx, street: "Preflop", type, amountBB });

const PREFLOP: { id: string; what: string; hero: number; hand: string; acts: TableAction[] }[] = [
  { id: "pf-utg-aa", what: "UTG premier à parler, AA", hero: 0, hand: "AA", acts: [] },
  { id: "pf-utg-ajo", what: "UTG premier à parler, AJo", hero: 0, hand: "AJo", acts: [] },
  { id: "pf-utg-76s", what: "UTG premier à parler, 76s", hero: 0, hand: "76s", acts: [] },
  { id: "pf-utg-22", what: "UTG premier à parler, 22", hero: 0, hand: "22", acts: [] },
  { id: "pf-btn-k9o", what: "BTN premier à parler, K9o", hero: 3, hand: "K9o", acts: [] },
  { id: "pf-btn-54s", what: "BTN premier à parler, 54s", hero: 3, hand: "54s", acts: [] },
  { id: "pf-sb-k7s", what: "SB premier à parler, K7s", hero: 4, hand: "K7s", acts: [] },
  { id: "pf-bb-a5o-btn", what: "BB face à l'ouverture du BTN, A5o", hero: 5, hand: "A5o", acts: [A(3, "Raise", 2.5)] },
  { id: "pf-bb-t8s-btn", what: "BB face à l'ouverture du BTN, T8s", hero: 5, hand: "T8s", acts: [A(3, "Raise", 2.5)] },
  { id: "pf-bb-72o-btn", what: "BB face à l'ouverture du BTN, 72o", hero: 5, hand: "72o", acts: [A(3, "Raise", 2.5)] },
  { id: "pf-btn-aqo-utg", what: "BTN face à l'ouverture d'UTG, AQo", hero: 3, hand: "AQo", acts: [A(0, "Raise", 2.5)] },
  { id: "pf-btn-99-utg", what: "BTN face à l'ouverture d'UTG, 99", hero: 3, hand: "99", acts: [A(0, "Raise", 2.5)] },
  { id: "pf-sb-kjs-btn", what: "SB face à l'ouverture du BTN, KJs", hero: 4, hand: "KJs", acts: [A(3, "Raise", 2.5)] },
  { id: "pf-btn-ajs-3bet", what: "BTN ouvre, BB 3-bet : AJs", hero: 3, hand: "AJs", acts: [A(3, "Raise", 2.5), A(5, "Raise", 7.5)] },
  { id: "pf-btn-88-3bet", what: "BTN ouvre, BB 3-bet : 88", hero: 3, hand: "88", acts: [A(3, "Raise", 2.5), A(5, "Raise", 7.5)] },
  { id: "pf-bb-aks-4bet", what: "BB 3-bet, BTN 4-bet : AKs", hero: 5, hand: "AKs", acts: [A(3, "Raise", 2.5), A(5, "Raise", 7.5), A(3, "Raise", 17.2)] },
  { id: "pf-co-65s-3bet", what: "CO ouvre, BTN 3-bet : 65s", hero: 2, hand: "65s", acts: [A(2, "Raise", 2.5), A(3, "Raise", 7.5)] },
  { id: "pf-btn-utg3bb", what: "BTN face à une ouverture d'UTG à 3 bb, AJo", hero: 3, hand: "AJo", acts: [A(0, "Raise", 3)] },
];

const R = (text: string, board: string[]) => expandRange(parseRangeText(text), board);
const POST = (p: Partial<PostflopInput> & Pick<PostflopInput, "board" | "hole" | "heroRange" | "villainRange">): PostflopInput => ({
  street: p.board.length === 3 ? "Flop" : p.board.length === 4 ? "Turn" : "River",
  heroInPosition: true, heroIsPfr: true, potBB: 12, toCallBB: 0, heroStackBB: 100, opponents: 1,
  villainCheckedThisStreet: true, samples: 800, ...p,
});

function postflopCases(): { id: string; what: string; inp: PostflopInput }[] {
  const b1 = ["As", "Kd", "7c", "2h", "2s"], b2 = ["8d", "6c", "2h", "5s"], b3 = ["Jh", "8d", "4c", "2s", "3h"], b4 = ["Ks", "8d", "3c"];
  return [
    { id: "po-river-nuts", what: "River, AA sur A-K-7-2-2, gros avantage", inp: POST({ board: b1, hole: ["Ah", "Ac"], heroRange: R("AA, KK, 77, AK, QJs", b1), villainRange: R("KQo, KJo, QJo, 99, T9s", b1) }) },
    { id: "po-turn-donk", what: "Turn favorable au payeur, 74s", inp: POST({ board: b2, hole: ["7h", "4h"], heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, prevVillain: "bet", prevHero: "call", heroRange: R("76s, 74s, 43s, 97s, 88, 66", b2), villainRange: R("AA, KK, QQ, AK, AQs, KQs", b2) }) },
    { id: "po-river-block", what: "River hors de position, JT moyenne", inp: POST({ board: b3, hole: ["Jc", "Td"], street: "River", heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, heroRange: R("JT, J9, 98s, 77, 55, AQ", b3), villainRange: R("AJ, KJ, JJ, 88, AK, QT", b3) }) },
    { id: "po-flop-set-facing", what: "Flop, brelan de 8 face à une mise", inp: POST({ board: b4, hole: ["8h", "8c"], heroRange: R("88, KQ, AJ, 76s", b4), villainRange: R("KQ, KJ, AK, QJ, 99", b4), toCallBB: 4, potBB: 16, heroInPosition: false, villainCheckedThisStreet: false }) },
    { id: "po-river-probe-medium", what: "River, 77 moyenne, tu parles en premier après son check derrière", inp: POST({ board: b3, hole: ["7c", "7h"], street: "River", heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, prevVillain: "checkBack", prevHero: "checkFirst", heroRange: R("JT, J9, 98s, 77, 55, AQ", b3), villainRange: R("AJ, KJ, JJ, 88, AK, QT", b3) }) },
    { id: "po-river-value-oop-overbet", what: "River, AT value hors de position, gros avantage de mains fortes", inp: POST({ board: ["Jc", "Jd", "Kc", "Qd", "Ks"], hole: ["As", "Ts"], potBB: 27, heroStackBB: 85, heroInPosition: false, heroIsPfr: true, villainCheckedThisStreet: false, prevHero: "bet", prevVillain: "call", heroRange: R("KK, QQ, JJ, KJ, KQ, AK, AT, AQ, QJ", ["Jc", "Jd", "Kc", "Qd", "Ks"]), villainRange: R("T9s, 98s, 87s, 66, 55, 44, A5s, QT, JT", ["Jc", "Jd", "Kc", "Qd", "Ks", "As", "Ts"]) }) },
    { id: "po-river-straight-paired-facing", what: "River pairée, quinte face à une mise (fulls dans ta range)", inp: POST({ board: ["Qs", "8s", "Jh", "Qd", "Tc"], hole: ["9s", "9d"], potBB: 24, toCallBB: 10, heroStackBB: 85, villainCheckedThisStreet: false, heroRange: R("99, QJ, QT, JJ, TT, 88, AK, KQ, AQ, K9s", ["Qs", "8s", "Jh", "Qd", "Tc"]), villainRange: R("AQ, KQ, KJ, AJ, QT, JT, A8s, 87s", ["Qs", "8s", "Jh", "Qd", "Tc", "9s", "9d"]) }) },
    { id: "po-river-donk-value", what: "River, T9 value, donk bet après avoir payé la turn", inp: POST({ board: ["Qd", "8c", "2d", "3s", "Ts"], hole: ["Tc", "9c"], potBB: 14, heroStackBB: 90, heroInPosition: false, heroIsPfr: false, villainCheckedThisStreet: false, prevVillain: "bet", prevHero: "call", heroRange: R("T9s, T8s, 98s, 33, 22, TT, 88, Q8s, JTs, A2s, 54s", ["Qd", "8c", "2d", "3s", "Ts"]), villainRange: R("AK, AJ, KJ, 99, 77, 66, A5s, J9s", ["Qd", "8c", "2d", "3s", "Ts", "Tc", "9c"]) }) },
    { id: "po-flop-air-facing-rake", what: "Flop, air face à une mise, rake cash", inp: POST({ board: b4, hole: ["7h", "6h"], heroRange: R("88, KQ, AJ, 76s", b4), villainRange: R("KQ, KJ, AK, QJ, 99", b4), toCallBB: 4, potBB: 16, heroInPosition: false, villainCheckedThisStreet: false, rake: CASH_RAKE }) },
  ];
}

const pct = (x: number) => Math.round(x);

export function computeDecisions(g: SolverGame): Decision[] {
  const out: Decision[] = [];
  for (const c of PREFLOP) {
    const m = matchSpot(g, SIX, c.hero, c.acts, 100);
    const adv = m.spot ? adviceForHand(m.spot, c.hand) : null;
    const cov = coverageOf(m).level;
    out.push({ id: c.id, what: c.what, result: adv ? `${adv.map(a => `${a.act} ${pct(a.pct)}`).join(" / ")} · ${cov}` : `aucun conseil (${m.reason ?? "?"})` });
  }
  postflopCases().forEach((c, k) => {
    const a = withSeed(1000 + k, () => advisePostflop(c.inp));
    out.push({ id: c.id, what: c.what, result: `${a.verb} · ${a.label}${a.stats.required != null ? ` · requis ${a.stats.required} %` : ""}` });
  });
  const board = ["Ks", "Kd", "8h", "4c", "2s"];
  const eg = solveEndgame({
    street: "River", board, startPot: 10, stack: 50,
    ranges: [R("AK,65,QJs,88", board), R("QQ,JJ,AQ,K9s", board)],
    hero: 1, heroCards: ["Qh", "Qd"], path: [{ player: 0, kind: "bet", to: 7.5 }],
    maxIter: 300, timeBudgetMs: 1e9, targetPct: 0, rake: CASH_RAKE,
  });
  out.push({
    id: "eg-river-qq-facing", what: "Fin de main : QQ face à une mise de 75 % à la river (rake cash)",
    result: eg ? eg.actions.filter(a => a.freq >= 0.005).map(a => `${a.label} ${pct(a.freq * 100)}`).join(" / ") : "aucun résultat",
  });
  return out;
}

export function diffDecisions(cur: Decision[], ref: Decision[]): Drift {
  const byRef = new Map(ref.map(d => [d.id, d]));
  const byCur = new Map(cur.map(d => [d.id, d]));
  return {
    changed: cur.filter(d => byRef.has(d.id) && byRef.get(d.id)!.result !== d.result)
      .map(d => ({ id: d.id, what: d.what, before: byRef.get(d.id)!.result, after: d.result })),
    added: cur.filter(d => !byRef.has(d.id)),
    removed: ref.filter(d => !byCur.has(d.id)),
  };
}
