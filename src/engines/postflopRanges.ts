// Ranges après le flop : on part des ranges préflop et on les « filtre » selon ce que
// chaque joueur a fait à chaque street (comme le dit Chichi : chaque action met un filtre).
// Puis on mesure l'avantage d'équité et de mains fortes sur le board actuel (3 à 5 cartes).

import { rank7, categoryOf } from "@/engines/handEval7";
import { Combo, FULL_DECK } from "@/engines/rangeVsRange";
import { detectDraws } from "@/lib/pokerEngine";

export type PostStreet = "Flop" | "Turn" | "River";
export type LineAct = "call" | "checkBack" | "checkFirst" | "bet";
export interface LineEvent { street: PostStreet; act: LineAct }

const boardAt = (board: string[], s: PostStreet) => board.slice(0, s === "Flop" ? 3 : s === "Turn" ? 4 : 5);

/** Force relative d'une main : catégories au-dessus du board seul (0 = rien, 1 = paire, 2+ = forte). */
export function relStrength(cards: string[], board: string[]): number {
  return categoryOf(rank7([...cards, ...board])) - categoryOf(rank7(board));
}

/** Applique les filtres de ligne aux combos d'un joueur (poids réduits, jamais supprimés). */
export function filterByLine(combos: Combo[], board: string[], line: LineEvent[]): Combo[] {
  return combos.map(c => {
    let w = c.w;
    for (const ev of line) {
      const b = boardAt(board, ev.street);
      if (b.length < 3) continue;
      const rel = relStrength(c.cards, b);
      const outs = ev.street === "River" ? 0 : detectDraws(c.cards, b).outs;
      if (ev.act === "call") w *= rel >= 1 || outs >= 8 ? 1 : outs >= 4 ? 0.5 : 0.12;
      else if (ev.act === "checkBack") w *= rel >= 2 ? 0.25 : 1;
      else if (ev.act === "checkFirst") w *= rel >= 2 ? 0.6 : 1;
      else if (ev.act === "bet") w *= rel >= 2 || outs >= 8 ? 1 : rel === 1 ? 0.6 : 0.5;
    }
    return { cards: c.cards, w };
  }).filter(c => c.w > 0.001);
}

export const removeDead = (combos: Combo[], dead: string[]) => {
  const d = new Set(dead);
  return combos.filter(c => !d.has(c.cards[0]) && !d.has(c.cards[1]));
};

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

function picker(combos: Combo[], rand: () => number) {
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

const strongShare = (combos: Combo[], board: string[]) => {
  let tot = 0, strong = 0;
  for (const c of combos) { tot += c.w; if (relStrength(c.cards, board) >= 2) strong += c.w; }
  return tot > 0 ? (strong / tot) * 100 : 0;
};

export interface Advantage { heroEquity: number; heroStrongPct: number; villainStrongPct: number }

/** Équité de la range du héros contre celle de l'adversaire sur ce board, et part de mains fortes. */
export function rangeAdvantage(hero: Combo[], villain: Combo[], board: string[], samples = 2500, seed = 3): Advantage {
  const base = { heroStrongPct: strongShare(hero, board), villainStrongPct: strongShare(villain, board) };
  if (!hero.length || !villain.length) return { heroEquity: 0.5, ...base };
  const rand = rng(seed);
  const pH = picker(hero, rand), pV = picker(villain, rand);
  let score = 0, done = 0;
  for (let i = 0; i < samples; i++) {
    const h = pH();
    let v = pV(), tries = 0;
    while ((v.cards.includes(h.cards[0]) || v.cards.includes(h.cards[1])) && tries++ < 20) v = pV();
    if (tries > 20) continue;
    const used = new Set([...board, ...h.cards, ...v.cards]);
    const run = [...board];
    while (run.length < 5) {
      const c = FULL_DECK[Math.floor(rand() * 52)];
      if (!used.has(c)) { used.add(c); run.push(c); }
    }
    const a = rank7([...h.cards, ...run]), b = rank7([...v.cards, ...run]);
    score += a > b ? 1 : a === b ? 0.5 : 0;
    done++;
  }
  return { heroEquity: done ? score / done : 0.5, ...base };
}

/** Équité d'une main précise contre une range (runout simulé). */
export function handEquity(hole: string[], villain: Combo[], board: string[], samples = 2000, seed = 5): number {
  const v = removeDead(villain, [...hole, ...board]);
  if (!v.length) return 0.5;
  const rand = rng(seed);
  const pV = picker(v, rand);
  let score = 0;
  for (let i = 0; i < samples; i++) {
    const vc = pV();
    const used = new Set([...board, ...hole, ...vc.cards]);
    const run = [...board];
    while (run.length < 5) {
      const c = FULL_DECK[Math.floor(rand() * 52)];
      if (!used.has(c)) { used.add(c); run.push(c); }
    }
    const a = rank7([...hole, ...run]), b = rank7([...vc.cards, ...run]);
    score += a > b ? 1 : a === b ? 0.5 : 0;
  }
  return score / samples;
}

const RANK_ORDER = "23456789TJQKA";
/** Top pair ou overpair (une seule paire, au niveau de la plus haute carte du board ou au-dessus). */
function topPairPlus(cards: string[], board: string[]): boolean {
  const top = Math.max(...board.map(c => RANK_ORDER.indexOf(c[0])));
  const [a, b] = cards.map(c => RANK_ORDER.indexOf(c[0]));
  return a === b ? a > top : a === top || b === top;
}

/**
 * Range d'un joueur qui MISE `betFrac` × le pot sur cette street.
 * - value (top pair et mieux) : gardée entière ;
 * - paires plus faibles : rarement misées (river 25 %, flop/turn 50 %) ;
 * - gros tirages (8 outs et plus, avant la river) : gardés, ce sont les semi-bluffs ;
 * - air : réduit pour que les bluffs ne dépassent pas la proportion standard d'une mise de cette taille,
 *   bluffs / (value + bluffs) = s / (1 + 2s) (½ pot → 25 %, pot → 33 %).
 * Aucun combo n'est supprimé : les poids sont seulement réduits.
 */
export function filterByBet(combos: Combo[], board: string[], street: PostStreet, betFrac: number): Combo[] {
  const b = boardAt(board, street);
  if (b.length < 3 || !combos.length) return combos;
  const s = Math.max(0.1, Math.min(3, betFrac || 0.5));
  const river = street === "River";
  type K = "value" | "medium" | "draw" | "air";
  const kinds: K[] = combos.map(c => {
    const rel = relStrength(c.cards, b);
    if (rel >= 2 || (rel === 1 && topPairPlus(c.cards, b))) return "value";
    if (rel === 1) return "medium";
    if (!river && detectDraws(c.cards, b).outs >= 8) return "draw";
    return "air";
  });
  let value = 0, air = 0;
  combos.forEach((c, i) => { if (kinds[i] === "value") value += c.w; else if (kinds[i] === "air") air += c.w; });
  const target = value * s / (1 + s);
  const airScale = air > 0 ? Math.min(1, target / air) : 1;
  const out = combos.map((c, i) => ({
    cards: c.cards,
    w: c.w * (kinds[i] === "medium" ? (river ? 0.25 : 0.5) : kinds[i] === "air" ? airScale : 1),
  }));
  return out.some(c => c.w > 0) ? out : combos;
}

/**
 * Équité du héros contre PLUSIEURS adversaires (il faut battre tout le monde ; égalités partagées).
 * Chaque donne tire une main dans chaque range sans réutiliser une carte ; une donne impossible est rejetée.
 * Avec un seul adversaire : exactement `handEquity`.
 */
export function handEquityMulti(hole: string[], ranges: Combo[][], board: string[], samples = 2000, seed = 5): number {
  if (ranges.length <= 1) return handEquity(hole, ranges[0] ?? [], board, samples, seed);
  const dead = [...hole, ...board];
  const live = ranges.map(r => removeDead(r, dead));
  if (live.some(r => !r.length)) return 0.5;
  const rand = rng(seed);
  const pick = live.map(r => picker(r, rand));
  let score = 0, done = 0;
  for (let i = 0; i < samples; i++) {
    // tirage de TOUTE la combinaison d'un coup, chaque main selon son poids, rejetée en entier dès qu'une carte est
    // partagée : c'est exactement la distribution jointe des mains adverses (D9), quel que soit l'ordre des adversaires
    // (D38 ; l'ancien tirage, une main après l'autre, dépendait de l'ordre : 75 % ou 50 % pour 66,67 % exacts)
    let used: Set<string> | null = null, hands: [string, string][] = [];
    for (let t = 0; t < 1000 && !used; t++) {
      const u = new Set(dead);
      hands = [];
      for (const p of pick) {
        const x = p();
        if (u.has(x.cards[0]) || u.has(x.cards[1])) break;
        u.add(x.cards[0]); u.add(x.cards[1]);
        hands.push(x.cards);
      }
      if (hands.length === pick.length) used = u;
    }
    if (!used) continue;
    const run = [...board];
    while (run.length < 5) {
      const c = FULL_DECK[Math.floor(rand() * 52)];
      if (!used.has(c)) { used.add(c); run.push(c); }
    }
    const me = rank7([...hole, ...run]);
    const opp = hands.map(h => rank7([...h, ...run]));
    const best = Math.max(me, ...opp);
    if (me === best) score += 1 / (1 + opp.filter(v => v === best).length);
    done++;
  }
  return done ? score / done : 0.5;
}

/**
 * Seuil d'équité pensé pour un tête-à-tête, ramené à `opponents` adversaires :
 * 0 → 0, 50 % → part équitable 1/(n+1), 100 % → 100 % (linéaire entre ces points).
 */
export function scaleEqThreshold(t: number, opponents: number): number {
  const fair = 1 / (Math.max(1, opponents) + 1);
  return t <= 0.5 ? (t / 0.5) * fair : fair + ((t - 0.5) / 0.5) * (1 - fair);
}

/** Place de la main du héros dans sa propre range (0 = bas, 1 = haut) sur le board actuel. */
export function handPercentile(hole: string[], range: Combo[], board: string[]): number {
  const me = rank7([...hole, ...board]);
  let tot = 0, below = 0;
  for (const c of removeDead(range, [...hole, ...board])) {
    const r = rank7([...c.cards, ...board]);
    tot += c.w;
    if (r < me) below += c.w;
    else if (r === me) below += c.w / 2;
  }
  return tot > 0 ? below / tot : 0.5;
}
