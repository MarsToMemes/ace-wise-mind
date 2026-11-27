import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { firstInSpot, type SolverGame } from "@/engines/solverSpots";
import { explorerOpen, openFacts } from "@/lib/explorerOpen";
import { POSITION_RANGE_CATALOG } from "@/engines/positionRangeCatalog";

// Libellés du Range Explorer (suite du problème 1) : plus aucun chiffre ni conseil d'ouverture écrit en dur, plus
// d'EV fictive ; les faits affichés pour l'ouverture sont calculés depuis la bibliothèque.
const g = JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8")) as SolverGame;
const R = "AKQJT98765432";
const openOf = (pos: string) => {
  const s = firstInSpot(g, pos)!;
  return Object.fromEntries(Object.entries(s.h).map(([h, p]) => [h, s.acts.reduce((t, a, i) => t + (/^[RA]/.test(a) ? p[i] ?? 0 : 0), 0)]));
};

describe("Range Explorer : libellés et conseils d'ouverture", () => {
  it("les faits affichés sont ceux de la bibliothèque (paire la plus basse, as assortis et dépareillés, mains mixtes, %)", () => {
    for (const pos of ["UTG", "MP", "CO", "BTN", "SB"]) {
      const o = openOf(pos);
      const pair = [...R].map(r => r + r).filter(h => o[h] >= 50).pop()!;
      const axs = [...R.slice(1)].map(r => `A${r}s`).filter(h => o[h] >= 50).pop()!;
      const axo = [...R.slice(1)].map(r => `A${r}o`).filter(h => o[h] >= 50).pop()!;
      const mixed = Object.values(o).filter(v => v > 5 && v < 95).length;
      const text = openFacts(explorerOpen(pos, g)!, g).join(" \n ");
      expect(text).toContain(explorerOpen(pos, g)!.pct.toFixed(1).replace(".", ","));
      expect(text).toContain(`jusqu'à ${pair}`);
      expect(text).toContain(`assortis jusqu'à ${axs}`);
      expect(text).toContain(`dépareillés jusqu'à ${axo}`);
      expect(text).toContain(`${mixed} main${mixed > 1 ? "s" : ""} jouée${mixed > 1 ? "s" : ""} en mixte`);
      expect(text).toContain("jamais de tapis");                 // A100 n'est jamais choisi à l'ouverture
      expect(text).not.toMatch(/limp/i);                          // pas de limp dans la bibliothèque
    }
  });

  it("plus de chiffre, de conseil ni de calibrage d'ouverture écrit en dur pour UTG à SB, plus d'EV fictive", () => {
    for (const pos of ["UTG", "MP", "CO", "BTN", "SB"]) {
      const info = POSITION_RANGE_CATALOG[pos] as unknown as Record<string, unknown>;
      expect(info.openFrequencyPct).toBeUndefined();
      expect(info.insights).toBeUndefined();
      expect(String(info.archetype ?? "")).not.toMatch(/\d/);
    }
    const ex = readFileSync(join(process.cwd(), "src/components/RangeExplorer.tsx"), "utf8");
    expect(ex).not.toMatch(/\+0\.00 bb/);
    expect(ex).not.toMatch(/Solver baseline|Baseline GTO priors/);
    expect(ex).toMatch(/openFacts\(/);                          // les faits affichés viennent de la bibliothèque
  });
});
