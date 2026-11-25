// A2 — Mains aléatoires légales (graine fixe) jouées en parallèle par l'arbitre (A1) et par le site. Après chaque
// action, le moteur de table, le calcul de la page et les conseillers sont comparés à l'arbitre. Les actions sont
// enregistrées comme le fait la table du site (un call enregistre le montant affiché par le menu, le bouton « Tapis »
// le montant « relance à » calculé par la page), pour retrouver les erreurs que voit vraiment l'utilisateur.
import { buildHandState, type BuildResult } from "@/core/handState";
import { settleHand } from "@/core/settle";
import { rank7 } from "@/engines/handEval7";
import { siteView, actionBounds, menuToCall, type SiteView } from "@/lib/siteView";
import { analyzePreflop } from "@/engines/cashPreflopEngine";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { expandRange } from "@/engines/rangeVsRange";
import { topPercentRange } from "@/engines/preflopEquity";
import type { PlayerAction } from "@/components/ActionMenu";
import type { TableSize } from "@/components/PokerTable";
import { Table, c, bbOf, STREETS, type Legal, type Act } from "../oracle/regles";
import { best } from "../oracle/evaluateur";
import { rng, DECK, type Rng } from "../outils/hasard";

export interface Divergence {
  check: string;
  /** Gravité : moteur faux (A), affichage faux, conseil impossible, convention différente. */
  family: "moteur" | "page" | "conseil" | "convention" | "abattage";
  detail: string;
  expected: string;
  got: string;
  hand: number;
  step: number;
}
export interface HandSetup { n: number; dealer: number; stacks: number[]; ante: number; hero: number; deck: string[] }
export interface FuzzOptions { seed: number; hands: number; advisors?: boolean; onlyHand?: number; trace?: (line: string) => void }
export interface FuzzResult {
  seed: number; hands: number; actions: number; probes: number; showdowns: number; advisorCalls: number;
  coverage: Record<string, number>;
  divergences: Divergence[];
  ms: number;
}

const EPS = 0.011;
const f = (x: number) => String(Math.round(x * 100) / 100);
/** Graine d'une main : on peut rejouer la main k seule. */
export const handSeed = (seed: number, k: number) => (Math.imul(seed ^ 0x9e3779b9, 2654435761) + Math.imul(k + 1, 0x85ebca6b)) >>> 0;

export function setupHand(seed: number, k: number): { setup: HandSetup; r: Rng } {
  const r = rng(handSeed(seed, k));
  const n = r.int(2, 6);
  const profile = r.pick(["100", "20", "30", "asym", "courts", "mixte"]);
  const half = (x: number) => Math.max(0.5, Math.round(x * 2) / 2);
  const stacks = Array.from({ length: n }, () => {
    switch (profile) {
      case "100": return 100;
      case "20": return 20;
      case "30": return 30;
      case "courts": return half(0.5 + r.next() * 12);
      case "mixte": return r.pick([0.5, 1, 2.5, 7.5, 20, 30, 92.5, 100, 150]);
      default: return half(1 + r.next() * 199);
    }
  });
  const ante = r.chance(0.12) ? r.pick([0.1, 0.25, 1]) : 0;
  return { setup: { n, dealer: r.int(0, n - 1), stacks, ante, hero: r.int(0, n - 1), deck: r.shuffle(DECK) }, r };
}

/** Action enregistrée comme le ferait la table du site. */
export function siteRecord(a: Act, street: PlayerAction["street"], v: SiteView, legal: Legal, maxTo: number): PlayerAction {
  const seat = a.seat;
  if (a.kind === "fold") return { seatIdx: seat, street, type: "Fold", amountBB: 0 };
  if (a.kind === "check") return { seatIdx: seat, street, type: "Check", amountBB: 0 };
  if (a.kind === "call") {
    // menu : « à payer » affiché par la table (même fonction que PokerTable.tsx)
    return { seatIdx: seat, street, type: "Call", amountBB: menuToCall(v.currentBet, v.potState.contribs[seat] ?? 0, v.stakes?.allInTo[seat]) };
  }
  const to = a.to!;
  // bouton « Tapis » du menu : le montant « relance à » calculé par la page
  const amount = to === maxTo && v.stakes ? v.stakes.allInTo[seat] : bbOf(to);
  return { seatIdx: seat, street, type: a.kind === "bet" ? "Bet" : "Raise", amountBB: amount };
}

/** Tire une action légale, en privilégiant les cas limites. */
function pickAction(r: Rng, t: Table, L: Legal): Act {
  const seat = t.toAct, s = t.seats[seat], maxTo = s.street + s.stack;
  const roll = r.next();
  const agg = L.raise ? { min: L.raise.minTo, max: L.raise.maxTo, kind: "raise" as const }
    : L.bet ? { min: s.street + L.bet.min, max: s.street + L.bet.max, kind: "bet" as const } : null;
  if (roll < (L.check ? 0.04 : 0.2)) return { seat, kind: "fold" };
  if (roll < 0.62 || !agg) return L.check ? { seat, kind: "check" } : { seat, kind: "call" };
  const sub = r.next();
  let to: number;
  if (sub < 0.3) to = agg.min;                                   // relance minimale exacte
  else if (sub < 0.5) to = agg.max;                              // tapis
  else if (sub < 0.6) to = Math.min(agg.max, agg.min + 50);      // juste au-dessus du minimum
  else to = Math.min(agg.max, agg.min + Math.round(r.next() * (agg.max - agg.min) / 50) * 50);
  return { seat, kind: agg.kind, to: Math.min(to, maxTo) };
}

/** Actions interdites essayées sur le moteur (sans les garder) : il doit les refuser. */
function illegalProbes(t: Table, L: Legal, street: PlayerAction["street"]): { what: string; act: PlayerAction }[] {
  const seat = t.toAct, s = t.seats[seat], maxTo = s.street + s.stack;
  const out: { what: string; act: PlayerAction }[] = [];
  if (L.raise && L.raise.minTo < maxTo && L.raise.minTo - 50 > t.currentBet) {
    out.push({ what: `relance juste sous le minimum (${bbOf(L.raise.minTo - 50)} au lieu de ${bbOf(L.raise.minTo)})`, act: { seatIdx: seat, street, type: "Raise", amountBB: bbOf(L.raise.minTo - 50) } });
  }
  if (L.bet && L.bet.min < s.stack && L.bet.min > 50) out.push({ what: "mise sous 1 bb", act: { seatIdx: seat, street, type: "Bet", amountBB: 0.5 } });
  if (!L.check) out.push({ what: "check face à une mise", act: { seatIdx: seat, street, type: "Check", amountBB: 0 } });
  if (L.check) out.push({ what: "call sans rien à payer", act: { seatIdx: seat, street, type: "Call", amountBB: 1 } });
  out.push({ what: "mise au-delà du tapis", act: { seatIdx: seat, street, type: t.currentBet > 0 ? "Raise" : "Bet", amountBB: bbOf(maxTo) + 5 } });
  if (t.currentBet > 0 && !L.raise && s.stack > t.toCallOf(seat) && t.canBet().some(j => j !== seat)) {
    out.push({ what: "relance alors que les enchères ne sont pas rouvertes", act: { seatIdx: seat, street, type: "Raise", amountBB: bbOf(maxTo) } });
  }
  return out;
}

const BET_KINDS = new Set(["bet", "overbet", "donk", "probe", "delayed", "block"]);

export function runFuzz(o: FuzzOptions): FuzzResult {
  const t0 = Date.now();
  const res: FuzzResult = { seed: o.seed, hands: 0, actions: 0, probes: 0, showdowns: 0, advisorCalls: 0, coverage: {}, divergences: [], ms: 0 };
  const cover = (k: string) => { res.coverage[k] = (res.coverage[k] ?? 0) + 1; };
  const from = o.onlyHand ?? 0, to = o.onlyHand !== undefined ? o.onlyHand + 1 : o.hands;
  for (let k = from; k < to; k++) {
    const { setup, r } = setupHand(o.seed, k);
    playHand(k, setup, r, o, res, cover);
    res.hands++;
  }
  res.ms = Date.now() - t0;
  return res;
}

function playHand(k: number, su: HandSetup, r: Rng, o: FuzzOptions, res: FuzzResult, cover: (k: string) => void) {
  const { n, dealer, stacks, ante, hero, deck } = su;
  const trace = o.trace ?? (() => {});
  const t = new Table({ n, dealer, stacks, ante });
  const holes = Array.from({ length: n }, (_, i) => [deck[2 * i], deck[2 * i + 1]]);
  const boardAll = deck.slice(2 * n, 2 * n + 5);
  const actions: PlayerAction[] = [];
  let step = 0;
  const seen = new Set<string>();
  // BB à tapis pour moins d'une blinde : l'arbitre suit la règle TDA (on paie la blinde entière), le site non ;
  // tout ce qui en découle dans la main est rangé à part (convention), pour ne pas masquer le reste.
  const shortBB = c(stacks[n === 2 ? (dealer + 1) % n : (dealer + 2) % n]) - c(ante) < 100;   // après l'ante
  if (shortBB) cover("BB à tapis pour moins d'une blinde");
  const div = (family0: Divergence["family"], check0: string, detail: string, expected: string, got: string) => {
    const family = shortBB ? "convention" : family0;
    const check = shortBB ? `BB à tapis pour moins d'une blinde — ${check0}` : check0;
    // une même divergence n'est notée qu'une fois par main
    const key = `${check}|${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    res.divergences.push({ family, check, detail, expected, got, hand: k, step });
  };
  const site = ante === 0;   // le site ne gère pas l'ante : seule la partie moteur est comparée
  if (ante) cover("ante");
  if (stacks.some(s => s < 1)) cover("tapis sous 1 bb");
  cover(`${n} joueurs`);
  trace(`main ${k} : ${n} joueurs, bouton ${dealer}, tapis ${stacks.join("/")}, ante ${ante}, héros ${hero} (${holes[hero].join(" ")})`);

  const boardNow = () => boardAll.slice(0, [0, 3, 4, 5][t.street]);
  const engine = (acts = actions, board = boardNow()): BuildResult => buildHandState({
    tableSize: n as TableSize, dealerIdx: dealer, heroIdx: hero, stacksBB: stacks, anteBB: ante, hole: holes[hero], board, actions: acts,
  });
  const view = (): SiteView => siteView({
    live: { tableSize: n, dealerIdx: dealer, userIdx: hero, stacks, hole: holes[hero], board: boardNow(), actions, folded: t.seats.map(s => s.folded), shown: {} },
    tracked: true, stack: stacks[hero], potTyped: 0, callTyped: 0,
  });

  const compare = () => {
    const e = engine();
    const st = e.state;
    if (e.errors.length) div("moteur", "erreur du moteur sur une suite légale", e.errors.map(x => x.code).join(", "), "aucune erreur", e.errors.map(x => `${x.code} : ${x.message}`).join(" | "));
    if (Math.abs(st.pot - bbOf(t.pot)) > EPS) div("moteur", "pot total (moteur)", "", f(bbOf(t.pot)), f(st.pot));
    t.seats.forEach((s, i) => {
      const m = st.seats[i];
      if (Math.abs(m.investedBB - bbOf(s.total)) > EPS || Math.abs(m.remainingBB - bbOf(s.stack)) > EPS) {
        div("moteur", "mise et tapis restant par siège (moteur)", `siège ${i}`, `${f(bbOf(s.total))} mis, ${f(bbOf(s.stack))} restant`, `${f(m.investedBB)} mis, ${f(m.remainingBB)} restant`);
      }
      if (m.folded !== s.folded) div("moteur", "joueur couché (moteur)", `siège ${i}`, String(s.folded), String(m.folded));
    });
    const startSum = stacks.reduce((a, b) => a + b, 0), now = st.seats.reduce((a, s) => a + s.remainingBB, 0) + st.pot;
    if (Math.abs(startSum - now) > EPS) div("moteur", "conservation des jetons (moteur)", "", f(startSum), f(now));
    if (st.toAct !== t.toAct) {
      const conv = t.toAct < 0 && st.toAct >= 0 && t.live().length > 1 && t.canBet().length === 1;
      div(conv ? "convention" : "moteur", "joueur qui doit parler (moteur)", t.handOver() ? "main finie pour l'arbitre" : "", String(t.toAct), String(st.toAct));
    }
    if (t.toAct >= 0 && st.toAct === t.toAct) {
      const L = t.legal()!, M = st.legal!;
      const fmtL = (x: { check: boolean; call: number; bet: { min: number; max: number } | null; raise: { minTo: number; maxTo: number } | null }, cents: boolean) => {
        const v = (z: number) => f(cents ? bbOf(z) : z);
        return `check ${x.check}, call ${v(x.call)}, mise ${x.bet ? `${v(x.bet.min)}–${v(x.bet.max)}` : "non"}, relance ${x.raise ? `${v(x.raise.minTo)}–${v(x.raise.maxTo)}` : "non"}`;
      };
      const same = L.check === M.check && Math.abs(bbOf(L.call) - M.call) <= EPS
        && !!L.bet === !!M.bet && (!L.bet || (Math.abs(bbOf(L.bet.min) - M.bet!.min) <= EPS && Math.abs(bbOf(L.bet.max) - M.bet!.max) <= EPS))
        && !!L.raise === !!M.raise && (!L.raise || (Math.abs(bbOf(L.raise.minTo) - M.raise!.minTo) <= EPS && Math.abs(bbOf(L.raise.maxTo) - M.raise!.maxTo) <= EPS));
      if (!same) {
        // relance proposée alors que tous les autres sont à tapis : règle différente, pas une erreur de calcul
        const conv = !L.raise && !!M.raise && !t.canBet().some(j => j !== t.toAct);
        div(conv ? "convention" : "moteur", conv ? "relance permise alors que tous les autres sont à tapis" : "actions légales et bornes (moteur)", "", fmtL(L, true), fmtL(M, false));
      }
      if (Math.abs(st.toCall - bbOf(t.toCallOf(t.toAct))) > EPS) div("moteur", "montant à payer du joueur qui parle (moteur)", "", f(bbOf(t.toCallOf(t.toAct))), f(st.toCall));
    }
    if (t.streetClosed()) {
      // pots comparés quand les enchères sont fermées (en cours de street, les ayants droit dépendent de la convention)
      const op = t.pots(), mp = st.pots;
      const fmtP = (ps: { amount: number; eligible: number[]; refund?: boolean; kind?: string }[], cents: boolean) =>
        ps.map(p => `${f(cents ? bbOf(p.amount) : p.amount)}[${p.eligible.join(",")}]${p.refund || p.kind === "refund" ? " rendu" : ""}`).join(" + ");
      const ok = op.length === mp.length && op.every((p, j) => Math.abs(bbOf(p.amount) - mp[j].amount) <= EPS && p.eligible.join() === mp[j].eligible.join() && p.refund === (mp[j].kind === "refund"));
      if (!ok) div("moteur", "pots annexes et mise rendue (moteur)", "", fmtP(op, true), fmtP(mp, false));
      if (op.filter(p => !p.refund).length >= 2) cover("pots annexes");
      if (op.some(p => p.refund)) cover("mise rendue");
    }

    if (!site) return;
    // --- page : ce que voit l'utilisateur ---
    const v = view();
    const me = t.seats[hero];
    if (Math.abs(v.tablePot - bbOf(t.pot)) > EPS) div("page", "pot affiché sur la table", "", f(bbOf(t.pot)), f(v.tablePot));
    if (!me.folded && t.toAct === hero) {
      // à ton tour seulement : sinon la page suppose couchés ceux qui n'ont pas encore parlé (convention de saisie)
      const heroCall = Math.min(t.toCallOf(hero), me.stack);
      if (Math.abs(v.userToCall - bbOf(heroCall)) > EPS) div("page", "« À payer » du héros", "", f(bbOf(heroCall)), f(v.userToCall));
      if (Math.abs(v.dynamicPot - bbOf(t.winnable(hero))) > EPS) div("page", "pot que le héros peut gagner (conseils)", "", f(bbOf(t.winnable(hero))), f(v.dynamicPot));
      if (Math.abs(v.effLeft - bbOf(t.effective(hero))) > EPS) div("page", "tapis effectif restant du héros", "", f(bbOf(t.effective(hero))), f(v.effLeft));
    }
    if (v.stakes) t.seats.forEach((s, i) => {
      if (!s.folded && Math.abs(v.stakes!.allInTo[i] - bbOf(s.street + s.stack)) > EPS) div("page", "montant « Tapis » du menu", `siège ${i}`, f(bbOf(s.street + s.stack)), f(v.stakes!.allInTo[i]));
    });
    if (t.toAct >= 0) {
      const L = t.legal()!, s = t.seats[t.toAct];
      const allInTo = v.stakes ? v.stakes.allInTo[t.toAct] : bbOf(s.street + s.stack);
      const b = actionBounds(v.currentBet, STREETS[t.street], allInTo, v.minRaiseTo);
      const agg = L.raise ? { min: L.raise.minTo, max: L.raise.maxTo } : L.bet ? { min: s.street + L.bet.min, max: s.street + L.bet.max } : null;
      if (agg) {
        const minOk = Math.min(b.minAmt, b.maxAmt);
        if (Math.abs(minOk - bbOf(agg.min)) > EPS) div("page", "relance minimale du menu d'action", STREETS[t.street], f(bbOf(agg.min)), f(minOk));
        if (Math.abs(b.maxAmt - bbOf(agg.max)) > EPS) div("page", "tapis maximal du menu d'action", "", f(bbOf(agg.max)), f(b.maxAmt));
      }
    }
    if (o.advisors && !me.folded) adviseCheck(v);
  };

  const adviseCheck = (v: SiteView) => {
    const me = t.seats[hero];
    const heroTurn = t.toAct === hero;
    const over = t.handOver() || me.allIn;
    if (!heroTurn && !over) return;        // le conseil n'est contrôlé qu'à ton tour, ou quand tu ne peux plus agir
    // la page remplace le conseil par un message quand tu ne peux plus agir (v.done)
    if (over) { if (!v.done) div("conseil", "conseil affiché alors que tu ne peux plus agir", t.handOver() ? "main finie" : "héros à tapis", "message « plus de décision »", "conseil affiché"); return; }
    if (v.done) { div("conseil", "décision masquée alors que c'est à toi de jouer", STREETS[t.street], "un conseil", v.done); return; }
    const L = heroTurn ? t.legal()! : null;
    const board = boardNow();
    res.advisorCalls++;
    const pos = engine().state.seats[hero].position;
    const where = over ? "main finie ou héros à tapis" : STREETS[t.street];
    if (t.street === 0) {
      const p = analyzePreflop({ hole: holes[hero], position: pos, stackBB: v.effLeft, facingRaise: v.facingBet, raiseSizeBB: v.currentBet, opponents: t.live().length - 1, canRaise: v.stakes?.canRaise });
      const a = p.recommendedAction;
      if (over) { if (a !== "Fold" && a !== "Check") div("conseil", "conseil préflop alors que tu ne peux plus agir", where, "aucun conseil", a); return; }
      if (a === "Check" && !L!.check) div("conseil", "conseil préflop : check face à une mise", "", "fold / call / relance", a);
      if (a === "Call" && L!.check) div("conseil", "conseil préflop : call sans rien à payer", "", "check / relance", a);
      if ((a === "Raise" || a === "3-bet") && !L!.raise && !L!.bet) div("conseil", "conseil préflop : relance impossible", "", "fold / call", a);
      return;
    }
    const range = expandRange(topPercentRange(40), [...holes[hero], ...board]);
    const adv = advisePostflop({
      street: STREETS[t.street] as "Flop" | "Turn" | "River", board, hole: holes[hero], heroRange: range, villainRange: range,
      heroInPosition: false, heroIsPfr: true, potBB: v.dynamicPot, toCallBB: v.userToCall, heroStackBB: v.effLeft,
      canRaise: v.stakes?.canRaise, betLevel: v.currentBet, minRaiseTo: v.minRaiseTo, opponents: Math.max(1, t.live().length - 1), villainCheckedThisStreet: false, samples: 120,
    });
    const act = adv.action, agg = BET_KINDS.has(act) || act === "raise" || act === "checkRaise" || act === "jam";
    if (over) { if (agg || act === "call") div("conseil", "conseil alors que tu ne peux plus agir", where, "aucun conseil", adv.label); return; }
    const remaining = bbOf(me.stack), streetPut = bbOf(me.street);
    if (act === "check" && !L!.check) div("conseil", "conseil : check face à une mise", "", "fold / call / relance", adv.label);
    if (act === "call" && L!.check) div("conseil", "conseil : call sans rien à payer", "", "check / mise", adv.label);
    if (BET_KINDS.has(act) && !L!.bet) div("conseil", L!.check ? "conseil : mise alors que personne ne peut payer" : "conseil : mise face à une mise", "", L!.check ? "check" : "fold / call / relance", adv.label);
    if ((act === "raise" || act === "checkRaise") && !L!.raise) div("conseil", "conseil : relance impossible", "", "fold / call", adv.label);
    if (adv.sizeBB !== undefined && (agg || act === "call")) {
      // montant ajouté (mise, call) ou « relance à » (relance) ; « Tapis X » : X = ce qu'il te reste
      const cap = act === "raise" || act === "checkRaise" ? streetPut + remaining : remaining;
      if (adv.sizeBB > cap + EPS) div("conseil", "conseil au-delà de ton tapis", act, `≤ ${f(cap)}`, `${adv.label}`);
      if (adv.allIn && Math.abs(adv.sizeBB - Math.min(remaining, bbOf(t.effective(hero)))) > 0.26) div("conseil", "montant du tapis conseillé", "", f(Math.min(remaining, bbOf(t.effective(hero)))), adv.label);
      if (BET_KINDS.has(act) && !adv.allIn && adv.sizeBB < 1 - EPS && remaining >= 1) div("conseil", "conseil : mise sous le minimum de 1 bb", "", "≥ 1", adv.label);
      if ((act === "raise" || act === "checkRaise") && !adv.allIn && L!.raise && adv.sizeBB < bbOf(L!.raise.minTo) - EPS) div("conseil", "conseil : relance sous le minimum", "", `≥ ${f(bbOf(L!.raise.minTo))}`, adv.label);
    }
  };

  compare();
  for (let guard = 0; guard < 200 && !t.handOver(); guard++) {
    if (t.streetClosed()) {
      t.nextStreet();
      trace(`  → ${STREETS[t.street]} ${boardNow().join(" ")}`);
      compare();
      continue;
    }
    const L = t.legal()!;
    const v = site ? view() : null;
    // essais d'actions interdites (le moteur doit les refuser)
    if (r.chance(0.25)) {
      for (const p of illegalProbes(t, L, STREETS[t.street])) {
        res.probes++;
        cover(`refus : ${p.what.replace(/\(.*\)/, "").trim()}`);
        const e = engine([...actions, p.act]);
        if (!e.errors.length) div("moteur", "action interdite acceptée par le moteur", p.what, "refusée", `acceptée (${p.act.type} ${p.act.amountBB})`);
      }
    }
    const a = pickAction(r, t, L);
    const s = t.seats[a.seat];
    if (a.to !== undefined) {
      if (a.to === s.street + s.stack) cover("tapis");
      if (L.raise && a.to === L.raise.minTo) cover("relance minimale exacte");
      if (L.raise && a.to === s.street + s.stack && a.to < L.raise.minTo) cover("tapis sous la relance minimale");
    }
    if (a.kind === "call" && L.call < t.toCallOf(a.seat)) cover("call incomplet (tapis)");
    const rec = v ? siteRecord(a, STREETS[t.street], v, L, s.street + s.stack)
      : { seatIdx: a.seat, street: STREETS[t.street], type: ({ fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise" } as const)[a.kind], amountBB: a.kind === "call" ? bbOf(L.call) : a.to ? bbOf(a.to) : 0 } as PlayerAction;
    const why = t.apply(a);
    if (why) { div("moteur", "générateur : action refusée par l'arbitre", why, "", ""); break; }
    actions.push(rec);
    res.actions++; step++;
    trace(`  ${STREETS[t.street]} siège ${a.seat} ${a.kind}${a.to ? ` ${bbOf(a.to)}` : ""}  (site : ${rec.type} ${rec.amountBB}) pot ${bbOf(t.pot)}`);
    compare();
  }
  if (t.live().filter(i => t.seats[i].allIn).length >= 2) cover("plusieurs tapis");

  // --- fin de main : répartition ---
  const live = t.live();
  const board = live.length > 1 ? boardAll : boardNow();
  if (live.length > 1) { res.showdowns++; cover("abattage"); }
  const strength = (i: number) => best([...holes[i], ...board]);
  const opay = t.payouts(strength);
  const e = engine(actions, board);
  const ranks: Record<number, number> = {};
  if (live.length > 1) live.forEach(i => { ranks[i] = rank7([...holes[i], ...board]); });
  const sres = settleHand(e.state, { ranks });
  // l'ordre des mains doit être le même pour l'évaluateur du site et celui de l'arbitre
  for (const i of live) for (const j of live) if (i < j && live.length > 1) {
    const a = Math.sign(strength(i) - strength(j)), b = Math.sign(ranks[i] - ranks[j]);
    if (a !== b) div("abattage", "évaluateur de mains (site contre arbitre)", `${holes[i].join("")} contre ${holes[j].join("")} sur ${board.join("")}`, String(a), String(b));
  }
  opay.forEach((p, i) => {
    if (Math.abs(bbOf(p) - sres.payouts[i]) > EPS) div("abattage", "gains de chaque joueur (règlement du moteur)", `siège ${i}`, f(bbOf(p)), f(sres.payouts[i]));
  });
  const total = sres.payouts.reduce((a2, b2) => a2 + b2, 0);
  if (Math.abs(total - bbOf(t.pot)) > EPS) div("abattage", "conservation des jetons au règlement", "", f(bbOf(t.pot)), f(total));
  if (o.advisors && site && !t.seats[hero].folded) adviseCheck(view());
  trace(`  fin : pot ${bbOf(t.pot)}, gains arbitre ${opay.map(x => f(bbOf(x))).join("/")}, moteur ${sres.payouts.map(f).join("/")}`);
}
