// Flop texture classification (computed from the cards, no lookup tables).
import { rankValue } from "@/engines/handEval7";

export type BoardHeight = "A-high" | "KQ-high" | "middle" | "low";
export type BoardPairing = "unpaired" | "paired" | "trips";
export type BoardSuits = "rainbow" | "two-tone" | "monotone";

export interface BoardTexture {
  height: BoardHeight;
  pairing: BoardPairing;
  suits: BoardSuits;
  /** Number of 5-rank windows holding 3+ distinct board ranks (straights makeable with 2 hole cards). */
  straightsPossible: number;
  dynamic: boolean;
  tags: string[];
}

export function analyzeBoard(board: string[]): BoardTexture {
  const flop = board.slice(0, 3);
  const vals = flop.map(rankValue);
  const top = Math.max(...vals);
  const height: BoardHeight = top === 14 ? "A-high" : top >= 12 ? "KQ-high" : top >= 9 ? "middle" : "low";

  const distinct = [...new Set(vals)];
  const pairing: BoardPairing = distinct.length === 1 ? "trips" : distinct.length === 2 ? "paired" : "unpaired";

  const suitCount = new Map<string, number>();
  flop.forEach(c => suitCount.set(c[1], (suitCount.get(c[1]) ?? 0) + 1));
  const maxSuit = Math.max(...suitCount.values());
  const suits: BoardSuits = maxSuit === 3 ? "monotone" : maxSuit === 2 ? "two-tone" : "rainbow";

  // Ace also plays low for the wheel window (A-5).
  const present = new Set(distinct);
  if (present.has(14)) present.add(1);
  let straightsPossible = 0;
  for (let low = 1; low <= 10; low++) {
    let n = 0;
    for (let r = low; r < low + 5; r++) if (present.has(r)) n++;
    if (n >= 3) straightsPossible++;
  }

  const dynamic =
    suits === "monotone" ||
    straightsPossible >= 2 ||
    (suits === "two-tone" && straightsPossible >= 1);

  const tags = [
    { "A-high": "As haut", "KQ-high": "K/Q haut", middle: "Board médian", low: "Board bas" }[height],
    { unpaired: "Non pairé", paired: "Pairé", trips: "Brelan au board" }[pairing],
    { rainbow: "Arc-en-ciel", "two-tone": "Bicolore (tirage couleur)", monotone: "Monocolore" }[suits],
    straightsPossible >= 2 ? "Très connecté" : straightsPossible === 1 ? "Connecté" : "Déconnecté",
    dynamic ? "Dynamique" : "Statique",
  ];

  return { height, pairing, suits, straightsPossible, dynamic, tags };
}
