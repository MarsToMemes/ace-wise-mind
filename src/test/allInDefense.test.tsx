import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { minimumDefense, allInDefense } from "@/engines/allInDefense";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { handPercentile } from "@/engines/postflopRanges";
import { CASH_RAKE } from "@/core/rake";
import { DecisionVerdict } from "@/components/DecisionVerdict";

// D46 — Défense minimale face à un tapis en tête-à-tête : plus aucune décision ensuite ; on paie avec la meilleure part
// de sa range (pot d'avant la mise / pot avec la mise), et seulement elle. Faille mesurée par le banc B3 : le site payait
// trop de tapis au flop et à la turn, et le solveur se couchait trop face aux tapis à la river.
const R = (t: string, board: string[]) => expandRange(parseRangeText(t), board);
const flop = ["Ks", "9d", "4c"];
const WIDE = "22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,86s+,75s+,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o";
const base = (over: Partial<Parameters<typeof advisePostflop>[0]>) => advisePostflop({
  street: "Flop", board: flop, hole: ["Kh", "7h"], heroRange: R(WIDE, flop), villainRange: R(WIDE, flop),
  heroInPosition: true, heroIsPfr: true, potBB: 103, toCallBB: 97.5, heroStackBB: 97.5, opponents: 1,
  villainCheckedThisStreet: false, canRaise: false, rake: CASH_RAKE, ...over,
} as never);

describe("défense minimale face à un tapis (D46)", () => {
  it("part à défendre = pot d'avant la mise / pot avec la mise", () => {
    expect(minimumDefense(103, 97.5)).toBeCloseTo(5.5 / 103, 10);            // tapis de 17,7 × le pot au flop
    expect(minimumDefense(60, 20)).toBeCloseTo(40 / 60, 10);                 // mise de la moitié du pot
    const d = allInDefense(["Kh", "7h"], R(WIDE, flop), flop, 103, 97.5);
    expect(d.percentile).toBeCloseTo(handPercentile(["Kh", "7h"], R(WIDE, flop), flop), 12);
    expect(d.inTop).toBe(d.percentile >= 1 - d.mdf);
  });

  it("flop, tapis de 17 × le pot : top pair moyenne (pas dans les 5 % du haut de ta range) → se coucher", () => {
    const a = base({});
    expect(a.defense?.inTop).toBe(false);
    expect(a.action).toBe("fold");
  });

  it("flop, même tapis : brelan (dans le haut de ta range) → payer", () => {
    const a = base({ hole: ["9h", "9c"] });
    expect(a.defense?.inTop).toBe(true);
    expect(a.action).toBe("call");
  });

  it("river, tapis de la taille du pot : main dans la meilleure moitié de ta range → payer, même si l'équité estimée contre sa range est faible", () => {
    const river = ["Ks", "9d", "4c", "7s", "2h"];
    const a = advisePostflop({
      street: "River", board: river, hole: ["Qh", "Qd"], heroRange: R(WIDE, river), villainRange: R("AA,KK,99,44,AK,K9s", river),
      heroInPosition: true, heroIsPfr: true, potBB: 60, toCallBB: 30, heroStackBB: 30, opponents: 1,
      villainCheckedThisStreet: false, canRaise: false, rake: CASH_RAKE,
    } as never);
    expect(a.stats.handEquity).toBeLessThan(a.stats.required!);              // contre la range prêtée, l'équité ne suffit pas
    expect(a.defense?.inTop).toBe(true);
    expect(a.action).toBe("call");
  });

  it("hors tapis (il reste des décisions) ou à plusieurs : la règle ne s'applique pas", () => {
    expect(base({ canRaise: true, heroStackBB: 200 }).defense).toBeUndefined();
    expect(base({ opponents: 2 }).defense).toBeUndefined();
  });

  it("garde-fou du solveur (turn, river) : le solveur se couche avec une main du haut de la range → la décision affiche CALL", () => {
    const endgame = {
      status: "done", progress: 1, note: null, guard: null,
      result: { street: "River", actions: [{ kind: "fold", to: 0, label: "Fold", freq: 0.7, ev: 0 }, { kind: "call", to: 30, label: "Call 30", freq: 0.3, ev: 1 }], range: [], exploitPct: 0.2, iterations: 500, ms: 900, combos: [100, 100], heroInRange: true },
    } as never;
    const postflop = { action: "call", label: "Call 30 BB", verb: "CALL", allIn: true, pct: 100, mix: [], role: "showdown", reasons: [], plan: [], stats: { rangeEquity: 50, handEquity: 40, eqEdge: 0, nutEdge: 0, percentile: 70, spr: 0.5 }, defense: { mdf: 0.5, percentile: 0.7, inTop: true } } as never;
    render(<DecisionVerdict street="River" engine={{ equityPct: 40, reqEquity: 33, suggestedAction: "Call", texture: "Dry", sizing: null } as never} polar={null} pot={60} toCall={30} stack={30} solver={null} postflop={postflop} endgame={endgame} />);
    expect(screen.getByText("CALL")).toBeTruthy();
    expect(screen.getAllByText(/défense minimale/i).length).toBeGreaterThan(0);
  });
});
