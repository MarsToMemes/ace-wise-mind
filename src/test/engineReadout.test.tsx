import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { EngineReadout, type EngineResult } from "@/components/EngineReadout";

const result = {
  category: "High Card", score: 10, adjScore: 7, drawType: "None", outs: 0, equityPct: 1,
  texture: "Dry", heroRA: "Capped", villainRA: "Polarized", potOdds: 0.25, reqEquity: 22,
  suggestedAction: "Fold", decisionReason: "Weak hand",
  sizing: { heroAction: "Fold", intent: "Pot Control", inPosition: false, pctMin: 0, pctMax: 0, amountBB: 0, explanation: "Fold: equity 1%" },
} as unknown as EngineResult;

describe("EngineReadout", () => {
  it("n'affiche plus les encadrés Recommendation et Recommended Sizing (doublons de la décision synthétique)", () => {
    render(<I18nProvider><EngineReadout result={result} /></I18nProvider>);
    expect(screen.queryByText("Recommendation")).toBeNull();
    expect(screen.queryByText("Recommended Sizing")).toBeNull();
    expect(screen.queryByText("Hand Strength")).toBeNull();
  });
  it("garde les indicateurs détaillés (texture, équité, cotes du pot)", () => {
    render(<I18nProvider><EngineReadout result={result} /></I18nProvider>);
    expect(screen.getByText("Capped")).toBeTruthy();
    expect(screen.getByText("Polarized")).toBeTruthy();
    expect(screen.getByText("25.0%")).toBeTruthy();
  });
});
