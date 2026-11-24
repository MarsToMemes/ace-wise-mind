import { describe, it, expect } from "vitest";
import { VRiverN } from "@/engines/multiway/vriverN";
import { endPayoff, type TNode } from "@/engines/multiway/betTree";
import type { VSpec, VProfile } from "@/engines/multiway/vriver3";
import { actionValues } from "@/engines/multiway/nodeValues";
import { rank7 } from "@/engines/handEval7";
import { CASH_RAKE } from "@/core/rake";

// Étape A3 : ce que rapporte chaque action avec ta main, au nœud où tu dois jouer (se coucher = 0).
const BOARD = ["Kh", "9d", "4c", "7s", "2h"];
const r = (...hs: string[]) => hs.map((x, k) => ({ cards: [x.slice(0, 2), x.slice(2)] as [string, string], w: 0.4 + 0.15 * k }));
const SPEC: VSpec = { board: BOARD, potBB: 23, stacks: [92.5, 92.5, 92.5], rake: CASH_RAKE, invested0: [7.5, 7.5, 7.5], dead: [0.5],
  ranges: [r("AsKs", "QcQd", "8c8d", "Ad5d"), r("AdKc", "JhJs", "Tc9c", "6c5c", "9s8s"), r("KcQh", "9h9c", "AhQs", "3c3d")],
  bets: [0.33, 0.75], raise: true, allin: true, maxAggr: 2, path: [{ player: 0, kind: "check" }, { player: 1, kind: "bet", to: 12 }] };

/** Calcul complet : toutes les distributions de mains, chaque action suivie jusqu'au bout avec le profil. */
function brute(v: VRiverN, prof: VProfile, nodeId: number, hero: number, cards: [string, string]): number[] {
  const hands = v.hands, n = v.n, rk = (c: [string, string]) => rank7([...c, ...BOARD]);
  const path: { node: TNode & { t: "act" }; a: number }[] = [];
  const find = (nd: TNode, acc: typeof path): boolean => {
    if (nd.t === "end") return false;
    if (nd.id === nodeId) { path.push(...acc); return true; }
    return nd.children.some((c, a) => find(c, [...acc, { node: nd, a }]));
  };
  find(v.root, []);
  const target = v.tree.acts[nodeId];
  const sig = (nd: TNode & { t: "act" }, a: number, hs: number[]) => { const s = prof.get(nd.id)!, N = hands[nd.player].length; return s[a * N + hs[nd.player]]; };
  const val = (nd: TNode, hs: number[], ranks: number[]): number => {
    if (nd.t === "end") return endPayoff(nd, hero, ranks);
    return nd.children.reduce((t, c, a) => t + sig(nd, a, hs) * val(c, hs, ranks), 0);
  };
  const out = new Array(target.actions.length).fill(0); let mass = 0;
  const hx = hands[hero].findIndex(c => c.cards.join("") === cards.join(""));
  const rec = (p: number, hs: number[], used: Set<string>, w: number) => {
    if (p === n) {
      // probabilité que les adversaires jouent la ligne jusqu'au nœud
      for (const st of path) if (st.node.player !== hero) w *= sig(st.node, st.a, hs);
      if (w === 0) return;
      const ranks = hs.map((x, q) => rk(hands[q][x].cards));
      mass += w;
      target.children.forEach((c, a) => { out[a] += w * val(c, hs, ranks); });
      return;
    }
    if (p === hero) return rec(p + 1, [...hs, hx], used, w);
    hands[p].forEach((c, x) => {
      if (c.cards.some(k => used.has(k))) return;
      rec(p + 1, [...hs, x], new Set([...used, ...c.cards]), w * c.w);
    });
  };
  rec(0, [], new Set(cards), 1);
  return out.map(x => x / mass + target.put[hero]);
}

describe("A3 : valeur de chaque action pour ta main", () => {
  it("égale au calcul complet (toutes les distributions de mains), avec la stratégie calculée", () => {
    const v = new VRiverN(SPEC); v.run(30);
    const prof = v.averageProfile(), node = v.tree.pathNode!;
    expect(node.player).toBe(2);
    for (const cards of [["KcQh"], ["9h9c"], ["3c3d"]].map(([s]) => [s.slice(0, 2), s.slice(2)] as [string, string])) {
      const x = v.hands[2].findIndex(c => c.cards.join("") === cards.join(""));
      const got = actionValues(SPEC, prof, node.id, 2)[x], want = brute(v, prof, node.id, 2, cards);
      got.forEach((g, a) => expect(g).toBeCloseTo(want[a], 9));
      expect(got[node.actions.indexOf("f")]).toBeCloseTo(0, 9);
    }
  });
});

import { multiwayResult } from "@/engines/multiway/nodeValues";

describe("A3 : résultat traduit pour la Décision synthétique", () => {
  it("actions en français avec leurs montants, fréquences qui font 100 %, se coucher = 0, range par catégorie", () => {
    const v = new VRiverN(SPEC); v.run(40);
    const prof = v.averageProfile(), node = v.tree.pathNode!;
    const x = v.hands[2].findIndex(c => c.cards.join("") === "9h9c");
    const res = multiwayResult(SPEC, prof, node.id, 2, x, { nashConv: 0.02, iterations: 40, ms: 1234 });
    expect(res.street).toBe("River");
    expect(res.actions.map(a => a.label)).toEqual(["Fold", "Call 12 bb", "Relance à 59 bb", "Tapis 92,5 bb"]);
    expect(res.actions.map(a => a.kind)).toEqual(["fold", "call", "raise", "allin"]);
    expect(res.actions.reduce((t, a) => t + a.freq, 0)).toBeCloseTo(1, 9);
    expect(res.actions[0].ev).toBeCloseTo(0, 9);
    expect(res.range.reduce((t, l) => t + l.freq, 0)).toBeCloseTo(1, 9);
    expect(res.combos).toEqual([4, 5, 4]);
    expect(res.exploitPct).toBeCloseTo(100 * 0.02 / 23, 12);
    expect(res.heroInRange).toBe(true);
    expect(res.players).toBe(3);
  });

  it("à un nœud sans mise : check et mises en % du pot", () => {
    const spec = { ...SPEC, path: [] };
    const v = new VRiverN(spec); v.run(10);
    const res = multiwayResult(spec, v.averageProfile(), v.tree.pathNode!.id, 0, 0, { nashConv: 1, iterations: 10, ms: 1 });
    expect(res.actions.map(a => a.label)).toEqual(["Check", "Mise 33 % = 7,6 bb", "Mise 75 % = 17,3 bb", "Tapis 92,5 bb"]);
  });
});

import { readFileSync } from "fs";
import { resolve } from "path";
import { multiwayRoute } from "@/engines/multiway/route";
import type { PlayerAction } from "@/components/ActionMenu";
import type { LiveHand } from "@/lib/liveHand";

describe("A3 : quel solveur pour quelle situation", () => {
  const game = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
  const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
  const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
  const live = (actions: PlayerAction[], userIdx: number, board = BOARD): LiveHand => ({ tableSize: 6, dealerIdx: 3, userIdx, stacks: Array(6).fill(100), hole: ["Ah", "Kd"], board, actions, folded: Array(6).fill(false), shown: {} });
  const base = { positions: SIX, game, effStack: 100, rake: CASH_RAKE };
  const PRE3 = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5)];
  const FT3 = [A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(5, "Turn", "Check"), A(2, "Turn", "Check"), A(3, "Turn", "Check")];

  it("tête-à-tête : le solveur actuel", () => {
    const pre2 = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Fold")];
    expect(multiwayRoute({ ...base, street: "River", live: live([...pre2, A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(2, "Turn", "Check"), A(3, "Turn", "Check"), A(2, "River", "Bet", 5)], 3) }).kind).toBe("headsup");
  });
  it("river à 3 joueurs : le solveur multiway, sur ta décision", () => {
    const r = multiwayRoute({ ...base, street: "River", live: live([...PRE3, ...FT3, A(5, "River", "Check"), A(2, "River", "Bet", 12)], 3) });
    expect(r.kind).toBe("multiway");
    if (r.kind === "multiway") { expect(r.spot.heroPlayer).toBe(2); expect(r.spot.seats).toEqual([5, 2, 3]); }
  });
  it("turn à 3 joueurs : le solveur multiway (méthode « turn seule ») ; river à 4 joueurs, pas de ranges : conseil maison", () => {
    const t = multiwayRoute({ ...base, street: "Turn", live: live([...PRE3, ...FT3.slice(0, 3), A(5, "Turn", "Check"), A(2, "Turn", "Check")], 3, BOARD.slice(0, 4)) });
    expect(t.kind).toBe("multiway");
    if (t.kind === "multiway") { expect(t.spot.spec.board).toHaveLength(4); expect(t.spot.heroPlayer).toBe(2); }
    const pre4 = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Call", 2), A(5, "Preflop", "Call", 1.5)];
    const ft4 = ["Flop", "Turn"].flatMap(st => [4, 5, 2, 3].map(s => A(s, st as PlayerAction["street"], "Check")));
    const f = multiwayRoute({ ...base, street: "River", live: live([...pre4, ...ft4], 4) });
    expect(f).toEqual({ kind: "house", note: "Solveur multiway : la turn et la river à 3 joueurs seulement pour l'instant (ici, 4 joueurs). Conseil maison." });
    const g = multiwayRoute({ ...base, game: null, street: "River", live: live([...PRE3, ...FT3, A(5, "River", "Check"), A(2, "River", "Bet", 12)], 3) });
    expect(g.kind).toBe("house");
  });
  it("à 3 joueurs mais pas à toi de parler : rien à calculer, sans note", () => {
    expect(multiwayRoute({ ...base, street: "River", live: live([...PRE3, ...FT3], 3) })).toEqual({ kind: "none" });
  });
});

describe("B2 : précision à ta décision (lignes rares)", () => {
  it("localPct = perte moyenne de ta range en suivant la stratégie au nœud (par rapport à la meilleure action), en % du pot", () => {
    const v = new VRiverN(SPEC); v.run(25);
    const prof = v.averageProfile(), node = v.tree.pathNode!, N = v.handCount(2), s = prof.get(node.id)!;
    const ev = actionValues(SPEC, prof, node.id, 2);
    let W = 0, L = 0;
    v.hands[2].forEach((c, x) => { W += c.w; L += c.w * (Math.max(...ev[x]) - ev[x].reduce((t, e, a) => t + s[a * N + x] * e, 0)); });
    const res = multiwayResult(SPEC, prof, node.id, 2, 0, { nashConv: 0, iterations: 25, ms: 1 });
    expect(res.localPct).toBeCloseTo((100 * L / W) / SPEC.potBB, 9);
  });
  it("une stratégie au hasard est bien moins précise à ta décision qu'une stratégie calculée", () => {
    const v = new VRiverN(SPEC), uni = v.averageProfile(), node = v.tree.pathNode!;
    v.run(300);
    const a = multiwayResult(SPEC, uni, node.id, 2, 0, { nashConv: 0, iterations: 0, ms: 1 });
    const b = multiwayResult(SPEC, v.averageProfile(), node.id, 2, 0, { nashConv: 0, iterations: 300, ms: 1 });
    expect(b.localPct!).toBeLessThan(a.localPct! / 5);
  }, 60000);
});
