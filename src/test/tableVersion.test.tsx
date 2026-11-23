import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionVerdict } from "@/components/DecisionVerdict";
import { versionLabel } from "@/engines/solverSpots";

const engine = { suggestedAction: "Fold", sizing: null, equityPct: 40, reqEquity: 30, heroRA: 0 } as never;

describe("version de la table préflop", () => {
  it("date de calcul lisible", () => {
    expect(versionLabel("2026-11-22")).toBe("22 nov. 2026");
    expect(versionLabel("pas une date")).toBe("pas une date");
  });
  it("les détails du calcul disent quelle table a répondu", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} format="cash"
      solver={{ act: "R2.5", pct: 100, label: "Cash · 100 bb", hand: "AA", version: "22 nov. 2026" }} />);
    expect(screen.getByText("Table préflop")).toBeTruthy();
    expect(screen.getByText("Cash · 100 bb · calculée le 22 nov. 2026")).toBeTruthy();
  });
});
