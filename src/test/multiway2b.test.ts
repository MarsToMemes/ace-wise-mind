import { describe, it, expect } from "vitest";
import { VRiver3, type VSpec, type VCombo } from "@/engines/multiway/vriver3";
import { CASH_RAKE } from "@/core/rake";

// Étape 2b : calcul rapide des fins de main (mains triées par force, cartes bloquées par inclusion-exclusion).
// Il doit donner exactement le même résultat que le calcul exact « toutes les combinaisons » de l'étape 2a.
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function ranges(board: string[], n: number, seed: number): VCombo[][] {
  const deck = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s)).filter(c => !board.includes(c));
  const r = rng(seed);
  return [0, 1, 2].map(() => {
    const seen = new Set<string>(), out: VCombo[] = [];
    while (out.length < n) {
      const a = deck[Math.floor(r() * deck.length)], b = deck[Math.floor(r() * deck.length)];
      const k = [a, b].sort().join("");
      if (a === b || seen.has(k)) continue;
      seen.add(k); out.push({ cards: [a, b], w: 0.2 + r() });
    }
    return out;
  });
}
const spec = (board: string[], n: number, seed: number, stacks = [40, 100, 100]): VSpec => ({
  board, ranges: ranges(board, n, seed), potBB: 30, stacks, bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3, rake: CASH_RAKE,
});

describe("étape 2b : calcul rapide des fins de main", () => {
  const boards = [
    ["Ks", "Kd", "8h", "4c", "2s"],            // board pairé
    ["7c", "7d", "7h", "2s", "2d"],            // full au board : énormément d'égalités
    ["Ah", "Kh", "Qh", "Jh", "9c"],            // couleur et quinte possibles
  ];
  boards.forEach((board, bi) => it(`même valeur que le calcul exact, à chaque fin de main et pour chaque joueur (board ${board.join(" ")})`, () => {
    const g = new VRiver3(spec(board, 30, 17 + bi));
    const r = rng(99 + bi);
    let worst = 0, checked = 0;
    for (let e = 0; e < g.terminalCount(); e++) for (const i of [0, 1, 2]) {
      const reach = g.hands.map(h => Float64Array.from(h, () => (r() < 0.15 ? 0 : r())));
      const fast = g.terminalCfv(e, i, reach, "fast"), exact = g.terminalCfv(e, i, reach, "exact");
      fast.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - exact[x])); });
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
    expect(worst).toBeLessThan(1e-7);
  }));

  it("tapis égaux sans rake (un seul pot) : même équivalence", () => {
    const s = { ...spec(boards[0], 25, 5, [100, 100, 100]), rake: null };
    const g = new VRiver3(s), r = rng(3);
    let worst = 0;
    for (let e = 0; e < g.terminalCount(); e++) for (const i of [0, 1, 2]) {
      const reach = g.hands.map(h => Float64Array.from(h, () => r()));
      const fast = g.terminalCfv(e, i, reach, "fast"), exact = g.terminalCfv(e, i, reach, "exact");
      fast.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - exact[x])); });
    }
    expect(worst).toBeLessThan(1e-7);
  });

  // Les stratégies elles-mêmes peuvent différer : quand plusieurs actions ont un regret nul, un écart de 10⁻¹³ suffit à
  // faire basculer la stratégie du moment. Le critère est donc la qualité atteinte, mesurée par le calcul exact.
  it("CFR avec le calcul rapide : même précision qu'avec le calcul exact, mesurée par le calcul exact", () => {
    const s = spec(boards[1], 12, 8);
    const fast = new VRiver3(s, { terminal: "fast" }), exact = new VRiver3(s, { terminal: "exact" });
    fast.run(400); exact.run(400);
    const ncFast = exact.nashConv(fast.averageProfile()), ncExact = exact.nashConv(exact.averageProfile());
    expect(ncFast).toBeLessThan(0.002 * s.potBB);
    expect(ncExact).toBeLessThan(0.002 * s.potBB);
    expect(fast.nashConv(fast.averageProfile())).toBeCloseTo(ncFast, 8);
  }, 60000);
});
