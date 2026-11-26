import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchSpot, adviceForHand, type SolverGame, type TableAction } from "@/engines/solverSpots";

// T9 (non-régression) : chaque nœud de la bibliothèque cash 100 bb qui a une solution, saisi comme sur la table, est
// retrouvé par le conseil préflop, et les fréquences affichées pour chaque main sont celles de la bibliothèque (écart 0).
const g = JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8")) as SolverGame;
const POS = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

function actionsOf(key: string): TableAction[] {
  if (!key) return [];
  let top = 1;
  return key.split(",").map(step => {
    const [pos, a] = step.split(":");
    const seatIdx = POS.indexOf(pos);
    if (a === "F") return { seatIdx, street: "Preflop", type: "Fold", amountBB: 0 };
    if (a === "X") return { seatIdx, street: "Preflop", type: "Check", amountBB: 0 };
    if (a === "C" || a === "L") return { seatIdx, street: "Preflop", type: "Call", amountBB: top };
    const to = Number(a.slice(1)); top = Math.max(top, to);
    return { seatIdx, street: "Preflop", type: "Raise", amountBB: to };
  });
}

describe("T9 : le conseil préflop rend la bibliothèque telle quelle", () => {
  it("nœuds avec solution retrouvés à l'identique, 0 écart de fréquence", () => {
    const solved = g.spots.filter(s => Object.keys(s.h).length);
    let found = 0, compared = 0, ecarts = 0;
    const missed: string[] = [];
    for (const s of solved) {
      const m = matchSpot(g, POS, POS.indexOf(s.a), actionsOf(s.k), 100);
      if (m.spot?.k !== s.k) { missed.push(s.k); continue; }
      found++;
      for (const [hand, p] of Object.entries(s.h)) {
        const adv = adviceForHand(m.spot, hand)!;
        compared++;
        const shown = Object.fromEntries(adv.map(x => [x.act, x.pct]));
        s.acts.forEach((a, i) => { if ((p[i] ?? 0) > 0 && shown[a] !== p[i]) ecarts++; });
      }
    }
    console.log(`T9 : ${found} / ${solved.length} nœuds avec solution retrouvés à l'identique, ${compared} mains comparées, ${ecarts} écart ; non retrouvés : ${missed.length}${missed.length ? ` (ex. ${missed.slice(0, 3).join(" ; ")})` : ""}`);
    expect(ecarts).toBe(0);
    expect(found).toBeGreaterThanOrEqual(408);
  });
});
