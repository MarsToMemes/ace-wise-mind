import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HandHistory } from "@/components/HandHistory";
import { saveHand, type HandSnapshot } from "@/lib/handHistory";
import { recordGaps, loadGaps } from "@/lib/gapLog";

const hand: HandSnapshot = {
  tableSize: 6, dealerIdx: 3, userIdx: 3, hole: ["As", "Kd"], flop: [], turn: null, river: null,
  folded: Array(6).fill(false), stack: 100, pot: 4, call: 0,
  actions: [{ seatIdx: 0, street: "Preflop", type: "Raise", amountBB: 3 }], shown: {},
};
const APPROX = { key: "approx|r3", kind: "approx" as const, label: "Relance de UTG à 3 bb comptée comme 2,5 bb (taille calculée la plus proche)." };
const FLOP = { key: "flop", kind: "flop" as const, label: "Flop : pas de solveur, conseil maison" };

const openTab = () => {
  fireEvent.click(screen.getByRole("button", { name: /historique/i }));
  fireEvent.mouseDown(screen.getByRole("tab", { name: /à calculer/i }));
  fireEvent.click(screen.getByRole("tab", { name: /à calculer/i }));
};

describe("onglet À calculer", () => {
  beforeEach(() => localStorage.clear());

  it("explique la liste quand elle est vide, et dit que rien n'est envoyé", () => {
    render(<HandHistory onReview={() => {}} />);
    openTab();
    expect(screen.getByText(/aucune lacune/i)).toBeInTheDocument();
    expect(screen.getByText(/rien n'est envoyé/i)).toBeInTheDocument();
  });

  it("liste les lacunes, la plus fréquente d'abord, avec le nombre de mains", () => {
    const h1 = saveHand(hand, { at: 1000 })!;
    const h2 = saveHand(hand, { at: 2000 })!;
    recordGaps([APPROX, FLOP], h1.id, 1000);
    recordGaps([APPROX], h2.id, 2000);
    render(<HandHistory onReview={() => {}} />);
    openTab();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(APPROX.label);
    expect(items[0]).toHaveTextContent("2 mains");
    expect(items[1]).toHaveTextContent("1 main");
  });

  it("Revoir rouvre la dernière main où la lacune est apparue", () => {
    const h1 = saveHand(hand, { at: 1000 })!;
    recordGaps([FLOP], h1.id, 1000);
    const onReview = vi.fn();
    render(<HandHistory onReview={onReview} />);
    openTab();
    fireEvent.click(screen.getByRole("button", { name: /revoir/i }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: h1.id }));
  });

  it("Tout effacer vide la liste après confirmation", () => {
    recordGaps([FLOP], "x", 1000);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HandHistory onReview={() => {}} />);
    openTab();
    fireEvent.click(screen.getByRole("button", { name: /effacer les lacunes/i }));
    expect(loadGaps()).toEqual([]);
  });

  it("propose d'exporter la liste", () => {
    recordGaps([FLOP], "x", 1000);
    render(<HandHistory onReview={() => {}} />);
    openTab();
    expect(screen.getByRole("button", { name: /exporter/i })).toBeInTheDocument();
  });
});
