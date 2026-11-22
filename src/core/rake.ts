// Règle de rake du cash, la même pour tout le site : table préflop (calculée avec), conseiller après le flop
// et solveur de fin de main. En tournoi : pas de rake (on ne passe pas de règle).

export interface RakeRule {
  pct: number;              // % du pot
  capBB: number | null;     // plafond en bb (null : sans plafond)
  noFlopNoDrop?: boolean;   // true : rien sur un pot gagné avant le flop
}

/** Rake de la table cash 100 bb (paramètres du calcul GTOpen). */
export const CASH_RAKE: RakeRule = { pct: 5, capBB: 3, noFlopNoDrop: true };

/** Rake prélevé sur un pot (bb) qui a vu le flop. 0 sans règle. */
export function rakeOf(potBB: number, rule?: RakeRule | null): number {
  if (!rule || potBB <= 0) return 0;
  const r = (rule.pct / 100) * potBB;
  return rule.capBB == null ? r : Math.min(r, rule.capBB);
}

const fr = (x: number) => String(x).replace(".", ",");

export function rakeLabel(rule: RakeRule): string {
  return `${fr(rule.pct)} %${rule.capBB != null ? ` plafonné à ${fr(rule.capBB)} bb` : ""}`
    + (rule.noFlopNoDrop ? ", rien sur un pot gagné avant le flop" : "");
}
