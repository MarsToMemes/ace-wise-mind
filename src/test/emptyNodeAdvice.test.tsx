import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { setSolverBaseGame, matchSpot, type SolverGame, type TableAction } from "@/engines/solverSpots";
import { emptyNodeAdvice, EMPTY_NODE_LABEL, SITE_SAMPLES } from "@/engines/emptyNodeAdvice";
import { HANDS_BY_STRENGTH } from "@/engines/preflopEquity";
import { CASH_RAKE } from "@/core/rake";
import { DecisionVerdict } from "@/components/DecisionVerdict";

// Problème 2 : nœuds vides de la bibliothèque (aucune main n'y arrive) → conseil indicatif, et, pour un call terminal en
// tête-à-tête, une seule range adverse (la range de tapis tirée de la bibliothèque) pour l'équité ET la décision.
const g = JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8")) as SolverGame;
const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/empty-nodes.json"), "utf8")) as { nodes: { key: string; hero: string; line: string }[] };
const POS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

/** La ligne d'un nœud, saisie comme sur la table (tapis 100 bb), et le pot / l'à-payer du héros. */
function fromKey(key: string, hero: string) {
  const put: Record<string, number> = { SB: 0.5, BB: 1 };
  let top = 1;
  const actions: TableAction[] = key.split(",").map(step => {
    const [pos, a] = step.split(":");
    const seatIdx = POS.indexOf(pos);
    if (a === "F") return { seatIdx, street: "Preflop", type: "Fold", amountBB: 0 };
    if (a === "C") { put[pos] = top; return { seatIdx, street: "Preflop", type: "Call", amountBB: top }; }
    const to = Number(a.slice(1)); put[pos] = to; top = Math.max(top, to);
    return { seatIdx, street: "Preflop", type: "Raise", amountBB: to };
  });
  const potBB = Object.values(put).reduce((t, x) => t + x, 0), mine = put[hero] ?? 0;
  return { actions, potBB, toCallBB: top - mine, heroStackBB: 100 - mine };
}
const adviceFor = (n: { key: string; hero: string }, hand: string, samples?: number) => {
  const f = fromKey(n.key, n.hero);
  return emptyNodeAdvice({ game: g, seatPos: POS, heroSeat: POS.indexOf(n.hero), actions: f.actions, stackBB: 100, hand, potBB: f.potBB, toCallBB: f.toCallBB, heroStackBB: f.heroStackBB, rake: CASH_RAKE, samples });
};

beforeAll(() => setSolverBaseGame(g));

describe("nœuds vides : conseil indicatif, et call terminal décidé par l'EV contre la même range", () => {
  it("T6 : sur les 91 nœuds × 169 mains, dans le périmètre (call terminal en tête-à-tête, range de tapis connue), EV(call) > 0 ⇒ pas de FOLD", () => {
    let inScope = 0, outScope = 0, violations = 0, evPos = 0;
    for (const n of fixture.nodes) for (const hand of HANDS_BY_STRENGTH) {
      const a = adviceFor(n, hand, 2000)!;
      expect(a).not.toBeNull();
      if (a.scope !== "call-terminal") { outScope++; continue; }
      inScope++;
      if (a.ev! > 0) { evPos++; if (a.action === "Fold") violations++; }
      // même range, mêmes montants : l'équité affichée et la cote affichée donnent la décision
      expect(a.action).toBe(a.equity! > a.required! ? "Call" : "Fold");
    }
    console.log(`T6 : ${inScope} cas dans le périmètre sur ${91 * 169} (${outScope} hors périmètre), EV(call) > 0 dans ${evPos} cas, ${violations} violation`);
    expect(inScope + outScope).toBe(91 * 169);
    expect(violations).toBe(0);
  }, 300000);

  it("T6 (bis) : 200 cas tirés au hasard, au réglage du site (20 000 tirages) : même règle", () => {
    let k = 12345, violations = 0;
    const rnd = () => ((k = (k * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 200; i++) {
      const n = fixture.nodes[Math.floor(rnd() * fixture.nodes.length)], hand = HANDS_BY_STRENGTH[Math.floor(rnd() * 169)];
      const a = adviceFor(n, hand)!;
      if (a.scope === "call-terminal" && a.ev! > 0 && a.action === "Fold") violations++;
    }
    expect(SITE_SAMPLES).toBe(20000);
    expect(violations).toBe(0);
  }, 300000);

  it("T7 : AKo au BTN et en SB face au tapis de la BB — même range (tapis de la BB, bibliothèque) pour l'équité et la décision", () => {
    const btn = adviceFor(fixture.nodes.find(n => n.key === "UTG:F,MP:F,CO:R2.5,BTN:C,SB:F,BB:R7.5,CO:F,BTN:R17.2,BB:A100")!, "AKo")!;
    const sb = adviceFor(fixture.nodes.find(n => n.key === "UTG:F,MP:F,CO:R2.5,BTN:F,SB:C,BB:R7.5,CO:F,SB:R17.2,BB:A100")!, "AKo")!;
    for (const a of [btn, sb]) { expect(a.scope).toBe("call-terminal"); expect(a.shover).toBe("BB"); }
    console.log(`T7 : AKo BTN équité ${(100 * btn.equity!).toFixed(1)} %, il faut ${(100 * btn.required!).toFixed(1)} %, EV ${btn.ev!.toFixed(2)} bb → ${btn.action} ; AKo SB équité ${(100 * sb.equity!).toFixed(1)} %, il faut ${(100 * sb.required!).toFixed(1)} %, EV ${sb.ev!.toFixed(2)} bb → ${sb.action}`);
    expect(sb.ev!).toBeGreaterThan(0);
    expect(sb.action).toBe("Call");                       // plus de FOLD avec une EV positive
    expect(btn.action).toBe(btn.ev! > 0 ? "Call" : "Fold");
    // montants : pot 120,2, à payer 82,8, pot final 203, rake 3 (plafond)
    expect(btn.finalPot).toBeCloseTo(203, 6); expect(btn.rake).toBeCloseTo(3, 6); expect(btn.call).toBeCloseTo(82.8, 6);
  });

  it("T8 : chaque nœud vide est reconnu, et la décision affiche « pas de solution pour cette ligne, conseil indicatif »", () => {
    for (const n of fixture.nodes) {
      const f = fromKey(n.key, n.hero);
      const m = matchSpot(g, POS, POS.indexOf(n.hero), f.actions, 100);
      expect(m.spot && Object.keys(m.spot.h).length).toBe(0);
      expect(adviceFor(n, "72o", 200)!.line).toBe(n.line);
    }
    const a = adviceFor(fixture.nodes[0], "AKo", 500)!;
    const engine = { equityPct: 100 * a.equity!, reqEquity: 100 * a.required!, suggestedAction: a.action!, texture: "Dry", sizing: null } as never;
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={120} toCall={82.8} stack={83} solver={null} emptyNode={a} />);
    expect(screen.getAllByText(new RegExp(EMPTY_NODE_LABEL)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Solveur GTOpen/)).toBeNull();
  });
});
