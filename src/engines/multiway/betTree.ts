// Arbre d'enchères public de la river pour 2 à 6 joueurs (étape 3a). Mêmes règles que le solveur à 3 joueurs
// (vriver3.ts) et que le moteur de règles du site : plusieurs tailles de mise en fraction du pot, relance au pot, tapis,
// nombre maximal de mises et relances, réouverture suivie par joueur (règle A : un tapis court qui relance d'un montant
// trop petit ne rouvre pas la relance), pots annexes, mise rendue et rake au prorata (D4-D5).
// Jetons d'historique : p (check), b ou b{k} (mise), f (couché), c (payer), r (relance au pot), a (tapis).
import { computePots, type PotSeat as SeatState } from "@/core/pots";
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
  /** Ce que chaque joueur a mis avant la river (sinon : le pot à parts égales). Étape A1. */
  invested0?: number[];
  /** Argent laissé par chaque joueur couché avant la river (chacun à son niveau, pour les pots annexes). */
  dead?: number[];
  /** Actions déjà jouées sur la river (vraies tailles : `to` = total mis sur la street). */
  path?: PathAct[];
  /** Joueurs déjà couchés avant cette street (étape B1) : ils ne parlent pas, ne gagnent rien ; leur argent reste au pot. */
  out?: boolean[];
}

export interface PathAct { player: number; kind: "check" | "bet" | "raise" | "call" | "fold" | "allin"; to?: number }

export type TAct = { t: "act"; id: number; player: number; hist: string; actions: string[]; children: TNode[];
  /** Ce que chaque joueur a mis dans la main en arrivant ici (avant la river + river). */
  put: number[];
  /** Mis sur la river par chaque joueur en arrivant ici ; pot avant l'action ; total « à » de chaque action. */
  street: number[]; pot: number; tos: number[] };
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
export interface BetTree {
  root: TNode; acts: TAct[]; ends: TEnd[]; byHist: Map<string, TAct>;
  /** Nœud où l'on arrive après les actions déjà jouées (la décision à prendre), et l'erreur si le chemin est impossible. */
  pathNode?: TAct; pathError?: string;
}

const EPS = 1e-9;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildBetTree(s: BetTreeSpec): BetTree {
  const n = s.n, acts: TAct[] = [], ends: TEnd[] = [], byHist = new Map<string, TAct>(), path = s.path ?? [];
  let pathNode: TAct | undefined, pathError: string | undefined;
  type St = { contrib: number[]; folded: boolean[]; acted: Set<number>; bet: number; full: number; aggr: number; seenBet: number[]; seenFull: number[]; hist: string; k: number };
  const base = (p: number) => (s.invested0 ? s.invested0[p] : s.potBB / n);
  const rem = (st: St, p: number) => s.stacks[p] - st.contrib[p];
  const next = (st: St, from: number): number => {
    for (let k = 1; k <= n; k++) {
      const p = (from + k) % n;
      if (!st.folded[p] && rem(st, p) > EPS && (!st.acted.has(p) || st.contrib[p] < st.bet - EPS)) return p;
    }
    return -1;
  };
  const end = (st: St): TEnd => {
    if (st.k >= 0 && st.k <= path.length && !pathError) pathError = st.k === path.length ? "La street est close : plus de décision à prendre." : "La main se termine avant la fin des actions saisies.";
    const seats = [
      ...Array.from({ length: n }, (_, p) => ({ idx: p, investedBB: base(p) + st.contrib[p], folded: st.folded[p], allIn: rem(st, p) <= EPS })),
      ...(s.dead ?? []).map((d, k) => ({ idx: n + k, investedBB: d, folded: true, allIn: false })),
    ] as SeatState[];
    const pots = computePots(seats, false);
    const contested = pots.filter(x => x.kind !== "refund");
    const T = contested.reduce((t, x) => t + x.amount, 0);
    const rake = s.rake && T > 0 ? rakeOf(T, s.rake) : 0;
    const refund = new Array(n).fill(0);
    pots.filter(x => x.kind === "refund" && x.eligible[0] < n).forEach(x => { refund[x.eligible[0]] += x.amount; });
    const node: TEnd = {
      t: "end", eid: ends.length, refund, invested: seats.slice(0, n).map(x => x.investedBB), folded: [...st.folded],
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

    // actions déjà jouées : retrouver (ou ajouter avec sa vraie taille) l'action saisie
    let onPath = -1;
    if (st.k >= 0 && st.k < path.length) {
      const pa = path[st.k];
      if (pa.player !== p) { if (!pathError) pathError = `Action saisie pour le joueur ${pa.player + 1}, mais c'est au joueur ${p + 1} de parler.`; }
      else if (pa.kind === "check") onPath = options.findIndex(o => o.tok === "p");
      else if (pa.kind === "call") onPath = options.findIndex(o => o.tok === "c");
      else if (pa.kind === "fold") onPath = options.findIndex(o => o.tok === "f");
      else {
        const to = pa.kind === "allin" ? allInTo : Math.min(pa.to ?? 0, allInTo);
        if (to >= allInTo - EPS) onPath = options.findIndex(o => o.type === "agg" && o.to >= allInTo - EPS);
        if (onPath < 0) {
          let best = -1, gap = Infinity;
          options.forEach((o, j) => { if (o.type === "agg" && Math.abs(o.to - to) < gap) { gap = Math.abs(o.to - to); best = j; } });
          if (best >= 0 && gap <= 0.05 * pot) onPath = best;
          else { options.push({ tok: `k${r1(to)}`, to: r1(to), type: "agg" }); onPath = options.length - 1; }
        }
      }
      if (onPath < 0 && !pathError) pathError = `Action « ${pa.kind} » impossible à ce moment de la main.`;
    }

    const node: TAct = { t: "act", id: acts.length, player: p, hist: st.hist, actions: options.map(o => o.tok), children: [],
      put: Array.from({ length: n }, (_, q) => base(q) + st.contrib[q]), street: [...st.contrib], pot, tos: options.map(o => o.to) };
    acts.push(node);
    byHist.set(`${p}|${st.hist}`, node);
    if (st.k === path.length && !pathError) pathNode = node;
    node.children = options.map((o, j) => {
      const nx: St = { ...st, contrib: [...st.contrib], folded: [...st.folded], acted: new Set(st.acted), seenBet: [...st.seenBet], seenFull: [...st.seenFull], hist: st.hist + o.tok,
        k: st.k >= 0 && j === onPath ? st.k + 1 : -1 };
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
  const firstToAct = () => { for (let p = 0; p < n; p++) if (s.stacks[p] > EPS && !s.out?.[p]) return p; return -1; };
  const root = go({
    contrib: new Array(n).fill(0), folded: s.out ? [...s.out] : new Array(n).fill(false), acted: new Set(), bet: 0, full: 1, aggr: 0,
    seenBet: new Array(n).fill(-1), seenFull: new Array(n).fill(1), hist: "", k: 0,
  }, firstToAct());
  return { root, acts, ends, byHist, pathNode, pathError };
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
