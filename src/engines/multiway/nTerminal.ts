// Valeur des fins de main à n joueurs (étape 3b, docs/DECISIONS.md D23). Valeur contrefactuelle de chaque main x du
// joueur i : somme, sur les mains des adversaires, du produit de leurs probabilités d'arriver là, fois le gain de i.
//  - exactCfvN : toutes les combinaisons compatibles (aucune carte partagée entre qui que ce soit). Référence, lente.
//  - indepCfvN : les cartes de x (et du board) sont retirées des ranges adverses, mais les adversaires sont supposés
//    indépendants entre eux. Rapide : pour chaque adversaire, masse de ses mains plus faibles / égales / toutes
//    (inclusion-exclusion sur les 2 cartes de x), puis part de pot gagnée via le polynôme Π (L_p + E_p·z).
import { rank7 } from "@/engines/handEval7";
import type { TEnd } from "@/engines/multiway/betTree";

const cardIndex = (c: string) => "23456789TJQKA".indexOf(c[0]) * 4 + "cdhs".indexOf(c[1]);

/** Mains de chaque joueur (hors cartes du board), avec index des cartes, force et ordre par force croissante. */
export class HandTable {
  readonly hands: [string, string][][];
  readonly c1: Int32Array[]; readonly c2: Int32Array[];
  readonly ranks: Int32Array[];
  readonly order: Int32Array[];
  /** Pour chaque joueur, index de la main formée par la paire de cartes (k = petite×52 + grande), ou −1. */
  readonly combo: Int32Array[];
  constructor(readonly board: string[], ranges: [string, string][][]) {
    const b = new Set(board);
    this.hands = ranges.map(r => r.filter(h => !b.has(h[0]) && !b.has(h[1])));
    this.c1 = this.hands.map(r => Int32Array.from(r, h => cardIndex(h[0])));
    this.c2 = this.hands.map(r => Int32Array.from(r, h => cardIndex(h[1])));
    this.ranks = this.hands.map(r => Int32Array.from(r, h => rank7([...h, ...board])));
    this.order = this.ranks.map(rk => Int32Array.from(rk.keys()).sort((x, y) => rk[x] - rk[y]));
    this.combo = this.hands.map((_, p) => {
      const m = new Int32Array(52 * 52).fill(-1);
      for (let y = 0; y < this.hands[p].length; y++) {
        const a = this.c1[p][y], c = this.c2[p][y];
        m[Math.min(a, c) * 52 + Math.max(a, c)] = y;
      }
      return m;
    });
  }
  get n() { return this.hands.length; }
}

/** Gain net du joueur i, forces de main connues (plus grand = meilleur). */
function payoff(e: TEnd, i: number, rk: number[]): number {
  let v = e.refund[i] - e.invested[i];
  for (const pot of e.pots) {
    if (!pot.elig.includes(i)) continue;
    let best = -Infinity, count = 0;
    for (const p of pot.elig) { const r = rk[p]; if (r > best) { best = r; count = 1; } else if (r === best) count++; }
    if (rk[i] === best) v += pot.net / count;
  }
  return v;
}

/** Référence exacte : toutes les combinaisons de mains adverses sans carte partagée. Coût O(N^(n−1)) par main. */
export function exactCfvN(h: HandTable, e: TEnd, i: number, reach: Float64Array[]): Float64Array {
  const n = h.n, opp = Array.from({ length: n }, (_, p) => p).filter(p => p !== i);
  const out = new Float64Array(h.hands[i].length), used = new Uint8Array(52), rk = new Array(n).fill(0);
  for (let x = 0; x < out.length; x++) {
    used[h.c1[i][x]] = 1; used[h.c2[i][x]] = 1; rk[i] = h.ranks[i][x];
    let s = 0;
    const rec = (k: number, w: number) => {
      if (k === opp.length) { s += w * payoff(e, i, rk); return; }
      const p = opp[k], r = reach[p];
      for (let y = 0; y < r.length; y++) {
        if (r[y] === 0) continue;
        const a = h.c1[p][y], b = h.c2[p][y];
        if (used[a] || used[b]) continue;
        used[a] = 1; used[b] = 1; rk[p] = h.ranks[p][y];
        rec(k + 1, w * r[y]);
        used[a] = 0; used[b] = 0;
      }
    };
    rec(0, 1);
    out[x] = s;
    used[h.c1[i][x]] = 0; used[h.c2[i][x]] = 0;
  }
  return out;
}

/** Approximation « adversaires indépendants » : exacte à 2 joueurs, et dès que les adversaires ne peuvent pas partager de carte. */
export function indepCfvN(h: HandTable, e: TEnd, i: number, reach: Float64Array[]): Float64Array {
  const n = h.n, opp = Array.from({ length: n }, (_, p) => p).filter(p => p !== i), m = opp.length;
  // par adversaire : total (W, C), plus faibles strictement (lw, lc), pas plus forts (ew, ec)
  const W = new Float64Array(m), C = opp.map(() => new Float64Array(52));
  const lw = new Float64Array(m), lc = opp.map(() => new Float64Array(52));
  const ew = new Float64Array(m), ec = opp.map(() => new Float64Array(52));
  opp.forEach((p, k) => {
    const r = reach[p];
    for (let y = 0; y < r.length; y++) { const w = r[y]; if (w === 0) continue; W[k] += w; C[k][h.c1[p][y]] += w; C[k][h.c2[p][y]] += w; }
  });
  // pour chaque pot où i peut gagner : quels adversaires y sont éligibles
  const pots = e.pots.filter(pt => pt.elig.includes(i)).map(pt => ({ net: pt.net, elig: opp.map(p => pt.elig.includes(p)) }));
  const base = e.refund[i] - e.invested[i];
  const xs = h.order[i], ri = h.ranks[i], out = new Float64Array(xs.length);
  const ptrL = new Int32Array(m), ptrE = new Int32Array(m);
  const M = new Float64Array(m), L = new Float64Array(m), E = new Float64Array(m), poly = new Float64Array(m + 1);
  for (let g = 0; g < xs.length;) {
    const v = ri[xs[g]];
    let gEnd = g; while (gEnd < xs.length && ri[xs[gEnd]] === v) gEnd++;
    opp.forEach((p, k) => {
      const o = h.order[p], rp = h.ranks[p], r = reach[p];
      while (ptrL[k] < o.length && rp[o[ptrL[k]]] < v) { const y = o[ptrL[k]++], w = r[y]; lw[k] += w; lc[k][h.c1[p][y]] += w; lc[k][h.c2[p][y]] += w; }
      while (ptrE[k] < o.length && rp[o[ptrE[k]]] <= v) { const y = o[ptrE[k]++], w = r[y]; ew[k] += w; ec[k][h.c1[p][y]] += w; ec[k][h.c2[p][y]] += w; }
    });
    for (let q = g; q < gEnd; q++) {
      const x = xs[q], x1 = h.c1[i][x], x2 = h.c2[i][x], key = Math.min(x1, x2) * 52 + Math.max(x1, x2);
      for (let k = 0; k < m; k++) {
        const p = opp[k], same = h.combo[p][key], ws = same >= 0 ? reach[p][same] : 0; // l'adversaire avec exactement x
        M[k] = W[k] - C[k][x1] - C[k][x2] + ws;
        L[k] = lw[k] - lc[k][x1] - lc[k][x2];               // x a la force v : la même main n'est pas « plus faible »
        E[k] = ew[k] - ec[k][x1] - ec[k][x2] + ws - L[k];
      }
      let all = 1; for (let k = 0; k < m; k++) all *= M[k];
      let val = base * all;
      for (const pt of pots) {
        // part espérée : Σ_T Π_{p∈T} E_p Π_{p∉T} L_p / (1+|T|) sur les éligibles, × masse totale des non-éligibles
        poly.fill(0); poly[0] = 1; let deg = 0, other = 1;
        for (let k = 0; k < m; k++) {
          if (!pt.elig[k]) { other *= M[k]; continue; }
          for (let d = deg + 1; d >= 1; d--) poly[d] = poly[d] * L[k] + poly[d - 1] * E[k];
          poly[0] *= L[k]; deg++;
        }
        let share = 0; for (let d = 0; d <= deg; d++) share += poly[d] / (d + 1);
        val += pt.net * other * share;
      }
      out[x] = val;
    }
    g = gEnd;
  }
  return out;
}
