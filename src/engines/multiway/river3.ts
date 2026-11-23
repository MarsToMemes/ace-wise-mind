// River à 3 joueurs miniature avec de vraies cartes (étape 1c du solveur multiway) : board fixé, quelques mains par
// joueur, distribution jointe exacte (produit des poids, aucune carte partagée : docs/DECISIONS.md D9), un seul tour
// d'enchères (check ou une mise de taille fixe ; face à une mise, payer ou se coucher, pas de relance), tapis
// éventuellement inégaux (tapis courts : pots annexes). Les gains sont calculés par le moteur de règles de la phase 1
// (core/handState computePots, core/settle), rake compris.
// Hypothèse documentée : le pot d'avant la river a été mis à parts égales par les trois joueurs.
import type { Game, Node } from "@/engines/multiway/game";
import { computePots, type HandState, type SeatState } from "@/core/handState";
import { settleHand } from "@/core/settle";
import type { RakeRule } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";

export interface RiverSpec {
  board: string[];
  /** Mains possibles de chaque joueur (dans l'ordre de parole : 0 parle en premier). */
  ranges: [string, string][][];
  /** Poids de chaque main (1 par défaut). */
  weights?: number[][];
  /** Pot avant la river (bb). */
  potBB: number;
  /** Tapis restant de chaque joueur au début de la river (bb). */
  stacks: number[];
  /** Taille de l'unique mise, en fraction du pot avant la mise. */
  betFrac: number;
  rake?: RakeRule | null;
}

/** River miniature de référence : board K-K-8-4-2, 4 mains par joueur, pot 30, tapis 100, mise 75 %. */
export const MICRO_RIVER: RiverSpec = {
  board: ["Ks", "Kd", "8h", "4c", "2s"],
  ranges: [
    [["Ah", "Kh"], ["8s", "8c"], ["Qh", "Qs"], ["6s", "5s"]],
    [["Ac", "Ad"], ["Jh", "Js"], ["9c", "9d"], ["7s", "6h"]],
    [["Kc", "Qc"], ["Tc", "Th"], ["5h", "3h"], ["Ad", "Qd"]],
  ],
  potBB: 30, stacks: [100, 100, 100], betFrac: 0.75, rake: null,
};

export interface RiverGame extends Game {
  /** Mains distribuées, une entrée par branche du hasard (dans l'ordre de root.outcomes). */
  deals: [string, string][][];
  dealIdx: number[][];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Gain net de chaque joueur sur la main (ce qu'il reçoit moins tout ce qu'il a mis, river comprise). */
export function river3Payoffs(spec: RiverSpec, hands: [string, string][], river: number[], folded: boolean[]): number[] {
  const n = hands.length;
  const seats: SeatState[] = hands.map((_, i) => ({
    idx: i, position: "", stackStartBB: spec.potBB / n + spec.stacks[i], investedBB: spec.potBB / n + river[i],
    streetBB: river[i], remainingBB: spec.stacks[i] - river[i], folded: folded[i],
    allIn: spec.stacks[i] - river[i] <= 1e-9, contributed: true,
  }));
  const ranks: Record<number, number> = {};
  hands.forEach((h, i) => { if (!folded[i]) ranks[i] = rank7([...h, ...spec.board]); });
  const state = { pots: computePots(seats, false), seats, board: spec.board, history: [] } as unknown as HandState;
  const s = settleHand(state, { ranks, rake: spec.rake ?? null });
  return s.payouts.map((x, i) => Math.round((x - seats[i].investedBB) * 1e9) / 1e9);
}

export function river3(spec: RiverSpec): RiverGame {
  const n = spec.ranges.length;
  const w = spec.weights ?? spec.ranges.map(r => r.map(() => 1));
  const deals: [string, string][][] = [], dealIdx: number[][] = [], dealW: number[] = [];
  const rec = (i: number, used: Set<string>, acc: number[]) => {
    if (i === n) { dealIdx.push(acc); deals.push(acc.map((k, p) => spec.ranges[p][k])); dealW.push(acc.reduce((t, k, p) => t * w[p][k], 1)); return; }
    spec.ranges[i].forEach((h, k) => {
      if (used.has(h[0]) || used.has(h[1]) || !(w[i][k] > 0)) return;
      rec(i + 1, new Set([...used, ...h]), [...acc, k]);
    });
  };
  rec(0, new Set(spec.board), []);
  const total = dealW.reduce((a, b) => a + b, 0);
  const bet = (p: number) => Math.min(r1(spec.betFrac * spec.potBB), spec.stacks[p]);

  const play = (hands: [string, string][], hist: string, pos: number, bettor: number, river: number[], folded: boolean[]): Node => {
    const end = () => ({ t: "terminal" as const, payoffs: river3Payoffs(spec, hands, river, folded) });
    if (bettor < 0) {
      if (pos === n) return end();
      const b = bet(pos);
      const raised = river.map((x, p) => (p === pos ? b : x));
      return {
        t: "decision", player: pos, info: `${pos}|${hands[pos].join("")}|${hist}`, actions: ["check", `mise ${b}`],
        children: [play(hands, hist + "p", pos + 1, -1, river, folded), play(hands, hist + "b", (pos + 1) % n, pos, raised, folded)],
      };
    }
    if (pos === bettor) return end();
    const pay = Math.min(river[bettor], spec.stacks[pos]);
    return {
      t: "decision", player: pos, info: `${pos}|${hands[pos].join("")}|${hist}`, actions: ["couché", "payer"],
      children: [
        play(hands, hist + "f", (pos + 1) % n, bettor, river, folded.map((f, p) => f || p === pos)),
        play(hands, hist + "c", (pos + 1) % n, bettor, river.map((x, p) => (p === pos ? pay : x)), folded),
      ],
    };
  };
  return {
    name: "River à 3 joueurs miniature", players: n, deals, dealIdx,
    root: { t: "chance", outcomes: deals.map((h, k) => ({ p: dealW[k] / total, child: play(h, "", 0, -1, Array(n).fill(0), Array(n).fill(false)) })) },
  };
}
