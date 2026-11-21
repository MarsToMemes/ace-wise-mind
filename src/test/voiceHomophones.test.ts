import { describe, it, expect } from "vitest";
import { interpretVoice, corrigerDictee, meilleureVersion, type VoiceTable } from "@/lib/voiceInput";

// Table 6 places, bouton au siège 0 = toi : 0 BTN, 1 SB, 2 BB, 3 UTG, 4 MP, 5 CO
const base = (over: Partial<VoiceTable> = {}): VoiceTable => ({
  size: 6, dealerIdx: 0, userIdx: 0, actions: [], board: [], hole: [], folded: Array(6).fill(false),
  stack: 100, blinds: true, startPot: 0, ...over,
});
// main arrivée au flop : bouton relance, big paye
const auFlop = () => {
  const r = interpretVoice(base(), "fold fold fold, je relance 2,5, small fold, big call");
  return base({ actions: r.actions, folded: [false, true, false, true, true, true] });
};
const holeOf = (s: string) => interpretVoice(base(), s).hole;

describe("saisie vocale : mots mal entendus par le navigateur", () => {
  it("« vallée » est compris comme valet", () => {
    expect(holeOf("j'ai vallée de pique, valet euh de cœur")).toEqual(["Js", "Jh"]);
    expect(corrigerDictee("j'ai un vallée de pique")).toBe("j'ai un valet de pique");
  });

  it("les cartes entendues comme des mots courants, quand une couleur suit", () => {
    expect(holeOf("j'ai cette de cœur, dis de trèfle")).toEqual(["7h", "Tc"]);
    expect(holeOf("j'ai si de pique, saint de carreau")).toEqual(["6s", "5d"]);
    expect(holeOf("j'ai d'âme de pique, rois de cœur")).toEqual(["Qs", "Kh"]);
    expect(holeOf("j'ai de de pique, cat de trèfle")).toEqual(["2s", "4c"]);
    expect(holeOf("j'ai as de pique, à de cœur")).toEqual(["As", "Ah"]);
  });

  it("les couleurs mal écrites : pic, chœur, carreaux, trèfles", () => {
    const r = interpretVoice(auFlop(), "flop roi de pic, dame de chœur, 7 de carreaux");
    expect(r.board).toEqual(["Ks", "Qh", "7d"]);
  });

  it("les mots courants ne deviennent pas des cartes sans couleur derrière", () => {
    expect(corrigerDictee("si le cutoff relance, cette fois je suis")).toBe("si le cutoff relance, cette fois je suis");
  });

  it("les actions mal écrites : chèque, bête, Tapie, bébé", () => {
    const t = auFlop();
    const flop = interpretVoice(t, "flop as de pique roi de pique 2 de cœur");
    const t2 = { ...t, board: flop.board! };
    expect(interpretVoice(t2, "bébé chèque, je bête 3").actions.map(a => `${a.seatIdx}:${a.type}`)).toEqual(["2:Check", "0:Bet"]);
    expect(interpretVoice(base(), "cutoff Tapie").actions.pop()?.type).toBe("Raise");
    expect(interpretVoice(base(), "cutoff trois bêtes à 8").actions.pop()).toMatchObject({ seatIdx: 5, type: "Raise", amountBB: 8 });
  });

  it("le texte écrit dans la barre est corrigé avec les bons mots", () => {
    expect(corrigerDictee("Flop vallée de pique, cette de chœur, dis de trèfles"))
      .toBe("Flop valet de pique, sept de cœur, dix de trèfle");
  });

  it("parmi les versions proposées par le navigateur, garde celle qui se comprend le mieux", () => {
    const t = base();
    expect(meilleureVersion(t, "", ["cutoff relance à deux et demi", "patate relance à deux et demi"])).toBe(0);
    expect(meilleureVersion(t, "", ["cut of relent sa", "cutoff relance à deux et demi"])).toBe(1);
    // à égalité, la première (la plus sûre pour le navigateur) gagne
    expect(meilleureVersion(t, "", ["cutoff call", "cutoff calle"])).toBe(0);
  });
});
