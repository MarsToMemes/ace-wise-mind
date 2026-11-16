// Équité préflop.
//  - EQ_VS_RANDOM : équité de chaque main contre une main au hasard, calculée par le site
//    (simulation de 40 000 donnes par main avec handEval7). Sert à classer les mains.
//  - equityVsRange : équité d'une main contre une range, par simulation à graine fixe.

import { rank7 } from "@/engines/handEval7";
import { RangeWeights, handCombos } from "@/engines/myRanges";
import { expandRange, FULL_DECK } from "@/engines/rangeVsRange";

export const EQ_VS_RANDOM: Record<string, number> = { "22": 50.2, "33": 53.5, "44": 57.2, "55": 60.1, "66": 63.4, "77": 66.5, "88": 69.2, "99": 71.8, "AA": 85.2, "AKs": 66.9, "AQs": 66.5, "AJs": 65.3, "ATs": 64.7, "A9s": 62.6, "A8s": 62.3, "A7s": 60.9, "A6s": 59.5, "A5s": 59.6, "A4s": 58.8, "A3s": 58.3, "A2s": 57, "AKo": 65.6, "KK": 82.3, "KQs": 63.8, "KJs": 62.5, "KTs": 62.1, "K9s": 60.5, "K8s": 58.2, "K7s": 57.5, "K6s": 56.6, "K5s": 55.7, "K4s": 55, "K3s": 54.2, "K2s": 53.3, "AQo": 64.8, "KQo": 61.4, "QQ": 79.9, "QJs": 60.1, "QTs": 59.8, "Q9s": 57.6, "Q8s": 56, "Q7s": 54.5, "Q6s": 52.9, "Q5s": 52.7, "Q4s": 52.2, "Q3s": 50.8, "Q2s": 50.4, "AJo": 63.4, "KJo": 60, "QJo": 58.2, "JJ": 77.2, "JTs": 57.7, "J9s": 55.3, "J8s": 54, "J7s": 52.4, "J6s": 50.4, "J5s": 50.4, "J4s": 49.3, "J3s": 48.3, "J2s": 47.1, "ATo": 62.6, "KTo": 60.1, "QTo": 57.6, "JTo": 54.8, "TT": 75.1, "T9s": 53.6, "T8s": 52.6, "T7s": 50.8, "T6s": 49.1, "T5s": 47.8, "T4s": 46.6, "T3s": 45.6, "T2s": 45, "A9o": 60.6, "K9o": 58.1, "Q9o": 55.3, "J9o": 53.1, "T9o": 51.5, "98s": 50.8, "97s": 49.4, "96s": 47.9, "95s": 45.6, "94s": 44.1, "93s": 43.5, "92s": 41.7, "A8o": 59.8, "K8o": 55.9, "Q8o": 53.6, "J8o": 51.4, "T8o": 49.8, "98o": 48, "87s": 47.9, "86s": 46.4, "85s": 44.5, "84s": 42.9, "83s": 41.1, "82s": 40.4, "A7o": 58.7, "K7o": 55.2, "Q7o": 52.2, "J7o": 49.6, "T7o": 47.4, "97o": 46.1, "87o": 45.5, "76s": 45.8, "75s": 43.4, "74s": 41.5, "73s": 40.1, "72s": 38.3, "A6o": 57.9, "K6o": 53.9, "Q6o": 50.9, "J6o": 47.8, "T6o": 45.5, "96o": 44.2, "86o": 43, "76o": 42.3, "65s": 43.2, "64s": 41.1, "63s": 39.8, "62s": 37.5, "A5o": 57.5, "K5o": 53.4, "Q5o": 50, "J5o": 47.2, "T5o": 44.5, "95o": 42.4, "85o": 41.4, "75o": 40.4, "65o": 39.8, "54s": 41.7, "53s": 39.6, "52s": 37.8, "A4o": 56.1, "K4o": 52.4, "Q4o": 48.9, "J4o": 46.3, "T4o": 43.7, "94o": 41.1, "84o": 39.1, "74o": 38.2, "64o": 37.8, "54o": 38.1, "43s": 38.5, "42s": 36.4, "A3o": 55.5, "K3o": 51, "Q3o": 48.2, "J3o": 45.4, "T3o": 42.7, "93o": 40.1, "83o": 37.5, "73o": 36.6, "63o": 36.4, "53o": 35.5, "43o": 35.3, "32s": 35.6, "A2o": 54.9, "K2o": 51, "Q2o": 47.5, "J2o": 44.1, "T2o": 41.6, "92o": 38.8, "82o": 36.8, "72o": 34.5, "62o": 34.3, "52o": 34, "42o": 33.3, "32o": 32.4 };

/** Mains triées de la plus forte à la plus faible (équité contre une main au hasard). */
export const HANDS_BY_STRENGTH: string[] = Object.keys(EQ_VS_RANDOM).sort((a, b) => EQ_VS_RANDOM[b] - EQ_VS_RANDOM[a]);

/** Range des `pct` % meilleures mains (en combos). */
export function topPercentRange(pct: number): RangeWeights {
  const target = (Math.max(0, Math.min(100, pct)) / 100) * 1326;
  const out: RangeWeights = {};
  let acc = 0;
  for (const h of HANDS_BY_STRENGTH) {
    if (acc >= target) break;
    out[h] = 1;
    acc += handCombos(h);
  }
  return out;
}

/**
 * Range de tapis estimée d'un joueur selon son tapis en big blinds
 * (plus il est court, plus il pousse large). Estimation, modifiable dans « Mes ranges ».
 */
export function estimatedJamPct(stackBB: number): number {
  const pts: [number, number][] = [[3, 75], [5, 65], [10, 42], [15, 30], [20, 22], [25, 17], [30, 14], [40, 10]];
  if (stackBB <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (stackBB <= x2) return Math.round(y1 + ((stackBB - x1) / (x2 - x1)) * (y2 - y1));
  }
  return pts[pts.length - 1][1];
}

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

/** Équité (0..1) de la main `hand` (ex. "63s") contre une range, préflop, cartes bloquées retirées. */
export function equityVsRange(hand: string, range: RangeWeights, opts: { samples?: number; seed?: number } = {}): number {
  const heroCombos = expandRange({ [hand]: 1 }, []);
  const rand = rng(opts.seed ?? 7);
  const n = opts.samples ?? 2000;
  let score = 0, done = 0;
  // pour chaque combo du héros, la range adverse sans ses cartes
  const villainByHero = heroCombos.map(h => {
    const v = expandRange(range, h.cards);
    let s = 0;
    const cum = v.map(c => (s += c.w));
    return { v, cum, total: s };
  });
  for (let i = 0; i < n; i++) {
    const k = i % heroCombos.length;
    const { v, cum, total } = villainByHero[k];
    if (!v.length || total <= 0) continue;
    const x = rand() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > x) hi = m; else lo = m + 1; }
    const hc = heroCombos[k].cards, vc = v[lo].cards;
    const used = new Set([...hc, ...vc]);
    const board: string[] = [];
    while (board.length < 5) {
      const c = FULL_DECK[Math.floor(rand() * 52)];
      if (!used.has(c)) { used.add(c); board.push(c); }
    }
    const a = rank7([...hc, ...board]), b = rank7([...vc, ...board]);
    score += a > b ? 1 : a === b ? 0.5 : 0;
    done++;
  }
  return done ? score / done : 0;
}
