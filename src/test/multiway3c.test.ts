import { describe, it, expect } from "vitest";
import { buildBetTree } from "@/engines/multiway/betTree";
import { HandTable, exactCfvN } from "@/engines/multiway/nTerminal";
import { VRiverMC, sampleTuples, sampledCfv } from "@/engines/multiway/vmc";
import { VRiver3, type VSpec } from "@/engines/multiway/vriver3";
import { CASH_RAKE } from "@/core/rake";

// Piste C (D24) : à chaque parcours, on tire des mains pour les adversaires (selon leurs poids, sans aucune carte
// partagée), et on calcule les valeurs de toutes les mains du joueur qui apprend contre ces tirages.
const BOARD = ["Ks", "Kd", "8h", "4c", "2s"];
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s)).filter(c => !BOARD.includes(c));
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function ranges(n: number, size: number, seed: number) {
  const r = rng(seed), out: [string, string][][] = [];
  for (let p = 0; p < n; p++) {
    const seen = new Set<string>(), hs: [string, string][] = [];
    while (hs.length < size) {
      const a = DECK[Math.floor(r() * DECK.length)], b = DECK[Math.floor(r() * DECK.length)], k = [a, b].sort().join("");
      if (a !== b && !seen.has(k)) { seen.add(k); hs.push([a, b]); }
    }
    out.push(hs);
  }
  return out;
}

describe("piste C : tirage des mains adverses", () => {
  it("sans biais : la moyenne des valeurs tirées est proportionnelle à la valeur exacte (4 joueurs)", () => {
    const n = 4, h = new HandTable(BOARD, ranges(n, 10, 3)), r = rng(1);
    const t = buildBetTree({ n, potBB: 20, stacks: [100, 30, 60, 100], rake: CASH_RAKE, bets: [0.75], raise: false, allin: true, maxAggr: 1 });
    const reach = h.hands.map(hs => Float64Array.from(hs, () => 0.2 + r()));
    const e = t.ends.find(x => x.folded.every(f => !f))!, i = 1;
    const exact = exactCfvN(h, e, i, reach);
    const tuples = sampleTuples(h, i, reach, 200000, rng(42));
    const est = sampledCfv(h, e, i, tuples);
    // échelle commune inconnue (masse totale) : on compare après normalisation par la somme des valeurs absolues
    const norm = (v: Float64Array) => { const s = v.reduce((a, b) => a + Math.abs(b), 0); return Array.from(v, x => x / s); };
    const a = norm(exact), b = norm(est);
    let worst = 0; a.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - b[k])); });
    expect(worst).toBeLessThan(0.01);
  });

  it("les tirages respectent les cartes : jamais deux adversaires avec la même carte, ni une carte du board", () => {
    const h = new HandTable(BOARD, ranges(5, 30, 7)), reach = h.hands.map(hs => Float64Array.from(hs, () => 1));
    const tuples = sampleTuples(h, 0, reach, 2000, rng(3));
    for (const tu of tuples.hands) {
      const cards = tu.flatMap((y, k) => (y < 0 ? [] : h.hands[k][y]));
      expect(new Set(cards).size).toBe(cards.length);
      cards.forEach(c => expect(BOARD.includes(c)).toBe(false));
    }
  });

  it("même graine = mêmes résultats", () => {
    const spec: VSpec = { board: BOARD, potBB: 20, stacks: [100, 100, 100], rake: CASH_RAKE, bets: [0.75], raise: false, allin: true, maxAggr: 1,
      ranges: ranges(3, 12, 5).map(r => r.map(cards => ({ cards, w: 1 }))) };
    const a = new VRiverMC(spec, { samples: 32, seed: 9 }), b = new VRiverMC(spec, { samples: 32, seed: 9 });
    a.run(20); b.run(20);
    expect([...a.averageProfile().values()].flatMap(x => Array.from(x))).toEqual([...b.averageProfile().values()].flatMap(x => Array.from(x)));
  });

  it("3 joueurs : la stratégie trouvée par tirage, jugée avec le calcul exact, s'approche de l'équilibre", () => {
    const spec: VSpec = { board: BOARD, potBB: 20, stacks: [100, 100, 100], rake: CASH_RAKE, bets: [0.75], raise: false, allin: true, maxAggr: 1,
      ranges: ranges(3, 15, 11).map(r => r.map(cards => ({ cards, w: 1 }))) };
    const judge = new VRiver3(spec, { terminal: "exact" }), mc = new VRiverMC(spec, { samples: 64, seed: 1 });
    const nc = [100, 400, 1600].map(it => { mc.run(it - mc.iterations); return judge.nashConv(mc.averageProfile()); });
    expect(nc[2]).toBeLessThan(nc[0]);
    expect(nc[2]).toBeLessThan(0.005 * spec.potBB);
  }, 120000);
});
