import { describe, it, expect } from "vitest";
import { solveEndgame } from "@/engines/endgame/solve";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange } from "@/engines/rangeVsRange";

const board = ["Ks", "Kd", "8h", "4c"];
const R = (t: string) => expandRange(parseRangeText(t), board);
const base = {
  street: "Turn" as const, board, startPot: 10, stack: 60, ranges: [R("AK,65s,88"), R("QQ,JJ,AQs")] as [ReturnType<typeof R>, ReturnType<typeof R>],
  hero: 1 as const, heroCards: ["Qh", "Qd"] as [string, string], path: [{ player: 0 as const, kind: "bet" as const, to: 7.5 }],
  maxIter: 20, timeBudgetMs: 1e9, targetPct: 0,
};

describe("solveur de fin de main : tailles réglables (banc d'essai)", () => {
  it("par défaut, à la turn, face à une mise : payer, se coucher ou tapis seulement", () => {
    const res = solveEndgame(base)!;
    expect(res.actions.map(a => a.kind).sort()).toEqual(["allin", "call", "fold"]);
  });
  it("avec une relance permise, elle apparaît (relance au pot)", () => {
    const res = solveEndgame({ ...base, sizes: { raise: true } })!;
    const raise = res.actions.find(a => a.kind === "raise");
    expect(raise).toBeTruthy();
    expect(raise!.to).toBeCloseTo(7.5 + (10 + 7.5 + 7.5), 1); // sa mise + le pot après call
  });
});
