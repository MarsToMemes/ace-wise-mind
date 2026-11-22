import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { mapHouseAction, summarize, compareAdvisorSolver, type Comparison } from "@/bench/advisorVsSolver";
import type { EndgameAction } from "@/engines/endgame/solve";
import type { SolverGame } from "@/engines/solverSpots";

const act = (kind: EndgameAction["kind"], to: number, freq: number, ev: number): EndgameAction => ({ kind, to, label: kind, freq, ev });

describe("brique 2 : relier le conseil maison à une action du solveur", () => {
  const root = [act("check", 0, 0.5, 2), act("bet", 3.3, 0.1, 1.5), act("bet", 7.5, 0.3, 2.1), act("bet", 12.5, 0.1, 1), act("allin", 90, 0, -3)];
  it("check et check-raise (pas encore de mise) → check", () => {
    expect(mapHouseAction({ action: "check" }, root, false)).toBe(0);
    expect(mapHouseAction({ action: "checkRaise" }, root, false)).toBe(0);
  });
  it("une mise va à la taille la plus proche", () => {
    expect(mapHouseAction({ action: "bet", sizeBB: 7 }, root, false)).toBe(2);
    expect(mapHouseAction({ action: "block", sizeBB: 3 }, root, false)).toBe(1);
    expect(mapHouseAction({ action: "jam", sizeBB: 90 }, root, false)).toBe(4);
  });
  const facing = [act("fold", 0, 0.4, 0), act("call", 7.5, 0.5, 0.3), act("raise", 30, 0.05, -1), act("allin", 90, 0.05, -2)];
  it("face à une mise : fold, call, relance à la taille la plus proche", () => {
    expect(mapHouseAction({ action: "fold" }, facing, true)).toBe(0);
    expect(mapHouseAction({ action: "call" }, facing, true)).toBe(1);
    expect(mapHouseAction({ action: "raise", sizeBB: 25 }, facing, true)).toBe(2);
    expect(mapHouseAction({ action: "checkRaise", sizeBB: 28 }, facing, true)).toBe(2);
  });
});

describe("brique 2 : bilan par type de situation", () => {
  const row = (cat: string, loss: number, agree: boolean, pot = 10): Comparison =>
    ({ id: cat + loss, category: cat, street: "River", decision: "x", role: "value", pot, house: "a", solver: "b", loss, agree, describe: "" });
  it("compte, accord et perte moyenne (bb et % du pot)", () => {
    const s = summarize([row("A", 0, true), row("A", 1, false), row("B", 0.5, true)]);
    const a = s.find(x => x.category === "A")!;
    expect(a.n).toBe(2);
    expect(a.agreePct).toBe(50);
    expect(a.lossBB).toBeCloseTo(0.5, 9);
    expect(a.lossPctPot).toBeCloseTo(5, 9);
  });
});

describe("brique 2 : petit lancement réel", () => {
  it("compare deux situations river avec les vrais moteurs", () => {
    const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
    const rows = compareAdvisorSolver(g, { river: 2, turn: 0, seed: 3, iterations: 60, samples: 200 });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(Number.isFinite(r.loss)).toBe(true);
      expect(r.loss).toBeGreaterThanOrEqual(0);
      expect(r.pot).toBeGreaterThan(0);
    }
  }, 60000);
});
