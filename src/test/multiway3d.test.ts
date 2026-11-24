import { describe, it, expect } from "vitest";
import { buildBetTree } from "@/engines/multiway/betTree";
import { HandTable, exactCfvN } from "@/engines/multiway/nTerminal";
import { exactCfvFast } from "@/engines/multiway/nExact";
import { VRiver3 } from "@/engines/multiway/vriver3";
import { CASH_RAKE } from "@/core/rake";

// Calcul exact des fins de main à n joueurs (D25) : deux adversaires calculés par la méthode rapide (inclusion-exclusion
// sur les cartes, mains triées par force), tous les autres énumérés main par main. Aucune approximation.
const BOARD = ["Ks", "Kd", "8h", "4c", "2s"];
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s)).filter(c => !BOARD.includes(c));
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function ranges(n: number, sizes: number[], seed: number) {
  const r = rng(seed), out: [string, string][][] = [];
  for (let p = 0; p < n; p++) {
    const seen = new Set<string>(), hs: [string, string][] = [];
    while (hs.length < sizes[p]) {
      const a = DECK[Math.floor(r() * DECK.length)], b = DECK[Math.floor(r() * DECK.length)], k = [a, b].sort().join("");
      if (a !== b && !seen.has(k)) { seen.add(k); hs.push([a, b]); }
    }
    out.push(hs);
  }
  return out;
}
const tree = (n: number) => buildBetTree({ n, potBB: 20, stacks: [100, 12, 45, 100, 30, 70].slice(0, n), rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2 });

describe("D25 : fins de main exactes à n joueurs", () => {
  for (const [n, sizes] of [[4, [9, 7, 8, 6]], [5, [6, 5, 7, 4, 5]]] as const) it(`${n} joueurs, tapis inégaux (pots annexes), égalités fréquentes : égal à l'énumération complète`, () => {
    const t = tree(n), h = new HandTable(BOARD, ranges(n, [...sizes], 13 + n)), r = rng(17);
    let worst = 0, checked = 0;
    for (const e of t.ends) for (let i = 0; i < n; i++) {
      if (r() > 0.25) continue;                             // un quart des fins de main, tous joueurs : suffisant et rapide
      const reach = h.hands.map(hs => Float64Array.from(hs, () => (r() < 0.15 ? 0 : r())));
      const a = exactCfvFast(h, e, i, reach), b = exactCfvN(h, e, i, reach);
      a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); }); checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(worst).toBeLessThan(1e-8);
  }, 120000);

  it("3 joueurs : égal au calcul rapide du solveur à 3 joueurs (déjà validé)", () => {
    const rs = ranges(3, [40, 30, 25], 5), h = new HandTable(BOARD, rs), t = tree(3), r = rng(2);
    const v = new VRiver3({ board: BOARD, potBB: 20, stacks: [100, 12, 45], rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2,
      ranges: rs.map(x => x.map(cards => ({ cards, w: 1 }))) }, { terminal: "fast" });
    let worst = 0;
    t.ends.forEach((e, k) => { for (let i = 0; i < 3; i++) {
      const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
      const a = exactCfvFast(h, e, i, reach), b = v.terminalCfv(k, i, reach, "fast");
      a.forEach((x, j) => { worst = Math.max(worst, Math.abs(x - b[j])); });
    } });
    expect(worst).toBeLessThan(1e-7);
  });

  it("2 joueurs : égal à l'énumération", () => {
    const t = tree(2), h = new HandTable(BOARD, ranges(2, [20, 20], 8)), r = rng(4);
    let worst = 0;
    for (const e of t.ends) for (let i = 0; i < 2; i++) {
      const reach = h.hands.map(hs => Float64Array.from(hs, () => r()));
      const a = exactCfvFast(h, e, i, reach), b = exactCfvN(h, e, i, reach);
      a.forEach((v, x) => { worst = Math.max(worst, Math.abs(v - b[x])); });
    }
    expect(worst).toBeLessThan(1e-9);
  });
});

import { VRiverN } from "@/engines/multiway/vriverN";
import { river3, type RiverSpec } from "@/engines/multiway/river3";
import { expectedValues as explicitEV, nashConv as explicitNC } from "@/engines/multiway/bestResponse";
import type { VSpec } from "@/engines/multiway/vriver3";

describe("D25 : solveur exact à n joueurs", () => {
  it("3 joueurs : mêmes valeurs et même NashConv que le solveur à 3 joueurs, pour une même stratégie", () => {
    const rs = ranges(3, [30, 25, 20], 21);
    const spec: VSpec = { board: BOARD, potBB: 20, stacks: [100, 40, 100], rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2,
      ranges: rs.map(x => x.map(cards => ({ cards, w: 1 }))) };
    const v3 = new VRiver3(spec, { terminal: "fast" }); v3.run(30);
    const prof = v3.averageProfile(), vn = new VRiverN(spec);
    vn.expectedValues(prof).forEach((x, i) => expect(x).toBeCloseTo(v3.expectedValues(prof)[i], 8));
    expect(vn.nashConv(prof)).toBeCloseTo(v3.nashConv(prof), 8);
  });

  it("4 joueurs : recoupement avec l'arbre explicite (valeurs et NashConv d'une stratégie calculée)", () => {
    const rs: RiverSpec = {
      board: BOARD, potBB: 30, stacks: [100, 25, 100, 60], betFrac: 0.75, rake: CASH_RAKE,
      ranges: [[["Ah", "Kh"], ["6s", "5s"], ["Qd", "Jd"]], [["Ac", "Ad"], ["7s", "6h"]], [["Kc", "Qc"], ["5h", "3h"]], [["Qh", "Qs"], ["9c", "9d"], ["Jh", "Th"]]],
    };
    const spec: VSpec = { board: rs.board, potBB: 30, stacks: rs.stacks, rake: CASH_RAKE, bets: [0.75], raise: false, allin: false, maxAggr: 1,
      ranges: rs.ranges.map(r => r.map(cards => ({ cards, w: 1 }))) };
    const vn = new VRiverN(spec); vn.run(1000); // mesuré : 0,0105 à 1 000 itérations, plateau vers 0,007 (pot 30)
    const prof = vn.averageProfile(), g = river3(rs);
    const explicit = (info: string) => {
      const [p, cards, hist] = info.split("|"), node = vn.tree.byHist.get(`${p}|${hist}`);
      if (!node) return undefined;
      const N = vn.handCount(+p), x = vn.h.hands[+p].findIndex(hh => hh.join("") === cards), s = prof.get(node.id)!;
      return node.actions.map((_, a) => s[a * N + x]);
    };
    vn.expectedValues(prof).forEach((x, i) => expect(x).toBeCloseTo(explicitEV(g, explicit)[i], 8));
    expect(vn.nashConv(prof)).toBeCloseTo(explicitNC(g, explicit), 8);
    expect(vn.nashConv(prof)).toBeLessThan(0.001 * spec.potBB);
  }, 120000);

  it("4 joueurs, menu complet et pots annexes : calcul exact rapide = énumération complète, pour l'évaluation", () => {
    const rs = ranges(4, [6, 5, 6, 5], 31);
    const spec: VSpec = { board: BOARD, potBB: 20, stacks: [100, 12, 45, 100], rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2,
      ranges: rs.map(x => x.map(cards => ({ cards, w: 1 }))) };
    const a = new VRiverN(spec); a.run(40);
    const prof = a.averageProfile(), b = new VRiverN(spec, { terminal: "enum" });
    a.expectedValues(prof).forEach((x, i) => expect(x).toBeCloseTo(b.expectedValues(prof)[i], 8));
    expect(a.nashConv(prof)).toBeCloseTo(b.nashConv(prof), 8);
  }, 120000);
});

import { VRiver3Parallel, inProcessPool } from "@/engines/multiway/vparallel";
import { MemoryStore, solveSpot } from "@/engines/multiway/spotCache";

describe("D25 : 4 joueurs, calcul réparti et mémoire des spots", () => {
  const rs = ranges(4, [7, 6, 7, 6], 41);
  const spec: VSpec = { board: BOARD, potBB: 20, stacks: [100, 12, 45, 100], rake: CASH_RAKE, bets: [0.5, 1], raise: true, allin: true, maxAggr: 2,
    ranges: rs.map(x => x.map(cards => ({ cards, w: 1 }))) };

  it("calcul réparti : mêmes résultats au bit près que le calcul d'un seul tenant", async () => {
    const seq = new VRiverN(spec), par = new VRiver3Parallel(spec, inProcessPool(3));
    await par.init();
    seq.run(10); await par.run(10);
    const a = seq.averageProfile(), b = await par.averageProfile();
    let worst = 0;
    a.forEach((s, id) => s.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - b.get(id)![k])); }));
    expect(worst).toBe(0);
    expect(await par.nashConv()).toBeCloseTo(seq.nashConv(a), 10);
  }, 120000);

  it("mémoire : un spot déjà résolu revient instantanément ; reprise exacte d'un calcul interrompu", async () => {
    const store = new MemoryStore();
    await solveSpot(spec, { store, target: 1e-9, maxIterations: 40, every: 20 });
    const resumed = await solveSpot(spec, { store, target: 1e-9, maxIterations: 80, every: 20 });
    expect(resumed.resumedFrom).toBe(40);
    const straight = new VRiverN(spec).solve(80, 20, 1e-9 * spec.potBB);
    expect(resumed.checks.map(c => c.nashConv)).toEqual(straight.checks.slice(2).map(c => c.nashConv));
    const again = await solveSpot(spec, { store, target: 1 });
    expect(again.fromCache).toBe(true);
  }, 120000);
});
