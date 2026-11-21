import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { cashCoverage, CASH_DEPTHS } from "@/engines/solverSpots";
import { DecisionVerdict } from "@/components/DecisionVerdict";

describe("cash : seule la profondeur 100 bb est calculée", () => {
  it("100 bb est couvert, sans remarque", () => {
    expect(cashCoverage(100)).toEqual({ ok: true, note: null });
  });

  it("près de 100 bb, le conseil reste donné mais on dit qu'il est calculé à 100 bb", () => {
    const c = cashCoverage(92);
    expect(c.ok).toBe(true);
    expect(c.note).toMatch(/calculé à 100 bb/);
  });

  it("à 50 bb, pas de conseil solveur et un message clair", () => {
    const c = cashCoverage(50);
    expect(c.ok).toBe(false);
    expect(c.note).toMatch(/100 bb/);
    expect(c.note).toMatch(/50 bb/);
  });

  it("seul 100 bb est disponible dans le choix du tapis", () => {
    expect(CASH_DEPTHS.filter(d => d.ready).map(d => d.bb)).toEqual([100]);
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
