// A4 — Équité multiway sans biais. Pour chaque cas : équité exacte (énumération, tests-solveur/oracle/equite.ts), puis
// l'équité du site (handEquityMulti, utilisée par le conseiller postflop) sur K graines, dans plusieurs ordres
// d'adversaires. Rapporte : moyenne, erreur d'échantillonnage (écart-type des graines / √K), écart à la valeur exacte et
// en nombre d'erreurs types (z), écart entre ordres. Pour le moteur de base (evaluateHandVsRange), dont les ranges sont
// construites à l'intérieur, on lui donne directement les mêmes mains adverses (entrée `combos`, à poids égal).
import { handEquityMulti } from "@/engines/postflopRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { topPercentRange } from "@/engines/preflopEquity";
import { evaluateHandVsRange } from "@/lib/handVsRange";
import { rank7 } from "@/engines/handEval7";
import { exactEquity, type ComboW } from "../oracle/equite";
import { best } from "../oracle/evaluateur";
import { rng, DECK } from "../outils/hasard";

export interface Mesure { ordre: string; moyenne: number; se: number; ecart: number; z: number }
export interface CasEquite { id: string; titre: string; joueurs: number; exacte: number; tuples: number; boards: number; mesures: Mesure[]; ecartOrdres: number; seOrdres: number; ok: boolean }
export interface ResultatA4 {
  graines: number; tirages: number; cas: CasEquite[]; casBase: CasEquite[];
  evaluateurs: { nom: string; mains: number; desaccords: number; exemples: string[] }[];
}

const permute = <T>(xs: T[], order: number[]) => order.map(i => xs[i]);

function mesurer(hole: string[], ranges: ComboW[][], board: string[], order: number[], K: number, N: number, exacte: number): Mesure {
  const xs: number[] = [];
  for (let k = 0; k < K; k++) xs.push(handEquityMulti(hole, permute(ranges, order), board, N, 1000 + 7919 * k));
  const m = xs.reduce((a, b) => a + b, 0) / K;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (K - 1));
  const se = sd / Math.sqrt(K);
  return { ordre: order.map(i => String.fromCharCode(65 + i)).join(""), moyenne: m, se, ecart: m - exacte, z: se > 0 ? (m - exacte) / se : (m === exacte ? 0 : Infinity) };
}

/** Moteur de base (evaluateHandVsRange), mains adverses données directement : ses mains sont à poids égal. */
function mesurerBase(hole: string[], ranges: ComboW[][], board: string[], order: number[], K: number, N: number, exacte: number): Mesure {
  const combos = permute(ranges, order).map(r => r.map(c => c.cards));
  const xs: number[] = [];
  for (let k = 0; k < K; k++) xs.push((evaluateHandVsRange({ hole, board, opponentRanges: [], combos, sims: N })?.equity_percentage ?? NaN) / 100);
  const m = xs.reduce((a, b) => a + b, 0) / K;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (K - 1));
  const se = sd / Math.sqrt(K);
  // equity_percentage est arrondi à 0,1 point : l'erreur type ne descend pas sous l'arrondi
  const seEff = Math.max(se, 0.0005 / Math.sqrt(K));
  return { ordre: order.map(i => String.fromCharCode(65 + i)).join(""), moyenne: m, se: seEff, ecart: m - exacte, z: (m - exacte) / seEff };
}

function casBase(id: string, titre: string, hole: string[], ranges: ComboW[][], board: string[], orders: number[][], K: number, N: number): CasEquite {
  const unit = ranges.map(r => r.map(c => ({ cards: c.cards, w: 1 })));
  const ex = exactEquity(hole, unit, board);
  const uniq = orders.filter((o, i) => orders.findIndex(x => x.join() === o.join()) === i);
  const mesures = uniq.map(o => mesurerBase(hole, unit, board, o, K, N, ex.equity));
  const ms = mesures.map(x => x.moyenne);
  const ecartOrdres = Math.max(...ms) - Math.min(...ms);
  const seOrdres = Math.sqrt(2) * Math.max(...mesures.map(x => x.se));
  const ok = mesures.every(x => Math.abs(x.z) < 4) && ecartOrdres < 4 * seOrdres + 1e-9;
  return { id, titre, joueurs: ranges.length + 1, exacte: ex.equity, tuples: ex.tuples, boards: ex.boards, mesures, ecartOrdres, seOrdres, ok };
}

function cas(id: string, titre: string, hole: string[], ranges: ComboW[][], board: string[], orders: number[][], K: number, N: number): CasEquite {
  const ex = exactEquity(hole, ranges, board);
  const uniq = orders.filter((o, i) => orders.findIndex(x => x.join() === o.join()) === i);
  const mesures = uniq.map(o => mesurer(hole, ranges, board, o, K, N, ex.equity));
  const ms = mesures.map(x => x.moyenne);
  const ecartOrdres = Math.max(...ms) - Math.min(...ms);
  const seOrdres = Math.sqrt(2) * Math.max(...mesures.map(x => x.se));
  // pas de biais détectable : chaque ordre à moins de 4 erreurs types de l'exacte, et les ordres d'accord entre eux
  const ok = mesures.every(x => Math.abs(x.z) < 4) && ecartOrdres < 4 * seOrdres + 1e-9;
  return { id, titre, joueurs: ranges.length + 1, exacte: ex.equity, tuples: ex.tuples, boards: ex.boards, mesures, ecartOrdres, seOrdres, ok };
}

/** Cas tiré au hasard : ranges de 2 à 4 mains prises dans un paquet commun (2 cartes par adversaire + 4) pour que
 *  les adversaires se gênent ; on garde le premier tirage où au moins 3 combinaisons existent et où ton équité exacte
 *  est entre 5 % et 95 % (sinon le cas ne dit rien). */
function casAleatoire(seed: number, opps: number, boardLen: 4 | 5) {
  for (let essai = 0; ; essai++) {
    const r = rng(seed * 1000 + essai);
    const d = r.shuffle(DECK);
    const hole = d.slice(0, 2), board = d.slice(2, 2 + boardLen), pool = d.slice(2 + boardLen, 2 + boardLen + 2 * opps + 4);
    const pairs: [string, string][] = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push([pool[i], pool[j]]);
    const ranges: ComboW[][] = Array.from({ length: opps }, () =>
      r.shuffle(pairs).slice(0, r.int(2, 4)).map(cards => ({ cards, w: Math.round((0.2 + 0.8 * r.next()) * 100) / 100 })));
    const ex = exactEquity(hole, ranges, board);
    if (ex.tuples >= 3 && ex.equity > 0.05 && ex.equity < 0.95) return { hole, board, ranges, essai };
  }
}

export function runA4(o: { graines?: number; tirages?: number; aleatoires?: number } = {}): ResultatA4 {
  const K = o.graines ?? 20, N = o.tirages ?? 4000;
  const out: CasEquite[] = [];
  const sources = new Map<string, { hole: string[]; ranges: ComboW[][]; board: string[]; orders: number[][] }>();
  const add = (id: string, titre: string, hole: string[], ranges: ComboW[][], board: string[], orders: number[][]) => {
    sources.set(id, { hole, ranges, board, orders });
    out.push(cas(id, titre, hole, ranges, board, orders, K, N));
  };
  // cas connu : 66,67 % exact à 3 joueurs (KsQs de A et KdKs de B se gênent : 3 couples possibles, tu en gagnes 2)
  const A: ComboW[] = [{ cards: ["Ks", "Qs"], w: 1 }, { cards: ["3c", "3d"], w: 1 }];
  const B: ComboW[] = [{ cards: ["Kd", "Ks"], w: 1 }, { cards: ["4h", "4s"], w: 1 }];
  add("E1", "Cas connu, 3 joueurs : A♥A♦ sur 2♣7♦9♥J♠K♣, A = {K♠Q♠, 3♣3♦}, B = {K♦K♠, 4♥4♠}",
    ["Ah", "Ad"], [A, B], ["2c", "7d", "9h", "Js", "Kc"], [[0, 1], [1, 0]]);
  // cas tirés au hasard : 3 à 6 joueurs, turn ou river
  const n = o.aleatoires ?? 12;
  for (let i = 0; i < n; i++) {
    const opps = 2 + (i % 4), boardLen = (i % 2 ? 4 : 5) as 4 | 5;
    const c = casAleatoire(20261125 + i, opps, boardLen);
    const id = Array.from({ length: opps }, (_, k) => k);
    const rev = [...id].reverse();
    const rot = [...id.slice(1), id[0]];
    add(`E${i + 2}`, `Tiré au hasard (graine ${20261125 + i}), ${opps + 1} joueurs, ${boardLen === 5 ? "river" : "turn"} : ${c.hole.join("")} sur ${c.board.join("")}`,
      c.hole, c.ranges, c.board, [id, rev, rot]);
  }

  // ranges réalistes (top x % du site, des centaines de combinaisons) : ce que le conseiller rencontre en jeu
  const real = (pcts: number[], hole: string[], board: string[]) =>
    pcts.map(p => expandRange(topPercentRange(p), [...hole, ...board]) as ComboW[]);
  const realistes: [string, string[], string[], number[]][] = [
    ["3 joueurs, river, ranges top 25 % et top 40 %", ["Ah", "Jd"], ["Js", "8h", "4c", "Kd", "2s"], [25, 40]],
    ["3 joueurs, turn, ranges top 15 % et top 35 %", ["Qh", "Qc"], ["Ts", "7d", "3h", "Ac"], [15, 35]],
    ["4 joueurs, river, ranges top 8 %, 12 % et 18 %", ["Ad", "9d"], ["Kd", "9c", "6s", "5h", "2c"], [8, 12, 18]],
  ];
  realistes.forEach(([t, hole, board, pcts], i) => {
    const ranges = real(pcts, hole, board);
    const id = ranges.map((_, k) => k);
    add(`E${n + 2 + i}`, `Ranges réalistes, ${t} : ${hole.join("")} sur ${board.join("")}`, hole, ranges, board, [id, [...id].reverse()]);
  });

  // moteur de base sur une partie des mêmes cas (le cas connu, 4 tirés au hasard, les 3 réalistes)
  const casBaseOut = out.filter((c, i) => i === 0 || (i >= 1 && i <= 4) || /réalistes/.test(c.titre)).map(c => {
    const src = sources.get(c.id)!;
    return casBase(c.id, c.titre, src.hole, src.ranges, src.board, src.orders, K, N);
  });

  // ordre des mains à l'abattage : évaluateur du site contre celui de l'arbitre
  const evals = [
    { nom: "rank7 (conseiller postflop, moteur de base depuis D38, solveurs, règlement)", f: (cs: string[]) => rank7(cs) },
  ].map(({ nom, f }) => {
    const r = rng(2026), M = 20000, ex: string[] = [];
    let bad = 0;
    for (let i = 0; i < M; i++) {
      const d = r.shuffle(DECK), b = d.slice(4, 9), a1 = [d[0], d[1], ...b], a2 = [d[2], d[3], ...b];
      if (Math.sign(best(a1) - best(a2)) !== Math.sign(f(a1) - f(a2))) {
        bad++;
        if (ex.length < 3) ex.push(`${d[0]}${d[1]} contre ${d[2]}${d[3]} sur ${b.join("")}`);
      }
    }
    return { nom, mains: M, desaccords: bad, exemples: ex };
  });

  return { graines: K, tirages: N, cas: out, casBase: casBaseOut, evaluateurs: evals };
}
