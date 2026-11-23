// Règlement d'une main (moteur de règles commun, phase 1.3) : chaque pot va à ses gagnants, la mise rendue à son
// auteur, le rake est pris sur le total contesté et réparti au prorata des pots (règle B, docs/DECISIONS.md D5).
import type { HandState, Pot } from "@/core/handState";
import { rakeOf, type RakeRule } from "@/core/rake";

export interface SettleOptions {
  /** Force de la main de chaque joueur à l'abattage (plus grand = meilleure ; égalité = partage). */
  ranks?: Record<number, number>;
  /** Gagnants imposés pour chaque pot contesté, dans l'ordre des pots (choix du joueur) ; prioritaires sur ranks. */
  winners?: number[][];
  /** Rake de la partie ; absent : aucun. */
  rake?: RakeRule | null;
}

export interface PotResult extends Pot { winners: number[]; rake: number }
export interface Settlement {
  perPot: PotResult[];
  /** Ce que chaque siège reçoit. */
  payouts: number[];
  /** Rake prélevé sur les pots attribués. */
  rake: number;
  /** Tapis après la main (ce qui restait + ce qui est reçu). */
  stacksAfter: number[];
  /** Pots contestés dont le gagnant n'est pas connu (mains inconnues à l'abattage) : à demander. */
  unresolved: { pot: number; eligible: number[] }[];
}

const clean = (x: number) => Math.round(x * 1e9) / 1e9;

export function settleHand(state: HandState, o: SettleOptions = {}): Settlement {
  const n = state.seats.length;
  const flopSeen = state.board.length >= 3 || state.history.some(a => a.street !== "Preflop");
  const contested = state.pots.filter(p => p.kind !== "refund");
  const total = contested.reduce((t, p) => t + p.amount, 0);
  const rule = o.rake ?? null;
  const rakeAll = rule && total > 0 && (flopSeen || rule.noFlopNoDrop === false) ? rakeOf(total, rule) : 0;

  const payouts = Array(n).fill(0);
  const unresolved: Settlement["unresolved"] = [];
  let rake = 0, ci = -1;
  const perPot: PotResult[] = state.pots.map((p, j) => {
    if (p.kind === "refund") {
      payouts[p.eligible[0]] += p.amount;
      return { ...p, winners: [...p.eligible], rake: 0 };
    }
    ci++;
    const potRake = total > 0 ? (rakeAll * p.amount) / total : 0;
    let winners: number[] = [];
    const imposed = o.winners?.[ci]?.filter(s => p.eligible.includes(s));
    if (imposed?.length) winners = imposed;
    else if (p.eligible.length === 1) winners = [...p.eligible];
    else {
      const known = p.eligible.filter(s => o.ranks?.[s] !== undefined);
      if (known.length === p.eligible.length) {
        const best = Math.max(...known.map(s => o.ranks![s]));
        winners = known.filter(s => o.ranks![s] === best);
      }
    }
    if (!winners.length) { unresolved.push({ pot: j, eligible: [...p.eligible] }); return { ...p, winners, rake: 0 }; }
    for (const w of winners) payouts[w] += (p.amount - potRake) / winners.length;
    rake += potRake;
    return { ...p, winners, rake: clean(potRake) };
  });

  const paid = payouts.map(clean);
  return {
    perPot, payouts: paid, rake: clean(rake), unresolved,
    stacksAfter: state.seats.map((s, i) => clean(s.remainingBB + paid[i])),
  };
}
