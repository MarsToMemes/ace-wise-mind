// A3 — Cas figés : un cas par bug déjà trouvé (rapports de l'utilisateur, puis A2). Chaque cas rejoue sa main sur
// l'arbitre (A1) et sur le site, les actions étant enregistrées comme le fait la table du site. La valeur attendue vient
// de l'arbitre ; elle est aussi écrite en clair (vérifiée à la main) pour qu'une erreur de l'arbitre se voie.
import { buildHandState } from "@/core/handState";
import { siteView, actionBounds, type SiteView } from "@/lib/siteView";
import { analyzePreflop } from "@/engines/cashPreflopEngine";
import { advisePostflop, type PostflopAdvice } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { topPercentRange } from "@/engines/preflopEquity";
import type { PlayerAction } from "@/components/ActionMenu";
import type { TableSize } from "@/components/PokerTable";
import { Table, c, bbOf, STREETS, type Act } from "../oracle/regles";
import { siteRecord } from "../a2/fuzz";

export interface Verif { quoi: string; attendu: string; obtenu: string; ok: boolean }
export interface Cas { id: string; titre: string; origine: string; verifs: () => Verif[] }

const f = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
const near = (a: number, b: number) => Math.abs(a - b) <= 0.011;
const V = (quoi: string, attendu: number | string, obtenu: number | string, ok?: boolean): Verif => ({
  quoi, attendu: typeof attendu === "number" ? f(attendu) : attendu, obtenu: typeof obtenu === "number" ? f(obtenu) : obtenu,
  ok: ok ?? (typeof attendu === "number" && typeof obtenu === "number" ? near(attendu, obtenu) : attendu === obtenu),
});

/** Table 6-max, bouton au siège 3 : UTG 0, MP 1, CO 2, BTN 3, SB 4, BB 5. */
interface Main { n: number; dealer: number; stacks: number[]; hero: number; hole: string[]; boards: string[][] }
const SIX = (stacks: number[], hero: number, hole: string[], boards: string[][] = [[], ["Kd", "7c", "2s"], ["Kd", "7c", "2s", "4h"], ["Kd", "7c", "2s", "4h", "9d"]]): Main =>
  ({ n: 6, dealer: 3, stacks, hero, hole, boards });

/** Rejoue une main : actions « arbitre » (siège, type, montant « à » en bb), enregistrées aussi comme le ferait le site. */
function rejouer(m: Main, acts: [number, Act["kind"], number?][]) {
  const t = new Table({ n: m.n, dealer: m.dealer, stacks: m.stacks });
  const actions: PlayerAction[] = [];
  const board = () => m.boards[t.street];
  const view = (): SiteView => siteView({
    live: { tableSize: m.n, dealerIdx: m.dealer, userIdx: m.hero, stacks: m.stacks, hole: m.hole, board: board(), actions, folded: t.seats.map(s => s.folded), shown: {} },
    tracked: true, stack: m.stacks[m.hero], potTyped: 0, callTyped: 0,
  });
  for (const [seat, kind, to] of acts) {
    while (t.streetClosed() && !t.handOver()) t.nextStreet();
    const L = t.legal();
    if (!L || t.toAct !== seat) throw new Error(`cas mal écrit : c'est au siège ${t.toAct} de parler, pas au siège ${seat}`);
    const a: Act = { seat, kind, to: to !== undefined ? c(to) : undefined };
    const rec = siteRecord(a, STREETS[t.street], view(), L, t.seats[seat].street + t.seats[seat].stack);
    const why = t.apply(a);
    if (why) throw new Error(`cas mal écrit : ${why}`);
    actions.push(rec);
  }
  const close = () => { while (t.streetClosed() && !t.handOver()) t.nextStreet(); };
  const engine = () => buildHandState({ tableSize: m.n as TableSize, dealerIdx: m.dealer, heroIdx: m.hero, stacksBB: m.stacks, hole: m.hole, board: board(), actions });
  return { t, actions, view, close, engine, board };
}

const R = (text: string, dead: string[]) => expandRange(parseRangeText(text), dead);
const WIDE = "22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A5o+,K9o+,Q9o+,J9o+,T9o";
function conseilApres(m: Main, r: ReturnType<typeof rejouer>): PostflopAdvice {
  const v = r.view(), b = r.board();
  return advisePostflop({
    street: STREETS[r.t.street] as "Flop" | "Turn" | "River", board: b, hole: m.hole,
    heroRange: R(WIDE, [...m.hole, ...b]), villainRange: R(WIDE, [...m.hole, ...b]),
    heroInPosition: false, heroIsPfr: false, potBB: v.dynamicPot, toCallBB: v.userToCall, heroStackBB: v.effLeft,
    canRaise: v.stakes?.canRaise, opponents: Math.max(1, r.t.live().length - 1), villainCheckedThisStreet: false, samples: 800,
  });
}
/** Le conseiller appelé comme dans A2 (ranges top 40 %, 120 tirages), pour rejouer exactement un écart trouvé par A2. */
function conseilCommeA2(m: Main, r: ReturnType<typeof rejouer>): PostflopAdvice {
  const v = r.view(), b = r.board(), range = expandRange(topPercentRange(40), [...m.hole, ...b]);
  return advisePostflop({
    street: STREETS[r.t.street] as "Flop" | "Turn" | "River", board: b, hole: m.hole, heroRange: range, villainRange: range,
    heroInPosition: false, heroIsPfr: true, potBB: v.dynamicPot, toCallBB: v.userToCall, heroStackBB: v.effLeft,
    canRaise: v.stakes?.canRaise, opponents: Math.max(1, r.t.live().length - 1), villainCheckedThisStreet: false, samples: 120,
  });
}
const AGG = new Set(["bet", "overbet", "donk", "probe", "delayed", "block", "raise", "checkRaise", "jam"]);
const BETS = new Set(["bet", "overbet", "donk", "probe", "delayed", "block"]);

export const CAS: Cas[] = [
  {
    id: "R1", origine: "rapport utilisateur",
    titre: "UTG tapis 80, MP paie (150 bb), BTN paie à tapis (30 bb) : pot de la table 191,5 bb (le site affichait 241,5)",
    verifs: () => {
      const m = SIX([80, 150, 100, 30, 100, 100], 1, ["Ah", "Ad"]);
      const r = rejouer(m, [[0, "raise", 80], [1, "call"], [2, "fold"], [3, "call"], [4, "fold"], [5, "fold"]]);
      return [
        V("pot total (arbitre, vérifié à la main : 80 + 80 + 30 + 0,5 + 1)", 191.5, bbOf(r.t.pot)),
        V("pot total (moteur de table)", bbOf(r.t.pot), r.engine().state.pot),
        V("pot affiché sur la table (page)", bbOf(r.t.pot), r.view().tablePot),
      ];
    },
  },
  {
    id: "R2", origine: "rapport utilisateur (main G)",
    titre: "30 bb en BB, relance à 8,5, UTG tapis 100 : à payer 21,5 (le site conseillait de payer 91,5), pot jouable 39",
    verifs: () => {
      const m = SIX([100, 100, 100, 100, 100, 30], 5, ["Ah", "Kd"]);
      const r = rejouer(m, [[0, "raise", 2.5], [1, "fold"], [2, "fold"], [3, "fold"], [4, "fold"], [5, "raise", 8.5], [0, "raise", 100]]);
      const v = r.view();
      return [
        V("à payer (arbitre : 30 − 8,5)", 21.5, bbOf(Math.min(r.t.toCallOf(5), r.t.seats[5].stack))),
        V("« À payer » affiché (page)", 21.5, v.userToCall),
        V("pot que tu peux gagner (arbitre : 30 d'UTG plafonné à ton tapis + tes 8,5 + 0,5 de la SB)", 39, bbOf(r.t.winnable(5))),
        V("pot que tu peux gagner (page, conseils)", 39, v.dynamicPot),
        V("tapis effectif restant (page)", 21.5, v.effLeft),
        V("relance encore possible (page)", "non", v.stakes?.canRaise ? "oui" : "non"),
      ];
    },
  },
  {
    id: "R3", origine: "rapport utilisateur",
    titre: "Ouverture à 2,5 bb puis relance à 3 bb : refusée, minimum 4 bb",
    verifs: () => {
      const m = SIX(Array(6).fill(100), 1, ["Ah", "Kd"]);
      const r = rejouer(m, [[0, "raise", 2.5]]);
      const L = r.t.legal()!;
      const e3 = buildHandState({ tableSize: 6, dealerIdx: 3, heroIdx: 1, stacksBB: 100, hole: [], board: [], actions: [...r.actions, { seatIdx: 1, street: "Preflop", type: "Raise", amountBB: 3 }] });
      const v = r.view();
      return [
        V("relance minimale (arbitre)", 4, bbOf(L.raise!.minTo)),
        V("relance minimale (moteur de table)", 4, r.engine().state.legal!.raise!.minTo),
        V("relance à 3 refusée par le moteur", "refusée", e3.errors.some(x => x.code === "RAISE_BELOW_MIN") ? "refusée" : "acceptée"),
        V("relance minimale du menu d'action (page)", 4, actionBounds(v.currentBet, "Preflop", 100).minAmt),
      ];
    },
  },
  {
    id: "R4", origine: "rapport utilisateur (main E)",
    titre: "Conseil « Tapis » : jamais plus que ce qu'il te reste (92,5 bb après un 3-bet à 7,5)",
    verifs: () => {
      const m = SIX(Array(6).fill(100), 3, ["Kh", "Kc"]);
      const r = rejouer(m, [[0, "fold"], [1, "fold"], [2, "raise", 2.5], [3, "raise", 7.5], [4, "fold"], [5, "fold"], [2, "call"], [2, "bet", 30]]);
      r.close();
      const a = conseilApres(m, r);
      const out: Verif[] = [V("il te reste (arbitre)", 92.5, bbOf(r.t.seats[3].stack)), V("tapis effectif (page)", 92.5, r.view().effLeft)];
      out.push(V("montant du conseil ≤ ce qu'il te reste (relance « à » : ≤ 100)", "≤ 100", a.label, (a.sizeBB ?? 0) <= (a.action === "raise" ? 100 : 92.5) + 0.01));
      if (a.allIn) out.push(V("« Tapis X » : X = ce qu'il te reste", 92.5, a.sizeBB ?? -1));
      return out;
    },
  },
  {
    id: "R5", origine: "rapport utilisateur",
    titre: "River fermée (check, check) : plus aucun conseil de miser",
    verifs: () => {
      const m = SIX(Array(6).fill(100), 5, ["Ah", "Kh"]);
      const r = rejouer(m, [[0, "raise", 2.5], [1, "fold"], [2, "fold"], [3, "fold"], [4, "fold"], [5, "call"],
        [5, "check"], [0, "check"], [5, "check"], [0, "check"], [5, "check"], [0, "check"]]);
      const out: Verif[] = [V("main finie (arbitre)", "oui", r.t.handOver() ? "oui" : "non")];
      for (const hole of [["Kh", "Kc"], ["9h", "9c"], ["Ah", "Kh"], ["7h", "7s"], ["5c", "3c"], ["Qh", "Jh"]]) {
        const a = conseilApres({ ...m, hole }, r);
        out.push(V(`${hole.join("")} : conseil avec les valeurs de la page`, "aucune mise", a.label, !AGG.has(a.action)));
      }
      return out;
    },
  },
  {
    id: "R6", origine: "rapport utilisateur",
    titre: "AA en BB contre l'ouverture d'UTG, flop K♦7♣2♠ : pots, montant à payer et street suivent la main",
    verifs: () => {
      const m = SIX(Array(6).fill(100), 5, ["Ah", "Ad"]);
      const r = rejouer(m, [[0, "raise", 2.5], [1, "fold"], [2, "fold"], [3, "fold"], [4, "fold"], [5, "call"]]);
      const out: Verif[] = [];
      let v = r.view();
      out.push(V("préflop terminé : pot (arbitre 2,5 + 2,5 + 0,5)", 5.5, bbOf(r.t.pot)), V("pot affiché (page)", 5.5, v.tablePot));
      r.close();
      v = r.view();
      out.push(V("street affichée", "Flop", v.street), V("à payer au flop avant toute mise", 0, v.userToCall));
      const r2 = rejouer(m, [[0, "raise", 2.5], [1, "fold"], [2, "fold"], [3, "fold"], [4, "fold"], [5, "call"], [5, "check"], [0, "bet", 3]]);
      v = r2.view();
      out.push(V("UTG mise 3 : à payer (page)", 3, v.userToCall), V("pot affiché (page)", 8.5, v.tablePot), V("pot (moteur)", 8.5, r2.engine().state.pot));
      return out;
    },
  },
  {
    id: "R7", origine: "A2 (graine 1, main 0)",
    titre: "Relance minimale du menu après une relance minimale : 2 puis 3 (et pas 4)",
    verifs: () => {
      const m = SIX(Array(6).fill(100), 2, ["Ah", "Kd"]);
      const r = rejouer(m, [[0, "raise", 2]]);
      return [V("relance minimale (arbitre)", 3, bbOf(r.t.legal()!.raise!.minTo)), V("relance minimale du menu (page)", 3, actionBounds(r.view().currentBet, "Preflop", 100).minAmt)];
    },
  },
  {
    id: "R8", origine: "A2 (graine 1, main 7)",
    titre: "Call d'un joueur court (SB, 2,5 bb) face à une relance à 3 : le pot ne compte que ce qu'il a",
    verifs: () => {
      const m: Main = { n: 5, dealer: 0, stacks: [92.5, 2.5, 150, 30, 7.5], hero: 0, hole: ["4s", "3h"], boards: [[], [], [], []] };
      const r = rejouer(m, [[3, "raise", 2], [4, "fold"], [0, "raise", 3], [1, "call"]]);
      return [V("pot (arbitre : 0,5+2 SB, 1 BB, 2 UTG, 3 BTN)", 8.5, bbOf(r.t.pot)), V("pot affiché (page)", 8.5, r.view().tablePot), V("pot (moteur)", 8.5, r.engine().state.pot)];
    },
  },
  {
    id: "R9", origine: "A2",
    titre: "Conseil préflop face à un tapis que personne d'autre ne peut relancer : pas de « Raise »",
    verifs: () => {
      const m: Main = { n: 2, dealer: 0, stacks: [100, 100], hero: 1, hole: ["Ah", "Ad"], boards: [[], [], [], []] };
      const r = rejouer(m, [[0, "raise", 100]]);
      const v = r.view();
      const p = analyzePreflop({ hole: m.hole, position: "BB", stackBB: v.effLeft, facingRaise: v.facingBet, raiseSizeBB: v.currentBet, opponents: 1 });
      return [V("relance possible (arbitre)", "non", r.t.legal()!.raise ? "oui" : "non"), V("conseil préflop", "Call ou Fold", p.recommendedAction, p.recommendedAction === "Call" || p.recommendedAction === "Fold")];
    },
  },
  {
    id: "R10", origine: "A2",
    titre: "Héros à tapis : plus de conseil (le site affichait « Block bet 25 % = 0 BB »)",
    verifs: () => {
      const m: Main = { n: 2, dealer: 0, stacks: [100, 40], hero: 1, hole: ["9h", "8h"], boards: [[], ["Kd", "7c", "2s"], ["Kd", "7c", "2s", "4h"], ["Kd", "7c", "2s", "4h", "9d"]] };
      const r = rejouer(m, [[0, "raise", 2.5], [1, "call"], [1, "bet", 37.5], [0, "call"]]);
      r.close();
      const out: Verif[] = [V("héros à tapis (arbitre)", "oui", r.t.seats[1].allIn ? "oui" : "non")];
      for (const hole of [["9h", "8h"], ["Kh", "Kc"], ["5c", "2s"], ["Ah", "Jh"]]) {
        const a = conseilApres({ ...m, hole }, r);
        out.push(V(`${hole.join("")} : conseil affiché`, "aucune mise", a.label, !AGG.has(a.action)));
      }
      return out;
    },
  },
  {
    id: "R11", origine: "A2 (graine 1, main 191)",
    titre: "Mise conseillée sous le minimum de 1 bb (« Mise 30 % = 0,5 BB ») dans un pot limpé de 2 bb",
    verifs: () => {
      const m: Main = { n: 2, dealer: 0, stacks: [30, 30], hero: 1, hole: ["Qd", "6s"], boards: [[], ["Qh", "9h", "7s"], [], []] };
      const r = rejouer(m, [[0, "call"], [1, "check"]]);
      r.close();
      const a = conseilCommeA2(m, r);
      const bet = BETS.has(a.action);
      return [V("pot (arbitre)", 2, bbOf(r.t.pot)), V("mise conseillée ≥ 1 bb", "≥ 1", a.label, !bet || a.allIn || (a.sizeBB ?? 0) >= 1)];
    },
  },
  {
    id: "R12", origine: "A2 (graine 20261125, main 8900)",
    titre: "Relance conseillée sous la relance minimale (« Check-raise à 4,5 BB » face à une relance à 5, minimum 6,5)",
    verifs: () => {
      const m: Main = { n: 4, dealer: 1, stacks: [20, 20, 20, 20], hero: 3, hole: ["8d", "3h"], boards: [[], ["8c", "8h", "Jh"], ["8c", "8h", "Jh", "6s"], []] };
      const r = rejouer(m, [[0, "call"], [1, "fold"], [2, "raise", 2], [3, "call"], [0, "call"],
        [2, "bet", 1], [3, "raise", 2], [0, "call"], [2, "call"],
        [2, "check"], [3, "bet", 1], [0, "raise", 2], [2, "raise", 3.5], [3, "call"], [0, "raise", 5], [2, "call"]]);
      const L = r.t.legal()!;
      const a = conseilCommeA2(m, r);
      const raise = a.action === "raise" || a.action === "checkRaise";
      return [
        V("relance minimale (arbitre : 5 + 1,5)", 6.5, bbOf(L.raise!.minTo)),
        V("relance conseillée ≥ relance minimale", "≥ 6,5", a.label, !raise || a.allIn || (a.sizeBB ?? 0) >= bbOf(L.raise!.minTo) - 0.01),
      ];
    },
  },
];

export function runCas(): { cas: Cas; verifs: Verif[]; erreur?: string }[] {
  return CAS.map(k => {
    try { return { cas: k, verifs: k.verifs() }; } catch (e) { return { cas: k, verifs: [], erreur: String(e) }; }
  });
}
