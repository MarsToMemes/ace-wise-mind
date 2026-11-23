import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WinnerDialog } from "@/components/WinnerDialog";
import { StacksPanel } from "@/components/StacksPanel";

const labelOf = (s: number) => (s === 3 ? "Toi" : `Siège ${s + 1}`);

describe("fenêtre « Qui a gagné ? »", () => {
  it("un seul pot : un clic sur le gagnant suffit ; partage et « ne rien changer » restent possibles", () => {
    const onPick = vi.fn(), onSkip = vi.fn();
    render(<WinnerDialog pots={[{ pot: 0, amount: 5.5, eligible: [3, 5], main: true }]} labelOf={labelOf} onPick={onPick} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Siège 6" }));
    expect(onPick).toHaveBeenLastCalledWith({ 0: [5] });
    fireEvent.click(screen.getByRole("button", { name: /partag/i }));
    expect(onPick).toHaveBeenLastCalledWith({ 0: [3, 5] });
    fireEvent.click(screen.getByRole("button", { name: /ne pas changer/i }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("pot principal et pot annexe : un gagnant par pot, puis valider", () => {
    const onPick = vi.fn();
    render(<WinnerDialog pots={[{ pot: 0, amount: 90, eligible: [0, 1, 2], main: true }, { pot: 1, amount: 100, eligible: [1, 2], main: false }]}
      labelOf={labelOf} onPick={onPick} onSkip={() => {}} />);
    expect(screen.getByText(/Pot principal · 90 bb/)).toBeInTheDocument();
    expect(screen.getByText(/Pot annexe · 100 bb/)).toBeInTheDocument();
    const valider = screen.getByRole("button", { name: /valider/i });
    expect(valider).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Siège 1" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Siège 2" })[1]);
    fireEvent.click(valider);
    expect(onPick).toHaveBeenLastCalledWith({ 0: [0], 1: [1] });
  });
});

describe("panneau « Tapis des joueurs »", () => {
  const stacks = [100, 80, 100, 120, 100, 45];
  it("liste les sièges dans l'ordre vu de ta place et corrige un tapis", () => {
    const onChange = vi.fn();
    render(<StacksPanel stacks={stacks} order={[0, 1, 2, 3, 4, 5]} labelOf={labelOf} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Tapis des joueurs/));
    fireEvent.change(screen.getByLabelText("Siège 6"), { target: { value: "60" } });
    expect(onChange).toHaveBeenLastCalledWith([100, 80, 100, 120, 100, 60]);
  });
  it("remet tout le monde à 100 bb", () => {
    const onChange = vi.fn();
    render(<StacksPanel stacks={stacks} order={[0, 1, 2, 3, 4, 5]} labelOf={labelOf} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Tapis des joueurs/));
    fireEvent.click(screen.getByRole("button", { name: /tous à 100/i }));
    expect(onChange).toHaveBeenLastCalledWith(Array(6).fill(100));
  });
});
