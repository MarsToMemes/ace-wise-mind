// Fast 5–7 card hand evaluator. Returns a single comparable number:
// higher = better hand, equal = tie. Pure function, no lookup tables.
//
// Encoding: category * 15^5 + tiebreak ranks (base 15).
// Categories: 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight,
//             5 flush, 6 full house, 7 quads, 8 straight flush.

const RV: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const B5 = 15 ** 5;

export const rankValue = (c: string) => RV[c[0]];

function enc(cat: number, ranks: number[]): number {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * 15 + (ranks[i] ?? 0);
  return cat * B5 + v;
}

// Highest straight top card from a rank-presence bitmask (bit r set if rank r present).
function straightTop(mask: number): number {
  for (let top = 14; top >= 6; top--) {
    let ok = true;
    for (let r = top; r > top - 5; r--) if (!(mask & (1 << r))) { ok = false; break; }
    if (ok) return top;
  }
  // wheel A-2-3-4-5
  const wheel = (1 << 14) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
  return (mask & wheel) === wheel ? 5 : 0;
}

export function rank7(cards: string[]): number {
  const counts = new Array(15).fill(0);
  const suitMasks: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  const suitCounts: Record<string, number> = { s: 0, h: 0, d: 0, c: 0 };
  let mask = 0;
  for (const c of cards) {
    const v = RV[c[0]];
    counts[v]++;
    mask |= 1 << v;
    suitMasks[c[1]] |= 1 << v;
    suitCounts[c[1]]++;
  }

  // Flush / straight flush
  for (const s of ["s", "h", "d", "c"]) {
    if (suitCounts[s] >= 5) {
      const sf = straightTop(suitMasks[s]);
      if (sf) return enc(8, [sf]);
      const top: number[] = [];
      for (let r = 14; r >= 2 && top.length < 5; r--) if (suitMasks[s] & (1 << r)) top.push(r);
      return enc(5, top);
    }
  }

  const quads: number[] = [], trips: number[] = [], pairs: number[] = [], singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  const kick = (exclude: number[], n: number) => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (counts[r] > 0 && !exclude.includes(r)) out.push(r);
    return out;
  };

  if (quads.length) return enc(7, [quads[0], ...kick([quads[0]], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return enc(6, [t, p]);
  }
  const st = straightTop(mask);
  if (st) return enc(4, [st]);
  if (trips.length) return enc(3, [trips[0], ...kick([trips[0]], 2)]);
  if (pairs.length >= 2) return enc(2, [pairs[0], pairs[1], ...kick([pairs[0], pairs[1]], 1)]);
  if (pairs.length === 1) return enc(1, [pairs[0], ...kick([pairs[0]], 3)]);
  return enc(0, kick([], 5));
}

export const categoryOf = (rank: number) => Math.floor(rank / B5);
