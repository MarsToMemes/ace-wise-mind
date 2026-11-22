import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionVerdict } from "@/components/DecisionVerdict";
import { CASH_RAKE } from "@/core/rake";

const engine = { suggestedAction: "Fold", sizing: null, equityPct: 40, reqEquity: 30, heroRA: 0 } as never;

describe("détails du calcul : rake", () => {
  it("en cash, dit quel rake est compté", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} solver={null} format="cash" rake={CASH_RAKE} />);
    expect(screen.getByText("Rake compté")).toBeTruthy();
    expect(screen.getByText("5 % · max 3 bb")).toBeTruthy();
  });
  it("sans règle (tournoi), rien n'est affiché", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} solver={null} />);
    expect(screen.queryByText("Rake compté")).toBeNull();
  });
});
