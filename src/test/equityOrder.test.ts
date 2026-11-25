import { describe, it, expect } from "vitest";
import { handEquityMulti } from "@/engines/postflopRanges";
import { evaluateHandVsRange } from "@/lib/handVsRange";
import type { Combo } from "@/engines/rangeVsRange";

// D38 (bugs trouvés par le banc, A4). Cas connu : A♥A♦ sur 2♣7♦9♥J♠K♣ ; A = {K♠Q♠, 3♣3♦}, B = {K♦K♠, 4♥4♠}.
// K♠Q♠ et K♦K♠ se gênent : 3 combinaisons possibles, tu en gagnes 2 → 66,67 % exacts, quel que soit l'ordre.
const board = ["2c", "7d", "9h", "Js", "Kc"];
const A: Combo[] = [{ cards: ["Ks", "Qs"], w: 1 }, { cards: ["3c", "3d"], w: 1 }];
const B: Combo[] = [{ cards: ["Kd", "Ks"], w: 1 }, { cards: ["4h", "4s"], w: 1 }];

describe("équité multiway sans dépendance à l'ordre des adversaires (D38)", () => {
  it("conseiller (handEquityMulti) : 66,67 % dans les deux ordres (l'ancien tirage donnait 75 % ou 50 %)", () => {
    const ab = handEquityMulti(["Ah", "Ad"], [A, B], board, 30000, 1);
    const ba = handEquityMulti(["Ah", "Ad"], [B, A], board, 30000, 1);
    expect(Math.abs(ab - 2 / 3)).toBeLessThan(0.015);
    expect(Math.abs(ba - 2 / 3)).toBeLessThan(0.015);
  });
  it("moteur de base (evaluateHandVsRange) : même résultat avec les mêmes mains données directement", () => {
    const combos = (r: Combo[][]) => r.map(x => x.map(c => c.cards));
    const ab = evaluateHandVsRange({ hole: ["Ah", "Ad"], board, opponentRanges: [], combos: combos([A, B]), sims: 30000 })!.equity_percentage;
    const ba = evaluateHandVsRange({ hole: ["Ah", "Ad"], board, opponentRanges: [], combos: combos([B, A]), sims: 30000 })!.equity_percentage;
    expect(Math.abs(ab - 66.67)).toBeLessThan(1.5);
    expect(Math.abs(ba - 66.67)).toBeLessThan(1.5);
  });
  it("moteur de base : 7♥7♠ bat Q♦5♣ sur 6♦5♠J♥T♦6♥ (l'ancien évaluateur donnait l'inverse)", () => {
    const r = evaluateHandVsRange({ hole: ["7h", "7s"], board: ["6d", "5s", "Jh", "Td", "6h"], opponentRanges: [], combos: [[["Qd", "5c"]]], sims: 50 })!;
    expect(r.equity_percentage).toBe(100);
  });
});
