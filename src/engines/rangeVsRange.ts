// Range contre range sur un flop donné.
//  - équité du relanceur : simulation Monte-Carlo à graine fixe (turn + river tirées) ;
//  - part de « mains fortes » : calcul exact, une main est forte si elle vaut au moins
//    deux catégories de plus que le board seul (ex. deux paires sur board non pairé,
//    brelan sur board pairé, full sur brelan au board).

import { rank7, categoryOf } from "@/engines/handEval7";
import { RangeWeights } from "@/engines/myRanges";

const RANKS = "AKQJT98765432";
const SUITS = "shdc";
export const FULL_DECK: string[] = [...RANKS].flatMap(r => [...SUITS].map(s => r + s));

export interface Combo { cards: [string, string]; w: number; }

export function expandRange(weights: RangeWeights, dead: string[]): Combo[] {
  const deadSet = new Set(dead);
  const out: Combo[] = [];
  for (const [hand, w] of Object.entries(weights)) {
    if (!(w > 0)) continue;
    const a = hand[0], b = hand[1];
    const pairs: [string, string][] = [];
    if (hand.length === 2) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([a + SUITS[i], a + SUITS[j]]);
    } else if (hand.endsWith("s")) {
      for (const s of SUITS) pairs.push([a + s, b + s]);
    } else {
      for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) pairs.push([a + s1, b + s2]);
    }
    for (const p of pairs) if (!deadSet.has(p[0]) && !deadSet.has(p[1])) out.push({ cards: p, w });
  }
  return out;
}

// mulberry32 — petit générateur pseudo-aléatoire reproductible
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function sampler(combos: Combo[], rand: () => number) {
  const cum: number[] = [];
  let s = 0;
  for (const c of combos) { s += c.w; cum.push(s); }
  return () => {
    const x = rand() * s;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > x) hi = m; else lo = m + 1; }
    return combos[lo];
  };
}

function strongPct(combos: Combo[], board: string[]): number {
  const boardCat = categoryOf(rank7(board));
  let tot = 0, strong = 0;
  for (const c of combos) {
    tot += c.w;
    if (categoryOf(rank7([...c.cards, ...board])) >= boardCat + 2) strong += c.w;
  }
  return tot > 0 ? Math.round((strong / tot) * 1000) / 10 : 0;
}

export interface BoardAdvantage {
  /** Équité moyenne du relanceur (0..1). */
  pfrEquity: number;
  /** % (pondéré) de mains fortes dans chaque range. */
  pfrStrongPct: number;
  callerStrongPct: number;
  pfrCombos: number;
  callerCombos: number;
  samples: number;
}

export function boardAdvantage(
  pfr: RangeWeights,
  caller: RangeWeights,
  board: string[],
  opts: { samples?: number; seed?: number } = {},
): BoardAdvantage {
  const flop = board.slice(0, 3);
  const P = expandRange(pfr, flop);
  const C = expandRange(caller, flop);
  const sum = (x: Combo[]) => Math.round(x.reduce((s, c) => s + c.w, 0) * 10) / 10;
  const base = { pfrStrongPct: strongPct(P, flop), callerStrongPct: strongPct(C, flop), pfrCombos: sum(P), callerCombos: sum(C) };
  if (!P.length || !C.length) return { pfrEquity: 0.5, samples: 0, ...base };

  const rand = rng(opts.seed ?? 42);
  const pickP = sampler(P, rand), pickC = sampler(C, rand);
  const n = opts.samples ?? 4000;
  let score = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const p = pickP();
    let c = pickC();
    let tries = 0;
    while ((c.cards[0] === p.cards[0] || c.cards[0] === p.cards[1] || c.cards[1] === p.cards[0] || c.cards[1] === p.cards[1]) && tries++ < 20) c = pickC();
    if (tries > 20) continue;
    const used = new Set([...flop, ...p.cards, ...c.cards]);
    const run: string[] = [];
    while (run.length < 2) {
      const card = FULL_DECK[Math.floor(rand() * 52)];
      if (!used.has(card)) { used.add(card); run.push(card); }
    }
    const rp = rank7([...p.cards, ...flop, ...run]);
    const rc = rank7([...c.cards, ...flop, ...run]);
    score += rp > rc ? 1 : rp === rc ? 0.5 : 0;
    done++;
  }
  return { pfrEquity: done ? score / done : 0.5, samples: done, ...base };
}
