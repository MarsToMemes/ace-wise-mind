// B2 — Tête-à-tête réel, turn et river, tailles de mise du site. Pour chaque spot :
//  1) la stratégie que le site affiche : solveur de fin de main (src/engines/endgame) avec les réglages de la décision
//     synthétique (même boucle d'arrêt et mêmes limites que solve.ts, ENDGAME_LIMITS : précision visée 0,3 % du pot ;
//     river 3 s et 1 500 itérations ; turn 30 s et 1 000 itérations, rivers réparties sur des ouvriers, D41 ; rake cash) ;
//  2) son exploitabilité exacte, calculée à part (tests-solveur/oracle/hu.ts) sur le même arbre de mises ;
//  3) un solveur de référence écrit à part (CFR+) sur le même arbre, poussé plus loin, pour comparer la valeur du jeu
//     et, à la première décision, la fréquence et l'EV de chaque action.
import { Solver } from "@/engines/endgame/cfr";
import { solveEndgame, solveEndgameAsync, ENDGAME_LIMITS } from "@/engines/endgame/solve";
import { startCores, riverCards } from "@/engines/endgame/parallel";
import { cpus } from "node:os";
import { nodePool } from "./ouvriers";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";
import { HU, RefSolver, type HNode, type HUSpec } from "../oracle/hu";

export interface Spot { id: string; titre: string; street: "Turn" | "River"; board: string[]; startPot: number; stack: number; oop: string; ip: string }
export interface ActionCmp { action: string; freqSite: number; freqRef: number; evSite: number; evRef: number }
export interface ResultatSpot {
  spot: Spot; combos: [number, number];
  site: { iterations: number; ms: number; exploitSite: number; exploitIndep: number; ev0: number; atteint: boolean };
  solveEndgame: { iterations: number; exploitPct: number };
  ref: { iterations: number; ms: number; exploit: number; ev0: number };
  actions: ActionCmp[];
}

// ranges de tête-à-tête plausibles après le flop (BB qui défend contre le BTN, pots 3-bettés…)
const BB_DEF = "22-99,A2s-AJs,K5s-KJs,Q8s-QJs,J8s-JTs,T8s-T9s,97s-98s,86s-87s,75s-76s,65s,54s,A8o-AJo,KTo-KJo,QTo-QJo,JTo";
const BTN_OPEN = "22+,A2s+,K8s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,A8o+,KTo+,QTo+,JTo";
const BB_3B = "TT+,AQs+,AKo,A5s,A4s,KQs";
const BTN_CALL3B = "77-QQ,AJs-AQs,KQs,QJs,JTs,T9s,AQo";

export const SPOTS: Spot[] = [
  { id: "R1", titre: "River, board sec, pot simple", street: "River", board: ["Kh", "8d", "4c", "2s", "Jh"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R2", titre: "River, board mouillé (tirages arrivés)", street: "River", board: ["9h", "8h", "7c", "2d", "5h"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R3", titre: "River, board doublement pairé", street: "River", board: ["Kd", "Ks", "7c", "3h", "3d"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R4", titre: "River, trois piques", street: "River", board: ["As", "9s", "5d", "2c", "Ks"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R5", titre: "River, pot 3-betté (SPR bas)", street: "River", board: ["Qd", "7s", "4h", "2c", "9d"], startPot: 50, stack: 75, oop: BB_3B, ip: BTN_CALL3B },
  { id: "R6", titre: "River, quinte possible au board", street: "River", board: ["Ts", "9d", "8c", "6h", "2s"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R7", titre: "River, gros pot (tapis court)", street: "River", board: ["Jc", "6d", "3s", "Td", "Qh"], startPot: 40, stack: 30, oop: BB_DEF, ip: BTN_OPEN },
  { id: "R8", titre: "River, board bas", street: "River", board: ["5c", "4d", "2h", "8s", "3c"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "T1", titre: "Turn, board sec, pot simple", street: "Turn", board: ["Ks", "9d", "4c", "7h"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "T2", titre: "Turn, board connecté", street: "Turn", board: ["Jh", "Td", "3c", "8s"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "T3", titre: "Turn, board pairé", street: "Turn", board: ["7c", "7d", "2h", "Qs"], startPot: 12, stack: 94, oop: BB_DEF, ip: BTN_OPEN },
  { id: "T4", titre: "Turn, pot 3-betté", street: "Turn", board: ["Ah", "6h", "3c", "9d"], startPot: 50, stack: 75, oop: BB_3B, ip: BTN_CALL3B },
];

const toH = (n: unknown): HNode => {
  const x = n as { t: string; id: number; player: 0 | 1; children: unknown[]; c: [number, number]; folder: 0 | 1; cards: string[] };
  if (x.t === "act") return { t: "act", id: x.id, player: x.player, c: x.c, children: x.children.map(toH) };
  if (x.t === "fold") return { t: "fold", folder: x.folder, c: x.c };
  if (x.t === "show") return { t: "show", c: x.c };
  return { t: "chance", cards: x.cards, children: x.children.map(toH) };
};

export async function runSpot(sp: Spot, refIters?: number): Promise<ResultatSpot> {
  const ranges = [expandRange(parseRangeText(sp.oop), sp.board), expandRange(parseRangeText(sp.ip), sp.board)] as const;
  // 1) la boucle de la décision synthétique (solve.ts), recopiée ici pour garder le solveur et ses stratégies ;
  //    à la turn, comme sur le site depuis D41 : les cartes de river réparties sur des ouvriers (un par cœur moins un, 8 au plus)
  const nW = sp.street === "Turn" && cpus().length >= 3 ? Math.min(8, cpus().length - 1) : 0;
  const pool = nW ? await nodePool(nW) : null;
  const opts = { street: sp.street, board: sp.board, startPot: sp.startPot, stack: sp.stack, ranges: [ranges[0], ranges[1]] as [typeof ranges[0], typeof ranges[1]], rake: CASH_RAKE };
  const s = new Solver(opts);
  const ask = pool ? await startCores(pool, opts, riverCards(opts)) : null;
  const t0 = Date.now();
  const maxIter = ENDGAME_LIMITS[sp.street].maxIter, budget = ENDGAME_LIMITS[sp.street].budgetMs, goal = 0.3;
  const deadline = performance.now() + budget, chunk = sp.street === "River" ? 50 : 10, checkEvery = 50;
  let reached = false;
  while (s.iterations < maxIter) {
    const done = ask ? await s.runAsync(Math.min(chunk, maxIter - s.iterations), deadline, ask) : s.run(Math.min(chunk, maxIter - s.iterations), deadline);
    if (done === 0) break;
    if (s.iterations % checkEvery === 0 && (ask ? await s.exploitabilityPctAsync(ask) : s.exploitabilityPct()) <= goal) { reached = true; break; }
  }
  const exploitSite = ask ? await s.exploitabilityPctAsync(ask) : s.exploitabilityPct(), ms = Date.now() - t0;
  // le vrai solveEndgame (ou sa version répartie) sur la même entrée : mêmes itérations et même précision attendues
  const heroCards = s.hs[0].cards[0];
  const inp = { street: sp.street, board: sp.board, startPot: sp.startPot, stack: sp.stack, ranges: [ranges[0], ranges[1]], hero: 0, heroCards, path: [], rake: CASH_RAKE } as never;
  const se = pool ? await solveEndgameAsync(inp, o => startCores(pool, o, riverCards(o))) : solveEndgame(inp);
  pool?.kill();
  // les stratégies des nœuds de river sont chez les ouvriers : on les relit avec un calcul sur un cœur qui refait
  // exactement les mêmes itérations (même résultat au bit près, D41)
  const s1 = ask ? new Solver(opts) : s;
  if (ask) s1.run(s.iterations);

  // 2) mesure indépendante sur le même arbre
  const spec: HUSpec = {
    root: toH(s1.root), board: sp.board, startPot: sp.startPot, rake: { pct: CASH_RAKE.pct, cap: CASH_RAKE.capBB },
    hands: [s1.hs[0].cards, s1.hs[1].cards], weights: [s1.hs[0].weights, s1.hs[1].weights],
  };
  const hu = new HU(spec);
  const byId = new Map(s1.nodes.map(n => [n.id, n]));
  const siteStrat = (id: number) => s1.averageStrategy(byId.get(id)!);
  const m = hu.exploitability(siteStrat);

  // 3) solveur de référence, plus loin que le site
  const t1 = Date.now();
  const ref = new RefSolver(hu);
  ref.run(refIters ?? (sp.street === "River" ? 2000 : 400));
  const mr = hu.exploitability(ref.average);
  const refMs = Date.now() - t1;

  // première décision (OOP) : fréquence et EV de chaque action, pour la range entière
  const root = s1.root as unknown as { id: number; actions: { kind: string; to: number }[]; children: unknown[] };
  const n0 = s1.hs[0].n, w0 = Float64Array.from(s1.hs[0].weights), w1 = Float64Array.from(s1.hs[1].weights);
  const comp = hu.compatMass(0, w1);
  const actionEv = (strat: (id: number) => ArrayLike<number>) => {
    const st = strat(root.id);
    const rootH = spec.root as Extract<HNode, { t: "act" }>;
    return root.actions.map((a, k) => {
      const reachI = Float64Array.from(w0, (w, h) => w * st[k * n0 + h]);
      const v = hu.walk(rootH.children[k], 0, reachI, w1, strat, "ev");
      // EV moyenne (bb) des mains qui jouent l'action : valeur de chaque main ramenée à sa masse adverse compatible
      let num = 0, den = 0, f = 0, ft = 0;
      for (let h = 0; h < n0; h++) {
        if (comp[h] > 0) { num += reachI[h] * (v[h] / comp[h]); den += reachI[h]; }
        f += w0[h] * st[k * n0 + h]; ft += w0[h];
      }
      return { label: `${a.kind}${a.kind === "check" || a.kind === "fold" ? "" : ` ${a.to}`}`, freq: f / ft, ev: den > 0 ? num / den : NaN };
    });
  };
  const aSite = actionEv(siteStrat), aRef = actionEv(ref.average);
  return {
    spot: sp, combos: [s.hs[0].n, s.hs[1].n],
    site: { iterations: s.iterations, ms, exploitSite, exploitIndep: (100 * m.expl) / sp.startPot, ev0: m.ev[0], atteint: reached },
    solveEndgame: { iterations: se?.iterations ?? -1, exploitPct: se?.exploitPct ?? NaN },
    ref: { iterations: ref.iterations, ms: refMs, exploit: (100 * mr.expl) / sp.startPot, ev0: mr.ev[0] },
    actions: aSite.map((x, k) => ({ action: x.label, freqSite: x.freq, freqRef: aRef[k].freq, evSite: x.ev, evRef: aRef[k].ev })),
  };
}

export async function runB2(o: { only?: string[]; refIters?: number } = {}): Promise<ResultatSpot[]> {
  const out: ResultatSpot[] = [];
  for (const sp of SPOTS.filter(x => !o.only || o.only.includes(x.id))) out.push(await runSpot(sp, o.refIters));
  return out;
}
