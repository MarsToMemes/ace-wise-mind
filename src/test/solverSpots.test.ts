import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  SolverGame, spotAfter, solverRangeForSlot, findSpot, childKey, rangeOf, isJam, isCall, isRaise, firstInSpot, facingSpot, foldsTo, actLabel,
} from "@/engines/solverSpots";

const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/mtt10.json"), "utf8"));

describe("solver spots (MTT 10 bb computed by GTOpen)", () => {
  it("has the root UTG decision with a full range", () => {
    const root = findSpot(g, "")!;
    expect(root.a).toBe("UTG");
    expect(Object.keys(root.h).length).toBe(169);
    const sum = root.f.reduce((s, x) => s + x, 0);
    expect(sum).toBeGreaterThan(99);
    expect(sum).toBeLessThan(101);
  });

  it("jams get wider as positions get later", () => {
    const pct = (pos: string) => {
      const s = firstInSpot(g, pos)!;
      return s.f.filter((_, i) => isJam(s.acts[i]) || isRaise(s.acts[i])).reduce((a, b) => a + b, 0);
    };
    expect(pct("UTG")).toBeLessThan(pct("BTN"));
    expect(pct("BTN")).toBeLessThan(pct("SB"));
  });

  it("AA always plays, 72o folds UTG", () => {
    const root = findSpot(g, "")!;
    const fold = root.acts.indexOf("F");
    expect(root.h["AA"][fold]).toBe(0);
    expect(root.h["72o"][fold]).toBeGreaterThan(90);
  });

  it("navigates to the BB facing a BTN jam and reads its calling range", () => {
    const s = facingSpot(g, "BTN", isJam, "BB");
    expect(s).toBeDefined();
    const calls = rangeOf(s!, isCall);
    expect(calls["AA"]).toBe(1);
    expect(calls["72o"] ?? 0).toBe(0);
    expect(foldsTo(g, "BTN")).toBe("UTG:F,MP:F,CO:F");
  });

  it("child keys chain the line", () => {
    const root = findSpot(g, "")!;
    expect(childKey(root, "F")).toBe("UTG:F");
    expect(findSpot(g, childKey(root, "F"))!.a).toBe("MP");
    expect(actLabel("A10")).toBe("Tapis 10 bb");
  });
});

describe("slots from the solver", () => {
  it("follows a line with folds in between", () => {
    const s = spotAfter(g, [["CO", isJam]], "BB");
    expect(s?.a).toBe("BB");
    expect(s?.k).toBe("UTG:F,MP:F,CO:A10,BTN:F,SB:F");
  });
  it("builds open and calling ranges for site slots", () => {
    const open = solverRangeForSlot("open:BTN", g)!;
    expect(open["AA"]).toBe(1);
    expect(solverRangeForSlot("open:BB", g)).toBeNull();
    expect(solverRangeForSlot("open:UTG", null)).toBeNull();
  });
});
