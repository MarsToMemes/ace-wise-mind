import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VoiceInput } from "@/components/VoiceInput";
import type { VoiceTable } from "@/lib/voiceInput";

// Fausse reconnaissance vocale du navigateur : on pilote ce qu'elle « entend ».
class FakeRec {
  static last: FakeRec | null = null;
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
  onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  constructor() { FakeRec.last = this; }
  start() { this.started = true; }
  stop() { this.started = false; this.onend?.(); }
  say(text: string, isFinal = true) { this.onresult?.({ results: [{ isFinal, 0: { transcript: text } }] }); }
  /** Plusieurs versions de la même phrase, la première étant la plus sûre pour le navigateur. */
  sayAlts(texts: string[]) {
    const r: Record<string, unknown> = { isFinal: true, length: texts.length };
    texts.forEach((t, i) => { r[i] = { transcript: t }; });
    this.onresult?.({ results: [r as never] });
  }
}

const table: VoiceTable = {
  size: 6, dealerIdx: 0, userIdx: 0, actions: [], board: [], hole: [], folded: Array(6).fill(false),
  stack: 100, blinds: true, startPot: 0,
};

afterEach(() => { delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition; FakeRec.last = null; });

describe("saisie vocale : petit micro dans la barre de saisie", () => {
  it("un clic lance la dictée, la phrase s'écrit dans la barre, un second clic l'arrête sans rien envoyer", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    const apply = vi.fn();
    render(<VoiceInput table={table} onApply={apply} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const mic = screen.getByRole("button", { name: "Dicter dans la barre" });
    const input = screen.getByLabelText("Écrire les actions") as HTMLInputElement;

    fireEvent.click(mic);
    expect(FakeRec.last?.started).toBe(true);
    expect(FakeRec.last?.lang).toBe("fr-FR");
    expect(mic.getAttribute("aria-pressed")).toBe("true");

    act(() => FakeRec.last!.say("cutoff relance à 2,5"));
    expect(input.value).toBe("cutoff relance à 2,5");
    // aperçu de ce qui est compris pendant qu'on parle
    expect(screen.getByText("Relance 2,5")).toBeTruthy();

    fireEvent.click(mic);
    expect(mic.getAttribute("aria-pressed")).toBe("false");
    expect(input.value).toBe("cutoff relance à 2,5");
    expect(apply).not.toHaveBeenCalled();

    // Entrée envoie
    fireEvent.submit(input.closest("form")!);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("la dictée s'ajoute à ce qui est déjà écrit", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    render(<VoiceInput table={table} onApply={() => {}} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const input = screen.getByLabelText("Écrire les actions") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "UTG fold," } });
    fireEvent.click(screen.getByRole("button", { name: "Dicter dans la barre" }));
    act(() => FakeRec.last!.say("MP fold"));
    expect(input.value).toBe("UTG fold, MP fold");
  });

  it("sans reconnaissance vocale, le micro explique quoi faire", () => {
    render(<VoiceInput table={table} onApply={() => {}} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dicter dans la barre" }));
    expect(screen.getByText(/Chrome, Edge ou Safari/)).toBeTruthy();
  });
});

describe("saisie vocale : gros micro en clic / reclic", () => {
  it("un clic ouvre le micro, il reste ouvert, un second clic inscrit les actions", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    const apply = vi.fn();
    render(<VoiceInput table={table} onApply={apply} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const mic = screen.getByRole("button", { name: /clique pour parler, reclique pour finir/ });

    fireEvent.click(mic);
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    expect(FakeRec.last?.started).toBe(true);
    act(() => FakeRec.last!.say("cutoff relance à 2,5"));
    expect(apply).not.toHaveBeenCalled();
    expect(mic.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(mic);
    expect(mic.getAttribute("aria-pressed")).toBe("false");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0].actions.map((a: { seatIdx: number; type: string }) => `${a.seatIdx}:${a.type}`)).toEqual(["3:Fold", "4:Fold", "5:Raise"]);
  });

  it("si le navigateur coupe après un silence, le micro se relance sans perdre ce qui a été dit", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    const apply = vi.fn();
    render(<VoiceInput table={table} onApply={apply} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const mic = screen.getByRole("button", { name: /clique pour parler, reclique pour finir/ });
    fireEvent.click(mic);
    const first = FakeRec.last!;
    act(() => first.say("UTG fold"));
    act(() => first.onend?.()); // coupure du navigateur
    expect(FakeRec.last).not.toBe(first);
    expect(FakeRec.last?.started).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    act(() => FakeRec.last!.say("MP fold"));
    fireEvent.click(mic);
    expect(apply.mock.calls[0][0].actions.map((a: { seatIdx: number; type: string }) => `${a.seatIdx}:${a.type}`)).toEqual(["3:Fold", "4:Fold"]);
  });

  it("la barre espace ouvre puis ferme le micro", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    render(<VoiceInput table={table} onApply={() => {}} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const mic = screen.getByRole("button", { name: /clique pour parler, reclique pour finir/ });
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyUp(window, { code: "Space" });
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(window, { code: "Space" });
    expect(mic.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("saisie vocale : mots mal entendus", () => {
  it("la barre affiche « valet » et non « vallée »", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    render(<VoiceInput table={table} onApply={() => {}} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const input = screen.getByLabelText("Écrire les actions") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Dicter dans la barre" }));
    act(() => FakeRec.last!.say("j'ai vallée de pique, cette de cœur"));
    expect(input.value).toBe("j'ai valet de pique, sept de cœur");
  });

  it("le gros micro demande plusieurs versions et garde celle qui se comprend", () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRec;
    const apply = vi.fn();
    render(<VoiceInput table={table} onApply={apply} onUndo={() => {}} canUndo={false} onNewHand={() => {}} />);
    const mic = screen.getByRole("button", { name: /clique pour parler, reclique pour finir/ });
    fireEvent.click(mic);
    expect(FakeRec.last!.maxAlternatives).toBeGreaterThan(1);
    act(() => FakeRec.last!.sayAlts(["cut of relent sa", "cutoff relance à deux et demi"]));
    expect(screen.getByText(/cutoff relance à deux et demi/)).toBeTruthy();
    fireEvent.click(mic);
    expect(apply.mock.calls[0][0].actions.map((a: { seatIdx: number; type: string }) => `${a.seatIdx}:${a.type}`)).toEqual(["3:Fold", "4:Fold", "5:Raise"]);
  });
});
