import { describe, it, expect } from "vitest";
import { buildBetTree, endPayoff, type BetTreeSpec, type TNode } from "@/engines/multiway/betTree";
import { river3, river3Payoffs, type RiverSpec } from "@/engines/multiway/river3";
import { VRiver3, fromRiverSpec } from "@/engines/multiway/vriver3";
import { MICRO_RIVER } from "@/engines/multiway/river3";
import { CASH_RAKE } from "@/core/rake";
import { rank7 } from "@/engines/handEval7";

// Étape 3a : arbre d'enchères de la river pour 2 à 6 joueurs, mêmes règles que le site (moteur de règles de la phase 1).
const FULL = { bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3 };
const SMALL = { bets: [0.5, 1], raise: true, allin: true, maxAggr: 2 };
const spec = (n: number, stacks: number[], menu = SMALL, rake = CASH_RAKE): BetTreeSpec => ({ n, potBB: 20, stacks, rake, ...menu });
const walk = (n: TNode, f: (n: TNode) => void) => { f(n); if (n.t === "act") n.children.forEach(c => walk(c, f)); };

describe("étape 3a : arbre d'enchères à n joueurs", () => {
  it("à 3 joueurs : exactement l'arbre du solveur actuel (mêmes historiques, actions et pots)", () => {
    const s = { ...fromRiverSpec(MICRO_RIVER), ...FULL, stacks: [40, 100, 100], rake: CASH_RAKE };
    const t = buildBetTree({ n: 3, potBB: s.potBB, stacks: s.stacks, bets: s.bets, raise: s.raise, allin: s.allin, maxAggr: s.maxAggr, rake: s.rake });
    const v = new VRiver3(s) as unknown as { acts: { hist: string; player: number; actions: string[] }[]; ends: { refund: number[]; invested: number[]; pots: unknown[] }[] };
    expect(t.acts.map(a => `${a.player}|${a.hist}|${a.actions.join(",")}`)).toEqual(v.acts.map(a => `${a.player}|${a.hist}|${a.actions.join(",")}`));
    expect(t.ends.map(e => JSON.stringify([e.refund, e.invested, e.pots]))).toEqual(v.ends.map(e => JSON.stringify([e.refund, e.invested, e.pots])));
  });

  for (const n of [4, 5, 6]) it(`${n} joueurs, tapis inégaux : ni jeton créé ni perdu, rake au plus le plafond, sur toutes les fins de main et tous les classements`, () => {
    const stacks = [100, 12, 45, 100, 30, 70].slice(0, n);
    const t = buildBetTree(spec(n, stacks));
    // tous les classements possibles (égalités comprises) : rangs 0..2 pour chaque joueur
    const ranks: number[][] = [];
    const rec = (acc: number[]) => { if (acc.length === n) { ranks.push(acc); return; } for (const r of [0, 1, 2]) rec([...acc, r]); };
    rec([]);
    let worst = -Infinity, maxRake = 0, checked = 0;
    for (const e of t.ends) for (const rk of ranks) {
      const sum = Array.from({ length: n }, (_, i) => endPayoff(e, i, rk)).reduce((a, b) => a + b, 0);
      worst = Math.max(worst, sum); maxRake = Math.max(maxRake, -sum); checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(worst).toBeLessThanOrEqual(1e-9);
    expect(maxRake).toBeLessThanOrEqual(3 + 1e-9);
  });

  it("gains de l'arbre = gains du moteur de règles du site (pots annexes, mises rendues, rake), mains tirées au hasard", () => {
    const n = 5, stacks = [100, 12, 45, 100, 30], s = spec(n, stacks), t = buildBetTree(s);
    const board = ["Ks", "Kd", "8h", "4c", "2s"];
    const deck = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(x => r + x)).filter(c => !board.includes(c));
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const rspec: RiverSpec = { board, ranges: [], potBB: s.potBB, stacks, betFrac: 0.5, rake: s.rake };
    let worst = 0;
    for (const e of t.ends) for (let k = 0; k < 3; k++) {
      const d = [...deck].sort(() => rnd() - 0.5), hands = Array.from({ length: n }, (_, i) => [d[2 * i], d[2 * i + 1]] as [string, string]);
      const rk = hands.map(h => rank7([...h, ...board]));
      const ref = river3Payoffs(rspec, hands, e.invested.map(x => x - s.potBB / n), e.folded);
      ref.forEach((x, i) => { worst = Math.max(worst, Math.abs(x - endPayoff(e, i, rk))); });
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it("règle de réouverture : un tapis court qui relance d'un montant trop petit ne rouvre pas la relance", () => {
    // pot 20 : J0 mise 10 (½ pot), J1 paie, J2 tapis 12 (relance de 2 < 10), J3 paie → J0 ne peut que payer ou se coucher
    // plafond de 3 mises et relances : c'est bien la règle de réouverture qui bloque, pas le plafond
    const t = buildBetTree(spec(4, [100, 100, 12, 100], { ...SMALL, maxAggr: 3 }));
    const node = t.byHist.get("0|b0cac")!;
    expect(node.actions).toEqual(["f", "c"]);
    // J3, qui n'avait pas encore parlé, peut relancer
    expect(t.byHist.get("3|b0ca")!.actions).toContain("r");
    // même ligne, mais le tapis de J2 fait une relance complète (tapis 40 → relance de 30 ≥ 10) : J0 peut relancer
    const t2 = buildBetTree(spec(4, [100, 100, 40, 100], { ...SMALL, maxAggr: 3 }));
    expect(t2.byHist.get("0|b0cac")!.actions).toEqual(["f", "c", "a"]); // relance au pot > tapis : proposée comme tapis
  });

  it("recoupement avec l'arbre explicite (une seule taille, 4 joueurs) : mêmes décisions, mêmes gains pour chaque distribution", () => {
    const rs: RiverSpec = {
      board: ["Ks", "Kd", "8h", "4c", "2s"], potBB: 30, stacks: [100, 25, 100, 60], betFrac: 0.75, rake: CASH_RAKE,
      ranges: [[["Ah", "Kh"], ["6s", "5s"]], [["Ac", "Ad"], ["7s", "6h"]], [["Kc", "Qc"], ["5h", "3h"]], [["Qh", "Qs"], ["9c", "9d"]]],
    };
    const g = river3(rs);
    const t = buildBetTree({ n: 4, potBB: 30, stacks: rs.stacks, bets: [0.75], raise: false, allin: false, maxAggr: 1, rake: CASH_RAKE });
    let paths = 0;
    g.root.t === "chance" && g.root.outcomes.forEach((o, k) => {
      const hands = g.deals[k], rk = hands.map(h => rank7([...h, ...rs.board]));
      const pair = (x: typeof o.child, y: TNode) => {
        if (x.t === "terminal") { expect(y.t).toBe("end"); if (y.t === "end") x.payoffs.forEach((v, i) => expect(endPayoff(y, i, rk)).toBeCloseTo(v, 9)); paths++; return; }
        if (x.t !== "decision" || y.t !== "act") throw new Error("structure différente");
        expect(y.player).toBe(x.player);
        expect(x.info.split("|")[2]).toBe(y.hist);
        expect(y.children.length).toBe(x.children.length);
        x.children.forEach((c, a) => pair(c, y.children[a]));
      };
      pair(o.child, t.root);
    });
    expect(paths).toBeGreaterThan(50);
  });
});
