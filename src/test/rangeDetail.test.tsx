import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionVerdict } from "@/components/DecisionVerdict";

const engine = { suggestedAction: "Fold", sizing: null, equityPct: 40, reqEquity: 30, heroRA: 0 } as never;

describe("détails du calcul : ranges d'entrée", () => {
  it("dit si les ranges viennent de la ligne préflop jouée", () => {
    render(<DecisionVerdict street="Flop" engine={engine} polar={null} pot={20} toCall={0} stack={90} rangeSource="ligne jouée · pot 4-betté" />);
    expect(screen.getByText("Ranges d'entrée")).toBeTruthy();
    expect(screen.getByText("ligne jouée · pot 4-betté")).toBeTruthy();
  });
  it("rien au préflop", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} rangeSource="situations types" />);
    expect(screen.queryByText("Ranges d'entrée")).toBeNull();
  });
});
