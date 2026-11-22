import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SolverGame, TableAction, findSpot, solverRangeForSlot } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";

const g: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"]; // sièges 0..5
const A = (seatIdx: number, type: string, amountBB = 0): TableAction => ({ seatIdx, street: "Preflop", type, amountBB });
const near = (a: Record<string, number>, b: Record<string, number>) => {
  for (const h of new Set([...Object.keys(a), ...Object.keys(b)])) expect(a[h] ?? 0).toBeCloseTo(b[h] ?? 0, 1);
};
const pct = (k: string, hand: string, act: string) => {
  const s = findSpot(g, k)!;
  return (s.h[hand]?.[s.acts.indexOf(act)] ?? 0) / 100;
};

describe("ranges tirées de la ligne préflop jouée", () => {
  it("BTN ouvre, BB paye : les ranges du pot simple", () => {
    const r = lineRanges(g, SIX, [A(3, "Raise", 2.5), A(5, "Call")], 100)!;
    expect(r.potType).toBe("srp");
    expect(Object.keys(r.bySeat).map(Number).sort()).toEqual([3, 5]);
    near(r.bySeat[3], solverRangeForSlot("open:BTN", g)!);
    near(r.bySeat[5], solverRangeForSlot("call:BB:vs:BTN", g)!);
  });

  it("BTN ouvre, BB 3-bet, BTN paye : la range du BTN = ouverture × call du 3-bet", () => {
    const r = lineRanges(g, SIX, [A(3, "Raise", 2.5), A(5, "Raise", 10), A(3, "Call")], 100)!;
    expect(r.potType).toBe("3bet");
    const open = "UTG:F,MP:F,CO:F";
    const face = "UTG:F,MP:F,CO:F,BTN:R2.5,SB:F,BB:R" + findSpot(g, "UTG:F,MP:F,CO:F,BTN:R2.5,SB:F")!.acts.find(a => a.startsWith("R"))!.slice(1);
    for (const h of ["AKo", "QQ", "JTs", "A5s"]) {
      expect(r.bySeat[3][h] ?? 0).toBeCloseTo(pct(open, h, "R2.5") * pct(face, h, "C"), 2);
    }
  });

  it("pot 4-betté : reconnu comme tel (plus traité comme un pot 3-betté)", () => {
    const k = "UTG:F,MP:F,CO:F,BTN:R2.5,SB:F";
    const three = findSpot(g, k)!.acts.find(a => a.startsWith("R"))!;
    const four = findSpot(g, `${k},BB:${three}`)!.acts.find(a => a.startsWith("R"))!;
    const r = lineRanges(g, SIX, [A(3, "Raise", 2.5), A(5, "Raise", +three.slice(1)), A(3, "Raise", +four.slice(1)), A(5, "Call")], 100)!;
    expect(r.potType).toBe("4bet");
    expect(Object.keys(r.bySeat[5]).length).toBeGreaterThan(0);
    // la range de BB qui paye un 4-bet est bien plus étroite que sa range de 3-bet
    const sum = (w: Record<string, number>) => Object.values(w).reduce((s, x) => s + x, 0);
    expect(sum(r.bySeat[5])).toBeLessThan(sum(solverRangeForSlot("3bet:BB:vs:BTN", g)!) * 0.8);
  });

  it("pot à trois : chaque joueur a sa propre range, tirée de sa ligne", () => {
    const r = lineRanges(g, SIX, [A(0, "Raise", 2.5), A(3, "Call"), A(5, "Call")], 100)!;
    expect(Object.keys(r.bySeat).map(Number).sort()).toEqual([0, 3, 5]);
    // BB qui paye après un call du BTN n'a pas la même range que BB face à UTG seul
    const hu = solverRangeForSlot("call:BB:vs:UTG", g)!;
    expect(Object.keys(r.bySeat[5]).sort()).not.toEqual(Object.keys(hu).sort());
  });

  it("ligne absente des calculs : pas de range (le site garde les situations types)", () => {
    expect(lineRanges(g, SIX, [A(0, "Raise", 2.5), A(1, "Raise", 7.5), A(2, "Raise", 20), A(3, "Raise", 40), A(4, "Call"), A(5, "Call")], 100)).toBeNull();
  });

  it("note les rapprochements de taille", () => {
    const r = lineRanges(g, SIX, [A(3, "Raise", 3), A(5, "Call")], 100)!;
    expect(r.notes[0]).toMatch(/3 bb comptée comme 2,5 bb/);
  });
});
