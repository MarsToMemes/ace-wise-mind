// Étape A1 (docs/DECISIONS.md D27) : de la main saisie sur le site au spot river multiway (2 à 4 joueurs) ; étape B2
// (D32) : même chose pour la turn à 3 joueurs (méthode « turn seule »).
// Joueurs, pot, tapis, argent mort : le moteur de règles du site (replayLive) rejoue la main jusqu'à la fin de la turn.
// Ranges : ligne préflop vraiment jouée (lineRanges), puis le filtre de chaque street (filterByLine), comme le conseil.
// Actions déjà jouées sur la river : insérées dans l'arbre avec leurs vraies tailles (betTree, `path`).
import type { PlayerAction } from "@/components/ActionMenu";
import type { RakeRule } from "@/core/rake";
import type { SolverGame, TableAction } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { filterByLine, type LineEvent, type PostStreet } from "@/engines/postflopRanges";
import { buildBetTree, type PathAct, type TAct } from "@/engines/multiway/betTree";
import type { VSpec, VCombo } from "@/engines/multiway/vriver3";
import type { TurnSpec } from "@/engines/multiway/vturn";
import { replayLive, type LiveHand } from "@/lib/liveHand";

export interface HandSpotInput {
  live: LiveHand;
  /** Position simple de chaque siège (UTG, MP, CO, BTN, SB, BB), comme pour lineRanges. */
  positions: string[];
  game: SolverGame;
  effStack: number;
  rake: RakeRule | null;
  /** Mains presque impossibles retirées (poids relatif sous ce seuil), sauf la tienne. Étape A2, comme Pluribus. */
  minWeight?: number;
}
export type HandSpot =
  | { ok: true; spec: VSpec; seats: number[]; heroPlayer: number; heroHand: number; pathNode: TAct; notes: string[]; reason?: undefined }
  | { ok: false; reason: string };

/** Menus de mise (D22) : complet à 2 et 3 joueurs, celui de Pluribus à 4. */
export const MENU_3 = { bets: [0.33, 0.75, 1.25], raise: true, allin: true, maxAggr: 3 };
export const MENU_4 = { bets: [0.5, 1], raise: true, allin: true, maxAggr: 2 };
/** Turn à 3 joueurs (mesurée, D30-D31) : 50 / 100 %, relance au pot, tapis ; river au bout de la turn : 66 % + tapis. */
export const MENU_TURN = { bets: [0.5, 1], raise: true, allin: true, maxAggr: 2 };
export const RIVER_AFTER_TURN = { bets: [0.66], raise: false, allin: true, maxAggr: 1 };

const norm = (r: VCombo[]) => { const t = Math.max(...r.map(c => c.w)); return r.map(c => ({ cards: c.cards, w: c.w / t })); };
const same = (a: [string, string], b: string[]) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

export function riverSpotFromHand(o: HandSpotInput): HandSpot { return spotFromHand(o, "River"); }
export function turnSpotFromHand(o: HandSpotInput): HandSpot { return spotFromHand(o, "Turn"); }

function spotFromHand(o: HandSpotInput, street: "Turn" | "River"): HandSpot {
  const turn = street === "Turn", h = turn ? { ...o.live, board: o.live.board.slice(0, 4) } : o.live, board = h.board;
  if (board.length !== (turn ? 4 : 5)) return { ok: false, reason: turn ? "Il faut les 4 cartes du board à la turn." : "Le calcul multiway démarre à la river : il faut les 5 cartes du board." };
  if (h.hole.length !== 2) return { ok: false, reason: "Entre tes deux cartes." };
  const before = h.actions.filter(a => a.street !== street && (!turn || a.street !== "River")), river = h.actions.filter(a => a.street === street);

  // joueurs, pot et tapis au début de la river, d'après le moteur de règles
  const pre = replayLive({ ...h, actions: before, folded: h.folded.map(() => false) });
  if (pre.errors?.length) return { ok: false, reason: `Main invalide : ${pre.errors.map(e => e.message).join(" ; ")}` };
  const size = h.tableSize, order = (s: number) => (s - h.dealerIdx - 1 + size) % size;    // SB parle en premier
  const seats = pre.state.seats.filter(s => !s.folded).map(s => s.idx).sort((a, b) => order(a) - order(b));
  if (seats.length < 2) return { ok: false, reason: "La main est déjà finie avant la river." };
  if (seats.length > (turn ? 3 : 4)) return { ok: false, reason: turn ? `${seats.length} joueurs encore dans le coup à la turn : le calcul multiway de la turn couvre 3 joueurs.` : `${seats.length} joueurs encore dans le coup à la river : le calcul multiway couvre 2 à 4 joueurs.` };
  const heroPlayer = seats.indexOf(h.userIdx);
  if (heroPlayer < 0) return { ok: false, reason: `Tu n'es plus dans le coup à la ${turn ? "turn" : "river"}.` };
  const seatOf = (i: number) => pre.state.seats.find(s => s.idx === i)!;
  const potBB = pre.state.seats.reduce((t, s) => t + s.investedBB, 0);
  const invested0 = seats.map(i => seatOf(i).investedBB), stacks = seats.map(i => seatOf(i).remainingBB);
  const dead = pre.state.seats.filter(s => s.folded && s.investedBB > 0).map(s => s.investedBB);

  // ranges : ligne préflop jouée, puis ce que chacun a fait au flop et à la turn
  const lr = lineRanges(o.game, o.positions, h.actions as TableAction[], o.effStack);
  if (!lr) return { ok: false, reason: "La ligne préflop sort des calculs du solveur : pas de ranges fiables." };
  const notes = [...lr.notes];
  if (lr.rare) notes.push("Ligne préflop rare : ranges indicatives.");
  const lineOf = (seat: number): LineEvent[] => ((turn ? ["Flop"] : ["Flop", "Turn"]) as PostStreet[]).flatMap<LineEvent>(st => {
    const acts = before.filter(a => a.street === st), mine = acts.filter(a => a.seatIdx === seat);
    if (mine.some(a => a.type === "Bet" || a.type === "Raise")) return [{ street: st, act: "bet" as const }];
    if (mine.some(a => a.type === "Call")) return [{ street: st, act: "call" as const }];
    // un check qui ferme la street (personne ne parle après) est un « check derrière »
    if (mine.some(a => a.type === "Check")) return [{ street: st, act: acts[acts.length - 1]?.seatIdx === seat ? "checkBack" as const : "checkFirst" as const }];
    return [];
  });
  const ranges: VCombo[][] = [];
  for (const seat of seats) {
    const w = lr.bySeat[seat];
    if (!w || !Object.keys(w).length) return { ok: false, reason: `Pas de range préflop pour le siège ${seat + 1}.` };
    ranges.push(norm(filterByLine(norm(expandRange(w, board)), board, lineOf(seat))));
  }
  let heroHand = ranges[heroPlayer].findIndex(c => same(c.cards, h.hole));
  if (heroHand < 0) {
    ranges[heroPlayer].push({ cards: [h.hole[0], h.hole[1]], w: 0.01 });
    heroHand = ranges[heroPlayer].length - 1;
    notes.push("Ta main ne faisait pas partie de ta range d'après la ligne jouée : ajoutée avec un petit poids.");
  }
  if (o.minWeight) {
    let removed = 0;
    ranges.forEach((r, p) => {
      const kept = r.filter((c, x) => c.w >= o.minWeight! || (p === heroPlayer && x === heroHand));
      removed += r.length - kept.length;
      if (p === heroPlayer) heroHand = kept.findIndex(c => same(c.cards, h.hole));
      ranges[p] = kept;
    });
    if (removed) notes.push(`${removed} mains presque impossibles d'après la ligne jouée (poids sous ${Math.round(o.minWeight * 100)} % de la main la plus fréquente) ne sont pas calculées.`);
  }

  // actions déjà jouées sur la river, avec leurs vraies tailles
  const path: PathAct[] = [];
  for (const a of river) {
    const player = seats.indexOf(a.seatIdx);
    if (player < 0) return { ok: false, reason: `Action à la ${turn ? "turn" : "river"} du siège ${a.seatIdx + 1}, qui n'est plus dans le coup.` };
    const kind = ({ Check: "check", Call: "call", Fold: "fold", Bet: "bet", Raise: "raise" } as const)[a.type as PlayerAction["type"]];
    path.push(kind === "bet" || kind === "raise" ? { player, kind, to: a.amountBB } : { player, kind });
  }

  const menu = turn ? MENU_TURN : seats.length === 4 ? MENU_4 : MENU_3;
  const spec: VSpec | TurnSpec = { board, ranges, potBB, stacks, rake: o.rake, ...menu, invested0, dead, path, ...(turn ? { river: RIVER_AFTER_TURN } : {}) };
  const tree = buildBetTree({ n: seats.length, potBB, stacks, rake: o.rake, ...menu, invested0, dead, path });
  if (tree.pathError || !tree.pathNode) return { ok: false, reason: tree.pathError ?? "Actions de la river impossibles à suivre." };
  if (tree.pathNode.player !== heroPlayer) return { ok: false, reason: `Ce n'est pas à toi de parler à la ${turn ? "turn" : "river"}.` };
  return { ok: true, spec, seats, heroPlayer, heroHand, pathNode: tree.pathNode, notes };
}
