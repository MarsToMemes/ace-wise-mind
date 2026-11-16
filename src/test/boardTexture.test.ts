import { describe, it, expect } from "vitest";
import { analyzeBoard } from "@/engines/boardTexture";

describe("analyzeBoard", () => {
  it("A72 rainbow is A-high, static", () => {
    const b = analyzeBoard(["As", "7d", "2c"]);
    expect(b.height).toBe("A-high");
    expect(b.suits).toBe("rainbow");
    expect(b.pairing).toBe("unpaired");
    expect(b.dynamic).toBe(false);
  });

  it("987 two-tone is middle and dynamic", () => {
    const b = analyzeBoard(["9h", "8h", "7c"]);
    expect(b.height).toBe("middle");
    expect(b.suits).toBe("two-tone");
    expect(b.straightsPossible).toBeGreaterThanOrEqual(3);
    expect(b.dynamic).toBe(true);
  });

  it("KK4 is paired, 777 is trips", () => {
    expect(analyzeBoard(["Kh", "Kd", "4h"]).pairing).toBe("paired");
    expect(analyzeBoard(["7h", "7d", "7c"]).pairing).toBe("trips");
  });

  it("862 monotone is low and dynamic", () => {
    const b = analyzeBoard(["8s", "6s", "2s"]);
    expect(b.suits).toBe("monotone");
    expect(b.height).toBe("low");
    expect(b.dynamic).toBe(true);
  });

  it("produces French tags", () => {
    expect(analyzeBoard(["As", "7d", "2c"]).tags).toContain("Arc-en-ciel");
  });
});
