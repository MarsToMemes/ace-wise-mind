import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cashCoverage, cashBaseId, CASH_DEPTHS } from "@/engines/solverSpots";
import { DecisionVerdict } from "@/components/DecisionVerdict";

describe("cash : tables calculées à 20, 30, 50, 75, 100 et 150 bb (D33)", () => {
  it("les six tapis calculés sont proposés", () => {
    expect(CASH_DEPTHS.filter(d => d.ready).map(d => d.bb)).toEqual([20, 30, 50, 75, 100, 150]);
  });

  it("un tapis calculé est couvert par sa table, sans remarque", () => {
    for (const bb of [20, 30, 50, 75, 100, 150]) expect(cashCoverage(bb)).toEqual({ ok: true, note: null, depth: bb });
  });

  it("entre deux tables : la plus proche, à 25 % de son tapis au plus, et on le dit", () => {
    const cases: [number, number][] = [[92, 100], [40, 50], [62, 50], [70, 75], [125, 100], [175, 150], [16, 20], [27, 30]];
    for (const [stack, depth] of cases) {
      const c = cashCoverage(stack);
      expect(c.ok, `${stack} bb`).toBe(true);
      expect(c.depth, `${stack} bb`).toBe(depth);
      expect(c.note).toMatch(new RegExp(`calculé à ${depth} bb`));
    }
  });

  it("trop loin de toute table : pas de conseil solveur et un message clair", () => {
    for (const stack of [12, 200]) {
      const c = cashCoverage(stack);
      expect(c.ok).toBe(false);
      expect(c.depth).toBeNull();
      expect(c.note).toMatch(/20 bb, 30 bb, 50 bb, 75 bb, 100 bb, 150 bb/);
      expect(c.note).toMatch(new RegExp(`ton tapis : ${stack} bb`));
    }
  });

  it("les ranges du site viennent toujours de la table la plus proche", () => {
    expect(cashBaseId(12)).toBe("cash20");
    expect(cashBaseId(30)).toBe("cash30");
    expect(cashBaseId(62)).toBe("cash50");
    expect(cashBaseId(100)).toBe("cash100");
    expect(cashBaseId(300)).toBe("cash150");
  });
});

describe("décision synthétique : profondeur non calculée", () => {
  const engine = { suggestedAction: "Fold", sizing: null } as never;
  it("annonce l'approximation au lieu d'afficher le solveur 100 bb", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={50}
      solver={null} solverNote="La bibliothèque cash n'est calculée qu'à 100 bb (ton tapis : 50 bb)." />);
    expect(screen.getByText(/n'est calculée qu'à 100 bb/)).toBeTruthy();
    expect(screen.getByText(/Approximation/)).toBeTruthy();
    expect(screen.queryByText(/Solveur GTOpen/)).toBeNull();
  });
  it("sans choix Tournoi / Cash quand le format est imposé", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} solver={null} format="cash" />);
    expect(screen.queryByRole("button", { name: "Tournoi" })).toBeNull();
  });
});
