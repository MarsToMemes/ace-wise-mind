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

/**
 * Masse exacte d'une paire d'adversaires (p, q) pour chaque main x de i : Σ w_p(y)·w_q(z) sur les mains y, z sans carte
 * commune entre x, y et z. Inclusion-exclusion sur les cartes (même calcul que le terme A×A de vriver3), O(52) par main.
 */
export function pairMass(h: HandTable, i: number, p: number, q: number, reach: Float64Array[]): Float64Array {
  const Ca = new Float64Array(52), Cb = new Float64Array(52), Pa = new Float64Array(2704), Pb = new Float64Array(2704);
  let Wa = 0, Wb = 0;
  const fill = (pl: number, C: Float64Array, P: Float64Array) => {
    let W = 0; const r = reach[pl];
    for (let y = 0; y < r.length; y++) {
      const w = r[y]; if (w === 0) continue;
      const a = h.c1[pl][y], b = h.c2[pl][y];
      W += w; C[a] += w; C[b] += w; P[a * 52 + b] += w; P[b * 52 + a] += w;
    }
    return W;
  };
  Wa = fill(p, Ca, Pa); Wb = fill(q, Cb, Pb);
  let D = 0, Rq = 0;
  const V = new Float64Array(52), U = new Float64Array(52), Rc = new Float64Array(52);
  for (let c = 0; c < 52; c++) {
    D += Ca[c] * Cb[c];
    let sv = 0, su = 0;
    for (let d = 0; d < 52; d++) { sv += Pa[c * 52 + d] * Cb[d]; su += Pb[c * 52 + d] * Ca[d]; }
    V[c] = sv; U[c] = su;
  }
  // même combo chez les deux : Σ sur les paires de cartes (non ordonnées) de Pa·Pb
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
    const k = Pa[a * 52 + b] * Pb[a * 52 + b];
    if (k !== 0) { Rq += k; Rc[a] += k; Rc[b] += k; }
  }
  const out = new Float64Array(h.hands[i].length);
  for (let x = 0; x < out.length; x++) {
    const x1 = h.c1[i][x], x2 = h.c2[i][x], kx = x1 * 52 + x2, o1 = x1 * 52, o2 = x2 * 52, pa = Pa[kx], pb = Pb[kx];
    const T1 = (Wa - Ca[x1] - Ca[x2] + pa) * (Wb - Cb[x1] - Cb[x2] + pb);
    const T2 = D - (Ca[x1] * Cb[x1] + V[x1]) - (Ca[x2] * Cb[x2] + V[x2]) + pa * (Cb[x1] + Cb[x2]);
    const T3 = Rq - Rc[x1] - Rc[x2] + pa * pb;
    let hsum = 0;
    for (let d = 0; d < 52; d++) hsum += (Pb[o1 + d] + Pb[o2 + d]) * (Pa[o1 + d] + Pa[o2 + d]);
    const t4 = U[x1] + U[x2] - pb * (Ca[x1] + Ca[x2]) - hsum + 2 * pb * pa;
    out[x] = T1 - T2 + T3 + t4;
  }
  return out;
}

/**
 * Approximation « adversaires indépendants » : exacte à 2 joueurs, et dès que les adversaires ne peuvent pas partager de
 * carte. Avec `pairs` (piste A, D23) : la valeur est multipliée, pour chaque paire d'adversaires, par la part de leurs
 * mains sans carte commune (exacte pour la masse à 3 joueurs ; produit de ces parts au-delà).
 */
export function indepCfvN(h: HandTable, e: TEnd, i: number, reach: Float64Array[], pairs = false): Float64Array {
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
  if (pairs && m >= 2) {
    const mass = opp.map(p => {
      const C = new Float64Array(52), r = reach[p]; let W = 0;
      for (let y = 0; y < r.length; y++) { const w = r[y]; if (w === 0) continue; W += w; C[h.c1[p][y]] += w; C[h.c2[p][y]] += w; }
      return { W, C };
    });
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
      const d = pairMass(h, i, opp[a], opp[b], reach);
      for (let x = 0; x < out.length; x++) {
        const x1 = h.c1[i][x], x2 = h.c2[i][x], key = Math.min(x1, x2) * 52 + Math.max(x1, x2);
        const mx = (k: number) => {
          const p = opp[k], same = h.combo[p][key];
          return mass[k].W - mass[k].C[x1] - mass[k].C[x2] + (same >= 0 ? reach[p][same] : 0);
        };
        const ind = mx(a) * mx(b);
        out[x] = ind > 0 ? out[x] * (d[x] / ind) : 0;
      }
    }
  }
  return out;
}
