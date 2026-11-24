// Valeur EXACTE des fins de main à n joueurs (docs/DECISIONS.md D25). Deux adversaires (a, b) sont calculés par la
// méthode rapide du solveur à 3 joueurs (inclusion-exclusion sur les cartes, mains triées par force : O(52) par main) ;
// tous les autres adversaires sont énumérés main par main (toutes les combinaisons compatibles, pondérées par leurs
// probabilités d'arriver là). Pour chaque combinaison énumérée, ses cartes sont retirées de a, b et du joueur qui
// apprend, et sa meilleure main dans chaque pot change la part que peut gagner x (battu, à égalité, ou sans effet).
// Aucune approximation : testé contre l'énumération complète.
import type { TEnd } from "@/engines/multiway/betTree";
import { HandTable, indepCfvN } from "@/engines/multiway/nTerminal";

/** Un pot, vu du joueur i (qui peut le gagner) : a et b peuvent-ils le gagner, meilleure main énumérée et nombre d'ex aequo. */
export interface PotView { net: number; ea: boolean; eb: boolean; fb: number; fc: number }

/**
 * Valeur de chaque main x de i contre deux adversaires a et b (poids ra, rb), joueurs énumérés résumés dans `pots`.
 * base = gain fixe (mise rendue − mise). Généralise vriver3.cfvFast : la part de pot dépend de c, le nombre de joueurs
 * énumérés à égalité avec x (si l'un d'eux bat x, le pot ne rapporte rien à x).
 */
// tampons réutilisés d'un appel à l'autre (les tables 52×52 ne sont nettoyées que là où des mains ont été posées)
const BW = new Float64Array(6), BC = Array.from({ length: 6 }, () => new Float64Array(52)), BP = Array.from({ length: 6 }, () => new Float64Array(2704));
const BRq = new Float64Array(3), BRc = Array.from({ length: 3 }, () => new Float64Array(52));

export function pairCfv(h: HandTable, i: number, a: number, b: number, ra: Float64Array, rb: Float64Array, base: number, pots: PotView[]): Float64Array {
  const W = BW, C = BC, P = BP, Rq = BRq, Rc = BRc;
  W.fill(0); Rq.fill(0); C.forEach(x => x.fill(0)); Rc.forEach(x => x.fill(0));
  const a1 = h.c1[a], a2 = h.c2[a], b1 = h.c1[b], b2 = h.c2[b];
  // termes possibles (ta, tb) : 0 = plus faibles que x, 1 = pas plus forts, 2 = toutes les mains
  const keys = new Set<number>([2 * 3 + 2]);
  for (const pt of pots) {
    if (pt.ea && pt.eb) [0, 1, 3, 4].forEach(k => keys.add(k));
    else if (pt.ea) [2, 5].forEach(k => keys.add(k));
    else if (pt.eb) [6, 7].forEach(k => keys.add(k));
  }
  const K = [...keys], nT = K.length, TA = K.map(k => Math.floor(k / 3)), TB = K.map(k => k % 3);
  const V = K.map(() => new Float64Array(52)), U = K.map(() => new Float64Array(52)), D = new Float64Array(nT);
  let live = false;
  const put = (slot: number, c1: number, c2: number, w: number) => {
    W[slot] += w; C[slot][c1] += w; C[slot][c2] += w; P[slot][c1 * 52 + c2] += w; P[slot][c2 * 52 + c1] += w;
  };
  const putA = (t: number, y: number) => {
    const w = ra[y]; if (w === 0) return;
    const c1 = a1[y], c2 = a2[y];
    if (live) for (let k = 0; k < nT; k++) {
      if (TA[k] !== t) continue;
      const Cb = C[3 + TB[k]], Pb = P[3 + TB[k]], Vk = V[k], Uk = U[k];
      Vk[c1] += w * Cb[c2]; Vk[c2] += w * Cb[c1];
      for (let c = 0; c < 52; c++) Uk[c] += w * (Pb[c * 52 + c1] + Pb[c * 52 + c2]);
      D[k] += w * (Cb[c1] + Cb[c2]);
    }
    put(t, c1, c2, w);
    const q = w * P[5][c1 * 52 + c2];
    Rq[t] += q; Rc[t][c1] += q; Rc[t][c2] += q;
  };
  const putB = (t: number, z: number) => {
    const w = rb[z]; if (w === 0) return;
    const c1 = b1[z], c2 = b2[z];
    if (live) for (let k = 0; k < nT; k++) {
      if (TB[k] !== t) continue;
      const Ca = C[TA[k]], Pa = P[TA[k]], Vk = V[k], Uk = U[k];
      for (let c = 0; c < 52; c++) Vk[c] += w * (Pa[c * 52 + c1] + Pa[c * 52 + c2]);
      Uk[c1] += w * Ca[c2]; Uk[c2] += w * Ca[c1];
      D[k] += w * (Ca[c1] + Ca[c2]);
    }
    put(3 + t, c1, c2, w);
  };
  for (let z = 0; z < rb.length; z++) putB(2, z);
  for (let y = 0; y < ra.length; y++) putA(2, y);
  for (let k = 0; k < nT; k++) {
    if (TA[k] !== 2 || TB[k] !== 2) continue;
    const Ca = C[2], Pa = P[2], Cb = C[5], Pb = P[5], Vk = V[k], Uk = U[k];
    let d = 0;
    for (let c = 0; c < 52; c++) {
      d += Ca[c] * Cb[c];
      let sv = 0, su = 0;
      for (let e = 0; e < 52; e++) { sv += Pa[c * 52 + e] * Cb[e]; su += Pb[c * 52 + e] * Ca[e]; }
      Vk[c] = sv; Uk[c] = su;
    }
    D[k] = d;
  }
  live = true;

  // coefficients des termes pour une main de force v
  const coef = new Float64Array(nT), idx = new Map(K.map((k, j) => [k, j]));
  const add = (ta: number, tb: number, c: number) => { coef[idx.get(ta * 3 + tb)!] += c; };
  const coefsFor = (v: number) => {
    coef.fill(0); add(2, 2, base);
    for (const pt of pots) {
      if (pt.fb > v) continue;                                 // un joueur énuméré bat x : rien pour x dans ce pot
      const c = pt.fb === v ? pt.fc : 0, al = 1 / (1 + c), be = 1 / (2 + c), ga = 1 / (3 + c), n = pt.net;
      if (pt.ea && pt.eb) { add(0, 0, n * (al - 2 * be + ga)); add(1, 0, n * (be - ga)); add(0, 1, n * (be - ga)); add(1, 1, n * ga); }
      else if (pt.ea) { add(0, 2, n * (al - be)); add(1, 2, n * be); }
      else if (pt.eb) { add(2, 0, n * (al - be)); add(2, 1, n * be); }
      else add(2, 2, n * al);
    }
  };

  const out = new Float64Array(h.hands[i].length), x1s = h.c1[i], x2s = h.c2[i];
  const evalGroup = (xs: ArrayLike<number>, from: number, to: number) => {
    for (let g = from; g < to; g++) {
      const x = xs[g], x1 = x1s[x], x2 = x2s[x], kx = x1 * 52 + x2, o1 = x1 * 52, o2 = x2 * 52;
      let v = 0;
      for (let k = 0; k < nT; k++) {
        const cf = coef[k]; if (cf === 0) continue;
        const ta = TA[k], tb = TB[k], Ca = C[ta], Pa = P[ta], Cb = C[3 + tb], Pb = P[3 + tb], tr = ta < tb ? ta : tb, Vk = V[k], Uk = U[k];
        const pa = Pa[kx], pb = Pb[kx];
        const T1 = (W[ta] - Ca[x1] - Ca[x2] + pa) * (W[3 + tb] - Cb[x1] - Cb[x2] + pb);
        const T2 = D[k] - (Ca[x1] * Cb[x1] + Vk[x1]) - (Ca[x2] * Cb[x2] + Vk[x2]) + pa * (Cb[x1] + Cb[x2]);
        const T3 = Rq[tr] - Rc[tr][x1] - Rc[tr][x2] + pa * pb;
        let hs = 0;
        for (let d = 0; d < 52; d++) hs += (Pb[o1 + d] + Pb[o2 + d]) * (Pa[o1 + d] + Pa[o2 + d]);
        const t4 = Uk[x1] + Uk[x2] - pb * (Ca[x1] + Ca[x2]) - hs + 2 * pb * pa;
        v += cf * (T1 - T2 + T3 + t4);
      }
      out[x] = v;
    }
  };
  const oi = h.order[i], oa = h.order[a], ob = h.order[b], ri = h.ranks[i], rka = h.ranks[a], rkb = h.ranks[b];
  let aL = 0, aE = 0, bL = 0, bE = 0;
  for (let g = 0; g < oi.length;) {
    const v = ri[oi[g]];
    let e = g; while (e < oi.length && ri[oi[e]] === v) e++;
    while (aL < oa.length && rka[oa[aL]] < v) putA(0, oa[aL++]);
    while (aE < oa.length && rka[oa[aE]] <= v) putA(1, oa[aE++]);
    while (bL < ob.length && rkb[ob[bL]] < v) putB(0, ob[bL++]);
    while (bE < ob.length && rkb[ob[bE]] <= v) putB(1, ob[bE++]);
    coefsFor(v);
    evalGroup(oi, g, e);
    g = e;
  }
  for (let y = 0; y < ra.length; y++) for (let t = 0; t < 3; t++) { P[t][a1[y] * 52 + a2[y]] = 0; P[t][a2[y] * 52 + a1[y]] = 0; }
  for (let z = 0; z < rb.length; z++) for (let t = 3; t < 6; t++) { P[t][b1[z] * 52 + b2[z]] = 0; P[t][b2[z] * 52 + b1[z]] = 0; }
  return out;
}

/** Valeur exacte de chaque main du joueur i à cette fin de main (n joueurs). */
export function exactCfvFast(h: HandTable, e: TEnd, i: number, reach: Float64Array[]): Float64Array {
  const n = h.n, opp = Array.from({ length: n }, (_, p) => p).filter(p => p !== i);
  if (opp.length === 1) return indepCfvN(h, e, i, reach);   // un seul adversaire : la méthode « indépendants » est exacte
  const live = (p: number) => reach[p].reduce((t, w) => t + (w !== 0 ? 1 : 0), 0);
  // les deux plus grosses ranges sont calculées par la méthode rapide, les autres énumérées (les plus petites d'abord)
  const bySize = [...opp].sort((p, q) => live(q) - live(p));
  const [a, b] = bySize, Q = bySize.slice(2).sort((p, q) => live(p) - live(q));
  const pots = e.pots.filter(pt => pt.elig.includes(i));
  const base = e.refund[i] - e.invested[i], Ni = h.hands[i].length, out = new Float64Array(Ni);
  const used = new Uint8Array(52), chosen = new Int32Array(n).fill(-1);
  const ra = new Float64Array(reach[a].length), rb = new Float64Array(reach[b].length);

  const leaf = (w: number) => {
    // retire les cartes énumérées des ranges de a et b
    for (let y = 0; y < ra.length; y++) ra[y] = used[h.c1[a][y]] || used[h.c2[a][y]] ? 0 : reach[a][y];
    for (let z = 0; z < rb.length; z++) rb[z] = used[h.c1[b][z]] || used[h.c2[b][z]] ? 0 : reach[b][z];
    const views: PotView[] = pots.map(pt => {
      let fb = -1, fc = 0;
      for (const q of Q) {
        if (!pt.elig.includes(q)) continue;
        const r = h.ranks[q][chosen[q]];
        if (r > fb) { fb = r; fc = 1; } else if (r === fb) fc++;
      }
      return { net: pt.net, ea: pt.elig.includes(a), eb: pt.elig.includes(b), fb, fc };
    });
    const v = pairCfv(h, i, a, b, ra, rb, base, views);
    for (let x = 0; x < Ni; x++) if (!used[h.c1[i][x]] && !used[h.c2[i][x]]) out[x] += w * v[x];
  };
  const rec = (k: number, w: number) => {
    if (k === Q.length) { leaf(w); return; }
    const q = Q[k], r = reach[q];
    for (let y = 0; y < r.length; y++) {
      if (r[y] === 0) continue;
      const c1 = h.c1[q][y], c2 = h.c2[q][y];
      if (used[c1] || used[c2]) continue;
      used[c1] = 1; used[c2] = 1; chosen[q] = y;
      rec(k + 1, w * r[y]);
      used[c1] = 0; used[c2] = 0;
    }
  };
  rec(0, 1);
  return out;
}
