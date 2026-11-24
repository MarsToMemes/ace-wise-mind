import { describe, it, expect } from "vitest";
import { VRiver3, fromRiverSpec, type VSpec } from "@/engines/multiway/vriver3";
import { MICRO_RIVER } from "@/engines/multiway/river3";
import { inProcessPool } from "@/engines/multiway/vparallel";
import { MemoryStore, solveSpot, spotKey } from "@/engines/multiway/spotCache";
import { CASH_RAKE } from "@/core/rake";

// Mémoire des spots déjà calculés (D21).
const rich: VSpec = { ...fromRiverSpec(MICRO_RIVER), bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3, stacks: [40, 100, 100], rake: CASH_RAKE };
const same = (a: Map<number, Float64Array>, b: Map<number, Float64Array>) => {
  expect(b.size).toBe(a.size);
  let worst = 0;
  a.forEach((s, id) => s.forEach((x, k) => { worst = Math.max(worst, Math.abs(x - b.get(id)![k])); }));
  return worst;
};

describe("D21 : mémoire des spots déjà calculés", () => {
  it("empreinte : même spot = même clé (même s'il est recréé) ; un tapis différent = autre clé", () => {
    expect(spotKey(rich)).toBe(spotKey(JSON.parse(JSON.stringify(rich))));
    expect(spotKey({ ...rich, stacks: [41, 100, 100] })).not.toBe(spotKey(rich));
    expect(spotKey(rich, "cfr+")).not.toBe(spotKey(rich));
  });

  it("un spot déjà résolu à la précision voulue revient instantanément, avec la même stratégie", async () => {
    const store = new MemoryStore();
    const a = await solveSpot(rich, { store, target: 0.001, maxIterations: 1500 });
    expect(a.fromCache).toBe(false);
    expect(a.nashConv).toBeLessThanOrEqual(0.001 * rich.potBB);
    const t0 = Date.now(), b = await solveSpot(JSON.parse(JSON.stringify(rich)), { store, target: 0.001 });
    expect(b.fromCache).toBe(true);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(same(a.profile, b.profile)).toBe(0);
  }, 120000);

  it("plus de précision demandée : le calcul reprend là où il s'était arrêté, comme s'il n'avait jamais été interrompu", async () => {
    const store = new MemoryStore();
    await solveSpot(rich, { store, target: 1e-9, maxIterations: 200, every: 100 });
    const resumed = await solveSpot(rich, { store, target: 1e-9, maxIterations: 400, every: 100 });
    expect(resumed.resumedFrom).toBe(200);
    expect(resumed.checks.map(c => c.iterations)).toEqual([300, 400]);
    const v = new VRiver3(rich), straight = v.solve(400, 100, 1e-9 * rich.potBB);
    expect(resumed.checks.map(c => c.nashConv)).toEqual(straight.checks.slice(2).map(c => c.nashConv));
  }, 120000);

  it("calcul réparti : même reprise exacte", async () => {
    const store = new MemoryStore(), pool = inProcessPool(3);
    await solveSpot(rich, { store, pool, target: 1e-9, maxIterations: 100, every: 50 });
    const resumed = await solveSpot(rich, { store, pool: inProcessPool(3), target: 1e-9, maxIterations: 200, every: 50 });
    const straight = new VRiver3(rich).solve(200, 50, 1e-9 * rich.potBB);
    resumed.checks.forEach((c, k) => expect(c.nashConv).toBeCloseTo(straight.checks[k + 2].nashConv, 10));
  }, 120000);

  it("la mémoire garde au plus `max` spots, les plus récemment utilisés", () => {
    const store = new MemoryStore(2), e = { state: { iterations: 0, regret: [], sum: [] }, best: { profile: [], nashConv: 1, iterations: 0 } };
    store.set("a", e); store.set("b", e); store.get("a"); store.set("c", e);
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")).toBeDefined();
    expect(store.size).toBe(2);
  });
});
