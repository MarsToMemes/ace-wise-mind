import { describe, it, expect } from "vitest";
import { VRiver3, type VSpec, type VProfile } from "@/engines/multiway/vriver3";
import { VRiverN } from "@/engines/multiway/vriverN";
import { inProcessPool } from "@/engines/multiway/vparallel";
import { buildBetTree } from "@/engines/multiway/betTree";
import { solveLive, AsyncMemoryStore, type LiveProgress } from "@/engines/multiway/liveSolve";
import { CASH_RAKE } from "@/core/rake";

// Étape A2 : calcul par morceaux, au fil de l'eau (conseil et précision à chaque contrôle), arrêt à la précision visée
// ou au temps maximum, reprise exacte d'un calcul interrompu.
const BOARD = ["Kh", "9d", "4c", "7s", "2h"];
const DECK = "23456789TJQKA".split("").flatMap(r => "cdhs".split("").map(s => r + s)).filter(c => !BOARD.includes(c));
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
function spec(n: number, size: number, seed: number): VSpec {
  const r = rng(seed);
  const ranges = Array.from({ length: n }, () => {
    const seen = new Set<string>(), hs: { cards: [string, string]; w: number }[] = [];
    while (hs.length < size) {
      const a = DECK[Math.floor(r() * DECK.length)], b = DECK[Math.floor(r() * DECK.length)], k = [a, b].sort().join("");
      if (a !== b && !seen.has(k)) { seen.add(k); hs.push({ cards: [a, b], w: 0.3 + r() }); }
    }
    return hs;
  });
  return { board: BOARD, ranges, potBB: 20, stacks: Array(n).fill(60), rake: CASH_RAKE,
    bets: n === 4 ? [0.5, 1] : [0.33, 1], raise: true, allin: true, maxAggr: 2, invested0: Array(n).fill(20 / n) };
}
const same = (a: VProfile, b: VProfile) => {
  expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
  for (const [id, s] of a) expect(Array.from(s)).toEqual(Array.from(b.get(id)!));
};

describe("A2 : calcul au fil de l'eau", () => {
  it("3 joueurs, d'un seul tenant : par morceaux = calcul d'un seul tenant, au bit près", async () => {
    const s = spec(3, 8, 1), ref = new VRiver3(s).solve(60, 20, 0);
    const res = await solveLive(s, { every: 20, maxIterations: 60, target: 0 });
    expect(res.nashConv).toBe(ref.nashConv);
    expect(res.iterations).toBe(ref.iterations);
    same(res.profile, ref.profile);
  });

  it("3 joueurs avec ouvriers (sous-arbres) et 4 joueurs avec ouvriers (fins de main) : mêmes résultats au bit près", async () => {
    const s3 = spec(3, 8, 2), r3 = new VRiver3(s3).solve(40, 20, 0);
    const p3 = await solveLive(s3, { every: 20, maxIterations: 40, target: 0, pool: inProcessPool(3) });
    expect(p3.nashConv).toBe(r3.nashConv); same(p3.profile, r3.profile);
    const s4 = spec(4, 5, 3), r4 = new VRiverN(s4).solve(40, 20, 0);
    const p4 = await solveLive(s4, { every: 20, maxIterations: 40, target: 0, pool: inProcessPool(3) });
    expect(p4.nashConv).toBe(r4.nashConv); same(p4.profile, r4.profile);
  });

  it("2 joueurs : le calcul marche aussi en tête-à-tête", async () => {
    const res = await solveLive(spec(2, 10, 4), { every: 50, maxIterations: 300, target: 0.001 });
    expect(res.nashConv).toBeLessThan(0.05 * 20);
  });

  it("progression : une étape par contrôle, itérations croissantes, conseil de la main suivie, raison d'arrêt", async () => {
    const s = spec(3, 8, 5), seen: LiveProgress[] = [];
    const res = await solveLive(s, { every: 10, maxIterations: 50, target: 0, watch: { node: 0, player: 0, hand: 2 }, onProgress: p => seen.push(p) });
    expect(seen.map(p => p.iterations)).toEqual([10, 20, 30, 40, 50]);
    const A = buildBetTree({ n: 3, potBB: s.potBB, stacks: s.stacks, bets: s.bets, raise: s.raise, allin: s.allin, maxAggr: s.maxAggr, rake: s.rake }).acts[0].actions.length;
    expect(seen.every(p => p.strategy!.length === A)).toBe(true);
    seen.forEach(p => expect(p.strategy!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9));
    expect(seen.at(-1)!.done).toBe(true);
    expect(res.reason).toBe("max");
    expect(seen.at(-1)!.nashConvPct).toBeCloseTo(100 * res.nashConv / s.potBB, 12);
  });

  it("arrêt à la précision visée, ou au temps maximum", async () => {
    const s = spec(3, 8, 6);
    // précision visée = celle mesurée au 3e contrôle : le calcul s'arrête juste là
    const seen: number[] = [];
    await solveLive(s, { every: 10, maxIterations: 30, target: 0, onProgress: p => seen.push(p.nashConvPct) });
    const t = await solveLive(s, { every: 10, maxIterations: 1000, target: (seen[2] / 100) * 1.000001 });
    expect(t.reason).toBe("target"); expect(t.iterations).toBeLessThanOrEqual(30);
    const m = await solveLive(s, { every: 10, maxIterations: 1000, target: 0, maxMs: 0 });
    expect(m.reason).toBe("time"); expect(m.iterations).toBe(10);
  });

  it("interrompu puis repris (mémoire des spots) = jamais interrompu ; spot déjà assez précis : rendu tout de suite", async () => {
    const s = spec(3, 8, 7), ref = await solveLive(s, { every: 20, maxIterations: 100, target: 0 });
    const store = new AsyncMemoryStore();
    const a = await solveLive(s, { every: 20, maxIterations: 40, target: 0, store });
    expect(a.iterations).toBe(40);
    const b = await solveLive(s, { every: 20, maxIterations: 100, target: 0, store });
    expect(b.resumedFrom).toBe(40);
    expect(b.nashConv).toBe(ref.nashConv); same(b.profile, ref.profile);
    const c = await solveLive(s, { every: 20, maxIterations: 100, target: (b.nashConv / s.potBB) * 1.000001, store });
    expect(c.reason).toBe("cache"); same(c.profile, ref.profile);
  });

  it("arrêt demandé entre deux contrôles : l'état est gardé et le calcul reprend de là", async () => {
    const s = spec(3, 8, 8), store = new AsyncMemoryStore();
    let n = 0;
    const a = await solveLive(s, { every: 10, maxIterations: 100, target: 0, store, shouldStop: () => ++n >= 3 });
    expect(a.reason).toBe("stopped"); expect(a.iterations).toBe(30);
    const b = await solveLive(s, { every: 10, maxIterations: 50, target: 0, store });
    expect(b.resumedFrom).toBe(30);
    const ref = await solveLive(s, { every: 10, maxIterations: 50, target: 0 });
    expect(b.nashConv).toBe(ref.nashConv);
  });
});

import { portPool, serveCore } from "@/engines/multiway/portPool";

describe("A2 : ouvriers reliés par des canaux de messages (comme les Web Workers)", () => {
  it("3 et 4 joueurs : mêmes résultats au bit près que le calcul d'un seul tenant, données copiées par les canaux", async () => {
    const chans = Array.from({ length: 3 }, () => new MessageChannel());
    chans.forEach(c => serveCore(c.port2));
    const pool = portPool(chans.map(c => c.port1));
    const s3 = spec(3, 8, 9), r3 = new VRiver3(s3).solve(40, 20, 0);
    const p3 = await solveLive(s3, { every: 20, maxIterations: 40, target: 0, pool });
    expect(p3.nashConv).toBe(r3.nashConv); same(p3.profile, r3.profile);
    const s4 = spec(4, 5, 10), r4 = new VRiverN(s4).solve(20, 20, 0);
    const p4 = await solveLive(s4, { every: 20, maxIterations: 20, target: 0, pool });
    expect(p4.nashConv).toBe(r4.nashConv);
    pool.close!();
  });
});

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

describe("A2 : les Web Workers ne chargent aucun fichier d'interface", () => {
  it("aucun .tsx (composants React : ils supposent une fenêtre de page) dans ce que chargent le chef et les ouvriers", () => {
    const root = resolve(__dirname, ".."), seen = new Set<string>(), tsx: string[] = [];
    const file = (spec: string, from: string) => {
      const base = spec.startsWith("@/") ? resolve(root, spec.slice(2)) : resolve(dirname(from), spec);
      return [base + ".ts", base + ".tsx", base].find(f => existsSync(f) && !f.endsWith("/"));
    };
    const walk = (f: string) => {
      if (seen.has(f)) return; seen.add(f);
      if (f.endsWith(".tsx")) { tsx.push(f.slice(root.length + 1)); return; }
      // imports qui restent à l'exécution (les « import type » disparaissent)
      for (const m of readFileSync(f, "utf8").matchAll(/^import\s+(?!type\s)[^;]*?from\s+"([^"]+)"/gms)) {
        if (!m[1].startsWith("@/") && !m[1].startsWith(".")) continue;
        const g = file(m[1], f); if (g) walk(g);
      }
    };
    walk(resolve(root, "engines/multiway/chefWorker.ts")); walk(resolve(root, "engines/multiway/coreWorker.ts"));
    expect(tsx).toEqual([]);
  });
});
