import { describe, it, expect } from "vitest";
import type { ActNode, Node } from "@/engines/endgame/tree";
import { Solver } from "@/engines/endgame/cfr";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { CASH_RAKE } from "@/core/rake";

const board = ["Ks", "Kd", "8h", "4c", "2s"];
const R = (t: string) => expandRange(parseRangeText(t), board);
// Joueur 0 a AA, joueur 1 a QQ : le joueur 0 gagne toujours à l'abattage.
const make = (rake?: typeof CASH_RAKE) =>
  new Solver({ street: "River", board, startPot: 10, stack: 100, ranges: [R("AA"), R("QQ")], rake });
// gain moyen (bb) du joueur 0 sur un nœud terminal
const gain0 = (s: Solver, n: Node) => {
  const reach = Float32Array.from(s.hs[1].weights);
  const v = s.values(n, 0, reach), comp = s.compatibleWeights(0, reach);
  let num = 0, den = 0;
  for (let h = 0; h < s.hs[0].n; h++) { num += s.hs[0].weights[h] * v[h]; den += s.hs[0].weights[h] * comp[h]; }
  return num / den;
};
const kid = (n: Node, kind: string) => { const a = n as ActNode; return a.children[a.actions.findIndex(x => x.kind === kind)]; };

describe("solveur de fin de main : rake", () => {
  it("check-check à la river : le gagnant touche le pot moins 5 %", () => {
    const n = kid(kid(make().root, "check"), "check");
    expect(gain0(make(), n)).toBeCloseTo(10, 4);
    const s = make(CASH_RAKE);
    expect(gain0(s, kid(kid(s.root, "check"), "check"))).toBeCloseTo(9.5, 4);
  });

  it("tapis payé : le rake s'arrête au plafond de 3 bb", () => {
    const s = make(CASH_RAKE);
    expect(gain0(s, kid(kid(s.root, "allin"), "call"))).toBeCloseTo(107, 4);
  });

  it("mise suivie d'un fold : la mise non payée est rendue avant le rake", () => {
    const s = make(CASH_RAKE);
    expect(gain0(s, kid(kid(s.root, "bet"), "fold"))).toBeCloseTo(9.5, 4);
  });

  it("converge aussi avec le rake (écart mesuré par les meilleures réponses)", () => {
    const s = new Solver({ street: "River", board, startPot: 10, stack: 100, ranges: [R("AA,QQ,76s,T9s"), R("JJ,KQ,A8")], rake: CASH_RAKE });
    s.run(400);
    expect(s.exploitabilityPct()).toBeLessThan(1);
  });
});
