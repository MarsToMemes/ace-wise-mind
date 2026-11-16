import { describe, it, expect } from "vitest";
import { rank7, categoryOf } from "@/engines/handEval7";

const r = (s: string) => rank7(s.split(" "));

describe("rank7", () => {
  it("orders hand categories", () => {
    const order = [
      "Ah 9c 7d 5s 3h 2c Jd",       // high card
      "Ah Ac 7d 5s 3h 2c Jd",       // pair
      "Ah Ac 7d 7s 3h 2c Jd",       // two pair
      "Ah Ac Ad 7s 3h 2c Jd",       // trips
      "Ah 2c 3d 4s 5h 9c Jd",       // wheel straight
      "9h Tc Jd Qs Kh 2c 3d",       // straight
      "Ah 9h 7h 5h 3h 2c Jd",       // flush
      "Ah Ac Ad 7s 7h 2c Jd",       // full house
      "Ah Ac Ad As 7h 2c Jd",       // quads
      "5h 6h 7h 8h 9h 2c Jd",       // straight flush
    ].map(r);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it("wheel is the lowest straight", () => {
    expect(r("2c 3d 4s 5h 6h Kc Kd")).toBeGreaterThan(r("Ah 2c 3d 4s 5h Kc Qd"));
  });

  it("kickers break ties and equal hands tie", () => {
    expect(r("Ah Ac Kd 7s 3h 2c 9d")).toBeGreaterThan(r("Ah Ac Qd 7s 3h 2c 9d"));
    expect(r("Ah Ac Kd 7s 3h 2c 9d")).toBe(r("As Ad Kc 7h 3s 2d 9c"));
  });

  it("works with 5 cards and reports category", () => {
    expect(categoryOf(r("Ah Ac 7d 7s 3h"))).toBe(2);
    expect(categoryOf(r("Ah Kh 7h 5h 3h"))).toBe(5);
  });
});
