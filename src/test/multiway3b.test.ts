import { describe, it, expect } from "vitest";
import { buildBetTree } from "@/engines/multiway/betTree";
import { HandTable, exactCfvN, indepCfvN, pairMass } from "@/engines/multiway/nTerminal";
import { CASH_RAKE } from "@/core/rake";

// Étape 3b : valeur des fins de main à n joueurs.
// Calcul exact = toutes les combinaisons de mains adverses compatibles (aucune carte partagée), sert de référence.
// Calcul approché = les cartes de ta main et du board sont retirées des ranges adverses, mais deux adversaires sont
// supposés indépendants (ils pourraient « partager » une carte). Rapide : O(n²) par main au lieu de O(N^(n−1)).
const BOARD = ["Ks", "Kd", "8h", "4c", "2s"];
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s)).filter(c => !BOARD.includes(c));
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function ranges(n: number, size: number, seed: number, disjoint = false) {
  const r = rng(seed), out: [string, string][][] = [];
  const pool = disjoint ? [...DECK].sort(() => r() - 0.5) : DECK;
  for (let p = 0; p < n; p++) {
    const cards = disjoint ? pool.slice(p * 8, p * 8 + 8) : pool, seen = new Set<string>(), hs: [string, string][] = [];
    while (hs.length < size) {
      const a = cards[Math.floor(r() * cards.length)], b = cards[Math.floor(r() * cards.length)], k = [a, b].sort().join("");
      if (a !== b && !seen.has(k)) { seen.add(k); hs.push([a, b]); }
    }
    out.push(hs);
  }
  return out;
}
const treeFor = (n: number) => buildBetTree({ n, potBB: 20, stacks: [100, 12, 45, 100, 30, 70].slice(0, n), rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2 });

describe("étape 3b : fins de main à n joueurs", () => {
  for (const n of [2, 3, 4]) it(`${n} joueurs aux cartes séparées (aucun partage possible) : l'approché égale l'exact`, () => {
    const t = treeFor(n), h = new HandTable(BOARD, ranges(n, 6, 3 + n, true)), r = rng(11);
    let worst = 0;
    for (const e of t.ends) for (let i = 0; i < n; i++) {
      const reach = h.hands.map(hs => Float64Array.from(hs, () => (r() < 0.2 ? 0 : r())));
      const a = indepCfvN(h, e, i, reach), b = exactCfvN(h, e, i, reach);
      a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); });
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("2 joueurs, cartes partagées possibles : l'approché reste exact (un seul adversaire)", () => {
    const t = treeFor(2), h = new HandTable(BOARD, ranges(2, 25, 5)), r = rng(2);
    let worst = 0;
    for (const e of t.ends) for (let i = 0; i < 2; i++) {
      const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
      const a = indepCfvN(h, e, i, reach), b = exactCfvN(h, e, i, reach);
      a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); });
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("le calcul exact à n joueurs égale celui du solveur à 3 joueurs (référence déjà validée)", async () => {
    const { VRiver3 } = await import("@/engines/multiway/vriver3");
    const rs = ranges(3, 12, 9);
    const v = new VRiver3({ board: BOARD, potBB: 20, stacks: [100, 12, 45], rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2,
      ranges: rs.map(r => r.map(cards => ({ cards, w: 1 }))) }, { terminal: "exact" });
    const t = treeFor(3), h = new HandTable(BOARD, rs), r = rng(4);
    let worst = 0;
    t.ends.forEach((e, k) => { for (let i = 0; i < 3; i++) {
      const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
      const a = exactCfvN(h, e, i, reach), b = v.terminalCfv(k, i, reach, "exact");
      a.forEach((x, j) => { worst = Math.max(worst, Math.abs(x - b[j])); });
    } });
    expect(worst).toBeLessThan(1e-9);
  });

  // Piste A : correction de la masse par paires d'adversaires (D23)
  it("masse exacte d'une paire d'adversaires : égale à l'énumération de toutes les paires sans carte partagée", () => {
    const h = new HandTable(BOARD, ranges(3, 30, 21)), r = rng(5);
    const reach = h.hands.map(hs => Float64Array.from(hs, () => (r() < 0.1 ? 0 : r())));
    const d = pairMass(h, 0, 1, 2, reach);
    let worst = 0;
    h.hands[0].forEach(([a, b], x) => {
      let s = 0;
      h.hands[1].forEach(([c, e], y) => {
        if ([c, e].some(k => k === a || k === b)) return;
        h.hands[2].forEach(([f, g2], z) => { if (![f, g2].some(k => k === a || k === b || k === c || k === e)) s += reach[1][y] * reach[2][z]; });
      });
      worst = Math.max(worst, Math.abs(s - d[x]));
    });
    expect(worst).toBeLessThan(1e-9);
  });

  it("3 joueurs, fins de main où ta main ne joue plus (tu t'es couché) : avec la correction, l'approché égale l'exact", () => {
    const t = treeFor(3), h = new HandTable(BOARD, ranges(3, 25, 8)), r = rng(6);
    let worst = 0, n = 0;
    for (const e of t.ends) for (let i = 0; i < 3; i++) {
      if (!e.folded[i]) continue;
      const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
      const a = indepCfvN(h, e, i, reach, true), b = exactCfvN(h, e, i, reach);
      a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); }); n++;
    }
    expect(n).toBeGreaterThan(10);
    expect(worst).toBeLessThan(1e-9);
  });

  it("avec la correction : toujours exact à 2 joueurs et quand les adversaires ne peuvent pas partager de carte", () => {
    for (const [n, disjoint] of [[2, false], [4, true]] as const) {
      const t = treeFor(n), h = new HandTable(BOARD, ranges(n, 8, 30 + n, disjoint)), r = rng(9);
      let worst = 0;
      for (const e of t.ends.slice(0, 120)) for (let i = 0; i < n; i++) {
        const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
        const a = indepCfvN(h, e, i, reach, true), b = exactCfvN(h, e, i, reach);
        a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); });
      }
      expect(worst).toBeLessThan(1e-9);
    }
  });
});
