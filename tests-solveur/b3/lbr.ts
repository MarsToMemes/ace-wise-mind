// B3 — L'exploiteur (Local Best Response, Lisý et Bowling, arXiv 1612.07547), en tête-à-tête à partir du flop.
// Il connaît la stratégie de l'adversaire (une fonction : vue → choix pour chaque main), jamais ses cartes.
//  - range suivie : au départ, la range préflop de la place de l'adversaire ; après chaque décision de l'adversaire, on
//    garde les mains avec lesquelles il aurait fait exactement ce choix (stratégie déterministe : filtre exact) ;
//  - à chaque décision : valeur de chaque action en supposant que la main se finit ensuite en check jusqu'à l'abattage
//    (« local » : un seul coup d'avance) ; pour une mise, la réponse de l'adversaire est lue main par main dans sa
//    stratégie (couché, sinon il paie : une relance est comptée comme un call) ; on joue l'action la plus rentable.
// Valeurs, relatives à maintenant (P = pot, WP = part de pot moyenne à l'abattage contre la range, WPc = contre les
// mains qui continuent, fp = part des mains qui se couchent) :
//   se coucher 0 ; check WP·P ; payer WP·(P + à payer) − à payer ;
//   miser ou relancer (x ajouté, y payé en face) fp·P + (1 − fp)·(WPc·(P + x + y) − x).
// Différence avec l'article : WPc contre les seules mains qui paient (l'article prend WP contre toute la range). Les deux
// sont des stratégies valables : ce que l'exploiteur gagne réellement reste une borne basse, quelle que soit la règle.
import { getRange, slotsFor } from "@/engines/matchupRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { topPercentRange } from "@/engines/preflopEquity";
import { rank7 } from "@/engines/handEval7";
import { DECK } from "../outils/hasard";
import type { View, Choice, Kind } from "../b4/joueur";
import type { Player, Ctx } from "../b4/match";
import { keyOfChoice, type Hole } from "./politique";

export type Policy = (v: View, hands: Hole[]) => string[];
export interface LbrStats {
  decisions: number; observed: number;
  /** La vraie main de l'adversaire n'était plus dans la range suivie (stratégie mal reproduite : doit rester à 0). */
  horsRange: number;
  /** Aucune main de la range ne fait le choix observé (range gardée telle quelle). */
  vide: number;
  actions: Record<string, number>;
  /** Réponse de l'adversaire à chaque mise ou relance de l'exploiteur, par taille (moitié, pot, tapis). */
  reponses: Record<string, Record<string, number>>;
}
export const newStats = (): LbrStats => ({ decisions: 0, observed: 0, horsRange: 0, vide: 0, actions: {}, reponses: {} });

const same = (a: Hole, b: Hole) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

/** Part de pot de `hole` contre chaque main, sur toutes les fins de board possibles. */
export function sharesVs(hole: Hole, board: string[], hands: Hole[]): Float64Array {
  const used = new Set([...hole, ...board]);
  const rest = DECK.filter(x => !used.has(x));
  const s = new Float64Array(hands.length), cnt = new Float64Array(hands.length);
  const run = (b: string[]) => {
    const me = rank7([...hole, ...b]);
    for (let j = 0; j < hands.length; j++) {
      const h = hands[j];
      if (b.length > board.length && (b.includes(h[0]) || b.includes(h[1]))) continue;
      const o = rank7([...h, ...b]);
      s[j] += me > o ? 1 : me === o ? 0.5 : 0; cnt[j]++;
    }
  };
  if (board.length === 5) run(board);
  else if (board.length === 4) for (const x of rest) run([...board, x]);
  else for (let i = 0; i < rest.length; i++) for (let k = i + 1; k < rest.length; k++) run([...board, rest[i], rest[k]]);
  for (let j = 0; j < hands.length; j++) s[j] = cnt[j] ? s[j] / cnt[j] : 0;
  return s;
}

/** Les tailles essayées : moitié du pot, pot, tapis (après avoir payé, pour une relance). */
export const SIZES = [0.5, 1] as const;

export function makeLBR(name: string, policy: Policy, stats: LbrStats): Player {
  let range: { h: Hole; w: number }[] = [];
  let hole: Hole = ["", ""];
  let cache: { board: string; s: Float64Array; n: number } | null = null;
  let last = "";
  const prune = (board: string[]) => {
    const dead = new Set([...board, ...hole]);
    const before = range.length;
    range = range.filter(x => !dead.has(x.h[0]) && !dead.has(x.h[1]));
    if (range.length !== before) cache = null;
  };
  return {
    name,
    begin(role, info) {
      hole = info.hole; cache = null; last = "";
      const slots = slotsFor(info.pfrPos, info.callPos, "srp");
      // l'adversaire est le payeur si je suis le relanceur, et inversement (même repli que le joueur du site)
      const [slot, pct] = role === 0 ? [slots.caller, 35] : [slots.pfr, 30];
      const w = getRange(slot).weights;
      range = expandRange(Object.keys(w).length ? w : topPercentRange(pct), []).map(c => ({ h: [c.cards[0], c.cards[1]] as Hole, w: c.w }));
      prune([]);
    },
    observe(v, ch) {
      stats.observed++;
      if (last && v.toCall > 0) { const r = (stats.reponses[last] ??= {}); r[ch.kind] = (r[ch.kind] ?? 0) + 1; }
      last = "";
      prune(v.board);
      const keys = policy(v, range.map(x => x.h));
      const k = keyOfChoice(ch);
      const kept = range.filter((_, i) => keys[i] === k);
      // contrôle seulement : la vraie main de l'adversaire doit rester dans la range suivie
      if (!kept.some(x => same(x.h, v.hole))) stats.horsRange++;
      if (kept.length === 0) { stats.vide++; return; }
      if (kept.length !== range.length) cache = null;
      range = kept;
    },
    decide(v, _r, ctx?: Ctx): Choice {
      stats.decisions++;
      prune(v.board);
      const hands = range.map(x => x.h), w = range.map(x => x.w);
      const bk = v.board.join("");
      if (!cache || cache.board !== bk || cache.n !== hands.length) cache = { board: bk, s: sharesVs(hole, v.board, hands), n: hands.length };
      const sh = cache.s;
      const mean = (idx: number[]) => { let a = 0, b = 0; for (const j of idx) { a += w[j] * sh[j]; b += w[j]; } return b > 0 ? a / b : 0; };
      const all = hands.map((_, j) => j), WP = mean(all), totW = w.reduce((a, b) => a + b, 0);
      const P = v.pot, toCall = v.toCall, L = v.legal;
      const cands: { c: Choice; ev: number }[] = [];
      if (toCall > 0) cands.push({ c: { kind: "fold", how: "" }, ev: 0 });
      if (L.check) cands.push({ c: { kind: "check", how: "" }, ev: WP * P });
      else cands.push({ c: { kind: "call", how: "" }, ev: WP * (P + toCall) - toCall });
      const tos: number[] = [];
      const r2 = (x: number) => Math.round(x * 100) / 100;
      if (L.bet && toCall === 0) {
        for (const f of SIZES) tos.push(r2(v.myStreet + Math.min(L.bet.max, Math.max(L.bet.min, f * P))));
        tos.push(r2(v.myStreet + L.bet.max));
      } else if (L.raise) {
        for (const f of SIZES) tos.push(r2(Math.min(L.raise.maxTo, Math.max(L.raise.minTo, v.currentBet + f * (P + toCall)))));
        tos.push(r2(L.raise.maxTo));
      }
      const kind: Kind = L.bet && toCall === 0 ? "bet" : "raise";
      if (ctx && totW > 0) for (const to of [...new Set(tos)].sort((a, b) => a - b)) {
        const vs = ctx.after(kind, to);
        if (!vs) continue;
        const keys = policy(vs, hands);
        const cont: number[] = [];
        let fw = 0;
        keys.forEach((k, j) => { if (k === "fold") fw += w[j]; else cont.push(j); });
        const fp = fw / totW, x = to - v.myStreet, y = vs.toCall;
        // une mise plus grosse que ce que l'adversaire peut payer : le surplus revient
        const matched = Math.min(v.myStreet + x, vs.myStreet + y) - v.myStreet;
        cands.push({ c: { kind, to, how: "" }, ev: fp * P + (1 - fp) * (mean(cont) * (P + matched + y) - matched) });
      }
      let best = cands[0];
      for (const c of cands) if (c.ev > best.ev + 1e-9) best = c;
      const aggr = best.c.kind === "bet" || best.c.kind === "raise";
      const sizeLab = !aggr ? "" : best.c.to === tos[tos.length - 1] ? "tapis" : best.c.to === tos[1] ? "pot" : "moitié du pot";
      const lab = aggr ? `${best.c.kind === "bet" ? "mise" : "relance"} ${sizeLab}` : best.c.kind;
      stats.actions[lab] = (stats.actions[lab] ?? 0) + 1;
      last = aggr ? lab : "";
      return best.c;
    },
  };
}
