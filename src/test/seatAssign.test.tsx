import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { upsertPlayer, setMyTable, getSeatPlayers, setSeatPlayers, assignSeat, duplicateSeats, creditableSeats } from "@/lib/playersStore";
import { MyTablePanel } from "@/components/MyTablePanel";

describe("un joueur n'occupe qu'un siège", () => {
  beforeEach(() => localStorage.clear());

  it("placer un joueur sur un autre siège le retire de l'ancien", () => {
    const paul = upsertPlayer("Paul");
    assignSeat(1, paul.id);
    assignSeat(3, paul.id);
    expect(getSeatPlayers()).toEqual({ 3: paul.id });
  });

  it("vider un siège ne touche pas aux autres", () => {
    const paul = upsertPlayer("Paul"), lea = upsertPlayer("Léa");
    assignSeat(1, paul.id);
    assignSeat(2, lea.id);
    assignSeat(1, null);
    expect(getSeatPlayers()).toEqual({ 2: lea.id });
  });

  it("repère un joueur placé sur deux sièges (anciennes données)", () => {
    const paul = upsertPlayer("Paul"), lea = upsertPlayer("Léa");
    expect(duplicateSeats({ 1: paul.id, 2: lea.id, 4: paul.id })).toEqual({ [paul.id]: [1, 4] });
  });

  it("les stats ne sont jamais créditées à un joueur sur deux sièges, ni sur ton siège", () => {
    const paul = upsertPlayer("Paul"), lea = upsertPlayer("Léa"), max = upsertPlayer("Max");
    expect(creditableSeats({ 0: max.id, 1: paul.id, 2: lea.id, 4: paul.id }, 0)).toEqual({ 2: lea.id });
  });
});

describe("panneau Ma table : association des sièges", () => {
  beforeEach(() => localStorage.clear());
  const labels = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

  it("choisir un joueur déjà placé le déplace au lieu de le dupliquer", () => {
    const paul = upsertPlayer("Paul");
    setMyTable([paul.id]);
    setSeatPlayers({ 1: paul.id });
    render(<MyTablePanel seatLabels={labels} heroSeat={3} />);
    fireEvent.change(screen.getByLabelText(/Siège 5 /), { target: { value: paul.id } }); // à ta gauche = siège interne 4
    expect(getSeatPlayers()).toEqual({ 4: paul.id });
  });

  it("signale un joueur placé sur deux sièges", () => {
    const paul = upsertPlayer("Paul");
    setMyTable([paul.id]);
    setSeatPlayers({ 1: paul.id, 4: paul.id });
    render(<MyTablePanel seatLabels={labels} heroSeat={3} />);
    expect(screen.getByText(/Paul est sur deux sièges/)).toBeInTheDocument();
  });
});

describe("panneau Ma table : numéros de sièges fixes et changement de table", () => {
  beforeEach(() => localStorage.clear());

  it("liste les sièges 1 à 6 comme sur Betclic (toi au 4, absent de la liste), avec gauche et droite", () => {
    const paul = upsertPlayer("Paul");
    setMyTable([paul.id]);
    // 6 joueurs, tu es au siège interne 3, le bouton au siège interne 0
    render(<MyTablePanel seatLabels={["BTN", "SB", "BB", "UTG", "MP", "CO"]} heroSeat={3} />);
    const labels = screen.getAllByText(/^Siège \d/).map(e => e.textContent);
    expect(labels).toEqual(["Siège 1 · BTN", "Siège 2 · SB", "Siège 3 · BB (à ta droite)", "Siège 5 · MP (à ta gauche)", "Siège 6 · CO"]);
  });

  it("changer de table enlève aussi le bouton et ta place", () => {
    const paul = upsertPlayer("Paul");
    setMyTable([paul.id]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChangeTable = vi.fn();
    render(<MyTablePanel seatLabels={["BTN", "SB", "BB", "UTG", "MP", "CO"]} heroSeat={3} onChangeTable={onChangeTable} />);
    fireEvent.click(screen.getByRole("button", { name: "Changer de table" }));
    expect(onChangeTable).toHaveBeenCalledTimes(1);
  });
});
