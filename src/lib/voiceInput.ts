import type { PlayerAction } from "@/components/ActionMenu";
import { seatLabel, type TableSize } from "@/components/PokerTable";

/**
 * Saisie vocale : comprend une phrase de poker en français (« UTG fold, cutoff relance à 2,5, moi je suis »)
 * et la transforme en actions de la table, en suivant l'ordre de parole.
 *
 * Règles :
 * - pas besoin de nommer chaque joueur : sans nom, c'est le prochain à parler ;
 * - un joueur sauté a forcément parlé : couché face à une mise, sinon parole (marqué « déduit ») ;
 * - ton action à toi n'est jamais devinée ;
 * - call = ce qu'il reste à payer, mise / relance = montant « à » (comme le menu de la table) ;
 * - rien d'impossible n'est enregistré (parole face à une mise, carte déjà prise…) : c'est signalé.
 */

type Street = PlayerAction["street"];

export interface VoiceTable {
  size: TableSize;
  dealerIdx: number;
  userIdx: number;
  actions: PlayerAction[];
  board: string[];
  hole: string[];
  folded: boolean[];
  /** Tapis de départ de chaque joueur (en bb). */
  stack: number;
  /** Blindes postées au préflop (main saisie dès le préflop). */
  blinds: boolean;
  /** Argent déjà au milieu avant la première action (main saisie à partir du flop). */
  startPot: number;
}

export interface VoiceEntry {
  level: "ok" | "warn" | "err" | "info";
  label: string;
  seatIdx?: number;
  type?: "Fold" | "Check" | "Call" | "Bet" | "Raise" | "Tapis";
  amount?: number;
  cards?: string[];
  note?: string;
  deduced?: boolean;
}

export interface VoiceResult {
  entries: VoiceEntry[];
  /** Actions à ajouter, dans l'ordre. */
  actions: PlayerAction[];
  /** Nouveau tableau complet (si une carte a été dite). */
  board?: string[];
  hole?: string[];
  undo?: boolean;
  newHand?: boolean;
  /** Siège qui doit parler ensuite (null : tour d'enchères fini). */
  next: number | null;
}

/* ------------------------------------------------------------------ vocabulaire */

const norm = (s: string) =>
  s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2").replace(/[,;:!?]/g, " , ").replace(/\.(?!\d)/g, " , ")
    .replace(/(\d)\s*x\b/g, "$1 x").replace(/\bx\s*(\d)/g, "$1 x")
    .replace(/(\d)\s*bb\b/g, "$1 bb")
    .replace(/[’'\-+]/g, " ").replace(/[^a-z0-9., ]/g, " ")
    .replace(/\s+/g, " ").trim();

const LEX_SRC: [string, string][] = [
  ["tout le monde se couche|tout le monde se couchent|tout le monde fold|tout le monde folde|tout le monde passe|tous fold|le reste fold|le reste se couche", "ALLFOLD"],
  ["nouvelle main", "NEWHAND"], ["annule|annuler|efface|corrige", "UNDO"],
  ["utg plus deux|utg plus 2|utg 2|utg deux", "P:UTG+2"], ["utg plus un|utg plus 1|utg 1|utg un", "P:UTG+1"],
  ["under the gun|u t g|utg", "P:UTG"],
  ["hi jack|hijack|hj", "P:HJ"], ["lo jack|lojack|lj", "P:LJ"], ["middle position|mp|milieu", "P:MP"],
  ["cut off|cutoff|cut|c o|co", "P:CO"], ["le bouton|bouton|button|btn|dealer|donneur", "P:BTN"],
  ["petite blinde|small blind|small|petite|sb|s b", "P:SB"], ["grosse blinde|big blind|big|grosse|bb|b b", "P:BB"],
  ["moi je|moi|je|hero|heros", "HERO"],
  ["se couche|se couchent|couche|fold|folde|jette", "A:FOLD"], ["passe", "A:PASS"],
  ["check|checke|parole", "A:CHECK"],
  ["call|calle|suit|suis|suivre|paye|paie|colle|complete", "A:CALL"],
  ["va a tapis|fait tapis|tapis|all in|allin|shove|push", "A:ALLIN"],
  ["sur relance|surrelance|reraise|3 bet|three bet|trois bet|4 bet|quatre bet|relance|relancer|raise|open|ouvre", "A:RAISE"],
  ["mise|miser|bet|donk|mets", "A:BET"],
  ["moitie du pot|moitie pot|demi pot|half pot", "F:0.5"], ["deux tiers du pot|deux tiers|2 tiers", "F:0.667"],
  ["trois quarts du pot|trois quarts|3 quarts", "F:0.75"], ["un tiers du pot|un tiers|tiers", "F:0.333"],
  ["un quart|quart", "F:0.25"], ["pot", "F:1"],
  ["flop", "S:Flop"], ["turn|tournant", "S:Turn"], ["river|riviere", "S:River"],
  ["j ai|ma main|mes cartes", "HOLE"],
];
const LEX: [string[], string][] = LEX_SRC
  .flatMap(([p, t]) => p.split("|").map(a => [a.split(" "), t] as [string[], string]))
  .sort((a, b) => b[0].length - a[0].length);
const STOP = new Set(", a au aux de du des le la les l et puis ensuite alors ok bon euh donc il elle qui ca fait apres sur en".split(" "));

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100,
};
const RANKW: Record<string, string> = {
  as: "A", ace: "A", a: "A", roi: "K", king: "K", k: "K", dame: "Q", reine: "Q", queen: "Q", q: "Q", valet: "J", jack: "J", j: "J",
  dix: "T", t: "T", "10": "T", neuf: "9", huit: "8", sept: "7", six: "6", cinq: "5", quatre: "4", trois: "3", deux: "2",
};
for (let d = 2; d <= 9; d++) RANKW[String(d)] = String(d);
const SUITW: Record<string, string> = {
  pique: "s", piques: "s", spade: "s", spades: "s", coeur: "h", coeurs: "h", heart: "h", hearts: "h",
  carreau: "d", carreaux: "d", diamond: "d", diamonds: "d", trefle: "c", trefles: "c", club: "c", clubs: "c",
};

type Tok = { t: string; v?: string | number | null; raw: string; cards?: string[] };

const lexAt = (w: string[], i: number): [number, string] | null => {
  for (const [pat, tok] of LEX) if (pat.every((p, k) => w[i + k] === p)) return [pat.length, tok];
  return null;
};
const actionAt = (w: string[], i: number) => { const h = lexAt(w, i); return !!h && h[1].startsWith("A:"); };

/** Lit un nombre (chiffres ou mots) : [valeur, nombre de mots lus]. */
function readNumber(w: string[], i: number): [number, number] | null {
  let j = i, acc: number | null = null;
  if (/^\d+(\.\d+)?$/.test(w[j] ?? "")) { acc = parseFloat(w[j]); j++; }
  else {
    while (j < w.length && w[j] in UNITS) {
      const v = UNITS[w[j]];
      if (v === 100) acc = (acc || 1) * 100;
      else if (v === 20 && w[j - 1] === "quatre" && acc !== null) acc = acc - 4 + 80;
      else acc = (acc || 0) + v;
      j++;
    }
    if (acc === null) return null;
  }
  if (w[j] === "et" && (w[j + 1] === "demi" || w[j + 1] === "demie")) { acc += 0.5; j += 2; }
  else if ((w[j] === "virgule" || w[j] === "point") && j + 1 < w.length) {
    const d = /^\d+$/.test(w[j + 1]) ? w[j + 1] : w[j + 1] in UNITS ? String(UNITS[w[j + 1]]) : null;
    if (d !== null) { acc = parseFloat(acc + "." + d); j += 2; }
  }
  if (["bb", "blindes", "blinde", "bigs"].includes(w[j]) && !actionAt(w, j + 1)) j++;
  return [acc, j - i];
}

/** Lit des cartes : « roi de cœur », « 7 trèfle »… (« K? » si la couleur manque). */
function readCards(w: string[], i: number, max: number): [string[], number] {
  const cards: string[] = []; let j = i;
  while (cards.length < max && j < w.length) {
    if ([",", "de", "et", "le", "un", "une"].includes(w[j])) { j++; continue; }
    const r = RANKW[w[j]];
    if (!r) break;
    let k = j + 1;
    if (w[k] === "de" || w[k] === "d") k++;
    const s = SUITW[w[k]];
    if (s) { cards.push(r + s); j = k + 1; } else { cards.push(r + "?"); j++; }
  }
  return [cards, j - i];
}

export function lex(text: string): Tok[] {
  const w = norm(text).split(" ").filter(Boolean);
  const out: Tok[] = [];
  let i = 0;
  while (i < w.length) {
    const prev = out[out.length - 1];
    if (prev && (prev.t === "S" || prev.t === "HOLE") && !prev.cards) {
      const want = prev.t === "HOLE" ? 2 : prev.v === "Flop" ? 3 : 1;
      const [cards, n] = readCards(w, i, want);
      prev.cards = cards;
      if (n) { i += n; continue; }
    }
    const hit = lexAt(w, i);
    if (hit) {
      const [n, tok] = hit;
      const [t, v] = tok.includes(":") ? tok.split(":") : [tok, null];
      out.push({ t, v: t === "F" ? parseFloat(v as string) : v, raw: w.slice(i, i + n).join(" ") });
      i += n; continue;
    }
    if (!(w[i] === "un" || w[i] === "une") || (w[i + 1] in UNITS)) {
      const num = readNumber(w, i);
      if (num) {
        const [v, n] = num;
        if (w[i + n] === "fois" || w[i + n] === "x") { out.push({ t: "M", v, raw: w.slice(i, i + n + 1).join(" ") }); i += n + 1; continue; }
        if (w[i + n] === "tiers") { out.push({ t: "F", v: v / 3, raw: w.slice(i, i + n + 1).join(" ") }); i += n + 1; continue; }
        out.push({ t: "N", v, raw: w.slice(i, i + n).join(" ") }); i += n; continue;
      }
    }
    if (w[i] === "jusqu" || w[i] === "jusque") { out.push({ t: "UNTIL", raw: w[i] }); i++; continue; }
    if (!STOP.has(w[i])) out.push({ t: "?", raw: w[i] });
    i++;
  }
  return out;
}

type Cmd =
  | { kind: "act"; who: (string | null)[]; act: string; size?: Tok; raw: string }
  | { kind: "allfold"; until?: string; raw: string }
  | { kind: "board"; street: Street; cards: string[]; raw: string }
  | { kind: "hole"; cards: string[]; raw: string }
  | { kind: "undo"; raw: string }
  | { kind: "newhand"; raw: string }
  | { kind: "unknown"; raw: string };

function commands(toks: Tok[]): Cmd[] {
  const cmds: Cmd[] = []; let who: string[] = [];
  const isSize = (k?: Tok) => !!k && (k.t === "N" || k.t === "M" || k.t === "F");
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === "P") who.push(k.v as string);
    else if (k.t === "HERO") who.push("HERO");
    else if (k.t === "A") {
      const c: Cmd = { kind: "act", who: who.length ? who : [null], act: k.v as string, raw: [...who, k.raw].join(" ") };
      if (isSize(toks[i + 1])) { c.size = toks[i + 1]; i++; }
      cmds.push(c); who = [];
    } else if (k.t === "ALLFOLD") {
      const c: Cmd = { kind: "allfold", raw: k.raw };
      const t2 = toks[i + 2];
      if (toks[i + 1]?.t === "UNTIL" && t2 && (t2.t === "P" || t2.t === "HERO")) { c.until = t2.t === "HERO" ? "HERO" : (t2.v as string); i += 2; }
      cmds.push(c); who = [];
    } else if (k.t === "S") cmds.push({ kind: "board", street: k.v as Street, cards: k.cards ?? [], raw: k.raw });
    else if (k.t === "HOLE") cmds.push({ kind: "hole", cards: k.cards ?? [], raw: k.raw });
    else if (k.t === "UNDO") cmds.push({ kind: "undo", raw: k.raw });
    else if (k.t === "NEWHAND") cmds.push({ kind: "newhand", raw: k.raw });
    else if (isSize(k) && who.length) { cmds.push({ kind: "act", who, act: "RAISE", size: k, raw: who.join(" ") + " " + k.raw }); who = []; }
    else if (k.t === "N" && cmds.length && cmds[cmds.length - 1].kind === "act" && !(cmds[cmds.length - 1] as { size?: Tok }).size) {
      (cmds[cmds.length - 1] as { size?: Tok }).size = k;
    } else if (k.t === "?" || isSize(k)) cmds.push({ kind: "unknown", raw: k.raw });
  }
  if (who.length) cmds.push({ kind: "unknown", raw: who.join(" ") });
  return cmds.reduce<Cmd[]>((a, c) => {
    const p = a[a.length - 1];
    if (c.kind === "unknown" && p && p.kind === "unknown") p.raw += " " + c.raw; else a.push(c);
    return a;
  }, []);
}

/* ------------------------------------------------------------------ moteur de table */

interface Seat { contrib: number; stack: number; folded: boolean; acted: boolean; allin: boolean }
interface State { street: Street; seats: Seat[]; bet: number; pot: number; last: number | null; pre: number[]; post: number[] }

const round1 = (x: number) => Math.round(x * 10) / 10;
export const fmtBB = (x: number) => round1(x).toString().replace(".", ",");
const STREETS: Street[] = ["Preflop", "Flop", "Turn", "River"];

function order(s: State) { return s.street === "Preflop" ? s.pre : s.post; }

function nextToAct(s: State): number | null {
  const o = order(s);
  if (o.filter(i => !s.seats[i].folded).length <= 1) return null;
  const pending = o.filter(i => !s.seats[i].folded && !s.seats[i].allin && (!s.seats[i].acted || s.seats[i].contrib < s.bet));
  if (!pending.length) return null;
  const start = s.last !== null ? (o.indexOf(s.last) + 1) % o.length : 0;
  for (let k = 0; k < o.length; k++) { const p = o[(start + k) % o.length]; if (pending.includes(p)) return p; }
  return null;
}

function act(s: State, i: number, type: PlayerAction["type"], amount = 0) {
  const st = s.seats[i];
  let add = 0;
  if (type === "Fold") st.folded = true;
  else if (type === "Call") add = Math.min(Math.max(0, amount || s.bet - st.contrib), st.stack);
  else if (type === "Bet" || type === "Raise") {
    add = Math.min(amount - st.contrib, st.stack);
    if (st.contrib + add > s.bet) { s.bet = st.contrib + add; s.seats.forEach((o, k) => { if (k !== i) o.acted = false; }); }
  }
  st.stack -= add; st.contrib += add; s.pot += add; st.acted = true; s.last = i;
  if (st.stack <= 0.001) st.allin = true;
}

function toStreet(s: State, street: Street) {
  s.street = street; s.bet = 0; s.last = null;
  s.seats.forEach(o => { o.contrib = 0; o.acted = false; });
}

/** Rejoue la main déjà saisie (souris ou voix) pour savoir où on en est. */
function build(t: VoiceTable): State {
  const n = t.size;
  const sb = n === 2 ? t.dealerIdx : (t.dealerIdx + 1) % n;
  const bb = n === 2 ? (t.dealerIdx + 1) % 2 : (t.dealerIdx + 2) % n;
  const ring = (from: number) => Array.from({ length: n }, (_, k) => (from + k) % n);
  const s: State = {
    street: t.actions[0]?.street ?? (t.board.length >= 3 ? STREETS[t.board.length - 2] : "Preflop"),
    seats: Array.from({ length: n }, (_, i) => ({ contrib: 0, stack: t.stack, folded: !!t.folded[i], acted: false, allin: false })),
    bet: 0, pot: t.startPot, last: null, pre: ring((bb + 1) % n), post: ring((t.dealerIdx + 1) % n),
  };
  if (s.street === "Preflop" && t.blinds) {
    const post = (i: number, x: number) => { s.seats[i].stack -= x; s.seats[i].contrib += x; s.pot += x; };
    post(sb, 0.5); post(bb, 1); s.bet = 1;
  }
  for (const a of t.actions) {
    if (a.street !== s.street) toStreet(s, a.street);
    act(s, a.seatIdx, a.type, a.amountBB);
  }
  const boardStreet: Street = t.board.length >= 3 ? STREETS[t.board.length - 2] : "Preflop";
  if (STREETS.indexOf(boardStreet) > STREETS.indexOf(s.street)) toStreet(s, boardStreet);
  return s;
}

/** Comprend une phrase et renvoie ce qu'il faut ajouter à la table. Rien n'est modifié tant que la page n'applique pas. */
export function interpretVoice(t: VoiceTable, text: string): VoiceResult {
  const res: VoiceResult = { entries: [], actions: [], next: null };
  if (t.dealerIdx < 0 || t.userIdx < 0) {
    res.entries.push({ level: "err", label: "Table", note: "place d'abord le bouton et ton siège" });
    return res;
  }
  const s = build(t);
  const n = t.size;
  const labelOf = (i: number) => seatLabel(i, t.dealerIdx, n);
  const seatOf = (canon: string): number | null => {
    const tries = canon === "HJ" ? ["HJ", "MP"] : canon === "LJ" ? ["LJ", "MP"] : canon === "MP" ? ["MP", "LJ", "HJ"] : [canon];
    for (const c of tries) for (let i = 0; i < n; i++) if (labelOf(i) === c) return i;
    return null;
  };
  let board = [...t.board];
  let hole = [...t.hole];
  let boardChanged = false, holeChanged = false;
  const push = (e: VoiceEntry) => res.entries.push(e);
  const record = (i: number, type: PlayerAction["type"], amount: number, deduced = false, shown?: VoiceEntry["type"], note?: string) => {
    act(s, i, type, type === "Call" ? amount : amount);
    res.actions.push({ seatIdx: i, street: s.street, type, amountBB: type === "Fold" || type === "Check" ? 0 : round1(amount) });
    push({ level: note ? "warn" : "ok", label: labelOf(i), seatIdx: i, type: shown ?? type, amount: type === "Fold" || type === "Check" ? undefined : round1(amount), deduced, note });
  };
  const autoFoldOrCheck = (i: number) => {
    if (s.bet > s.seats[i].contrib) record(i, "Fold", 0, true); else record(i, "Check", 0, true);
  };

  for (const c of commands(lex(text))) {
    if (c.kind === "unknown") { push({ level: "err", label: `« ${c.raw} »`, note: "pas compris" }); continue; }
    if (c.kind === "undo") { res.undo = true; continue; }
    if (c.kind === "newhand") { res.newHand = true; continue; }
    if (c.kind === "hole" || c.kind === "board") {
      const need = c.kind === "hole" ? 2 : c.street === "Flop" ? 3 : 1;
      const label = c.kind === "hole" ? "Tes cartes" : c.street;
      const others = c.kind === "hole" ? board : [...hole, ...board];
      let note = "";
      if (c.cards.length < need || c.cards.some(x => x.endsWith("?"))) note = `il faut ${need} carte${need > 1 ? "s" : ""} avec leur couleur`;
      else if (new Set(c.cards).size < c.cards.length || c.cards.some(x => others.includes(x))) note = "une de ces cartes est déjà sur la table";
      else if (c.kind === "board" && board.length !== { Flop: 0, Turn: 3, River: 4 }[c.street as "Flop" | "Turn" | "River"]) {
        note = c.street === "Flop" ? "le flop est déjà posé (dis « annule » pour corriger)" : c.street === "Turn" ? "dis d'abord le flop" : "dis d'abord le turn";
      }
      if (note) { push({ level: "err", label, cards: c.cards, note }); continue; }
      if (c.kind === "hole") { hole = c.cards; holeChanged = true; push({ level: "ok", label, cards: c.cards }); continue; }
      const still = nextToAct(s);
      board = [...board, ...c.cards]; boardChanged = true;
      if (still !== null) push({ level: "warn", label: labelOf(still), seatIdx: still, note: "n'avait pas fini de parler" });
      toStreet(s, c.street);
      push({ level: "ok", label, cards: c.cards });
      continue;
    }
    if (c.kind === "allfold") {
      const stop = c.until === "HERO" ? t.userIdx : c.until ? seatOf(c.until) : null;
      let k = 0;
      for (let g = 0; g < n; g++) {
        const p = nextToAct(s);
        if (p === null || p === stop || p === t.userIdx) break;
        autoFoldOrCheck(p); k++;
      }
      if (!k) push({ level: "warn", label: "Tout le monde fold", note: "personne à coucher" });
      continue;
    }
    // une action, pour un ou plusieurs joueurs
    for (const w of c.who) {
      const nxt = nextToAct(s);
      if (nxt === null) {
        push({ level: "err", label: c.raw, note: s.street === "River" ? "les enchères sont finies" : "le tour d'enchères est fini : dis d'abord la carte suivante" });
        break;
      }
      const target = w === null ? nxt : w === "HERO" ? t.userIdx : seatOf(w);
      if (target === null) { push({ level: "err", label: w ?? "", note: "pas de joueur à cette place sur cette table" }); continue; }
      const name = labelOf(target);
      if (s.seats[target].folded) { push({ level: "err", label: name, seatIdx: target, note: `${name} est déjà couché` }); continue; }
      let heroSkipped = false;
      for (let g = 0; g < n; g++) {
        const p = nextToAct(s);
        if (p === null || p === target) break;
        if (p === t.userIdx) { heroSkipped = true; break; }
        autoFoldOrCheck(p);
      }
      if (heroSkipped) { push({ level: "err", label: name, seatIdx: target, note: "c'est à toi avant : dis d'abord ton action" }); continue; }
      if (nextToAct(s) !== target) { push({ level: "err", label: name, seatIdx: target, note: `${name} a déjà parlé` }); continue; }
      const st = s.seats[target];
      const owed = s.bet - st.contrib;
      let a = c.act;
      if (a === "PASS") a = owed > 0 ? "FOLD" : "CHECK";
      if (a === "FOLD") { record(target, "Fold", 0); continue; }
      if (a === "CHECK") {
        if (owed > 0) { push({ level: "err", label: name, seatIdx: target, type: "Check", note: `ne peut pas checker : ${fmtBB(owed)} bb à payer` }); continue; }
        record(target, "Check", 0); continue;
      }
      if (a === "CALL") {
        if (owed <= 0) { record(target, "Check", 0, false, "Check", "rien à payer : compté comme parole"); continue; }
        record(target, "Call", Math.min(owed, st.stack)); continue;
      }
      const tp: PlayerAction["type"] = s.bet > 0 ? "Raise" : "Bet";
      if (a === "ALLIN") { record(target, tp, st.contrib + st.stack, false, "Tapis"); continue; }
      // mise ou relance
      const sz = c.size;
      let amount: number, note: string | undefined;
      if (!sz) {
        amount = s.street === "Preflop" ? (s.bet <= 1 ? 2.5 : s.bet * 3) : s.bet > 0 ? s.bet * 3 : s.pot * 0.66;
        note = "taille non dite : taille habituelle";
      } else if (sz.t === "M") amount = (s.bet || 1) * (sz.v as number);
      else if (sz.t === "F") amount = s.bet > 0 ? s.bet + (sz.v as number) * (s.pot + owed) : (sz.v as number) * s.pot;
      else amount = sz.v as number;
      amount = round1(amount);
      if (amount <= s.bet) { push({ level: "err", label: name, seatIdx: target, type: tp, amount, note: `trop petit : la mise est déjà à ${fmtBB(s.bet)} bb` }); continue; }
      if (amount > st.contrib + st.stack) { amount = st.contrib + st.stack; note = "plus que son tapis : compté tapis"; }
      record(target, tp, amount, false, tp, note);
    }
  }
  if (boardChanged) res.board = board;
  if (holeChanged) res.hole = hole;
  res.next = nextToAct(s);
  return res;
}
