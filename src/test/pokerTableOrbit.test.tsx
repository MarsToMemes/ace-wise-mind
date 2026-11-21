import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { PokerTable } from "@/components/PokerTable";

const base = {
  size: 6 as const, dealerIdx: 3, userIdx: 3, mode: "user" as const, folded: Array(6).fill(false),
  streetContribs: [0, 0, 2.5, 2.5, 0.5, 1], lastActions: Array(6).fill(null), currentBet: 2.5, defaultRaise: 7.5,
  onSeatClick: () => {}, onPlayerAction: () => {}, onModeChange: () => {}, onSizeChange: () => {},
};
const renderTable = (p: Partial<React.ComponentProps<typeof PokerTable>> = {}) =>
  render(<I18nProvider><PokerTable {...base} {...p} /></I18nProvider>);

describe("PokerTable (Orbite)", () => {
  it("keeps one clickable seat per player with its position", () => {
    const click = vi.fn();
    renderTable({ onSeatClick: click });
    const btn = screen.getByRole("button", { name: "Seat 4 BTN" });
    fireEvent.click(btn);
    expect(click).toHaveBeenCalledWith(3);
    expect(screen.getAllByRole("button", { name: /^Seat \d/ })).toHaveLength(6);
  });

  it("puts your seat at the bottom of the table", () => {
    renderTable({ userIdx: 5 });
    const hero = screen.getByRole("button", { name: "Seat 6 BB" });
    expect(parseFloat(hero.style.top)).toBeGreaterThan(85);
    const across = screen.getByRole("button", { name: "Seat 3 CO" });
    expect(parseFloat(across.style.top)).toBeLessThan(15);
  });

  it("shows the pot, the board and your cards in the middle", () => {
    renderTable({ potBB: 32, board: ["Jh", "Th", "9c", "4s"], hole: ["Qs", "Qd"] });
    expect(screen.getByTestId("table-pot").textContent).toContain("32");
    expect(screen.getAllByTestId("board-card")).toHaveLength(4);
    expect(screen.getAllByTestId("hero-card")).toHaveLength(2);
  });

  it("shows the setup prompt while the table is empty", () => {
    renderTable({ dealerIdx: -1, userIdx: -1 });
    expect(screen.queryByTestId("board-card")).toBeNull();
    expect(screen.getByTestId("table-prompt")).toBeTruthy();
  });

  it("marks the dealer with a D button", () => {
    renderTable();
    expect(screen.getByTestId("dealer-button").textContent).toBe("D");
  });

  it("shows what is left for you to pay, not the whole bet", () => {
    renderTable({ currentBet: 20, toCallBB: 12.5 });
    const el = screen.getByTestId("table-to-call");
    expect(el.textContent).toContain("12.5");
    expect(el.textContent).not.toContain("20");
  });
});
