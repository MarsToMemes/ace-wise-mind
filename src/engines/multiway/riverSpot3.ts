// River à 3 joueurs sur de vraies ranges (étape 2b, docs/DECISIONS.md D19). Ranges préflop tirées de la ligne jouée
// (table du site, lineRanges), étendues en combos hors cartes du board, puis resserrées par les actions du flop et de la
// turn avec les filtres du site. Les joueurs sont rangés dans l'ordre de parole après le flop.
import type { SolverGame, TableAction } from "@/engines/solverSpots";
import { lineRanges } from "@/engines/lineRanges";
import { expandRange, type Combo } from "@/engines/rangeVsRange";
import { filterByLine, type LineEvent } from "@/engines/postflopRanges";
import { CASH_RAKE, type RakeRule } from "@/core/rake";
import type { VSpec } from "@/engines/multiway/vriver3";

const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const POSTFLOP = ["SB", "BB", "UTG", "MP", "CO", "BTN"];

export interface RiverSpot3Input {
  /** Ligne préflop, sièges 0..5 dans l'ordre UTG, MP, CO, BTN, SB, BB. */
  preflop: TableAction[];
  board: string[];
  /** Actions du flop et de la turn de chaque siège (filtres de range). */
  lines?: Record<number, LineEvent[]>;
  /** Pot au début de la river, en bb. */
  potBB: number;
  /** Tapis restant de chaque siège au début de la river, en bb. */
  stacks: Record<number, number>;
  sizes?: Partial<Pick<VSpec, "bets" | "raise" | "allin" | "maxAggr">>;
  rake?: RakeRule | null;
  /** Abstraction : retire les combos dont le poids est sous minWeight × le plus gros poids (0 = aucune). */
  minWeight?: number;
}

export interface RiverSpot3 {
  spec: VSpec;
  /** Sièges dans l'ordre de parole (joueur 0 parle en premier). */
  seats: number[];
  positions: string[];
  combos: number[];
  /** Part du poids de chaque range retirée par l'abstraction. */
  removedWeight: number[];
  notes: string[];
  /** Une étape de la ligne préflop n'est presque jamais jouée par la stratégie : ranges indicatives. */
  rare: boolean;
}

const total = (r: Combo[]) => r.reduce((t, c) => t + c.w, 0);
const normalize = (r: Combo[]) => {
  const top = Math.max(0, ...r.map(c => c.w));
  return top > 0 ? r.map(c => ({ cards: c.cards, w: c.w / top })) : r;
};

/** null si la ligne sort de la table, ne laisse pas exactement 3 joueurs, ou si le board n'a pas 5 cartes. */
export function riverSpot3(g: SolverGame, inp: RiverSpot3Input): RiverSpot3 | null {
  if (inp.board.length !== 5) return null;
  const lr = lineRanges(g, SIX, inp.preflop, 100);
  if (!lr) return null;
  const seats = Object.keys(lr.bySeat).map(Number).sort((a, b) => POSTFLOP.indexOf(SIX[a]) - POSTFLOP.indexOf(SIX[b]));
  if (seats.length !== 3) return null;

  const notes = [...lr.notes];
  const minW = inp.minWeight ?? 0;
  const removedWeight: number[] = [];
  const ranges = seats.map(seat => {
    let r = normalize(expandRange(lr.bySeat[seat], inp.board));
    const line = inp.lines?.[seat] ?? [];
    if (line.length) r = normalize(filterByLine(r, inp.board, line));
    const kept = minW > 0 ? r.filter(c => c.w >= minW) : r;
    removedWeight.push(minW > 0 ? 1 - total(kept) / total(r) : 0);
    return kept;
  });
  if (inp.lines && Object.values(inp.lines).some(l => l.length))
    notes.push("Ranges resserrées au flop et à la turn par les filtres du site, pensés pour le tête-à-tête : approximation à 3 joueurs.");
  if (minW > 0) notes.push(`Abstraction : combos sous ${Math.round(minW * 100)} % du plus gros poids retirés.`);

  const spec: VSpec = {
    board: inp.board, potBB: inp.potBB, stacks: seats.map(s => inp.stacks[s]),
    bets: inp.sizes?.bets ?? [0.33, 0.75, 1.25], raise: inp.sizes?.raise ?? true, allin: inp.sizes?.allin ?? true,
    maxAggr: inp.sizes?.maxAggr ?? 3, rake: inp.rake === undefined ? CASH_RAKE : inp.rake,
    ranges,
  };
  return { spec, seats, positions: seats.map(s => SIX[s]), combos: ranges.map(r => r.length), removedWeight, notes, rare: lr.rare };
}
