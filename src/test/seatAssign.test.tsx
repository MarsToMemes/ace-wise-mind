import { describe, it, expect, beforeEach } from "vitest";
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
    fireEvent.change(screen.getByLabelText(/Siège 5/), { target: { value: paul.id } });
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
