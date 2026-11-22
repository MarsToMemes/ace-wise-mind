/**
 * Contrôle d'une table préflop (format public/solver/<id>.json) avant de s'en servir :
 * lignes uniques, codes d'action connus, fréquences qui font 100 %, mains valides,
 * joueurs de la table, et chaque ligne rattachée à l'action qui y mène.
 * Ne juge pas la qualité stratégique : seulement que la table est bien formée.
 */
import { RANKS } from "@/lib/pokerEngine";
import type { SolverGame } from "@/engines/solverSpots";
import type { Violation } from "@/core/handState";

const ACTION = /^(F|X|C|L|[RA]\d+(\.\d+)?)$/;

/** Les 169 mains de départ : « AA », « AKs », « AKo »… */
export const HAND_CLASSES: ReadonlySet<string> = new Set((() => {
  const out: string[] = [];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    for (let j = i; j >= 0; j--) {
      if (i === j) out.push(RANKS[i] + RANKS[j]);
      else out.push(RANKS[i] + RANKS[j] + "s", RANKS[i] + RANKS[j] + "o");
    }
  }
  return out;
})());

/**
 * Une ligne de fréquences : chacune entre 0 et `scale` (100 pour des %, 1 pour des probabilités),
 * et une somme égale à `scale` à `tol` près (les tables publiées sont arrondies).
 */
export function checkStrategyRow(row: number[], scale: 1 | 100, tol: number): Violation[] {
  const out: Violation[] = [];
  if (row.some(x => !Number.isFinite(x) || x < -tol || x > scale + tol)) {
    out.push({ code: "FREQ_RANGE", message: `Fréquence hors de 0–${scale} : ${row.join(", ")}.` });
  }
  const sum = row.reduce((s, x) => s + x, 0);
  if (Math.abs(sum - scale) > tol) out.push({ code: "FREQ_SUM", message: `Somme ${Math.round(sum * 100) / 100} au lieu de ${scale}.` });
  return out;
}

export function checkSolverTable(g: SolverGame): Violation[] {
  const out: Violation[] = [];
  const add = (code: string, where: string, message: string) => out.push({ code, message: `[${where || "début"}] ${message}` });
  const byKey = new Map<string, SolverGame["spots"][number]>();
  const positions = new Set(g.positions);

  for (const s of g.spots) {
    if (byKey.has(s.k)) add("DUP_KEY", s.k, "Ligne en double.");
    byKey.set(s.k, s);
  }
  for (const s of g.spots) {
    if (!positions.has(s.a)) add("BAD_ACTOR", s.k, `${s.a} n'est pas un joueur de la table.`);
    const bad = s.acts.filter(a => !ACTION.test(a));
    if (bad.length) add("BAD_ACTION", s.k, `Codes d'action inconnus : ${bad.join(", ")}.`);
    if (s.f.length !== s.acts.length) add("ROW_LENGTH", s.k, "Fréquences globales et actions de longueurs différentes.");
    // arrondi à 0,1 point dans l'export : 1 point de tolérance
    for (const v of checkStrategyRow(s.f, 100, 1)) add(v.code, s.k, `Fréquences globales : ${v.message}`);
    for (const [hand, row] of Object.entries(s.h)) {
      if (!HAND_CLASSES.has(hand)) { add("BAD_HAND", s.k, `Main inconnue : ${hand}.`); continue; }
      if (row.length !== s.acts.length) { add("ROW_LENGTH", s.k, `${hand} : ${row.length} valeurs pour ${s.acts.length} actions.`); continue; }
      // pourcentages entiers : jusqu'à un demi-point d'arrondi par action
      for (const v of checkStrategyRow(row, 100, Math.max(1, row.length / 2))) add(v.code, s.k, `${hand} : ${v.message}`);
    }
    if (s.k) {
      const cut = s.k.lastIndexOf(",");
      const parentKey = cut < 0 ? "" : s.k.slice(0, cut);
      const [pos, act] = s.k.slice(cut + 1).split(":");
      const parent = byKey.get(parentKey);
      if (!parent || parent.a !== pos || !parent.acts.includes(act)) add("ORPHAN", s.k, "L'action qui mène à cette ligne n'existe pas dans la table.");
    }
  }
  return out;
}
