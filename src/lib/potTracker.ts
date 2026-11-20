import type { PlayerAction } from "@/components/ActionMenu";

/**
 * Suivi du pot à partir des actions saisies sur la table.
 *
 * Règles :
 * - mise / relance : montant « à » sur la street → le joueur n'ajoute que la différence
 *   avec ce qu'il a déjà mis sur cette street ;
 * - call : montant qu'il restait à payer (c'est ce que le menu de la table enregistre) → ajouté tel quel ;
 * - au préflop, les blindes sont postées automatiquement (0,5 et 1 bb) quand leurs sièges sont connus ;
 * - `startPot` = argent déjà au milieu avant la première action enregistrée
 *   (pot tapé à la main pour une main saisie à partir du flop, ou 1,5 bb de blindes si les sièges sont inconnus).
 */
export type Street = PlayerAction["street"];

export interface PotOptions {
  /** Sièges des blindes : postées au début du préflop. */
  blinds?: { sbIdx: number; bbIdx: number } | null;
  sb?: number;
  bb?: number;
  /** Argent déjà au milieu avant la première action enregistrée. */
  startPot?: number;
}

export interface PotStep {
  action: PlayerAction;
  /** Pot juste avant l'action. */
  potBefore: number;
  /** Jetons réellement ajoutés par l'action. */
  added: number;
}

export interface PotState {
  /** Pot total au milieu (mises de la street en cours comprises). */
  pot: number;
  steps: PotStep[];
  /** Ce que chaque siège a mis sur la street demandée. */
  contribs: Record<number, number>;
  /** Mise la plus haute sur la street demandée. */
  currentBet: number;
  /** Ce qu'il reste à payer à ce siège sur la street demandée. */
  toCall: (seatIdx: number) => number;
}

const round = (x: number) => Math.round(x * 100) / 100;

export function trackPot(actions: PlayerAction[], opts: PotOptions = {}, street?: Street): PotState {
  const sb = opts.sb ?? 0.5, bb = opts.bb ?? 1;
  let pot = opts.startPot ?? 0;
  const byStreet: Partial<Record<Street, Record<number, number>>> = {};
  const contribsOf = (st: Street) => (byStreet[st] ??= {});

  if (opts.blinds) {
    const pre = contribsOf("Preflop");
    pre[opts.blinds.sbIdx] = sb;
    pre[opts.blinds.bbIdx] = (pre[opts.blinds.bbIdx] ?? 0) + bb;
    pot += sb + bb;
  }

  const steps: PotStep[] = [];
  for (const a of actions) {
    const c = contribsOf(a.street);
    const before = c[a.seatIdx] ?? 0;
    const amt = a.amountBB || 0;
    const added = a.type === "Call" ? Math.max(0, amt)
      : a.type === "Bet" || a.type === "Raise" ? Math.max(0, amt - before)
      : 0;
    steps.push({ action: a, potBefore: round(pot), added: round(added) });
    if (added > 0) {
      c[a.seatIdx] = before + added;
      pot += added;
    }
  }

  const st = street ?? actions[actions.length - 1]?.street ?? "Preflop";
  const contribs = { ...(byStreet[st] ?? {}) };
  const currentBet = Object.values(contribs).reduce((m, v) => Math.max(m, v), 0);
  return {
    pot: round(pot),
    steps,
    contribs,
    currentBet,
    toCall: (seat: number) => round(Math.max(0, currentBet - (contribs[seat] ?? 0))),
  };
}
