import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WinnerDialog } from "@/components/WinnerDialog";
import { StacksPanel } from "@/components/StacksPanel";

const labelOf = (s: number) => (s === 3 ? "Toi" : `Siège ${s + 1}`);

describe("fenêtre « Qui a gagné ? »", () => {
  it("un gagnant, le partage, ou ne rien changer", () => {
    const onPick = vi.fn(), onSkip = vi.fn();
    render(<WinnerDialog candidates={[3, 5]} labelOf={labelOf} onPick={onPick} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole("button", { name: "Siège 6" }));
    expect(onPick).toHaveBeenLastCalledWith([5]);
    fireEvent.click(screen.getByRole("button", { name: /partag/i }));
    expect(onPick).toHaveBeenLastCalledWith([3, 5]);
    fireEvent.click(screen.getByRole("button", { name: /ne pas changer/i }));
    expect(onSkip).toHaveBeenCalled();
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
