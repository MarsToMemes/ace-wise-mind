import { describe, it, expect } from "vitest";
import { interpretVoice, type VoiceTable } from "@/lib/voiceInput";
import { trackPot } from "@/lib/potTracker";
import type { PlayerAction } from "@/components/ActionMenu";

// Table 6 places, bouton au siège 0 = toi : 0 BTN, 1 SB, 2 BB, 3 UTG, 4 MP, 5 CO
const base = (over: Partial<VoiceTable> = {}): VoiceTable => ({
  size: 6, dealerIdx: 0, userIdx: 0, actions: [], board: [], hole: [], folded: Array(6).fill(false),
  stack: 100, blinds: true, startPot: 0, ...over,
});
const short = (a: PlayerAction[]) => a.map(x => `${x.seatIdx}:${x.type}${x.amountBB ? " " + x.amountBB : ""}`);

/** Joue plusieurs dictées à la suite en appliquant ce qui est compris, comme le fera la page. */
const play = (lines: string[], t = base()) => {
  for (const line of lines) {
    const r = interpretVoice(t, line);
    t = {
      ...t,
      actions: [...t.actions, ...r.actions],
      board: r.board ?? t.board,
      hole: r.hole ?? t.hole,
      folded: t.folded.map((f, i) => f || r.actions.some(a => a.seatIdx === i && a.type === "Fold")),
    };
  }
  return t;
};

describe("saisie vocale : comprendre une phrase de poker", () => {
  it("préflop dicté sans nommer les joueurs sautés : UTG et MP déduits couchés", () => {
    const r = interpretVoice(base(), "cutoff relance à deux et demi");
    expect(short(r.actions)).toEqual(["3:Fold", "4:Fold", "5:Raise 2.5"]);
    expect(r.entries.filter(e => e.deduced).length).toBe(2);
    expect(r.next).toBe(0); // à toi
  });

  it("une main complète dictée donne les bonnes actions et le bon pot (32 bb au turn)", () => {
    const t = play([
      "J'ai dame de pique, dame de carreau",
      "UTG fold, MP fold, cutoff relance à 2,5",
      "moi je suis, small se couche, big call",
      "flop roi de cœur, sept de trèfle, deux de pique",
      "big parole, cutoff mise 4, moi je relance à 12",
      "big se couche, cutoff call",
    ]);
    expect(t.hole).toEqual(["Qs", "Qd"]);
    expect(t.board).toEqual(["Kh", "7c", "2s"]);
    expect(short(t.actions.filter(a => a.street === "Flop"))).toEqual(["2:Check", "5:Bet 4", "0:Raise 12", "2:Fold", "5:Call 8"]);
    expect(trackPot(t.actions, { blinds: { sbIdx: 1, bbIdx: 2 } }, "Turn").pot).toBe(32);
  });

  it("call : le montant est ce qu'il reste à payer (comme le menu de la table)", () => {
    const r = interpretVoice(base(), "cutoff relance 2,5, je suis, small fold, big paye");
    expect(short(r.actions)).toEqual(["3:Fold", "4:Fold", "5:Raise 2.5", "0:Call 2.5", "1:Fold", "2:Call 1.5"]);
  });

  it("refuse une parole face à une relance, sans rien enregistrer pour ce joueur", () => {
    const r = interpretVoice(base(), "cutoff relance 2,5, moi je suis, big parole");
    const err = r.entries.find(e => e.level === "err");
    expect(err?.note).toMatch(/ne peut pas checker/);
    expect(r.actions.some(a => a.seatIdx === 2)).toBe(false);
  });

  it("ne devine jamais ton action à toi", () => {
    const r = interpretVoice(base(), "cutoff relance 2,5, big call");
    expect(r.actions.some(a => a.seatIdx === 0)).toBe(false);
    expect(r.entries.some(e => e.level === "err" && /toi/.test(e.note ?? ""))).toBe(true);
  });

  it("tailles : 3 fois, deux tiers du pot, tapis", () => {
    expect(short(interpretVoice(base(), "fold fold relance 3 fois").actions)).toEqual(["3:Fold", "4:Fold", "5:Raise 3"]);
    expect(short(interpretVoice(base(), "cutoff tapis").actions).pop()).toBe("5:Raise 100");
    const t = play(["fold fold fold, je relance 2,5, fold, big call", "flop as de pique roi de pique 2 de cœur", "big check"]);
    const r = interpretVoice(t, "je mise deux tiers du pot");
    expect(short(r.actions)).toEqual(["0:Bet 3.7"]);
  });

  it("raccourci « tout le monde se couche jusqu'au cutoff »", () => {
    const r = interpretVoice(base(), "tout le monde se couche jusqu'au cutoff, cutoff relance 2,5, je 3-bet à 8");
    expect(short(r.actions)).toEqual(["3:Fold", "4:Fold", "5:Raise 2.5", "0:Raise 8"]);
  });

  it("cartes : il faut les couleurs, et une carte ne peut pas servir deux fois", () => {
    const r1 = interpretVoice(base(), "flop roi sept deux");
    expect(r1.board).toBeUndefined();
    expect(r1.entries[0].level).toBe("err");
    const t = play(["j'ai as de pique roi de pique", "fold fold fold, je relance 2,5, fold, big call"]);
    const r2 = interpretVoice(t, "flop as de pique, 7 de trèfle, 2 de cœur");
    expect(r2.board).toBeUndefined();
    expect(r2.entries[0].note).toMatch(/déjà/);
  });

  it("le turn avant le flop est refusé", () => {
    const r = interpretVoice(base(), "turn as de pique");
    expect(r.board).toBeUndefined();
    expect(r.entries[0].level).toBe("err");
  });

  it("annule et nouvelle main sont des commandes", () => {
    expect(interpretVoice(base(), "annule").undo).toBe(true);
    expect(interpretVoice(base(), "nouvelle main").newHand).toBe(true);
  });

  it("mots inconnus signalés, le reste est compris", () => {
    const r = interpretVoice(base(), "patate cutoff call");
    expect(r.entries[0]).toMatchObject({ level: "err", note: "pas compris" });
    expect(short(r.actions).pop()).toBe("5:Call 1");
  });

  it("table 9 places : hijack et UTG+1 sont reconnus", () => {
    // 0 BTN, 1 SB, 2 BB, 3 UTG, 4 UTG+1, 5 UTG+2, 6 LJ, 7 HJ, 8 CO
    const t = base({ size: 9, folded: Array(9).fill(false) });
    expect(short(interpretVoice(t, "UTG plus un relance 2,5").actions)).toEqual(["3:Fold", "4:Raise 2.5"]);
    expect(short(interpretVoice(t, "hijack relance 2,5").actions).pop()).toBe("7:Raise 2.5");
  });

  it("tête-à-tête : le bouton parle d'abord au préflop, la big d'abord au flop", () => {
    // 0 BTN (petite blinde), 1 BB ; toi = BB
    const t = base({ size: 2, userIdx: 1, folded: [false, false] });
    const r = interpretVoice(t, "bouton relance 2,5, je suis");
    expect(short(r.actions)).toEqual(["0:Raise 2.5", "1:Call 1.5"]);
    const t2 = play(["bouton relance 2,5, je suis", "flop as de pique roi de pique 2 de cœur"], t);
    expect(interpretVoice(t2, "").next).toBe(1);
  });

  it("reprend une main déjà commencée à la souris", () => {
    const t = base({ actions: [{ seatIdx: 3, street: "Preflop", type: "Raise", amountBB: 2.5 }], folded: Array(6).fill(false) });
    const r = interpretVoice(t, "MP fold, cutoff 3-bet à 8");
    expect(short(r.actions)).toEqual(["4:Fold", "5:Raise 8"]);
  });
});
