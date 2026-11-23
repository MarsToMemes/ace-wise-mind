// Poker de Kuhn à n joueurs (jeu de recherche à solution connue) : n + 1 cartes (de rang 0 à n), une par joueur ;
// chacun met 1 (ante) ; un seul tour d'enchères dans l'ordre des joueurs : check ou mise de 1 ; après une mise, chaque
// autre joueur, dans l'ordre, paie ou se couche (pas de relance) ; la plus haute carte gagne à l'abattage.
// À 2 joueurs, la valeur de l'équilibre est -1/18 pour le joueur 1 ; à 3 joueurs, voir Szafron, Gibson, Sturtevant (2013).
import type { Game, Node } from "@/engines/multiway/game";

export function kuhn(n: number): Game {
  const deals: number[][] = [];
  const pick = (left: number[], acc: number[]) => {
    if (acc.length === n) { deals.push(acc); return; }
    left.forEach((c, k) => pick([...left.slice(0, k), ...left.slice(k + 1)], [...acc, c]));
  };
  pick(Array.from({ length: n + 1 }, (_, c) => c), []);

  const showdown = (deal: number[], contenders: number[], contrib: number[]): Node => {
    const pot = contrib.reduce((a, b) => a + b, 0);
    const winner = contenders.reduce((w, p) => (deal[p] > deal[w] ? p : w), contenders[0]);
    return { t: "terminal", payoffs: contrib.map((c, p) => (p === winner ? pot : 0) - c) };
  };
  const play = (deal: number[], hist: string, pos: number, bettor: number, callers: number[]): Node => {
    const contrib = deal.map((_, p) => 1 + (p === bettor || callers.includes(p) ? 1 : 0));
    if (bettor < 0) {
      if (pos === n) return showdown(deal, deal.map((_, p) => p), contrib); // tout le monde a checké
      return {
        t: "decision", player: pos, info: `${pos}|${deal[pos]}|${hist}`, actions: ["check", "mise"],
        children: [play(deal, hist + "p", pos + 1, -1, []), play(deal, hist + "b", (pos + 1) % n, pos, [])],
      };
    }
    if (pos === bettor) return showdown(deal, [bettor, ...callers], contrib); // chacun a répondu
    return {
      t: "decision", player: pos, info: `${pos}|${deal[pos]}|${hist}`, actions: ["couché", "payer"],
      children: [play(deal, hist + "f", (pos + 1) % n, bettor, callers), play(deal, hist + "c", (pos + 1) % n, bettor, [...callers, pos])],
    };
  };
  return {
    name: `Kuhn à ${n} joueurs`, players: n,
    root: { t: "chance", outcomes: deals.map(d => ({ p: 1 / deals.length, child: play(d, "", 0, -1, []) })) },
  };
}
