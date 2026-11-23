// Brique 1 de l'évaluateur : petits jeux dont la solution est connue d'avance (théorie), rejoués par le solveur
// de fin de main. Un écart à la théorie au-delà de la tolérance signale une erreur de calcul.
import { Solver } from "@/engines/endgame/cfr";
import type { ActNode } from "@/engines/endgame/tree";
import { parseRangeText } from "@/engines/myRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { kuhn } from "@/engines/multiway/kuhn";
import { CFR } from "@/engines/multiway/cfr";
import { expectedValues, nashConv } from "@/engines/multiway/bestResponse";
import { river3, MICRO_RIVER, type RiverSpec } from "@/engines/multiway/river3";
import { CASH_RAKE } from "@/core/rake";

/** unit : « pct » (part, affichée en %) ou « jetons » (jetons par main). */
export interface CheckResult { name: string; expected: number; got: number; tolerance: number; ok: boolean; unit?: "pct" | "jetons" }

const check = (name: string, expected: number, got: number, tolerance: number, unit: CheckResult["unit"] = "pct"): CheckResult =>
  ({ name, expected, got, tolerance, ok: Math.abs(got - expected) <= tolerance, unit });

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

/**
 * Poker de Kuhn à 2 et 3 joueurs, résolus par le solveur multiway (src/engines/multiway) : valeur exacte connue à
 * 2 joueurs (-1/18), NashConv exacte (0 = équilibre), et à 3 joueurs la valeur -1/48 du joueur 2 publiée par
 * Szafron, Gibson, Sturtevant (2013) pour leur famille d'équilibres (comparaison).
 */
export function kuhnChecks(iterations = 5000): CheckResult[] {
  const out: CheckResult[] = [];
  for (const n of [2, 3]) {
    const g = kuhn(n);
    const s = new CFR(g);
    s.run(iterations);
    const p = s.averageProfile();
    const ev = expectedValues(g, p);
    if (n === 2) out.push(check("Kuhn à 2 joueurs : valeur du joueur 1 (exacte : -1/18)", -1 / 18, ev[0], 1e-3, "jetons"));
    out.push(check(`Kuhn à ${n} joueurs : NashConv (0 = équilibre)`, 0, nashConv(g, p), 1e-3, "jetons"));
    if (n === 3) out.push(check("Kuhn à 3 joueurs : valeur du joueur 2 (publiée : -1/48)", -1 / 48, ev[1], 1e-3, "jetons"));
  }
  return out;
}

/**
 * River à 3 joueurs miniature (vraies cartes) : NashConv exacte, seuil 0,1 % du pot (docs/DECISIONS.md D14).
 * Le cas tapis court + rake, qui ne converge pas, n'est pas présenté comme un équilibre (voir D15).
 */
export function river3Checks(iterations = 3000): CheckResult[] {
  const cases: [string, RiverSpec][] = [
    ["River à 3 miniature, tapis égaux, rake cash : NashConv (bb)", { ...MICRO_RIVER, rake: CASH_RAKE }],
    ["River à 3 miniature, tapis court (15), sans rake : NashConv (bb)", { ...MICRO_RIVER, stacks: [15, 100, 100], rake: null }],
  ];
  return cases.map(([name, spec]) => {
    const g = river3(spec);
    const s = new CFR(g);
    s.run(iterations);
    return check(name, 0, nashConv(g, s.averageProfile()), 0.001 * spec.potBB, "jetons");
  });
}
