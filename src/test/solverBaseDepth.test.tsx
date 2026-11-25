import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const loaded: string[] = [];
vi.mock("@/engines/solverSpots", async orig => {
  const real = await orig<typeof import("@/engines/solverSpots")>();
  return {
    ...real,
    loadSolverIndex: async () => ["cash20", "cash30", "cash50", "cash75", "cash100", "cash150"].map(id => ({ id, kind: "cash", label: id, stack: +id.slice(4) })),
    loadSolverGame: async (id: string) => { loaded.push(id); return { id, kind: "cash", stack: +id.slice(4), positions: [], spots: [] }; },
  };
});
import { useSolverBase } from "@/hooks/use-solver-base";
import { getSolverBaseGame } from "@/engines/solverSpots";

describe("ranges du site : table du tapis joué (D33)", () => {
  beforeEach(() => { loaded.length = 0; });
  it("à 30 bb, les ranges viennent de la table 30 bb", async () => {
    renderHook(() => useSolverBase(30));
    await waitFor(() => expect(getSolverBaseGame()?.id).toBe("cash30"));
  });
  it("change de table quand le tapis change", async () => {
    const { rerender } = renderHook(({ s }) => useSolverBase(s), { initialProps: { s: 100 } });
    await waitFor(() => expect(getSolverBaseGame()?.id).toBe("cash100"));
    rerender({ s: 62 });
    await waitFor(() => expect(getSolverBaseGame()?.id).toBe("cash50"));
  });
});
