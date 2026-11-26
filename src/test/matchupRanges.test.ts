import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRange, getBaseRange, slotsFor, actsFirstPostflop, preflopStrength } from "@/engines/matchupRanges";
import { saveMyRange } from "@/engines/myRanges";
import { setSolverBaseGame } from "@/engines/solverSpots";

const cash100 = () => JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8"));

describe("matchupRanges", () => {
  beforeEach(() => localStorage.clear());

  it("postflop order: blinds act first, BTN last", () => {
    expect(actsFirstPostflop("BB", "BTN")).toBe(true);
    expect(actsFirstPostflop("BTN", "CO")).toBe(false);
    expect(actsFirstPostflop("UTG", "CO")).toBe(true);
  });

  it("slots for single-raised and 3-bet pots", () => {
    expect(slotsFor("BTN", "BB", "srp")).toEqual({ pfr: "open:BTN", caller: "call:BB:vs:BTN" });
    expect(slotsFor("BB", "BTN", "3bet")).toEqual({ pfr: "3bet:BB:vs:BTN", caller: "call3bet:BTN:vs:BB" });
  });

  afterEach(() => setSolverBaseGame(null));

  it("ouverture : une seule source, la bibliothèque du solveur (plus de table écrite en dur) ; défense : tables de base", () => {
    // sans bibliothèque chargée, aucune range d'ouverture n'est inventée
    expect(getRange("open:UTG")).toMatchObject({ source: "estimated", weights: {} });
    setSolverBaseGame(cash100());
    const open = getRange("open:UTG");
    expect(open.source).toBe("solver");
    expect(open.weights["AA"]).toBe(1);
    expect(open.weights["72o"] ?? 0).toBe(0);
    expect(getBaseRange("open:UTG").weights).toEqual(open.weights);
    expect(getBaseRange("call:BB:vs:BTN").source).toBe("base");
    expect(getBaseRange("call:BB:vs:UTG").source).toBe("estimated");
  });

  it("estimated call-vs-3bet keeps the top of the open range without AA/KK", () => {
    setSolverBaseGame(cash100());
    const r = getBaseRange("call3bet:BTN:vs:BB");
    expect(r.source).toBe("estimated");
    expect(r.weights["AA"] ?? 0).toBe(0);
    expect(r.weights["QQ"]).toBeGreaterThan(0);
    expect(r.weights["72o"] ?? 0).toBe(0);
  });

  it("user range wins", () => {
    saveMyRange("open:UTG", { AA: 1, KK: 1 });
    const r = getRange("open:UTG");
    expect(r.source).toBe("user");
    expect(Object.keys(r.weights).sort()).toEqual(["AA", "KK"]);
  });

  it("preflop strength ranks AA > AKs > 72o", () => {
    expect(preflopStrength("AA")).toBeGreaterThan(preflopStrength("AKs"));
    expect(preflopStrength("AKs")).toBeGreaterThan(preflopStrength("72o"));
  });
});
