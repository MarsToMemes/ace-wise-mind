import { describe, it, expect } from "vitest";
import { pickMain } from "@/engines/multiway/display";

// Étape B2 : quelle action mettre en avant pour ta main (D32).
const act = (label: string, freq: number, ev: number) => ({ kind: "bet" as const, to: 0, label, freq, ev });

describe("B2 : action mise en avant", () => {
  it("l'action la plus jouée, quand elle rapporte (presque) autant que la meilleure", () => {
    const r = pickMain([act("Fold", 0.1, 0), act("Call 4 bb", 0.9, 1.2), act("Tapis", 0, 0.9)], 16);
    expect(r.main.label).toBe("Call 4 bb");
    expect(r.note).toBeUndefined();
  });
  it("la plus rentable, quand la plus jouée rapporte nettement moins (calcul pas fini pour ta main), avec une explication", () => {
    const r = pickMain([act("Fold", 0.05, 0), act("Call 4 bb", 0.04, 0), act("Relance à 20 bb", 0.26, 0.8), act("Tapis 97,5 bb", 0.65, 0.5)], 16);
    expect(r.main.label).toBe("Relance à 20 bb");
    expect(r.note).toBe("Le calcul n'a pas fini de régler ta main : l'action la plus jouée (Tapis 97,5 bb, 65 %) rapporte 0,3 bb de moins que Relance à 20 bb, mise en avant.");
  });
  it("presque indifférent : les deux meilleures actions rapportent presque pareil", () => {
    const r = pickMain([act("Fold", 0.5, 0), act("Call 4 bb", 0.5, 0.05)], 16);
    expect(r.close).toBe("Presque indifférent : Call 4 bb (+0,1 bb) et Fold (+0 bb) rapportent presque pareil.");
  });
});
