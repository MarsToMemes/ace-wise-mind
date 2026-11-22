// Brique 1 de l'évaluateur : petits jeux dont la solution est connue d'avance (théorie), rejoués par le solveur
// de fin de main. Un écart à la théorie au-delà de la tolérance signale une erreur de calcul.
import { Solver } from "@/engines/endgame/cfr";
import type { ActNode } from "@/engines/endgame/tree";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange } from "@/engines/rangeVsRange";

export interface CheckResult { name: string; expected: number; got: number; tolerance: number; ok: boolean }

const check = (name: string, expected: number, got: number, tolerance: number): CheckResult =>
  ({ name, expected, got, tolerance, ok: Math.abs(got - expected) <= tolerance });

/**
 * River polarisée : OOP a soit le brelan (AK sur K-K-8-4-2), soit l'air (65) ; IP n'a que QQ (attrapeur de bluffs).
 * Une seule mise possible, b × pot (le tapis). Théorie : part de bluffs dans la range qui mise = b / (1 + 2b),
 * fréquence de défense de IP = 1 / (1 + b).
 */
export function polarRiver(b: number, iterations = 1500): [CheckResult, CheckResult] {
  const board = ["Ks", "Kd", "8h", "4c", "2s"];
  const pot = 10;
  const oop = expandRange(parseRangeText("AK,65"), board);
  const ip = expandRange(parseRangeText("QQ"), board);
  const s = new Solver({ street: "River", board, startPot: pot, stack: b * pot, ranges: [oop, ip], sizes: { bets: [b], raise: false } });
  s.run(iterations);
  const root = s.root as ActNode;
  const bet = root.actions.findIndex(a => a.kind !== "check");
  const st = s.averageStrategy(root);
  let value = 0, bluff = 0;
  oop.forEach((c, i) => {
    const w = c.w * st[bet * oop.length + i];
    if (c.cards.some(x => x[0] === "K")) value += w; else bluff += w;
  });
  const facing = root.children[bet] as ActNode;
  const call = facing.actions.findIndex(a => a.kind === "call");
  const sf = s.averageStrategy(facing);
  const callFreq = ip.reduce((t, c, i) => t + sf[call * ip.length + i], 0) / ip.length;
  const pct = Math.round(b * 100);
  return [
    check(`River polarisée, mise ${pct} % du pot : part de bluffs`, b / (1 + 2 * b), bluff / (value + bluff), 0.06),
    check(`River polarisée, mise ${pct} % du pot : défense`, 1 / (1 + b), callFreq, 0.06),
  ];
}

export const knownGames = (): CheckResult[] => [0.5, 1, 2].flatMap(b => polarRiver(b));
