import { describe, it, expect } from "vitest";
import { buildHandState, checkInvariants, ENGINE_RAKE, type HandInput } from "@/core/handState";
import { trackPot } from "@/lib/potTracker";

interface Fixture {
  name: string;
  description: string;
  input: HandInput;
  expect: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    pot?: number;
    toAct?: number;
    toCall?: number;
    supported?: boolean;
    unsupported?: string[];
    legal?: unknown;
    remaining?: number[];
    sidePots?: { amount: number; eligible: number[] }[];
  };
}

const files = import.meta.glob("./fixtures/hands/*.json", { eager: true, import: "default" }) as Record<string, Fixture>;
const fixtures = Object.values(files).sort((a, b) => a.name.localeCompare(b.name));
const codes = (vs: { code: string }[]) => [...new Set(vs.map(v => v.code))].sort();

describe("mains d'exemple : la fiche de main et ses contrôles", () => {
  it("les 15 mains d'exemple sont chargées", () => {
    expect(fixtures).toHaveLength(15);
  });

  for (const fx of fixtures) {
    it(`${fx.name} — ${fx.description}`, () => {
      const { state, errors, warnings, valid } = buildHandState(fx.input);
      const e = fx.expect;
      expect(codes(errors)).toEqual([...e.errors].sort());
      expect(codes(warnings)).toEqual([...e.warnings].sort());
      expect(valid).toBe(e.valid);
      if (e.pot !== undefined) expect(state.pot).toBeCloseTo(e.pot, 6);
      if (e.toAct !== undefined) expect(state.toAct).toBe(e.toAct);
      if (e.toCall !== undefined) expect(state.toCall).toBeCloseTo(e.toCall, 6);
      if (e.supported !== undefined) expect(state.supported).toBe(e.supported);
      if (e.unsupported !== undefined) expect([...state.unsupported].sort()).toEqual([...e.unsupported].sort());
      if (e.legal !== undefined) expect(state.legal).toEqual(e.legal);
      if (e.remaining) expect(state.seats.map(s => s.remainingBB)).toEqual(e.remaining);
      if (e.sidePots) expect(state.sidePots).toEqual(e.sidePots);
    });
  }
});

describe("invariants sur les mains valides", () => {
  const valid = fixtures.filter(f => f.expect.valid);

  it("aucun jeton ne se crée ni ne se perd : tapis de départ = tapis restants + pot", () => {
    for (const fx of valid) {
      const { state } = buildHandState(fx.input);
      const start = state.seats.reduce((s, x) => s + x.stackStartBB, 0);
      const left = state.seats.reduce((s, x) => s + x.remainingBB, 0);
      expect(start, fx.name).toBeCloseTo(left + state.pot, 6);
    }
  });

  it("même pot et même montant à payer que le calcul actuel du site (trackPot)", () => {
    for (const fx of valid) {
      const { state } = buildHandState(fx.input);
      const t = trackPot(fx.input.actions, { blinds: { sbIdx: state.sbIdx, bbIdx: state.bbIdx } }, state.street);
      expect(state.pot, fx.name).toBeCloseTo(t.pot, 6);
      if (state.toAct >= 0) expect(state.toCall, fx.name).toBeCloseTo(t.toCall(state.toAct), 6);
    }
  });

  it("les pots annexes, s'il y en a, font exactement le pot", () => {
    for (const fx of valid) {
      const { state } = buildHandState(fx.input);
      if (!state.sidePots.length) continue;
      expect(state.sidePots.reduce((s, p) => s + p.amount, 0), fx.name).toBeCloseTo(state.pot, 6);
    }
  });

  it("checkInvariants ne trouve rien à redire sur une fiche bien construite", () => {
    for (const fx of valid) expect(checkInvariants(buildHandState(fx.input).state), fx.name).toEqual([]);
  });
});

describe("checkInvariants repère une fiche abîmée", () => {
  const base = () => buildHandState(fixtures.find(f => f.name === "f04-multiway-flop")!.input).state;

  it("pot qui ne correspond pas aux mises", () => {
    const s = base();
    s.pot += 1;
    expect(codes(checkInvariants(s))).toContain("POT_MISMATCH");
  });

  it("tapis négatif", () => {
    const s = base();
    s.seats[1].remainingBB = -2;
    expect(codes(checkInvariants(s))).toContain("NEGATIVE_STACK");
  });

  it("check autorisé alors qu'il y a à payer", () => {
    const s = base();
    s.legal = { ...s.legal!, check: true };
    expect(codes(checkInvariants(s))).toContain("LEGAL_INCONSISTENT");
  });

  it("carte mal écrite", () => {
    const s = base();
    s.board = ["Ah", "8d", "1c"];
    expect(codes(checkInvariants(s))).toContain("BAD_CARD");
  });
});

describe("conventions de rake documentées", () => {
  it("en cash, les trois moteurs comptent le même rake", () => {
    expect(ENGINE_RAKE.preflopSolver).toMatchObject({ pct: 5, capBB: 3 });
    expect(ENGINE_RAKE.postflopAdvisor).toMatchObject({ pct: 5, capBB: 3, noFlopNoDrop: true });
    expect(ENGINE_RAKE.endgameSolver).toMatchObject({ pct: 5, capBB: 3, noFlopNoDrop: true });
  });
});
