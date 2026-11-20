import { describe, it, expect } from "vitest";
import { bluffGuard } from "@/engines/endgame/guard";
import type { EndgameResult } from "@/engines/endgame/solve";

const res = (main: "bet" | "check" | "raise" | "allin" | "call"): EndgameResult => ({
  actions: [
    { kind: main, to: 5, label: "x", freq: 0.7, ev: 1 },
    { kind: "check", to: 0, label: "Check", freq: 0.3, ev: 0.5 },
  ],
} as unknown as EndgameResult);

describe("bluffGuard (pas de bluff du solveur contre un récréatif)", () => {
  it("blocks a solver bluff against a passive recreational player (station)", () => {
    expect(bluffGuard(res("bet"), "recPassif", "bluff")).toBe(true);
  });
  it("blocks a solver bluff raise against an aggressive recreational player (maniac)", () => {
    expect(bluffGuard(res("raise"), "recAgressif", "bluff")).toBe(true);
    expect(bluffGuard(res("allin"), "recAgressif", "bluff")).toBe(true);
  });
  it("keeps value bets against them", () => {
    expect(bluffGuard(res("bet"), "recPassif", "value")).toBe(false);
    expect(bluffGuard(res("bet"), "recPassif", "medium")).toBe(false);
  });
  it("keeps the solver's bluffs against regulars and unknown players", () => {
    expect(bluffGuard(res("bet"), "regCompetent", "bluff")).toBe(false);
    expect(bluffGuard(res("bet"), "inconnu", "bluff")).toBe(false);
    expect(bluffGuard(res("bet"), null, "bluff")).toBe(false);
  });
  it("does nothing when the solver checks or calls", () => {
    expect(bluffGuard(res("call"), "recPassif", "bluff")).toBe(false);
    expect(bluffGuard({ actions: [{ kind: "check", to: 0, label: "Check", freq: 0.6, ev: 0 }, { kind: "bet", to: 5, label: "x", freq: 0.4, ev: 0 }] } as unknown as EndgameResult, "recPassif", "bluff")).toBe(false);
  });
});
