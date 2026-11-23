// Mesures exactes dans un jeu fini (docs/DECISIONS.md D11) : valeur de chaque joueur pour un profil de stratégies,
// meilleure réponse exacte d'un joueur (les autres fixés, ensembles d'information respectés) et NashConv
// (somme de ce que chaque joueur gagnerait en dérivant au mieux ; 0 = équilibre de Nash de ce jeu).
import { probs, type Game, type Node, type Profile } from "@/engines/multiway/game";

export const uniformProfile = (): Profile => () => undefined;

export function expectedValues(g: Game, prof: Profile): number[] {
  const walk = (n: Node): number[] => {
    if (n.t === "terminal") return n.payoffs;
    if (n.t === "chance") {
      const v = Array(g.players).fill(0);
      for (const o of n.outcomes) walk(o.child).forEach((x, j) => { v[j] += o.p * x; });
      return v;
    }
    const s = probs(prof, n), v = Array(g.players).fill(0);
    n.children.forEach((c, a) => { if (s[a] > 0) walk(c).forEach((x, j) => { v[j] += s[a] * x; }); });
    return v;
  };
  return walk(g.root);
}

/** Valeur de la meilleure réponse exacte du joueur i quand les autres jouent `prof`. */
export function bestResponseValue(g: Game, prof: Profile, i: number): number {
  type D = Extract<Node, { t: "decision" }>;
  const members = new Map<string, { node: D; w: number }[]>();
  const collect = (n: Node, w: number) => {
    if (n.t === "terminal" || w === 0) return;
    if (n.t === "chance") { n.outcomes.forEach(o => collect(o.child, w * o.p)); return; }
    if (n.player === i) {
      if (!members.has(n.info)) members.set(n.info, []);
      members.get(n.info)!.push({ node: n, w });
      n.children.forEach(c => collect(c, w));
      return;
    }
    const s = probs(prof, n);
    n.children.forEach((c, a) => collect(c, w * s[a]));
  };
  collect(g.root, 1);

  const val = new Map<Node, number>();
  const choice = new Map<string, number>();
  const value = (n: Node): number => {
    const known = val.get(n);
    if (known !== undefined) return known;
    let v: number;
    if (n.t === "terminal") v = n.payoffs[i];
    else if (n.t === "chance") v = n.outcomes.reduce((t, o) => t + o.p * value(o.child), 0);
    else if (n.player === i) v = value(n.children[best(n.info)]);
    else { const s = probs(prof, n); v = n.children.reduce((t, c, a) => t + (s[a] > 0 ? s[a] * value(c) : 0), 0); }
    val.set(n, v);
    return v;
  };
  const best = (info: string): number => {
    const known = choice.get(info);
    if (known !== undefined) return known;
    const ms = members.get(info) ?? [];
    const k = ms[0]?.node.actions.length ?? 1;
    let arg = 0, top = -Infinity;
    for (let a = 0; a < k; a++) {
      const q = ms.reduce((t, m) => t + m.w * value(m.node.children[a]), 0);
      if (q > top + 1e-15) { top = q; arg = a; }
    }
    choice.set(info, arg);
    return arg;
  };
  return value(g.root);
}

export function nashConv(g: Game, prof: Profile): number {
  const ev = expectedValues(g, prof);
  let t = 0;
  for (let i = 0; i < g.players; i++) t += bestResponseValue(g, prof, i) - ev[i];
  return Math.max(0, t);
}
