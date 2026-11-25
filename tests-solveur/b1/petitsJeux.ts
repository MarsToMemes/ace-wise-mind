// B1 — Le solveur sur des petits jeux à solution connue. Pour chaque jeu et chaque nombre d'itérations : exploitabilité
// exacte par meilleure réponse (calculée à part, tests-solveur/oracle/meilleureReponse.ts) et écart de la valeur du
// jeu à la valeur théorique. On attend une exploitabilité qui tend vers 0 et une valeur qui tend vers la théorie.
//  - Kuhn et Leduc avec la logique CFR générique du site (src/engines/multiway/cfr.ts, CFR+) ;
//  - Kuhn joué par le solveur de fin de main du site (src/engines/endgame/cfr.ts, celui de la décision synthétique en
//    tête-à-tête), déguisé en river : trois mains (TT < QQ < KK), une mise de la taille du pot de départ ;
//  - deux rivers jouets avec ce même solveur : river polarisée (théorie connue) et petite river avec le menu du site.
import { CFR } from "@/engines/multiway/cfr";
import { nashConv } from "@/engines/multiway/bestResponse";
import { Solver } from "@/engines/endgame/cfr";
import type { Combo } from "@/engines/rangeVsRange";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { kuhn, leduc } from "../oracle/jeux";
import { jBestResponse, jValues, riverExploitability, type JNode, type RNode } from "../oracle/meilleureReponse";

export interface Point { iterations: number; exploit: number; valeur?: number; ecartValeur?: number; site?: number; extra?: string }
export interface Courbe { id: string; titre: string; unite: string; theorie?: string; points: Point[]; ok: boolean; critere: string }

const ITERS = [10, 30, 100, 300, 1000, 3000];

/** Jeu explicite résolu par le CFR générique du site, mesuré par la meilleure réponse indépendante. */
function explicite(id: string, titre: string, root: JNode, valeur0: number, iters: number[]): Courbe {
  const game = { name: titre, players: 2, root } as unknown as ConstructorParameters<typeof CFR>[0];
  const cfr = new CFR(game, true);
  const points: Point[] = [];
  let done = 0;
  for (const T of iters) {
    cfr.run(T - done); done = T;
    const prof = cfr.averageProfile();
    const v = jValues(root, prof, 2);
    const expl = (jBestResponse(root, prof, 0) + jBestResponse(root, prof, 1)) / 2;   // somme nulle : (BR0 + BR1) / 2
    points.push({ iterations: T, exploit: expl, valeur: v[0], ecartValeur: v[0] - valeur0, site: nashConv(game, prof) / 2 });
  }
  const last = points[points.length - 1];
  const ok = last.exploit < 0.01 && last.exploit < points[0].exploit && Math.abs(last.site! - last.exploit) < 1e-6;
  return { id, titre, unite: "jetons par main", theorie: `valeur du 1er joueur ${valeur0.toFixed(4).replace(".", ",")}`, points, ok,
    critere: "exploitabilité < 0,01 jeton par main à la fin, en baisse, et égale à celle que mesure le site (nashConv)" };
}

/** Partie commune aux rivers : arbre du solveur → arbre pour la meilleure réponse indépendante. */
function riverGame(s: Solver, board: string[]) {
  const conv = (n: unknown): RNode => {
    const x = n as { t: string; id: number; player: 0 | 1; children: unknown[]; c: [number, number]; folder: 0 | 1 };
    if (x.t === "act") return { t: "act", id: x.id, player: x.player, c: x.c, children: x.children.map(conv) };
    if (x.t === "fold") return { t: "fold", folder: x.folder, c: x.c };
    if (x.t === "show") return { t: "show", c: x.c };
    throw new Error("river : nœud inattendu " + x.t);
  };
  const byId = new Map(s.nodes.map(n => [n.id, n]));
  return {
    root: conv(s.root), board, startPot: s.startPot,
    hands: [s.hs[0].cards, s.hs[1].cards] as [[string, string][], [string, string][]],
    weights: [s.hs[0].weights, s.hs[1].weights] as [ArrayLike<number>, ArrayLike<number>],
    strategy: (id: number) => s.averageStrategy(byId.get(id)!),
  };
}

function riverCourbe(id: string, titre: string, make: () => Solver, board: string[], iters: number[], theorie: string,
  extra?: (s: Solver) => string, valeur0?: number): Courbe {
  const s = make();
  const points: Point[] = [];
  let done = 0;
  for (const T of iters) {
    s.run(T - done); done = T;
    const g = riverGame(s, board);
    const r = riverExploitability(g);
    points.push({
      iterations: T, exploit: (100 * r.expl) / s.startPot, site: s.exploitabilityPct(),
      valeur: r.ev[0], ecartValeur: valeur0 !== undefined ? r.ev[0] - valeur0 : undefined, extra: extra?.(s),
    });
  }
  const last = points[points.length - 1];
  const ok = last.exploit < 0.5 && last.exploit < points[0].exploit && Math.abs(last.site! - last.exploit) < 0.05;
  return { id, titre, unite: "% du pot", theorie, points, ok,
    critere: "exploitabilité < 0,5 % du pot à la fin, en baisse, et à moins de 0,05 point de celle que mesure le site" };
}

export function runB1(o: { iters?: number[] } = {}): Courbe[] {
  const iters = o.iters ?? ITERS;
  const out: Courbe[] = [];
  out.push(explicite("K1", "Kuhn, CFR générique du site (CFR+)", kuhn(), -1 / 18, iters));
  out.push(explicite("L1", "Leduc, CFR générique du site (CFR+)", leduc(), -0.0856, iters));

  // Kuhn déguisé en river pour le solveur de fin de main : board sans quinte ni couleur possible pour ces mains
  const kBoard = ["2c", "3d", "7h", "9s", "4c"];
  const kHands: Combo[] = [{ cards: ["Ts", "Td"], w: 1 }, { cards: ["Qs", "Qd"], w: 1 }, { cards: ["Ks", "Kd"], w: 1 }];
  out.push(riverCourbe("K2", "Kuhn joué par le solveur de fin de main du site (DCFR)",
    () => new Solver({ street: "River", board: kBoard, startPot: 2, stack: 1, ranges: [kHands, kHands], sizes: { bets: [0.5], raise: false, maxAggr: 1 } }),
    kBoard, iters, "valeur du 1er joueur −1/18 ≈ −0,0556 jeton (ici : gain dans la river − 1 d'ante)",
    undefined, 1 - 1 / 18));

  // river polarisée : OOP a le brelan (AK) ou l'air (65), IP n'a que QQ ; mise du pot (b = 1)
  const pBoard = ["Ks", "Kd", "8h", "4c", "2s"];
  const oop = expandRange(parseRangeText("AK,65"), pBoard), ip = expandRange(parseRangeText("QQ"), pBoard);
  const b = 1;
  out.push(riverCourbe("P1", "River polarisée (brelan ou air contre QQ), mise du pot, solveur de fin de main",
    () => new Solver({ street: "River", board: pBoard, startPot: 10, stack: b * 10, ranges: [oop, ip], sizes: { bets: [b], raise: false } }),
    pBoard, iters, `IP paie ${Math.round(100 / (1 + b))} % ; bluffs = ${Math.round((100 * b) / (1 + 2 * b))} % de la range qui mise`,
    s => {
      const root = s.root as unknown as { id: number; actions: { kind: string }[]; children: { id: number; actions: { kind: string }[] }[] };
      const st = s.averageStrategy(root as never), n0 = s.hs[0].n;
      const betIdx = root.actions.findIndex(a => a.kind !== "check");
      let wv = 0, wb = 0;
      s.hs[0].cards.forEach((c, h) => {
        const p = st[betIdx * n0 + h] * s.hs[0].weights[h];
        if (c.some(x => x[0] === "A")) wv += p; else wb += p;
      });
      const after = root.children[betIdx], st1 = s.averageStrategy(after as never), n1 = s.hs[1].n;
      const callIdx = after.actions.findIndex(a => a.kind === "call");
      let call = 0, tot = 0;
      s.hs[1].weights.forEach((w, h) => { call += w * st1[callIdx * n1 + h]; tot += w; });
      return `IP paie ${(100 * call / tot).toFixed(1).replace(".", ",")} % ; bluffs ${(100 * wb / (wv + wb)).toFixed(1).replace(".", ",")} % de la range qui mise`;
    }));

  // petite river avec le menu complet du site (33 / 75 / 125 %, relance, tapis)
  const sBoard = ["Jh", "8d", "5c", "2s", "Kd"];
  const r0 = expandRange(parseRangeText("KJ,K8,J8,88,55,QT,T9,A5s"), sBoard), r1 = expandRange(parseRangeText("KQ,JJ,J9,98,AQ,76"), sBoard);
  out.push(riverCourbe("R1", "Petite river, menu complet du site (33/75/125 %, relance, tapis), solveur de fin de main",
    () => new Solver({ street: "River", board: sBoard, startPot: 10, stack: 40, ranges: [r0, r1] }),
    sBoard, iters, "équilibre inconnu : seule l'exploitabilité (→ 0) sert de mesure"));
  return out;
}
