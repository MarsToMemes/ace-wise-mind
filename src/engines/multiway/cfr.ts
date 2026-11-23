// CFR à n joueurs (minimisation du regret contrefactuel), variante CFR+ : regrets positifs gardés, mises à jour
// alternées par joueur, moyenne pondérée par l'itération. Au-delà de 2 joueurs, aucune convergence vers un équilibre
// n'est garantie : la qualité se mesure avec bestResponse.ts (NashConv exacte), voir docs/DECISIONS.md D11.
import type { Game, Node, Profile } from "@/engines/multiway/game";

type Decision = Extract<Node, { t: "decision" }>;

export class CFR {
  iterations = 0;
  private regret = new Map<string, Float64Array>();
  private sum = new Map<string, Float64Array>();
  /** Regrets de l'itération en cours, appliqués à la fin du parcours : la stratégie reste fixe pendant l'itération. */
  private pending = new Map<string, Float64Array>();
  constructor(readonly game: Game, readonly plus = true) {}

  private table(m: Map<string, Float64Array>, n: Decision) {
    let v = m.get(n.info);
    if (!v) { v = new Float64Array(n.actions.length); m.set(n.info, v); }
    return v;
  }

  /** Stratégie courante (correspondance des regrets positifs). */
  private current(n: Decision): number[] {
    const r = this.table(this.regret, n);
    let s = 0;
    for (const x of r) s += Math.max(0, x);
    return s > 0 ? Array.from(r, x => Math.max(0, x) / s) : Array(r.length).fill(1 / r.length);
  }

  private walk(n: Node, i: number, reach: number[], chance: number): number {
    if (n.t === "terminal") return n.payoffs[i];
    if (n.t === "chance") return n.outcomes.reduce((v, o) => v + o.p * this.walk(o.child, i, reach, chance * o.p), 0);
    const sigma = this.current(n);
    if (n.player !== i) {
      let v = 0;
      n.children.forEach((c, a) => {
        if (sigma[a] === 0) return;
        const r = [...reach]; r[n.player] *= sigma[a];
        v += sigma[a] * this.walk(c, i, r, chance);
      });
      return v;
    }
    const vals = n.children.map((c, a) => { const r = [...reach]; r[i] *= sigma[a]; return this.walk(c, i, r, chance); });
    const v = vals.reduce((t, x, a) => t + sigma[a] * x, 0);
    const others = reach.reduce((p, x, j) => (j === i ? p : p * x), chance);
    const dReg = this.table(this.pending, n), sum = this.table(this.sum, n);
    const w = this.plus ? this.iterations : 1;
    vals.forEach((x, a) => {
      dReg[a] += others * (x - v);
      sum[a] += w * reach[i] * sigma[a];
    });
    return v;
  }

  run(iterations: number) {
    for (let k = 0; k < iterations; k++) {
      this.iterations++;
      for (let i = 0; i < this.game.players; i++) {
        this.pending.clear();
        this.walk(this.game.root, i, Array(this.game.players).fill(1), 1);
        for (const [info, d] of this.pending) {
          const r = this.regret.get(info) ?? new Float64Array(d.length);
          for (let a = 0; a < d.length; a++) r[a] = this.plus ? Math.max(0, r[a] + d[a]) : r[a] + d[a];
          this.regret.set(info, r);
        }
      }
    }
  }

  /** Stratégie moyenne (celle qui approche un équilibre en 2 joueurs à somme nulle). */
  averageProfile(): Profile {
    const snap = new Map<string, number[]>();
    for (const [info, s] of this.sum) {
      const t = s.reduce((a, b) => a + b, 0);
      snap.set(info, t > 0 ? Array.from(s, x => x / t) : Array(s.length).fill(1 / s.length));
    }
    return info => snap.get(info);
  }
}
