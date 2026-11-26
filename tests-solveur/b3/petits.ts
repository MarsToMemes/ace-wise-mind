// B3 — Contrôle de l'exploiteur là où la meilleure réponse exacte est connue. Même principe qu'en partie réelle : à
// chaque décision, valeur de chaque action avec la réponse de l'adversaire lue dans sa stratégie, puis check (ou call)
// jusqu'au bout ; action la plus rentable. Sa valeur exacte (tout énuméré, sans tirage) ne doit jamais dépasser celle
// de la meilleure réponse : sinon l'exploiteur, ou sa mesure, est faux.
import { CFR } from "@/engines/multiway/cfr";
import { Solver } from "@/engines/endgame/cfr";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";
import { kuhn, leduc } from "../oracle/jeux";
import { jBestResponse, jValues, riverValue, payoff, type JNode, type JProfile, type RNode, type RiverGame } from "../oracle/meilleureReponse";
import { best } from "../oracle/evaluateur";
import { riverGame } from "../b1/petitsJeux";
import { SPOTS } from "../b2/spots";

type D = Extract<JNode, { t: "decision" }>;
const PASSIVE = new Set(["check", "payer"]);

/** Exploiteur du joueur i dans un jeu explicite : son choix à chaque ensemble d'information. */
export function jLBR(root: JNode, prof: JProfile, i: number): Map<string, number> {
  const probs = (n: D) => prof(n.info) ?? n.actions.map(() => 1 / n.actions.length);
  const passive = (n: JNode): number => {
    if (n.t === "terminal") return n.payoffs[i];
    if (n.t === "chance") return n.outcomes.reduce((v, o) => v + o.p * passive(o.child), 0);
    const a = n.actions.findIndex(x => PASSIVE.has(x));
    return passive(n.children[a]);
  };
  // après l'action de l'exploiteur : une réponse de l'adversaire selon sa stratégie, puis check / call jusqu'au bout
  const local = (n: JNode): number => {
    if (n.t !== "decision" || n.player === i) return passive(n);
    const p = probs(n);
    return n.children.reduce((v, c, a) => v + p[a] * passive(c), 0);
  };
  const sets = new Map<string, { n: D; reach: number }[]>();
  const collect = (n: JNode, reach: number) => {
    if (n.t === "terminal") return;
    if (n.t === "chance") { n.outcomes.forEach(o => collect(o.child, reach * o.p)); return; }
    if (n.player === i) { (sets.get(n.info) ?? sets.set(n.info, []).get(n.info)!).push({ n, reach }); n.children.forEach(c => collect(c, reach)); return; }
    const p = probs(n);
    n.children.forEach((c, a) => { if (p[a]) collect(c, reach * p[a]); });
  };
  collect(root, 1);
  const choice = new Map<string, number>();
  for (const [info, nodes] of sets) {
    let bA = 0, bV = -Infinity;
    for (let a = 0; a < nodes[0].n.actions.length; a++) {
      const v = nodes.reduce((t, { n, reach }) => t + reach * local(n.children[a]), 0);
      if (v > bV + 1e-12) { bV = v; bA = a; }
    }
    choice.set(info, bA);
  }
  return choice;
}

export interface LigneJeu { jeu: string; strategie: string; joueur: number; lbr: number; br: number; ev: number; ok: boolean }

/** Kuhn et Leduc : stratégies au hasard, CFR (logique du site) à 10, 100, 1 000 itérations, toujours passif, toujours agressif. */
export function petitsJeux(): LigneJeu[] {
  const out: LigneJeu[] = [];
  for (const [jeu, root] of [["Kuhn", kuhn()], ["Leduc", leduc()]] as const) {
    const profs: [string, JProfile][] = [["au hasard", () => undefined]];
    const game = { name: jeu, players: 2, root } as unknown as ConstructorParameters<typeof CFR>[0];
    const cfr = new CFR(game, true);
    let done = 0;
    for (const T of [10, 100, 1000]) { cfr.run(T - done); done = T; const p = cfr.averageProfile(); const snap = new Map<string, number[]>(); const all = (n: JNode) => { if (n.t === "chance") n.outcomes.forEach(o => all(o.child)); else if (n.t === "decision") { const x = p(n.info); if (x) snap.set(n.info, [...x]); n.children.forEach(all); } }; all(root); profs.push([`CFR ${T} itérations`, info => snap.get(info)]); }
    const pure = (pick: (acts: string[]) => number): JProfile => {
      const m = new Map<string, number[]>();
      const all = (n: JNode) => { if (n.t === "chance") n.outcomes.forEach(o => all(o.child)); else if (n.t === "decision") { const k = pick(n.actions); m.set(n.info, n.actions.map((_, a) => (a === k ? 1 : 0))); n.children.forEach(all); } };
      all(root);
      return info => m.get(info);
    };
    profs.push(["toujours check / payer", pure(a => a.findIndex(x => PASSIVE.has(x)))]);
    profs.push(["toujours miser / relancer", pure(a => { const k = a.findIndex(x => x === "mise" || x === "relance"); return k >= 0 ? k : a.findIndex(x => PASSIVE.has(x)); })]);
    for (const [nom, prof] of profs) for (const i of [0, 1]) {
      const ch = jLBR(root, prof, i);
      const mixed: JProfile = info => { const a = ch.get(info); if (a === undefined) return prof(info); const n = prof(info)?.length ?? countActions(root, info); return Array.from({ length: n }, (_, k) => (k === a ? 1 : 0)); };
      const lbr = jValues(root, mixed, 2)[i], br = jBestResponse(root, prof, i), ev = jValues(root, prof, 2)[i];
      out.push({ jeu, strategie: nom, joueur: i, lbr, br, ev, ok: lbr <= br + 1e-9 });
    }
  }
  return out;
}

function countActions(root: JNode, info: string): number {
  let k = 0;
  const go = (n: JNode) => { if (k) return; if (n.t === "chance") n.outcomes.forEach(o => go(o.child)); else if (n.t === "decision") { if (n.info === info) { k = n.actions.length; return; } n.children.forEach(go); } };
  go(root);
  return k;
}

// ------------------------------------------------------------------ river en tête-à-tête (forme range)
/** Exploiteur du joueur i sur une river : stratégie pure par main à chacun de ses nœuds. */
export function riverLBR(g: RiverGame, i: 0 | 1): Map<number, Float64Array> {
  const o = (1 - i) as 0 | 1;
  const H = g.hands[i], J = g.hands[o];
  const si = H.map(h => best([...h, ...g.board])), sj = J.map(h => best([...h, ...g.board]));
  const compat = H.map(h => J.map(j => (j.some(c => h.includes(c)) ? 0 : 1)));
  const passiveChild = (n: Extract<RNode, { t: "act" }>) => n.children.find(c => c.t !== "fold" && Math.max(...c.c) === Math.max(...n.c))!;
  const passive = (n: RNode, h: number, j: number): number => (n.t === "act" ? passive(passiveChild(n), h, j) : payoff(g, n, i, si[h], sj[j]));
  const local = (n: RNode, h: number, j: number): number => {
    if (n.t !== "act") return payoff(g, n, i, si[h], sj[j]);
    if (n.player === i) return passive(n, h, j);
    const s = g.strategy(n.id);
    return n.children.reduce((v, c, a) => v + s[a * J.length + j] * passive(c, h, j), 0);
  };
  const out = new Map<number, Float64Array>();
  const walk = (n: RNode, reachO: number[]) => {
    if (n.t !== "act") return;
    if (n.player === i) {
      const k = n.children.length, st = new Float64Array(k * H.length);
      H.forEach((_, h) => {
        let bA = 0, bV = -Infinity;
        for (let a = 0; a < k; a++) {
          let v = 0;
          for (let j = 0; j < J.length; j++) if (compat[h][j] && reachO[j]) v += reachO[j] * local(n.children[a], h, j);
          if (v > bV + 1e-12) { bV = v; bA = a; }
        }
        st[bA * H.length + h] = 1;
      });
      out.set(n.id, st);
      n.children.forEach(c => walk(c, reachO));
      return;
    }
    const s = g.strategy(n.id);
    n.children.forEach((c, a) => walk(c, reachO.map((r, j) => r * s[a * J.length + j])));
  };
  walk(g.root, Array.from(g.weights[o]));
  return out;
}

export interface LigneRiver { spot: string; strategie: string; joueur: number; lbr: number; br: number; ev: number; ok: boolean; part: number }

/** Rivers de B2 : stratégie du solveur du site (réglages du site), puis « toujours check / payer ». Jetons par main. */
export function rivers(only?: string[]): LigneRiver[] {
  const out: LigneRiver[] = [];
  for (const sp of SPOTS.filter(x => x.street === "River" && (!only || only.includes(x.id)))) {
    const ranges = [expandRange(parseRangeText(sp.oop), sp.board), expandRange(parseRangeText(sp.ip), sp.board)] as [ReturnType<typeof expandRange>, ReturnType<typeof expandRange>];
    const s = new Solver({ street: "River", board: sp.board, startPot: sp.startPot, stack: sp.stack, ranges, rake: CASH_RAKE });
    while (s.iterations < 1500) { if (s.run(50) === 0) break; if (s.iterations % 50 === 0 && s.exploitabilityPct() <= 0.3) break; }
    const g = riverGame(s, sp.board) as RiverGame;
    const passiveStrat = (id: number) => {
      const find = (n: RNode): Extract<RNode, { t: "act" }> | null => { if (n.t !== "act") return null; if (n.id === id) return n; for (const c of n.children) { const r = find(c); if (r) return r; } return null; };
      const n = find(g.root)!, nh = g.hands[n.player].length, a = n.children.findIndex(c => c.t !== "fold" && Math.max(...c.c) === Math.max(...n.c));
      const st = new Float64Array(n.children.length * nh); for (let h = 0; h < nh; h++) st[a * nh + h] = 1; return st;
    };
    for (const [nom, strat] of [["solveur du site", g.strategy], ["toujours check / payer", passiveStrat]] as const) {
      const gs: RiverGame = { ...g, strategy: strat };
      for (const i of [0, 1] as const) {
        const lb = riverLBR(gs, i);
        const mixed: RiverGame = { ...gs, strategy: id => lb.get(id) ?? strat(id) };
        const lbr = riverValue(mixed, i, "ev"), br = riverValue(gs, i, "br"), ev = riverValue(gs, i, "ev");
        out.push({ spot: sp.id, strategie: nom, joueur: i, lbr, br, ev, ok: lbr <= br + 1e-9, part: br - ev > 1e-9 ? (lbr - ev) / (br - ev) : 1 });
      }
    }
  }
  return out;
}
