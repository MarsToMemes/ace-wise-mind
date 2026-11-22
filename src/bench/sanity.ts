// Brique 1 (suite) : mains évidentes dans la table préflop. Ce ne sont pas des solutions exactes, mais des
// comportements que toute stratégie raisonnable respecte ; un échec signale une table abîmée ou mal lue.
import { SolverGame, firstInSpot, facingSpot, isRaise, isJam } from "@/engines/solverSpots";
import type { CheckResult } from "@/bench/knownGames";

const share = (spot: { acts: string[]; h: Record<string, number[]> } | undefined, hand: string, pick: (a: string) => boolean) => {
  const p = spot?.h[hand];
  return p ? spot!.acts.reduce((t, a, i) => t + (pick(a) ? p[i] ?? 0 : 0), 0) / 100 : NaN;
};

export function sanityChecks(g: SolverGame): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (name: string, got: number, ok: boolean, expected: number) => out.push({ name, expected, got, tolerance: 0, ok: ok && Number.isFinite(got) });
  const opens = g.positions.filter(p => p !== "BB");
  for (const p of opens) {
    const s = firstInSpot(g, p);
    const aa = share(s, "AA", a => isRaise(a) || isJam(a));
    add(`${p} premier à parler : AA relance toujours`, aa, aa >= 0.99, 1);
  }
  for (const p of ["UTG", "MP", "CO"].filter(x => g.positions.includes(x))) {
    const f = share(firstInSpot(g, p), "72o", a => a === "F");
    add(`${p} premier à parler : 72o se couche toujours`, f, f >= 0.99, 1);
  }
  for (const opener of opens) {
    for (const pos of g.positions.slice(g.positions.indexOf(opener) + 1)) {
      const f = share(facingSpot(g, opener, isRaise, pos), "AA", a => a === "F");
      add(`${pos} face à l'ouverture de ${opener} : AA ne se couche jamais`, f, f === 0, 0);
    }
  }
  return out;
}
