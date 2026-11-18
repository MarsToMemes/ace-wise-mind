// Statistiques d'un adversaire, profil et tendances.
// Chaque stat est gardée en « fait / occasions ». Les estimations sont rapprochées des
// moyennes des joueurs de petite limite tant que l'échantillon est petit (rétrécissement
// bayésien : (fait + moyenne × K) / (occasions + K)).

import type { PlayerAction } from "@/components/ActionMenu";

export interface Counters {
  hands: number;
  vpipOpp: number; vpip: number;
  pfr: number;
  limpOpp: number; limp: number;
  threeBetOpp: number; threeBet: number;
  cbetOpp: number; cbet: number;
  foldCbetOpp: number; foldCbet: number;
  wtsdOpp: number; wtsd: number;
  aggBets: number; aggCalls: number;
  postBets: number; smallBets: number;
}

export const emptyCounters = (): Counters => ({
  hands: 0, vpipOpp: 0, vpip: 0, pfr: 0, limpOpp: 0, limp: 0, threeBetOpp: 0, threeBet: 0,
  cbetOpp: 0, cbet: 0, foldCbetOpp: 0, foldCbet: 0, wtsdOpp: 0, wtsd: 0,
  aggBets: 0, aggCalls: 0, postBets: 0, smallBets: 0,
});

export function addCounters(a: Counters, b: Partial<Counters>): Counters {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof Counters)[]) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------
// Moyennes de la population (petite limite) et estimation
// ---------------------------------------------------------------------------
export const POPULATION = {
  vpip: 0.32, pfr: 0.14, limp: 0.15, threeBet: 0.05, cbet: 0.60,
  foldCbet: 0.45, wtsd: 0.30, smallBet: 0.25, af: 1.5,
};
const K = 10;
const shrink = (made: number, opp: number, prior: number) => (made + prior * K) / (opp + K);

export interface Estimates {
  vpip: number; pfr: number; limp: number; threeBet: number; cbet: number;
  foldCbet: number; wtsd: number; smallBet: number; af: number;
  samples: { vpip: number; limp: number; threeBet: number; cbet: number; foldCbet: number; wtsd: number; bets: number };
}

export function estimate(c: Counters): Estimates {
  const vpip = shrink(c.vpip, c.vpipOpp, POPULATION.vpip);
  // PFR estimé en part du VPIP, pour rester ≤ VPIP
  const pfrShare = shrink(c.pfr, c.vpip, POPULATION.pfr / POPULATION.vpip);
  return {
    vpip,
    pfr: Math.min(vpip, pfrShare * vpip),
    limp: shrink(c.limp, c.limpOpp, POPULATION.limp),
    threeBet: shrink(c.threeBet, c.threeBetOpp, POPULATION.threeBet),
    cbet: shrink(c.cbet, c.cbetOpp, POPULATION.cbet),
    foldCbet: shrink(c.foldCbet, c.foldCbetOpp, POPULATION.foldCbet),
    wtsd: shrink(c.wtsd, c.wtsdOpp, POPULATION.wtsd),
    smallBet: shrink(c.smallBets, c.postBets, POPULATION.smallBet),
    af: (c.aggBets + POPULATION.af * 3) / (c.aggCalls + 3),
    samples: { vpip: c.vpipOpp, limp: c.limpOpp, threeBet: c.threeBetOpp, cbet: c.cbetOpp, foldCbet: c.foldCbetOpp, wtsd: c.wtsdOpp, bets: c.postBets },
  };
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
export type Profile = "Nit" | "TAG" | "LAG" | "Maniac" | "Station" | "FishLimper" | "Unknown";
export type Confidence = "faible" | "moyenne" | "bonne";

export const PROFILE_LABEL: Record<Profile, string> = {
  Nit: "Nit (serré)", TAG: "TAG (serré-agressif)", LAG: "LAG (large-agressif)", Maniac: "Maniac",
  Station: "Calling station", FishLimper: "Fish limpeur", Unknown: "Inconnu",
};

export const PROFILE_TIP: Record<Profile, string> = {
  Nit: "Vole ses blinds, c-bet les boards secs ; ses relances = mains fortes, couche-toi sans gros jeu.",
  TAG: "Joueur solide : reste proche du GTO, attaque ses checks et ses petites mises.",
  LAG: "Paie plus large contre ses mises, piège plus avec tes mains fortes, moins de bluffs.",
  Maniac: "Laisse-le miser : check-call et check-raise tes bonnes mains, quasi pas de bluff.",
  Station: "Value bet fin et gros sur 3 streets, presque aucun bluff, paie peu ses grosses mises.",
  FishLimper: "Iso-raise gros ses limps (jusqu'à 6-7 bb), value bet, il paie avec trop de mains.",
  Unknown: "Pas assez de mains : joue proche des ranges de base et observe.",
};

export function confidenceOf(hands: number): Confidence {
  return hands >= 50 ? "bonne" : hands >= 15 ? "moyenne" : "faible";
}

export function classify(c: Counters): { profile: Profile; provisional: boolean; confidence: Confidence; est: Estimates } {
  const est = estimate(c);
  const confidence = confidenceOf(c.hands);
  const { vpip, pfr, limp } = est;
  const ratio = vpip > 0 ? pfr / vpip : 0;
  let profile: Profile;
  if (c.hands < 5) profile = "Unknown";
  else if (vpip >= 0.45 && pfr >= 0.3) profile = "Maniac";
  else if (limp >= 0.15 && vpip >= 0.35 && ratio < 0.45) profile = "FishLimper";
  else if (vpip >= 0.35 && ratio < 0.45 && est.foldCbet < 0.40) profile = "Station";
  else if (vpip >= 0.35 && ratio < 0.45) profile = limp >= 0.12 ? "FishLimper" : "Station";
  else if (vpip < 0.18) profile = "Nit";
  else if (vpip <= 0.26) profile = ratio >= 0.6 ? "TAG" : "Nit";
  else profile = pfr >= 0.2 ? "LAG" : "Station";
  return { profile, provisional: c.hands < 15, confidence, est };
}

/** Tendances exploitables (texte), selon les estimations et un minimum d'occasions. */
export function tendencies(c: Counters): string[] {
  const e = estimate(c);
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  if (c.cbetOpp >= 5 && e.cbet >= 0.72) out.push(`C-bet trop (${pct(e.cbet)}) : relance ou flotte ses c-bets sur les boards qui t'avantagent.`);
  if (c.cbetOpp >= 5 && e.cbet <= 0.40) out.push(`C-bet peu (${pct(e.cbet)}) : ses c-bets sont souvent de la value.`);
  if (c.foldCbetOpp >= 5 && e.foldCbet >= 0.58) out.push(`Se couche trop au c-bet (${pct(e.foldCbet)}) : c-bet souvent, même sans main.`);
  if (c.foldCbetOpp >= 5 && e.foldCbet <= 0.30) out.push(`Ne lâche pas au c-bet (${pct(e.foldCbet)}) : moins de bluffs, plus de value.`);
  if (c.limpOpp >= 5 && e.limp >= 0.18) out.push(`Limpe beaucoup (${pct(e.limp)}) : iso-raise gros derrière ses limps.`);
  if (c.wtsdOpp >= 5 && e.wtsd >= 0.38) out.push(`Va trop à l'abattage (${pct(e.wtsd)}) : value bet fin, ne bluffe pas la river.`);
  if (c.postBets >= 4 && e.smallBet >= 0.45) out.push(`Mises petites répétées (${pct(e.smallBet)}) : souvent une main moyenne, range limitée.`);
  if (c.threeBetOpp >= 8 && e.threeBet >= 0.10) out.push(`3-bet souvent (${pct(e.threeBet)}) : 4-bet plus large ou ouvre plus serré devant lui.`);
  if (c.aggBets + c.aggCalls >= 6 && e.af <= 0.8) out.push("Passif : ses mises et relances sont fortes, ses calls larges.");
  return out;
}

// ---------------------------------------------------------------------------
// Comptage d'une main saisie dans l'analyseur
// ---------------------------------------------------------------------------
export interface AnalyzedHand {
  actions: PlayerAction[];
  /** Position de chaque siège (ex. { 0: "BTN", 1: "SB", 2: "BB" }). */
  positions: Record<number, string>;
  /** Nombre de cartes au board à la fin de la main (0, 3, 4 ou 5). */
  boardCards: number;
  potStartBB?: number;
}

/** Renvoie les compteurs à ajouter pour chaque siège ayant agi dans la main. */
export function countAnalyzedHand(h: AnalyzedHand): Record<number, Counters> {
  const out: Record<number, Counters> = {};
  const get = (s: number) => (out[s] ??= emptyCounters());
  const seats = [...new Set(h.actions.map(a => a.seatIdx))];
  seats.forEach(s => { const c = get(s); c.hands = 1; c.vpipOpp = 1; });

  // --- préflop
  const pre = h.actions.filter(a => a.street === "Preflop");
  let raises = 0;
  let aggressor = -1;
  const acted = new Set<number>();
  for (const a of pre) {
    const c = get(a.seatIdx);
    const first = !acted.has(a.seatIdx);
    if (first && raises === 0 && h.positions[a.seatIdx] !== "BB") {
      c.limpOpp = 1;
      if (a.type === "Call") c.limp = 1;
    }
    if (raises === 1 && aggressor !== a.seatIdx && c.threeBetOpp === 0) {
      c.threeBetOpp = 1;
      if (a.type === "Raise" || a.type === "Bet") c.threeBet = 1;
    }
    if (a.type === "Call" || a.type === "Raise" || a.type === "Bet") c.vpip = 1;
    if (a.type === "Raise" || a.type === "Bet") { c.pfr = 1; raises++; aggressor = a.seatIdx; }
    acted.add(a.seatIdx);
  }

  // --- postflop
  let pot = h.potStartBB ?? 1.5;
  pre.forEach(a => { pot += a.amountBB || 0; });
  const foldedPre = new Set(pre.filter(a => a.type === "Fold").map(a => a.seatIdx));
  const sawFlop = h.boardCards >= 3 ? seats.filter(s => !foldedPre.has(s)) : [];
  sawFlop.forEach(s => { get(s).wtsdOpp = 1; });

  for (const street of ["Flop", "Turn", "River"] as const) {
    const acts = h.actions.filter(a => a.street === street);
    let betSeen = false;
    let cbetLive = false;
    for (const a of acts) {
      const c = get(a.seatIdx);
      if (street === "Flop" && a.seatIdx === aggressor && !betSeen && c.cbetOpp === 0) {
        c.cbetOpp = 1;
        if (a.type === "Bet" || a.type === "Raise") { c.cbet = 1; cbetLive = true; }
      } else if (street === "Flop" && cbetLive && a.seatIdx !== aggressor && c.foldCbetOpp === 0) {
        c.foldCbetOpp = 1;
        if (a.type === "Fold") c.foldCbet = 1;
      }
      if (a.type === "Bet" || a.type === "Raise") {
        c.aggBets++;
        if (a.type === "Bet") {
          c.postBets++;
          if ((a.amountBB || 0) <= pot * 0.35) c.smallBets++;
        }
        betSeen = true;
      } else if (a.type === "Call") c.aggCalls++;
      pot += a.amountBB || 0;
    }
  }

  // --- abattage : au moins deux joueurs encore en jeu à la river
  const foldedAll = new Set(h.actions.filter(a => a.type === "Fold").map(a => a.seatIdx));
  const alive = sawFlop.filter(s => !foldedAll.has(s));
  if (h.boardCards === 5 && alive.length >= 2) alive.forEach(s => { get(s).wtsd = 1; });
  return out;
}

// ---------------------------------------------------------------------------
// Suivi rapide (boutons pendant le jeu)
// ---------------------------------------------------------------------------
export type QuickEvent =
  | "limp" | "open" | "threeBet" | "callOpen" | "foldPre" | "checkBB"
  | "cbet" | "checkPfr" | "foldToCbet" | "callCbet" | "smallBet" | "bigBet" | "showdown";

export const QUICK_LABEL: Record<QuickEvent, string> = {
  limp: "Limp", open: "Open", threeBet: "3-bet", callOpen: "Call", foldPre: "Fold", checkBB: "Check BB",
  cbet: "C-bet", checkPfr: "Check (relanceur)", foldToCbet: "Fold au c-bet", callCbet: "Paie le c-bet",
  smallBet: "Petite mise", bigBet: "Grosse mise", showdown: "Abattage",
};

export const PREFLOP_EVENTS: QuickEvent[] = ["limp", "open", "threeBet", "callOpen", "foldPre", "checkBB"];
export const POSTFLOP_EVENTS: QuickEvent[] = ["cbet", "checkPfr", "foldToCbet", "callCbet", "smallBet", "bigBet", "showdown"];

/** État d'une main en cours pour un joueur (évite de compter deux fois la même chose). */
export interface HandFlags { pre?: QuickEvent; sawFlop?: boolean; cbetDone?: boolean; facedCbet?: boolean; showdown?: boolean }

export function applyQuickEvent(flags: HandFlags, ev: QuickEvent): { delta: Partial<Counters>; flags: HandFlags } | null {
  const f = { ...flags };
  const d: Partial<Counters> = {};
  if (PREFLOP_EVENTS.includes(ev)) {
    if (f.pre) return null; // une seule action préflop comptée par main
    f.pre = ev;
    Object.assign(d, { hands: 1, vpipOpp: 1 });
    if (ev === "limp") Object.assign(d, { vpip: 1, limpOpp: 1, limp: 1 });
    if (ev === "open") Object.assign(d, { vpip: 1, pfr: 1, limpOpp: 1 });
    if (ev === "threeBet") Object.assign(d, { vpip: 1, pfr: 1, threeBetOpp: 1, threeBet: 1 });
    if (ev === "callOpen") Object.assign(d, { vpip: 1, threeBetOpp: 1 });
    return { delta: d, flags: f };
  }
  if (!f.pre) return null; // il faut d'abord son action préflop
  if (!f.sawFlop && ev !== "showdown") { f.sawFlop = true; d.wtsdOpp = 1; }
  switch (ev) {
    case "cbet": if (f.cbetDone) return null; f.cbetDone = true; Object.assign(d, { cbetOpp: 1, cbet: 1, aggBets: 1, postBets: 1 }); break;
    case "checkPfr": if (f.cbetDone) return null; f.cbetDone = true; d.cbetOpp = 1; break;
    case "foldToCbet": if (f.facedCbet) return null; f.facedCbet = true; Object.assign(d, { foldCbetOpp: 1, foldCbet: 1 }); break;
    case "callCbet": if (f.facedCbet) return null; f.facedCbet = true; Object.assign(d, { foldCbetOpp: 1, aggCalls: 1 }); break;
    case "smallBet": Object.assign(d, { aggBets: 1, postBets: 1, smallBets: 1 }); break;
    case "bigBet": Object.assign(d, { aggBets: 1, postBets: 1 }); break;
    case "showdown":
      if (f.showdown) return null;
      f.showdown = true;
      if (!f.sawFlop) { f.sawFlop = true; d.wtsdOpp = 1; }
      d.wtsd = 1;
      break;
  }
  return { delta: d, flags: f };
}

// ---------------------------------------------------------------------------
// Familles de profils (vision « récréatif / régulier ») et écarts aux références
// ---------------------------------------------------------------------------
export type Family = "recPassif" | "recAgressif" | "regCompetent" | "regSerre" | "regAgressif" | "inconnu";

export const FAMILY_LABEL: Record<Family, string> = {
  recPassif: "Récréatif passif", recAgressif: "Récréatif agressif", regCompetent: "Régulier compétent",
  regSerre: "Régulier serré (nit)", regAgressif: "Régulier agressif", inconnu: "Inconnu",
};
export const FAMILY_SHORT: Record<Family, string> = {
  recPassif: "Récré passif", recAgressif: "Récré agro", regCompetent: "Reg", regSerre: "Nit", regAgressif: "Reg agro", inconnu: "?",
};
export const FAMILY_TIP: Record<Family, string> = {
  recPassif: "Mine d'or : joue plus large contre lui, invite-le dans le coup, beaucoup de value, peu de bluffs.",
  recAgressif: "Resserre-toi : il t'empêche de réaliser ton équité. Prends des mains qui supportent ses 3-bets et laisse-le taper dedans.",
  regCompetent: "Joue proche des ranges de base et couche tes mains marginales (le rake les rend perdantes).",
  regSerre: "Vole ses blindes, c-bet ses checks ; couche-toi face à ses relances sans grosse main.",
  regAgressif: "Paie un peu plus large ses mises, piège tes grosses mains, moins de bluffs.",
  inconnu: "Pas assez de mains : joue tes ranges de base et observe.",
};
export const isRecreational = (f: Family) => f === "recPassif" || f === "recAgressif";

export function familyOf(c: Counters): Family {
  if (c.hands < 5) return "inconnu";
  const e = estimate(c);
  const ratio = e.vpip > 0 ? e.pfr / e.vpip : 0;
  if (e.vpip >= 0.35) {
    const aggressive = e.af >= 2.2 || e.threeBet >= 0.09 || (ratio >= 0.5 && e.vpip >= 0.45);
    return aggressive ? "recAgressif" : "recPassif";
  }
  if (e.vpip < 0.18) return "regSerre";
  if (e.threeBet >= 0.1 || e.pfr >= 0.24) return "regAgressif";
  return "regCompetent";
}

/** Références d'un joueur correct (stats globales), et tolérance avant de signaler un écart. */
export const REFERENCE = {
  vpip: { ref: 0.25, tol: 0.07, low: "Joue peu de mains : vole ses blindes, respecte ses relances.", high: "Joue trop de mains : value plus large contre lui." },
  pfr: { ref: 0.19, tol: 0.06, low: "Relance peu : ses relances sont fortes, ses calls larges.", high: "Relance beaucoup : paie et 3-bet plus large contre ses ouvertures." },
  threeBet: { ref: 0.08, tol: 0.03, low: "Ne 3-bet pas assez : ouvre plus large devant lui.", high: "3-bet beaucoup : ouvre plus serré devant lui, 4-bet plus large." },
  cbet: { ref: 0.6, tol: 0.12, low: "C-bet peu : ses c-bets sont souvent de la value.", high: "C-bet trop : flotte et relance ses c-bets." },
  foldCbet: { ref: 0.45, tol: 0.12, low: "Lâche rarement au c-bet : moins de bluffs, plus de value.", high: "Se couche trop au c-bet : c-bet souvent." },
  wtsd: { ref: 0.28, tol: 0.08, low: "Va peu à l'abattage : bluffe plus aux dernières streets.", high: "Va trop à l'abattage : value fine, pas de bluff river." },
} as const;

export interface ReferenceGap { stat: keyof typeof REFERENCE; label: string; value: number; ref: number; dir: "low" | "high"; advice: string }

const GAP_LABEL: Record<keyof typeof REFERENCE, string> = {
  vpip: "VPIP", pfr: "PFR", threeBet: "3-bet", cbet: "C-bet", foldCbet: "Fold au c-bet", wtsd: "Abattage",
};

/** Écarts nets aux références (seulement avec assez d'occasions pour la stat). */
export function referenceGaps(c: Counters, minOpp = 8): ReferenceGap[] {
  const e = estimate(c);
  const opp: Record<keyof typeof REFERENCE, number> = {
    vpip: c.vpipOpp, pfr: c.vpipOpp, threeBet: c.threeBetOpp, cbet: c.cbetOpp, foldCbet: c.foldCbetOpp, wtsd: c.wtsdOpp,
  };
  const out: ReferenceGap[] = [];
  for (const k of Object.keys(REFERENCE) as (keyof typeof REFERENCE)[]) {
    if (opp[k] < minOpp) continue;
    const r = REFERENCE[k];
    const v = e[k];
    if (v < r.ref - r.tol) out.push({ stat: k, label: GAP_LABEL[k], value: v, ref: r.ref, dir: "low", advice: r.low });
    else if (v > r.ref + r.tol) out.push({ stat: k, label: GAP_LABEL[k], value: v, ref: r.ref, dir: "high", advice: r.high });
  }
  return out;
}
