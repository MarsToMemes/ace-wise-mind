// Arbre d'enchères public de la river pour 2 à 6 joueurs (étape 3a). Mêmes règles que le solveur à 3 joueurs
// (vriver3.ts) et que le moteur de règles du site : plusieurs tailles de mise en fraction du pot, relance au pot, tapis,
// nombre maximal de mises et relances, réouverture suivie par joueur (règle A : un tapis court qui relance d'un montant
// trop petit ne rouvre pas la relance), pots annexes, mise rendue et rake au prorata (D4-D5).
// Jetons d'historique : p (check), b ou b{k} (mise), f (couché), c (payer), r (relance au pot), a (tapis).
import { computePots, type SeatState } from "@/core/handState";
import { rakeOf, type RakeRule } from "@/core/rake";

export interface BetTreeSpec {
  /** Nombre de joueurs encore dans le coup, dans l'ordre de parole (0 parle en premier). */
  n: number;
  potBB: number;
  /** Tapis restant de chaque joueur au début de la river. */
  stacks: number[];
  bets: number[];
  raise: boolean;
  allin: boolean;
  maxAggr: number;
  rake: RakeRule | null;
}

export type TAct = { t: "act"; id: number; player: number; hist: string; actions: string[]; children: TNode[] };
export type TEnd = {
  t: "end"; eid: number;
  /** Mise rendue à chaque joueur (part non payée par les autres). */
  refund: number[];
  /** Tout ce que chaque joueur a mis dans la main (part du pot d'avant la river + river). */
  invested: number[];
  folded: boolean[];
  /** Pots disputés, rake déduit au prorata, et joueurs qui peuvent les gagner. */
  pots: { net: number; elig: number[] }[];
};
export type TNode = TAct | TEnd;
export interface BetTree { root: TNode; acts: TAct[]; ends: TEnd[]; byHist: Map<string, TAct> }

const EPS = 1e-9;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildBetTree(s: BetTreeSpec): BetTree {
  const n = s.n, acts: TAct[] = [], ends: TEnd[] = [], byHist = new Map<string, TAct>();
  type St = { contrib: number[]; folded: boolean[]; acted: Set<number>; bet: number; full: number; aggr: number; seenBet: number[]; seenFull: number[]; hist: string };
  const rem = (st: St, p: number) => s.stacks[p] - st.contrib[p];
  const next = (st: St, from: number): number => {
    for (let k = 1; k <= n; k++) {
      const p = (from + k) % n;
      if (!st.folded[p] && rem(st, p) > EPS && (!st.acted.has(p) || st.contrib[p] < st.bet - EPS)) return p;
    }
    return -1;
  };
  const end = (st: St): TEnd => {
    const seats = Array.from({ length: n }, (_, p) => ({
      idx: p, investedBB: s.potBB / n + st.contrib[p], folded: st.folded[p], allIn: rem(st, p) <= EPS,
    })) as SeatState[];
    const pots = computePots(seats, false);
    const contested = pots.filter(x => x.kind !== "refund");
    const T = contested.reduce((t, x) => t + x.amount, 0);
    const rake = s.rake && T > 0 ? rakeOf(T, s.rake) : 0;
    const refund = new Array(n).fill(0);
    pots.filter(x => x.kind === "refund").forEach(x => { refund[x.eligible[0]] += x.amount; });
    const node: TEnd = {
      t: "end", eid: ends.length, refund, invested: seats.map(x => x.investedBB), folded: [...st.folded],
      pots: contested.map(x => ({ net: x.amount - (T > 0 ? (rake * x.amount) / T : 0), elig: x.eligible })),
    };
    ends.push(node);
    return node;
  };
  const go = (st: St, p: number): TNode => {
    if (p < 0 || st.folded.filter(f => !f).length <= 1) return end(st);
    const pot = s.potBB + st.contrib.reduce((a, b) => a + b, 0);
    const r = rem(st, p), toCall = Math.max(0, st.bet - st.contrib[p]);
    const options: { tok: string; to: number; type: "f" | "x" | "c" | "agg" }[] = [];
    const canAgg = st.aggr < s.maxAggr && r > toCall + EPS &&
      (st.seenBet[p] < 0 || st.bet - st.seenBet[p] >= st.seenFull[p] - EPS);
    const allInTo = st.contrib[p] + r;
    if (toCall <= EPS) {
      options.push({ tok: "p", to: st.contrib[p], type: "x" });
      if (canAgg) s.bets.forEach((f, k) => {
        const to = Math.min(r1(f * pot), allInTo);
        if (to >= allInTo - EPS && s.allin) return;              // couvert par le tapis
        if (!options.some(o => Math.abs(o.to - to) < EPS)) options.push({ tok: s.bets.length === 1 ? "b" : `b${k}`, to, type: "agg" });
      });
    } else {
      options.push({ tok: "f", to: st.contrib[p], type: "f" });
      options.push({ tok: "c", to: Math.min(st.bet, allInTo), type: "c" });
      if (canAgg && s.raise) {
        const to = Math.min(st.bet + pot + toCall, allInTo);
        if (!(to >= allInTo - EPS && s.allin)) options.push({ tok: "r", to, type: "agg" });
      }
    }
    if (canAgg && s.allin && allInTo > st.bet + EPS) options.push({ tok: "a", to: allInTo, type: "agg" });

    const node: TAct = { t: "act", id: acts.length, player: p, hist: st.hist, actions: options.map(o => o.tok), children: [] };
    acts.push(node);
    byHist.set(`${p}|${st.hist}`, node);
    node.children = options.map(o => {
      const nx: St = { ...st, contrib: [...st.contrib], folded: [...st.folded], acted: new Set(st.acted), seenBet: [...st.seenBet], seenFull: [...st.seenFull], hist: st.hist + o.tok };
      if (o.type === "f") { nx.folded[p] = true; nx.acted.add(p); return go(nx, next(nx, p)); }
      nx.contrib[p] = o.to;
      if (o.type === "agg") {
        const inc = o.to - st.bet;
        if (inc >= st.full - EPS || st.bet <= EPS) nx.full = st.bet <= EPS ? o.to : inc;
        nx.bet = o.to; nx.aggr = st.aggr + 1; nx.acted = new Set([p]);
      } else nx.acted.add(p);
      nx.seenBet[p] = nx.bet; nx.seenFull[p] = nx.full;
      return go(nx, next(nx, p));
    });
    return node;
  };
  const root = go({
    contrib: new Array(n).fill(0), folded: new Array(n).fill(false), acted: new Set(), bet: 0, full: 1, aggr: 0,
    seenBet: new Array(n).fill(-1), seenFull: new Array(n).fill(1), hist: "",
  }, 0);
  return { root, acts, ends, byHist };
}

/** Gain net du joueur i à cette fin de main, connaissant la force de la main de chaque joueur (plus grand = meilleur). */
export function endPayoff(e: TEnd, i: number, ranks: number[]): number {
  let v = e.refund[i] - e.invested[i];
  for (const pot of e.pots) {
    if (!pot.elig.includes(i)) continue;
    let best = -Infinity, count = 0;
    for (const p of pot.elig) { const r = ranks[p]; if (r > best) { best = r; count = 1; } else if (r === best) count++; }
    if (ranks[i] === best) v += pot.net / count;
  }
  return v;
}
