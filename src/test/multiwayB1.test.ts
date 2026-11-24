import { describe, it, expect } from "vitest";
import { buildBetTree, endPayoff, type TNode, type BetTreeSpec } from "@/engines/multiway/betTree";
import { VTurnN, type TurnSpec } from "@/engines/multiway/vturn";
import { rank7 } from "@/engines/handEval7";
import { CASH_RAKE } from "@/core/rake";

// Étape B1 : jeu turn + river à n joueurs. Feuilles « exactes » (toutes les rivers et leurs mises : la référence) ou
// « abattage » (méthode « turn seule » : au bout de la turn, abattage moyen sur toutes les rivers).
const MENU = { bets: [0.5], raise: false, allin: true, maxAggr: 1 };

describe("B1 : joueurs déjà couchés dans l'arbre de mises", () => {
  it("un joueur couché avant la street ne parle jamais, ne gagne rien, son argent reste au pot à son niveau", () => {
    const s: BetTreeSpec = { n: 3, potBB: 30, stacks: [50, 50, 50], rake: null, ...MENU, invested0: [10, 10, 10], out: [false, true, false] };
    const t = buildBetTree(s);
    expect(t.acts.every(a => a.player !== 1)).toBe(true);
    for (const e of t.ends) {
      expect(e.folded[1]).toBe(true);
      expect(e.pots.every(p => !p.elig.includes(1))).toBe(true);
      expect(endPayoff(e, 1, [9, 9, 9])).toBe(-10);
    }
  });
});

const BOARD = ["Kh", "9d", "4c", "7s"];
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s));
const r = (...hs: string[]) => hs.map((x, k) => ({ cards: [x.slice(0, 2), x.slice(2)] as [string, string], w: 0.5 + 0.2 * k }));
const SPEC: TurnSpec = { board: BOARD, potBB: 12, stacks: [40, 40, 40], rake: CASH_RAKE, invested0: [3.5, 3.5, 3.5], dead: [1.5],
  ranges: [r("AsKs", "QcQd", "8c8d"), r("AdKc", "Tc9c", "6c5c"), r("KcQh", "9h9c", "AhQs")], ...MENU, river: { bets: [0.66], raise: false, allin: true, maxAggr: 1 } };

/** Calcul complet : toutes les mains, toutes les rivers, chaque nœud suivi avec une stratégie uniforme. */
function brute(spec: TurnSpec, leaves: "exact" | "showdown"): number[] {
  const n = spec.ranges.length, turn = buildBetTree({ n, potBB: spec.potBB, stacks: spec.stacks, rake: spec.rake, bets: spec.bets, raise: spec.raise, allin: spec.allin, maxAggr: spec.maxAggr, invested0: spec.invested0, dead: spec.dead });
  const ev = new Array(n).fill(0); let mass = 0;
  const unseen = 52 - 4 - 2 * n;
  const uni = (nd: TNode, f: (e: TNode & { t: "end" }) => number[]): number[] => {
    if (nd.t === "end") return f(nd);
    const out = new Array(n).fill(0);
    nd.children.forEach(c => uni(c, f).forEach((v, p) => { out[p] += v / nd.children.length; }));
    return out;
  };
  const rec = (p: number, hs: [string, string][], used: Set<string>, w: number) => {
    if (p < n) { spec.ranges[p].forEach(c => { if (!c.cards.some(k => used.has(k))) rec(p + 1, [...hs, c.cards], new Set([...used, ...c.cards]), w * c.w); }); return; }
    mass += w;
    const vals = new Array(n).fill(0);
    for (const card of DECK) {
      if (used.has(card) || BOARD.includes(card)) continue;
      const ranks = hs.map(h => rank7([...h, ...BOARD, card]));
      const v = uni(turn.root, e => {
        const live = e.folded.filter(f => !f).length;
        if (leaves === "showdown" || live < 2) return Array.from({ length: n }, (_, q) => endPayoff(e, q, ranks));
        const river = buildBetTree({ n, potBB: e.invested.reduce((t, x) => t + x, 0) + (spec.dead ?? []).reduce((t, x) => t + x, 0),
          stacks: spec.stacks.map((s, q) => s - (e.invested[q] - spec.invested0![q])), rake: spec.rake, ...spec.river, invested0: e.invested, dead: spec.dead, out: e.folded });
        return uni(river.root, f => Array.from({ length: n }, (_, q) => endPayoff(f, q, ranks)));
      });
      v.forEach((x, q) => { vals[q] += x / unseen; });
    }
    vals.forEach((x, q) => { ev[q] += w * x; });
  };
  rec(0, [], new Set(BOARD), 1);
  return ev.map(x => x / mass);
}

describe("B1 : jeu turn + river", () => {
  it("feuilles exactes : valeurs (stratégie uniforme) = calcul complet sur toutes les mains et toutes les rivers", () => {
    const v = new VTurnN(SPEC, { leaves: "exact" }), got = v.expectedValues(v.averageProfile()), want = brute(SPEC, "exact");
    got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 9));
  });
  it("feuilles « abattage » : valeurs = calcul complet sans mises à la river", () => {
    const v = new VTurnN(SPEC, { leaves: "showdown" }), got = v.expectedValues(v.averageProfile()), want = brute(SPEC, "showdown");
    got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 9));
  });
  it("le calcul converge (feuilles exactes) : la précision mesurée sur tout le jeu baisse", () => {
    const v = new VTurnN(SPEC, { leaves: "exact" }), res = v.solve(200, 50);
    expect(res.checks[res.checks.length - 1].nashConv).toBeLessThan(res.checks[0].nashConv);
    expect(res.nashConv).toBeLessThan(0.02 * SPEC.potBB);
  }, 120000);
});

describe("B1 : rivers tirées au hasard (méthode « turn seule »)", () => {
  it("en tirant les 48 rivers, mêmes résultats au bit près que sans tirage", () => {
    const a = new VTurnN(SPEC, { leaves: "showdown" }), b = new VTurnN(SPEC, { leaves: "showdown", sample: 48 });
    a.run(30); b.run(30);
    const pa = a.averageProfile(), pb = b.averageProfile();
    for (const [id, s] of pa) expect(Array.from(pb.get(id)!)).toEqual(Array.from(s));
  });
  it("en tirant 8 rivers par itération, 6 fois moins de rivers évaluées", () => {
    const a = new VTurnN(SPEC, { leaves: "showdown" }), b = new VTurnN(SPEC, { leaves: "showdown", sample: 8 });
    a.run(2); b.run(2);
    expect(b.riverEvals * 6).toBe(a.riverEvals);
  });
  it("en tirant 8 rivers par itération, le calcul converge (précision mesurée sur toutes les rivers)", () => {
    const v = new VTurnN(SPEC, { leaves: "showdown", sample: 8 });
    const r = v.solve(600, 200);
    // le tirage ralentit la convergence (≈ 1,1 % du pot à 600 itérations ici) : sa valeur se mesure (D30)
    expect(r.nashConv).toBeLessThan(0.02 * SPEC.potBB);
  }, 60000);
});
