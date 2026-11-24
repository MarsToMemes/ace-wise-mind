import { describe, it, expect } from "vitest";
import { buildBetTree, endPayoff, type BetTreeSpec } from "@/engines/multiway/betTree";
import { computePots, type SeatState, type HandState } from "@/core/handState";
import { settleHand } from "@/core/settle";
import { CASH_RAKE } from "@/core/rake";

// Étape A1 : l'arbre d'enchères accepte les vraies mises d'avant la river (dont l'argent des joueurs couchés, chacun à
// son niveau) et les actions déjà jouées sur la river, avec leurs vraies tailles.
const MENU = { bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3 };

describe("A1 : arbre d'enchères à partir d'une vraie main", () => {
  it("mises d'avant la river inégales (tapis court déjà à tapis) et argent mort : gains = moteur de règles du site", () => {
    // J0 tapis à 20 avant la river (reste 0) ; J1, J2 ont mis 30 ; deux joueurs couchés ont laissé 2,5 et 7 bb
    const s: BetTreeSpec = { n: 3, potBB: 20 + 30 + 30 + 2.5 + 7, stacks: [0, 60, 45], rake: CASH_RAKE, ...MENU,
      invested0: [20, 30, 30], dead: [2.5, 7] };
    const t = buildBetTree(s);
    let worst = 0, n = 0;
    for (const e of t.ends) for (const rk of [[3, 2, 1], [1, 3, 2], [2, 2, 1], [1, 2, 3], [2, 1, 2]]) {
      // même fin de main, rejouée par le moteur de règles : sièges réels + joueurs couchés
      const seats = [
        ...[0, 1, 2].map(p => ({ idx: p, investedBB: e.invested[p], folded: e.folded[p], allIn: s.stacks[p] - (e.invested[p] - s.invested0![p]) <= 1e-9 })),
        ...s.dead!.map((d, k) => ({ idx: 3 + k, investedBB: d, folded: true, allIn: false })),
      ] as SeatState[];
      const state = { pots: computePots(seats, false), seats, board: ["Ks", "Kd", "8h", "4c", "2s"], history: [] } as unknown as HandState;
      const ranks: Record<number, number> = {};
      [0, 1, 2].forEach(p => { if (!e.folded[p]) ranks[p] = rk[p]; });
      const ref = settleHand(state, { ranks, rake: CASH_RAKE });
      [0, 1, 2].forEach(p => { worst = Math.max(worst, Math.abs(ref.payouts[p] - e.invested[p] - endPayoff(e, p, rk))); });
      n++;
    }
    expect(n).toBe(70); // 14 fins de main (J0 à tapis ne parle plus) × 5 classements
    expect(worst).toBeLessThan(1e-6);
    // J0, déjà à tapis, ne parle jamais sur la river
    expect(t.acts.every(a => a.player !== 0)).toBe(true);
  });

  it("actions déjà jouées : une taille hors de l'arbre est ajoutée telle quelle, et l'on arrive au bon joueur", () => {
    const s: BetTreeSpec = { n: 3, potBB: 30, stacks: [100, 100, 100], rake: CASH_RAKE, ...MENU,
      path: [{ player: 0, kind: "check" }, { player: 1, kind: "bet", to: 18 }] };     // 60 % du pot : hors arbre
    const t = buildBetTree(s);
    expect(t.pathNode?.player).toBe(2);
    expect(t.pathNode?.actions).toEqual(["f", "c", "r", "a"]);
    const n1 = t.byHist.get("1|p")!;
    expect(n1.actions.some(a => a.startsWith("k"))).toBe(true);                         // la vraie taille, ajoutée
    expect(t.pathError).toBeUndefined();
  });

  it("une taille proche d'une taille de l'arbre (à 5 % du pot près) est rattachée à celle-ci ; un tapis au tapis", () => {
    const t = buildBetTree({ n: 3, potBB: 30, stacks: [100, 100, 100], rake: CASH_RAKE, ...MENU,
      path: [{ player: 0, kind: "bet", to: 23 }, { player: 1, kind: "raise", to: 100 }] }); // 22,5 ≈ ¾ pot ; 100 = tapis
    expect(t.pathNode?.player).toBe(2);
    expect(t.pathNode?.hist).toBe("b1a");
  });

  it("chemin impossible (ce n'est pas à ce joueur de parler) : signalé, pas de nœud", () => {
    const t = buildBetTree({ n: 3, potBB: 30, stacks: [100, 100, 100], rake: CASH_RAKE, ...MENU, path: [{ player: 1, kind: "check" }] });
    expect(t.pathNode).toBeUndefined();
    expect(t.pathError).toBeDefined();
  });
});

import { readFileSync } from "fs";
import { resolve } from "path";
import type { SolverGame } from "@/engines/solverSpots";
import { riverSpotFromHand } from "@/engines/multiway/handSpot";
import { replayLive, type LiveHand } from "@/lib/liveHand";
import type { PlayerAction } from "@/components/ActionMenu";

const game: SolverGame = JSON.parse(readFileSync(resolve(__dirname, "../../public/solver/cash100.json"), "utf8"));
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];             // sièges 0..5, bouton au siège 3
const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
const hand = (actions: PlayerAction[], userIdx: number, hole: string[], stacks = [100, 100, 100, 100, 100, 100]): LiveHand => ({
  tableSize: 6, dealerIdx: 3, userIdx, stacks, hole, board: ["Kh", "9d", "4c", "7s", "2h"], actions, folded: [false, false, false, false, false, false], shown: {},
});
const PRE3 = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5)];
const FLOP_TURN3 = [A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(5, "Turn", "Check"), A(2, "Turn", "Bet", 5), A(3, "Turn", "Call", 5), A(5, "Turn", "Call", 5)];
const opts = { positions: SIX, game, effStack: 100, rake: CASH_RAKE };

describe("A1 : spot river à partir d'une main saisie sur le site", () => {
  it("3 joueurs (CO ouvre, BTN et BB paient, SB couchée), river : BB checke, CO mise 12 (hors arbre), au BTN (toi) de jouer", () => {
    const h = hand([...PRE3, ...FLOP_TURN3, A(5, "River", "Check"), A(2, "River", "Bet", 12)], 3, ["Ah", "Kd"]);
    const s = riverSpotFromHand({ live: h, ...opts });
    if (!s.ok) throw new Error(s.reason);
    expect(s.seats).toEqual([5, 2, 3]);                      // BB, CO, BTN : ordre de parole après le flop
    expect(s.heroPlayer).toBe(2);
    expect(s.spec.invested0).toEqual([7.5, 7.5, 7.5]);
    expect(s.spec.dead).toEqual([0.5]);                      // la petite blinde couchée
    expect(s.spec.potBB).toBeCloseTo(23, 9);
    expect(s.spec.stacks).toEqual([92.5, 92.5, 92.5]);
    // même pot que le moteur de règles du site, une fois la river rejouée
    const st = replayLive(h).state;
    expect(st.seats.reduce((t, x) => t + x.investedBB, 0)).toBeCloseTo(23 + 12, 9);
    expect(s.pathNode.player).toBe(2);
    expect(s.pathNode.hist.startsWith("pk12")).toBe(true);
    expect(s.spec.ranges[2][s.heroHand].cards.join("")).toBe("AhKd");
    expect(s.spec.ranges.every(r => r.length > 10)).toBe(true);
  });

  it("4 joueurs (CO ouvre, BTN, SB, BB paient), river, la SB (toi) parle en premier", () => {
    const pre = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Call", 2), A(5, "Preflop", "Call", 1.5)];
    const ft = [A(4, "Flop", "Check"), A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(4, "Turn", "Check"), A(5, "Turn", "Check"), A(2, "Turn", "Check"), A(3, "Turn", "Check")];
    const s = riverSpotFromHand({ live: hand([...pre, ...ft], 4, ["Qs", "Qc"]), ...opts });
    if (!s.ok) throw new Error(s.reason);
    expect(s.seats).toEqual([4, 5, 2, 3]);
    expect(s.heroPlayer).toBe(0);
    expect(s.spec.potBB).toBeCloseTo(10, 9);
    expect(s.pathNode.hist).toBe("");
    expect(s.spec.bets).toEqual([0.5, 1]);                   // menu de Pluribus à 4 joueurs
  });

  it("tapis court déjà à tapis à la turn : il reste dans le coup sans parler, ses pots annexes sont justes", () => {
    const stacks = [100, 100, 15, 100, 100, 100];
    const ft = [A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(5, "Turn", "Check"), A(2, "Turn", "Bet", 12.5), A(3, "Turn", "Call", 12.5), A(5, "Turn", "Call", 12.5)];
    const s = riverSpotFromHand({ live: hand([...PRE3, ...ft], 5, ["8c", "8d"], stacks), ...opts });
    if (!s.ok) throw new Error(s.reason);
    expect(s.seats).toEqual([5, 2, 3]);
    expect(s.spec.stacks).toEqual([85, 0, 85]);
    expect(s.spec.invested0).toEqual([15, 15, 15]);
    expect(s.heroPlayer).toBe(0);
  });

  it("refus clairs : ce n'est pas à toi de jouer ; 5 joueurs ; pas encore la river", () => {
    const notHero = riverSpotFromHand({ live: hand([...PRE3, ...FLOP_TURN3], 3, ["Ah", "Kd"]), ...opts });
    expect(notHero.ok).toBe(false);
    const turn = riverSpotFromHand({ live: { ...hand([...PRE3, A(5, "Flop", "Check")], 2, ["Ah", "Kd"]), board: ["Kh", "9d", "4c"] }, ...opts });
    expect(turn.ok).toBe(false);
    const pre5 = [A(0, "Preflop", "Raise", 2.5), A(1, "Preflop", "Call", 2.5), A(2, "Preflop", "Fold"), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Call", 2), A(5, "Preflop", "Call", 1.5)];
    const ft5 = ["Flop", "Turn"].flatMap(st => [4, 5, 0, 1, 3].map(seat => A(seat, st as PlayerAction["street"], "Check")));
    const five = riverSpotFromHand({ live: hand([...pre5, ...ft5], 4, ["Ah", "Kd"]), ...opts });
    expect(five.ok).toBe(false);
    if (!five.ok) expect(five.reason).toMatch(/5 joueurs/);
  });
});

import { VRiver3, type VSpec } from "@/engines/multiway/vriver3";
import { VRiverN } from "@/engines/multiway/vriverN";

describe("A1 : le moteur rapide à 3 joueurs suit la vraie main", () => {
  it("mises inégales, tapis déjà à tapis, argent mort et mise déjà jouée : mêmes gains que le moteur général", () => {
    const r = (...hs: string[]) => hs.map(x => ({ cards: [x.slice(0, 2), x.slice(2)] as [string, string], w: 1 }));
    const spec: VSpec = { board: ["Kh", "9d", "4c", "7s", "2h"], potBB: 20 + 30 + 30 + 2.5 + 7, stacks: [0, 60, 45], rake: CASH_RAKE,
      ranges: [r("AsKs", "QcQd", "8c8d"), r("AdKc", "JhJs", "Tc9c", "6c5c"), r("KcQh", "9s9h", "AhQs")],
      ...MENU, invested0: [20, 30, 30], dead: [2.5, 7], path: [{ player: 1, kind: "bet", to: 17 }] };
    const fast = new VRiver3(spec, { terminal: "exact" }), ref = new VRiverN(spec, { terminal: "enum" });
    expect(fast.terminalCount()).toBe(ref.terminalCount());
    const a = fast.expectedValues(fast.averageProfile()), b = ref.expectedValues(ref.averageProfile());
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
  });
});

import { spotKey } from "@/engines/multiway/spotCache";

describe("A1 : mémoire des spots", () => {
  it("deux spots qui ne diffèrent que par l'argent mort, les mises d'avant la river ou la ligne jouée ont des empreintes différentes", () => {
    const r = [{ cards: ["As", "Ks"] as [string, string], w: 1 }];
    const base: VSpec = { board: ["Kh", "9d", "4c", "7s", "2h"], potBB: 30, stacks: [50, 50], rake: null, ranges: [r, r], ...MENU };
    const keys = [base, { ...base, dead: [1] }, { ...base, invested0: [10, 20] }, { ...base, path: [{ player: 0, kind: "check" as const }] }].map(s => spotKey(s));
    expect(new Set(keys).size).toBe(4);
  });
});

describe("A2 : mains presque impossibles retirées (Pluribus)", () => {
  it("sous le seuil, les mains disparaissent des ranges, sauf la tienne ; le nombre retiré est signalé", () => {
    const h = hand([...PRE3, ...FLOP_TURN3, A(5, "River", "Check"), A(2, "River", "Bet", 12)], 3, ["Ah", "Kd"]);
    const full = riverSpotFromHand({ live: h, ...opts }), cut = riverSpotFromHand({ live: h, ...opts, minWeight: 0.05 });
    if (!full.ok || !cut.ok) throw new Error("spot");
    cut.spec.ranges.forEach((r, p) => r.forEach((c, x) => { if (!(p === cut.heroPlayer && x === cut.heroHand)) expect(c.w).toBeGreaterThanOrEqual(0.05); }));
    expect(cut.spec.ranges[cut.heroPlayer][cut.heroHand].cards.join("")).toBe("AhKd");
    const removed = full.spec.ranges.reduce((t, r) => t + r.length, 0) - cut.spec.ranges.reduce((t, r) => t + r.length, 0);
    expect(removed).toBeGreaterThan(0);
    expect(cut.notes.some(n => n.includes(`${removed} mains`))).toBe(true);
  });
});

import { turnSpotFromHand } from "@/engines/multiway/handSpot";

describe("B2 : spot turn à 3 joueurs à partir d'une main saisie", () => {
  const turnHand = (actions: PlayerAction[], userIdx: number) => ({ ...hand(actions, userIdx, ["Ah", "Kd"]), board: ["Kh", "9d", "4c", "7s"] });
  const FLOP3 = [A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check")];
  it("BB checke, CO mise 4 bb, au BTN (toi) : joueurs, pot, mises d'avant la turn, menus, nœud de ta décision", () => {
    const s = turnSpotFromHand({ live: turnHand([...PRE3, ...FLOP3, A(5, "Turn", "Check"), A(2, "Turn", "Bet", 4)], 3), ...opts });
    if (!s.ok) throw new Error(s.reason);
    expect(s.seats).toEqual([5, 2, 3]);
    expect(s.spec.board).toEqual(["Kh", "9d", "4c", "7s"]);
    expect(s.spec.potBB).toBeCloseTo(8, 9);
    expect(s.spec.invested0).toEqual([2.5, 2.5, 2.5]);
    expect(s.spec.dead).toEqual([0.5]);
    expect(s.spec.bets).toEqual([0.5, 1]);
    expect("river" in s.spec).toBe(true);
    expect(s.pathNode.player).toBe(2);
    expect(s.pathNode.actions).toEqual(["f", "c", "r", "a"]);
  });
  it("refus : 4 joueurs à la turn ; pas à toi de parler", () => {
    const pre4 = [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Call", 2), A(5, "Preflop", "Call", 1.5)];
    const four = turnSpotFromHand({ live: { ...turnHand([...pre4, ...[4, 5, 2, 3].map(x => A(x, "Flop", "Check"))], 4) }, ...opts });
    expect(four.ok).toBe(false);
    if (!four.ok) expect(four.reason).toMatch(/3 joueurs/);
    const notMe = turnSpotFromHand({ live: turnHand([...PRE3, ...FLOP3], 3), ...opts });
    expect(notMe.ok).toBe(false);
  });
});
