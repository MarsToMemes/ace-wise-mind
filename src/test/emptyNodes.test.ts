import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyNodes, readableLine } from "@/engines/emptyNodes";

// Problème 2a : les nœuds vides de la bibliothèque cash 100 bb, figés dans tests/fixtures/empty-nodes.json.
const g = JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8"));
const fixture = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/empty-nodes.json"), "utf8"));

describe("nœuds vides de la bibliothèque (2a)", () => {
  it("91 nœuds vides sur 1 919, identiques à la fixture (clé, ligne, position du héros)", () => {
    const list = emptyNodes(g);
    expect(g.spots.length).toBe(1919);
    expect(list.length).toBe(91);
    expect(fixture).toMatchObject({ table: "cash100", total: 1919, empty: 91 });
    expect(list).toEqual(fixture.nodes);
  });

  it("l'exemple du test en direct en fait partie : BTN face au tapis de la BB après sa relance à 17,2", () => {
    const k = "UTG:F,MP:F,CO:R2.5,BTN:C,SB:F,BB:R7.5,CO:F,BTN:R17.2,BB:A100";
    expect(fixture.nodes).toContainEqual({ key: k, hero: "BTN", line: readableLine(k) });
    expect(readableLine(k)).toBe("UTG fold, MP fold, CO relance 2,5, BTN call, SB fold, BB relance 7,5, CO fold, BTN relance 17,2, BB tapis 100");
  });
});
