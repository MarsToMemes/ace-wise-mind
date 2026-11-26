import { describe, it, expect } from "vitest";
import { Solver } from "@/engines/endgame/cfr";
import { solveEndgame, solveEndgameAsync, ENDGAME_LIMITS } from "@/engines/endgame/solve";
import { inProcessPool, startCores, riverCards, shareCards } from "@/engines/endgame/parallel";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";

// D41 : la turn répartie sur des ouvriers doit donner exactement le même calcul que sur un cœur.
const board = ["Ks", "9d", "4c", "7h"];
const R = (t: string) => expandRange(parseRangeText(t), board);
const opts = { street: "Turn" as const, board, startPot: 12, stack: 94, ranges: [R("99,44,K9s,KTs,QJs,T8s,65s"), R("KK,KQs,AK,JTs,A5s")] as [ReturnType<typeof R>, ReturnType<typeof R>], rake: CASH_RAKE };

describe("solveur de fin de main, turn sur plusieurs cœurs (D41)", () => {
  it("les 48 cartes de river sont toutes réparties, une fois chacune", () => {
    const parts = shareCards(48, 7);
    expect(parts.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 48 }, (_, k) => k));
  });

  it("mêmes stratégies au bit près qu'un calcul sur un cœur, après 30 itérations, avec 3 ouvriers", async () => {
    const one = new Solver(opts);
    one.run(30);
    const par = new Solver(opts);
    const ask = await startCores(inProcessPool(3), opts, riverCards(opts));
    await par.runAsync(30, Infinity, ask);
    // nœuds de la turn chez le chef ; nœuds de river : demandés aux ouvriers à travers les valeurs (comparées plus bas)
    for (const n of one.nodes.filter(x => x.street === "Turn")) {
      expect(Array.from(par.averageStrategy(n))).toEqual(Array.from(one.averageStrategy(n)));
    }
    expect(await par.exploitabilityPctAsync(ask)).toBe(one.exploitabilityPct());
  }, 60000);

  it("solveEndgameAsync rend le même résultat que solveEndgame (mêmes itérations, précision, fréquences et EV)", async () => {
    const inp = { ...opts, hero: 0 as const, heroCards: ["9h", "9c"] as [string, string], path: [], maxIter: 60, timeBudgetMs: 1e9, targetPct: 0 };
    const a = solveEndgame(inp)!;
    const b = (await solveEndgameAsync(inp, o => startCores(inProcessPool(4), o, riverCards(o))))!;
    expect(b.iterations).toBe(a.iterations);
    expect(b.exploitPct).toBe(a.exploitPct);
    expect(b.actions).toEqual(a.actions);
    expect(b.range).toEqual(a.range);
  }, 60000);
});

describe("turn : premier conseil à mi-chemin, puis affinage jusqu'à 30 s (D41)", () => {
  it("limites de la turn : 30 s, 1 000 itérations, premier conseil à 15 s ; river inchangée (3 s, 1 500)", () => {
    expect(ENDGAME_LIMITS.Turn).toEqual({ budgetMs: 30000, maxIter: 1000, firstResultMs: 15000 });
    expect(ENDGAME_LIMITS.River).toEqual({ budgetMs: 3000, maxIter: 1500, firstResultMs: Infinity });
  });

  const inp = { ...opts, hero: 0 as const, heroCards: ["9h", "9c"] as [string, string], path: [], maxIter: 100, timeBudgetMs: 1e9, targetPct: 0, firstResultMs: 0 };

  it("sur un cœur : un premier résultat, une seule fois, avant le résultat final et avec moins d'itérations", () => {
    const partial: number[] = [];
    const r = solveEndgame({ ...inp, onPartial: p => partial.push(p.iterations) })!;
    expect(partial.length).toBe(1);
    expect(partial[0]).toBeGreaterThan(0);
    expect(partial[0]).toBeLessThan(r.iterations);
  }, 60000);

  it("avec les ouvriers : même premier résultat que sur un cœur", async () => {
    const a: unknown[] = [], b: unknown[] = [];
    solveEndgame({ ...inp, onPartial: p => a.push({ it: p.iterations, ex: p.exploitPct, act: p.actions }) });
    await solveEndgameAsync({ ...inp, onPartial: p => b.push({ it: p.iterations, ex: p.exploitPct, act: p.actions }) }, o => startCores(inProcessPool(3), o, riverCards(o)));
    expect(b).toEqual(a);
  }, 60000);

  it("précision visée atteinte avant 15 s : pas de premier résultat", () => {
    const partial: number[] = [];
    solveEndgame({ ...inp, targetPct: 100, firstResultMs: 15000, onPartial: p => partial.push(p.iterations) });
    expect(partial).toEqual([]);
  }, 60000);
});
