// Mains montrées à l'abattage : on enregistre les cartes de l'adversaire avec toute sa ligne,
// on classe chacune de ses actions (value, bluff, main moyenne), puis on en tire des
// enseignements (ses grosses mises river sont-elles des bluffs ? paie-t-il léger ?).

import type { PlayerAction } from "@/components/ActionMenu";
import { trackPot, type PotOptions } from "@/lib/potTracker";
import { relStrength } from "@/engines/postflopRanges";
import { rank7 } from "@/engines/handEval7";
import { FULL_DECK } from "@/engines/rangeVsRange";
import { handLabel } from "@/engines/cashPreflopEngine";
import { EQ_VS_RANDOM } from "@/engines/preflopEquity";

export type Strength = "value" | "medium" | "bluff";
export interface ShowdownEvent { street: string; act: string; sizePct?: number; strength?: Strength }

export interface ShowdownRecord {
  cards: string;          // « Ah Jd »
  handClass: string;      // « AJo »
  position: string;
  board: string[];
  events: ShowdownEvent[];
  line: string;           // ligne lisible
  date: string;
}

const STREETS = ["Preflop", "Flop", "Turn", "River"] as const;
const boardFor = (board: string[], street: string) =>
  street === "Flop" ? board.slice(0, 3) : street === "Turn" ? board.slice(0, 4) : street === "River" ? board.slice(0, 5) : [];

/** Lit « AhJd », « Ah Jd », « A♥ J♦ » ou « ah jd » ; renvoie null si invalide. */
export function parseCards(text: string): [string, string] | null {
  const SUIT: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
  const t = text.replace(/[♠♥♦♣]/g, m => SUIT[m]).replace(/10/g, "T").replace(/\s|,/g, "");
  const m = t.match(/^([2-9TJQKAtjqka])([shdcSHDC])([2-9TJQKAtjqka])([shdcSHDC])$/);
  if (!m) return null;
  const a = m[1].toUpperCase() + m[2].toLowerCase();
  const b = m[3].toUpperCase() + m[4].toLowerCase();
  return a === b ? null : [a, b];
}

/** Force d'une main à une street : value (2 catégories au-dessus du board ou top paire+), bluff (rien), moyenne. */
export function strengthAt(cards: string[], board: string[]): Strength {
  if (board.length < 3) {
    const eq = EQ_VS_RANDOM[handLabel(cards)] ?? 50;
    return eq >= 60 ? "value" : eq <= 45 ? "bluff" : "medium";
  }
  const rel = relStrength(cards, board);
  if (rel >= 2) return "value";
  if (rel === 0) return "bluff";
  // une paire : top paire avec la carte la plus haute du board = value, sinon moyenne
  const top = Math.max(...board.map(c => "23456789TJQKA".indexOf(c[0])));
  const paired = cards.some(c => "23456789TJQKA".indexOf(c[0]) >= top && board.some(b => b[0] === c[0]));
  const pocketOver = cards[0][0] === cards[1][0] && "23456789TJQKA".indexOf(cards[0][0]) > top;
  return paired || pocketOver ? "value" : "medium";
}

const ACT_FR: Record<string, string> = { Fold: "fold", Check: "check", Call: "call", Bet: "mise", Raise: "relance" };

/** Construit l'enregistrement d'une main montrée à partir de la main saisie sur la table. */
export function buildShowdownRecord(cards: [string, string], seat: number, position: string, actions: PlayerAction[], board: string[], potStart: number | PotOptions = 1.5): ShowdownRecord {
  const potBefore = new Map(trackPot(actions, typeof potStart === "number" ? { startPot: potStart } : potStart).steps.map(st => [st.action, st.potBefore]));
  const events: ShowdownEvent[] = [];
  for (const st of STREETS) {
    for (const a of actions.filter(x => x.street === st)) {
      if (a.seatIdx === seat) {
        const aggressive = a.type === "Bet" || a.type === "Raise";
        const ev: ShowdownEvent = { street: st, act: a.type };
        const pot = potBefore.get(a) ?? 0;
        if (aggressive && pot > 0) ev.sizePct = Math.round(((a.amountBB || 0) / pot) * 100);
        if (aggressive || a.type === "Call") ev.strength = strengthAt(cards, boardFor(board, st));
        events.push(ev);
      }
    }
  }
  const line = events.map(e => `${e.street === "Preflop" ? "préflop" : e.street.toLowerCase()} ${ACT_FR[e.act] ?? e.act}${e.sizePct ? ` ${e.sizePct} %` : ""}`).join(" → ");
  return { cards: cards.join(" "), handClass: handLabel(cards), position, board: board.slice(0, 5), events, line, date: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Enseignements tirés des abattages
// ---------------------------------------------------------------------------
export interface ShowdownInsights {
  bigRiverBets: number; bigRiverBluffs: number;
  smallBets: number; smallBetsValue: number;
  riverCalls: number; lightRiverCalls: number;
  looseOpens: string[];
  lines: string[];        // phrases à afficher
}

/** Accepte les anciennes mains montrées (texte libre) : seules les mains structurées comptent. */
export function showdownInsights(records: Partial<ShowdownRecord>[]): ShowdownInsights {
  const out: ShowdownInsights = { bigRiverBets: 0, bigRiverBluffs: 0, smallBets: 0, smallBetsValue: 0, riverCalls: 0, lightRiverCalls: 0, looseOpens: [], lines: [] };
  for (const r of records) {
    if (!r.events) continue;
    for (const e of r.events) {
      if (e.street === "River" && (e.act === "Bet" || e.act === "Raise") && (e.sizePct ?? 0) >= 60) {
        out.bigRiverBets++;
        if (e.strength === "bluff") out.bigRiverBluffs++;
      }
      if (e.street !== "Preflop" && (e.act === "Bet" || e.act === "Raise") && (e.sizePct ?? 100) <= 35) {
        out.smallBets++;
        if (e.strength === "value") out.smallBetsValue++;
      }
      if (e.street === "River" && e.act === "Call") {
        out.riverCalls++;
        if (e.strength === "medium" || e.strength === "bluff") out.lightRiverCalls++;
      }
    }
    const firstPre = r.events.find(e => e.street === "Preflop" && (e.act === "Raise" || e.act === "Bet" || e.act === "Call"));
    if (firstPre && r.handClass && (EQ_VS_RANDOM[r.handClass] ?? 50) < 44) out.looseOpens.push(r.handClass);
  }
  const few = (n: number) => (n < 3 ? " (échantillon faible)" : "");
  if (out.bigRiverBets) {
    const pct = Math.round((out.bigRiverBluffs / out.bigRiverBets) * 100);
    out.lines.push(`Grosses mises river : ${out.bigRiverBluffs} bluff${out.bigRiverBluffs > 1 ? "s" : ""} sur ${out.bigRiverBets} montrées (${pct} %)${few(out.bigRiverBets)}${pct >= 50 ? " → paie plus large" : pct === 0 && out.bigRiverBets >= 2 ? " → couche tes bluff-catchers" : ""}.`);
  }
  if (out.riverCalls) out.lines.push(`Calls river : ${out.lightRiverCalls} avec une main faible ou moyenne sur ${out.riverCalls}${few(out.riverCalls)}${out.lightRiverCalls >= 2 ? " → ne le bluffe pas, value fine" : ""}.`);
  if (out.smallBets) out.lines.push(`Petites mises : ${out.smallBetsValue} en value sur ${out.smallBets}${few(out.smallBets)}${out.smallBets >= 2 && out.smallBetsValue === 0 ? " → souvent faible, relance-les" : ""}.`);
  if (out.looseOpens.length) out.lines.push(`Joue des mains très faibles : ${[...new Set(out.looseOpens)].slice(0, 5).join(", ")} → plus large que ses stats.`);
  return out;
}

/** Équité exacte du héros contre des cartes connues, à chaque street (pour la revue de la main). */
export function equityByStreet(hero: string[], villain: string[], board: string[]): { street: string; equity: number }[] {
  const res: { street: string; equity: number }[] = [];
  for (const [st, n] of [["Préflop", 0], ["Flop", 3], ["Turn", 4], ["River", 5]] as const) {
    if (board.length < n) break;
    const known = board.slice(0, n);
    const used = new Set([...hero, ...villain, ...known]);
    const rest = FULL_DECK.filter(c => !used.has(c));
    const need = 5 - n;
    let win = 0, tot = 0;
    const evalRun = (run: string[]) => {
      const a = rank7([...hero, ...known, ...run]), b = rank7([...villain, ...known, ...run]);
      win += a > b ? 1 : a === b ? 0.5 : 0; tot++;
    };
    if (need === 0) evalRun([]);
    else if (need === 1) rest.forEach(c => evalRun([c]));
    else if (need === 2) { for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) evalRun([rest[i], rest[j]]); }
    else {
      // préflop : échantillon de 4 000 boards
      let s = 7;
      const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let k = 0; k < 4000; k++) {
        const pick = new Set<string>();
        while (pick.size < 5) pick.add(rest[Math.floor(rand() * rest.length)]);
        evalRun([...pick]);
      }
    }
    res.push({ street: st, equity: Math.round((win / tot) * 1000) / 10 });
  }
  return res;
}
