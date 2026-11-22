import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { HandHistory } from "@/components/HandHistory";
import { saveHand, loadHands, type HandSnapshot } from "@/lib/handHistory";

const base: HandSnapshot = {
  tableSize: 6, dealerIdx: 3, userIdx: 3, hole: ["As", "Kd"], flop: [], turn: null, river: null,
  folded: Array(6).fill(false), stack: 100, pot: 10, call: 0,
  actions: [{ seatIdx: 0, street: "Preflop", type: "Raise", amountBB: 2.5 }, { seatIdx: 3, street: "Preflop", type: "Raise", amountBB: 7.5 }],
  shown: {},
};

const open = () => fireEvent.click(screen.getByRole("button", { name: /historique/i }));

describe("panneau Historique", () => {
  beforeEach(() => localStorage.clear());

  it("explique comment remplir l'historique quand il est vide", () => {
    render(<HandHistory onReview={() => {}} />);
    open();
    expect(screen.getByText(/aucune main/i)).toBeInTheDocument();
  });

  it("liste les mains avec la position, les cartes et la ligne", () => {
    saveHand(base, { at: 1000 });
    saveHand({ ...base, userIdx: 5, hole: ["7h", "7c"], actions: [] }, { at: 2000 });
    render(<HandHistory onReview={() => {}} />);
    open();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("BB")).toBeInTheDocument();
    expect(within(items[1]).getByText("BTN")).toBeInTheDocument();
    expect(within(items[1]).getByLabelText("A♠")).toBeInTheDocument();
    expect(within(items[1]).getByText("UTG relance 2,5 · Toi relance 7,5")).toBeInTheDocument();
  });

  it("filtre par position", () => {
    saveHand(base, { at: 1000 });
    saveHand({ ...base, userIdx: 5 }, { at: 2000 });
    render(<HandHistory onReview={() => {}} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "BTN" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("« Revoir » renvoie la main à l'analyseur et ferme le panneau", () => {
    const saved = saveHand(base, { at: 1000 })!;
    const onReview = vi.fn();
    render(<HandHistory onReview={onReview} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: /revoir/i }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id, hole: ["As", "Kd"] }));
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("supprime une main", () => {
    saveHand(base, { at: 1000 });
    saveHand(base, { at: 2000 });
    render(<HandHistory onReview={() => {}} />);
    open();
    fireEvent.click(screen.getAllByRole("button", { name: /supprimer/i })[0]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(loadHands()).toHaveLength(1);
  });

  it("« Tout effacer » demande confirmation", () => {
    saveHand(base, { at: 1000 });
    render(<HandHistory onReview={() => {}} />);
    open();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: /tout effacer/i }));
    expect(loadHands()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /tout effacer/i }));
    expect(loadHands()).toHaveLength(0);
    confirm.mockRestore();
  });

  it("se met à jour quand une main est enregistrée pendant qu'il est ouvert", () => {
    render(<HandHistory onReview={() => {}} />);
    open();
    act(() => { saveHand(base, { at: 1000 }); });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
