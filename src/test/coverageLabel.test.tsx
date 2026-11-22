import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionVerdict, SolverPreflop } from "@/components/DecisionVerdict";
import { RARE_NOTE } from "@/engines/solverSpots";

const engine = { suggestedAction: "Fold", sizing: null } as never;
const base: SolverPreflop = { act: "F", pct: 74, label: "Cash · 100 bb", title: "BTN face à : relance UTG, relance BTN, tapis UTG", hand: "AKo",
  mix: [{ label: "Fold", pct: 74 }, { label: "Call", pct: 26 }] };
const show = (solver: SolverPreflop | null) =>
  render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} solver={solver} format="cash" />);

describe("étiquette d'origine du conseil", () => {
  it("ligne calculée et jouée : solveur, sans réserve", () => {
    show({ ...base, coverage: { level: "exact", details: [] } });
    expect(screen.getByText("Solveur GTOpen · Cash · 100 bb")).toBeTruthy();
    expect(screen.queryByText(/ligne rare|approché/)).toBeNull();
  });

  it("ligne rare : étiquette à part, conseil dit indicatif", () => {
    show({ ...base, coverage: { level: "rare", details: [RARE_NOTE] } });
    expect(screen.getByText("Solveur · ligne rare · Cash · 100 bb")).toBeTruthy();
    expect(screen.getByText(RARE_NOTE)).toBeTruthy();
    expect(screen.getByText(/AKo : 74 % fold · indicatif/)).toBeTruthy();
  });

  it("ligne rapprochée : étiquette « approché » et ce qui a été changé", () => {
    const d = "Relance de UTG à 3 bb comptée comme 2,5 bb (taille calculée la plus proche).";
    show({ ...base, coverage: { level: "approx", details: [d] } });
    expect(screen.getByText("Solveur · approché · Cash · 100 bb")).toBeTruthy();
    expect(screen.getByText(d)).toBeTruthy();
    expect(screen.getByText(/AKo : 74 % fold · approché/)).toBeTruthy();
  });

  it("sans ligne calculée : moteur de base", () => {
    show(null);
    expect(screen.getByText("Moteur de base")).toBeTruthy();
  });
});
