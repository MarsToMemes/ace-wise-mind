// A4 — Équité exacte par énumération complète (référence indépendante du site). Distribution jointe des mains adverses :
// P(mains) ∝ Π poids × 1[aucune carte en commun, ni entre elles, ni avec ta main et le board] (docs/DECISIONS.md D9) ;
// puis toutes les cartes restantes du board, à égalité. Ta part : 1 si tu gagnes seul, 1/k si tu partages à k.
import { best } from "./evaluateur";

export interface ComboW { cards: [string, string]; w: number }
const DECK = [..."23456789TJQKA"].flatMap(r => [..."shdc"].map(s => r + s));

export function exactEquity(hole: string[], ranges: ComboW[][], board: string[]): { equity: number; tuples: number; boards: number } {
  const dead = new Set([...hole, ...board]);
  const live = ranges.map(r => r.filter(c => !dead.has(c.cards[0]) && !dead.has(c.cards[1]) && c.w > 0));
  const rest = DECK.filter(c => !dead.has(c));
  const need = 5 - board.length;
  // toutes les suites de cartes de board (sans ordre) parmi les cartes restantes
  const runouts: string[][] = [];
  const rec = (start: number, acc: string[]) => {
    if (acc.length === need) { runouts.push([...acc]); return; }
    for (let i = start; i < rest.length; i++) rec(i + 1, [...acc, rest[i]]);
  };
  rec(0, []);
  // forces mises en cache : (main, board final)
  const cache = new Map<string, number>();
  const force = (cards: string[], run: string[], key: string) => {
    let v = cache.get(key);
    if (v === undefined) { v = best([...cards, ...board, ...run]); cache.set(key, v); }
    return v;
  };
  let num = 0, den = 0, tuples = 0;
  const pick: ComboW[] = [];
  const walk = (k: number, used: Set<string>, w: number) => {
    if (k === live.length) {
      tuples++;
      let s = 0, n = 0;
      for (let ri = 0; ri < runouts.length; ri++) {
        const run = runouts[ri];
        if (run.some(c => used.has(c))) continue;
        const me = force(hole, run, `h|${ri}`);
        const opp = pick.map(p => force(p.cards, run, `${p.cards.join("")}|${ri}`));
        const top = Math.max(me, ...opp);
        if (me === top) s += 1 / (1 + opp.filter(v => v === top).length);
        n++;
      }
      if (n) { num += w * (s / n); den += w; }
      return;
    }
    for (const c of live[k]) {
      if (used.has(c.cards[0]) || used.has(c.cards[1])) continue;
      pick.push(c); used.add(c.cards[0]); used.add(c.cards[1]);
      walk(k + 1, used, w * c.w);
      pick.pop(); used.delete(c.cards[0]); used.delete(c.cards[1]);
    }
  };
  walk(0, new Set(), 1);
  return { equity: den ? num / den : NaN, tuples, boards: runouts.length };
}
