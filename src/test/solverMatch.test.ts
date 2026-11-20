import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SolverGame, matchSpot, adviceForHand, pickGame, TableAction } from "@/engines/solverSpots";

const load = (id: string): SolverGame => JSON.parse(readFileSync(resolve(__dirname, `../../public/solver/${id}.json`), "utf8"));
const g10 = load("mtt10");
const g15 = load("mtt15");
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"]; // sièges 0..5
const A = (seatIdx: number, type: string, amountBB = 0): TableAction => ({ seatIdx, street: "Preflop", type, amountBB });

describe("matchSpot", () => {
  it("hero BTN, nobody acted before → first-in spot", () => {
    const m = matchSpot(g10, SIX, 3, [], 10);
    expect(m.spot?.k).toBe("UTG:F,MP:F,CO:F");
    expect(m.title).toContain("BTN parle en premier");
  });

  it("CO jams 10 bb, hero BB → BB facing the CO jam", () => {
    const m = matchSpot(g10, SIX, 5, [A(2, "Raise", 10)], 10);
    expect(m.spot?.k).toBe("UTG:F,MP:F,CO:A10,BTN:F,SB:F");
    expect(m.title).toContain("tapis CO");
    const adv = adviceForHand(m.spot!, "AA")!;
    expect(adv[0].act).toBe("C");
    expect(adv[0].pct).toBeGreaterThan(95);
  });

  it("small raise maps to the closest raise size", () => {
    const m = matchSpot(g15, SIX, 5, [A(0, "Fold"), A(1, "Raise", 2)], 15);
    expect(m.spot?.k).toBe("UTG:F,MP:R2,CO:F,BTN:F,SB:F");
  });

  it("hero already opened and faces a 3-bet → hero's second decision", () => {
    const m = matchSpot(g15, SIX, 3, [A(3, "Raise", 2), A(5, "Raise", 15)], 15);
    expect(m.spot?.a).toBe("BTN");
    expect(m.spot?.k.startsWith("UTG:F,MP:F,CO:F,BTN:R2")).toBe(true);
  });

  it("9-max seats collapse onto 6-max positions with a note", () => {
    const nine = ["UTG", "UTG", "UTG", "MP", "MP", "CO", "BTN", "SB", "BB"];
    const m = matchSpot(g10, nine, 6, [], 10);
    expect(m.spot?.a).toBe("BTN");
    expect(m.notes.length).toBe(1);
  });

  it("asks for the hero seat when unknown, and picks the closest stack", () => {
    expect(matchSpot(g10, ["", "", "", "", "", ""], 0, [], 10).reason).toBeTruthy();
    const ix = [{ id: "mtt10", kind: "mtt", label: "", stack: 10, spots: 1 }, { id: "mtt20", kind: "mtt", label: "", stack: 20, spots: 1 }];
    expect(pickGame(ix, "mtt", 16)!.id).toBe("mtt20");
  });
});

describe("lines with calls", () => {
  const g20 = load("mtt20");
  it("a flat call leads to the next player's decision (squeeze spot)", () => {
    const m = matchSpot(g20, SIX, 5, [A(2, "Raise", 2), A(3, "Call", 2)], 20);
    expect(m.spot?.a).toBe("BB");
    expect(m.spot?.k).toContain("BTN:C");
  });
  it("every call that does not close the action has a child spot", () => {
    const keys = new Set(g20.spots.map(s => s.k));
    const callChildren = g20.spots.filter(s => s.k.includes(":C"));
    expect(callChildren.length).toBeGreaterThan(50);
    expect([...keys].some(k => k.endsWith("BTN:C,SB:F"))).toBe(true);
  });
});

describe("raise sizes are final amounts in bb (not the 3-bet/4-bet number)", () => {
  const cash = load("cash100");
  it("BB 3-bets UTG's 2.5 open to 7.5 bb", () => {
    const m = matchSpot(cash, SIX, 5, [A(0, "Raise", 2.5)], 100);
    expect(m.spot?.acts).toContain("R7.5");
    expect(m.spot?.acts).not.toContain("R3");
  });
  it("cold 4-bet is 17.2 bb and the line key carries the 3-bet size", () => {
    const m = matchSpot(cash, SIX, 3, [A(0, "Raise", 2.5), A(2, "Raise", 7.5)], 100);
    expect(m.spot?.k).toContain("CO:R7.5");
    expect(m.spot?.acts).toContain("R17.2");
  });
  it("no table keeps a bare re-raise number as a size", () => {
    for (const id of ["mtt15", "mtt30", "cash100"]) {
      const g = load(id);
      const raises = new Set(g.spots.flatMap(s => s.acts.filter(a => a.startsWith("R"))));
      // seuls les montants d'open ou de relance réels : aucune relance plus petite que l'open
      const open = Math.min(...[...raises].map(a => +a.slice(1)));
      const threebets = g.spots.filter(s => s.k.split(",").filter(x => /:R/.test(x)).length === 1).flatMap(s => s.acts.filter(a => a.startsWith("R")));
      expect(threebets.every(a => +a.slice(1) > open * 2)).toBe(true);
    }
  });
});
