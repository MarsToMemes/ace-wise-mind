import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecisionVerdict } from "@/components/DecisionVerdict";

const engine = { suggestedAction: "Call", sizing: null, equityPct: 41.237, reqEquity: 38.46153846153847, heroRA: 0, texture: "sec" } as never;

describe("cote dans la décision synthétique", () => {
  it("arrondie à une décimale dans les détails et l'explication", () => {
    render(<DecisionVerdict street="Preflop" engine={engine} polar={null} pot={1.5} toCall={1} stack={100} />);
    expect(screen.getByText("38.5 %")).toBeTruthy();
    expect(screen.getByText(/vs cote 38\.5 %/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/38\.4615/);
  });
});
