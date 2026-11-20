// Arbre de mises du solveur de fin de main, depuis le début de la street en cours.
// Joueur 0 = celui qui parle en premier (hors de position), 1 = en position.
// Montants en bb ; « to » = mise totale du joueur sur la street après l'action.

import { FULL_DECK } from "@/engines/rangeVsRange";

export type EndStreet = "Turn" | "River";
export type ActKind = "check" | "bet" | "call" | "fold" | "raise" | "allin";
export interface Action { kind: ActKind; to: number }
export interface PathAct { player: 0 | 1; kind: "check" | "bet" | "call" | "fold" | "raise"; to?: number }

/** c = mises totales de chaque joueur depuis le début du sous-jeu. */
export interface ActNode { t: "act"; id: number; player: 0 | 1; actions: Action[]; children: Node[]; pot: number; s: [number, number]; c: [number, number]; street: EndStreet; onPath?: number }
export interface FoldNode { t: "fold"; folder: 0 | 1; c: [number, number] }
export interface ShowNode { t: "show"; c: [number, number] }
export interface ChanceNode { t: "chance"; cards: string[]; children: Node[]; c: [number, number] }
export type Node = ActNode | FoldNode | ShowNode | ChanceNode;

export interface Sizes {
  bets?: number[];          // fractions du pot
  raise?: boolean;          // relance « pot » en plus du tapis
  maxAggr?: number;
}
export interface TreeOptions {
  street: EndStreet;
  startPot: number;
  stack: number;            // tapis effectif au début de la street
  board?: string[];         // nécessaire à la turn (cartes de river possibles)
  path?: PathAct[];
  sizes?: Sizes;            // pour la street racine
}

const ROOT_SIZES: Record<EndStreet, Required<Sizes>> = {
  River: { bets: [0.33, 0.75, 1.25], raise: true, maxAggr: 3 },
  Turn: { bets: [0.33, 0.75, 1.25], raise: false, maxAggr: 2 },
};
const RIVER_AFTER_TURN: Required<Sizes> = { bets: [0.5, 1], raise: false, maxAggr: 2 };
const JAM_AT = 0.67;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildTree(o: TreeOptions): { root: Node; pathNode: ActNode | null; nodes: ActNode[] } {
  const S = o.stack;
  const nodes: ActNode[] = [];
  const path = o.path ?? [];
  let pathNode: ActNode | null = null;
  const rootSizes = { ...ROOT_SIZES[o.street], ...(o.sizes ?? {}) };
  const riverCards = o.street === "Turn" ? FULL_DECK.filter(c => !(o.board ?? []).includes(c)) : [];

  const act = (street: EndStreet, sz: Required<Sizes>, player: 0 | 1, s: [number, number], base: [number, number],
    aggr: number, checks: number, k: number): Node => {
    const rem = (p: number) => r1(S - base[p] - s[p]);
    const pot = r1(o.startPot + base[0] + base[1] + s[0] + s[1]);
    const opp = (1 - player) as 0 | 1;
    const facing = s[opp] > s[player];
    const actions: Action[] = [];
    const push = (a: Action) => { if (!actions.some(x => x.kind === a.kind && x.to === a.to)) actions.push(a); };
    const sized = (kind: "bet" | "raise", to: number): Action => {
      const allTo = r1(s[player] + rem(player));
      return to - s[player] >= JAM_AT * rem(player) || to >= allTo ? { kind: "allin", to: allTo } : { kind, to: r1(to) };
    };
    if (!facing) {
      push({ kind: "check", to: s[player] });
      if (rem(player) > 0 && rem(opp) > 0) {
        for (const f of sz.bets) push(sized("bet", s[player] + f * pot));
        push({ kind: "allin", to: r1(s[player] + rem(player)) });
      }
    } else {
      push({ kind: "fold", to: s[player] });
      push({ kind: "call", to: Math.min(s[opp], r1(s[player] + rem(player))) });
      const canRaise = aggr < sz.maxAggr && rem(opp) > 0 && rem(player) > s[opp] - s[player];
      if (canRaise) {
        if (sz.raise) push(sized("raise", s[opp] + (pot + s[opp] - s[player])));
        push({ kind: "allin", to: r1(s[player] + rem(player)) });
      }
    }
    // insertion de l'action réellement jouée (si on est sur le chemin)
    let onPathIdx = -1;
    const real = k >= 0 && k < path.length ? path[k] : null;
    if (real && real.player === player) {
      if (real.kind === "bet" || real.kind === "raise") {
        const to = r1(real.to ?? 0);
        let best = -1, gap = Infinity;
        actions.forEach((a, i) => {
          if (a.kind === "bet" || a.kind === "raise" || a.kind === "allin") {
            const g = Math.abs(a.to - to);
            if (g < gap) { gap = g; best = i; }
          }
        });
        if (best >= 0 && (gap <= 0.05 * pot || actions[best].kind === "allin" && to >= actions[best].to)) onPathIdx = best;
        else {
          const a = sized(real.kind === "raise" || facing ? "raise" : "bet", to);
          const ex = actions.findIndex(x => x.kind === a.kind && x.to === a.to);
          if (ex >= 0) onPathIdx = ex;
          else { actions.push(a); onPathIdx = actions.length - 1; }
        }
      } else {
        onPathIdx = actions.findIndex(a => a.kind === real.kind);
      }
    }
    const node: ActNode = { t: "act", id: nodes.length, player, actions, children: [], pot, s: [s[0], s[1]], c: [base[0] + s[0], base[1] + s[1]], street };
    if (onPathIdx >= 0) node.onPath = onPathIdx;
    nodes.push(node);
    if (k === path.length && k >= 0) pathNode = node;
    node.children = actions.map((a, i) => {
      const nk = i === onPathIdx ? k + 1 : -1;
      const ns: [number, number] = [s[0], s[1]];
      ns[player] = a.to;
      const c: [number, number] = [base[0] + ns[0], base[1] + ns[1]];
      if (a.kind === "fold") return { t: "fold", folder: player, c } as FoldNode;
      const closes = a.kind === "call" || (a.kind === "check" && (checks >= 1 || player === 1));
      if (!closes) return act(street, sz, opp, ns, base, a.kind === "check" ? aggr : aggr + 1, a.kind === "check" ? checks + 1 : 0, nk);
      const allIn = rem(0) - (ns[0] - s[0]) <= 0 || rem(1) - (ns[1] - s[1]) <= 0;
      return endStreet(street, c, allIn);
    });
    return node;
  };

  const endStreet = (street: EndStreet, c: [number, number], allIn: boolean): Node => {
    if (street === "River") return { t: "show", c };
    return {
      t: "chance", cards: riverCards, c,
      children: riverCards.map(() => allIn ? { t: "show", c } as ShowNode : act("River", RIVER_AFTER_TURN, 0, [0, 0], c, 0, 0, -1)),
    };
  };

  const root = act(o.street, rootSizes, 0, [0, 0], [0, 0], 0, 0, 0);
  return { root, pathNode: pathNode as ActNode | null, nodes };
}
