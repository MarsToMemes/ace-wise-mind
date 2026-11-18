// Note de table : où sont les récréatifs par rapport au héros ?
// Règle (vidéo cash game) : la meilleure table a un récréatif juste à ta droite
// (il parle juste avant toi : tu as la position sur lui à chaque main) ;
// sinon il en faut au moins deux ; une table sans récréatif est à quitter (rake).
// Les sièges sont numérotés dans le sens des aiguilles d'une montre : le siège i+1
// est à gauche du siège i (comme sur la table de l'analyseur : BTN → SB → BB).

import { Counters, familyOf, isRecreational, Family, FAMILY_LABEL } from "@/engines/playerStats";

export type TableGrade = "excellente" | "bonne" | "moyenne" | "quitter" | "inconnue";

export interface SeatInfo { name: string; counters: Counters }

export interface TableAnalysis {
  grade: TableGrade;
  title: string;
  reasons: string[];
  fishSeats: number[];
  bestSeat?: number;      // siège conseillé (juste à gauche du récréatif)
  rightSeat: number;      // siège juste à droite du héros
}

/** Poids d'un récréatif : moins sûr s'il a été vu sur peu de mains. */
const fishWeight = (c: Counters) => (c.hands >= 15 ? 1 : 0.5);

export function analyzeTable(seatCount: number, heroSeat: number, seats: Record<number, SeatInfo | undefined>): TableAnalysis {
  const right = (heroSeat - 1 + seatCount) % seatCount;
  const fam: Record<number, Family> = {};
  for (const [k, v] of Object.entries(seats)) if (v && +k !== heroSeat) fam[+k] = familyOf(v.counters);
  const fishSeats = Object.keys(fam).map(Number).filter(i => isRecreational(fam[i]));
  const known = Object.keys(fam).filter(i => fam[+i] !== "inconnu").length;
  const weight = fishSeats.reduce((s, i) => s + fishWeight(seats[i]!.counters), 0);
  const name = (i: number) => seats[i]?.name ?? `siège ${i + 1}`;
  const reasons: string[] = [];

  if (heroSeat < 0) {
    return { grade: "inconnue", title: "Place ton siège sur la table", reasons: ["Clique ton siège sur la table pour que le site sache qui est à ta droite."], fishSeats, rightSeat: -1 };
  }

  if (fishSeats.includes(right) && fishWeight(seats[right]!.counters) >= 0.5) {
    reasons.push(`${name(right)} (${FAMILY_LABEL[fam[right]].toLowerCase()}) est juste à ta droite : tu parles après lui à chaque main.`);
    reasons.push("C'est contre lui que tu gagnes le plus (4 à 6 fois plus qu'à ta gauche).");
    if (seats[right]!.counters.hands < 15) reasons.push("Profil encore provisoire : confirme-le sur quelques mains de plus.");
    return { grade: "excellente", title: "Excellente table", reasons, fishSeats, rightSeat: right };
  }

  // Siège conseillé : juste à gauche du récréatif le plus sûr
  const bestFish = [...fishSeats].sort((a, b) => seats[b]!.counters.hands - seats[a]!.counters.hands)[0];
  const bestSeat = bestFish !== undefined ? (bestFish + 1) % seatCount : undefined;

  if (weight >= 1.5) {
    reasons.push(`${fishSeats.length} récréatifs à la table : ${fishSeats.map(name).join(", ")}.`);
    if (bestSeat !== undefined && bestSeat !== heroSeat) reasons.push(`Encore mieux : le siège ${bestSeat + 1}, juste à gauche de ${name(bestFish!)}.`);
    return { grade: "bonne", title: "Bonne table", reasons, fishSeats, bestSeat, rightSeat: right };
  }

  if (fishSeats.length) {
    reasons.push(`Un seul récréatif (${name(fishSeats[0])}), et il n'est pas juste à ta droite.`);
    if (bestSeat !== undefined && bestSeat !== heroSeat) reasons.push(`Le meilleur siège serait le ${bestSeat + 1}, juste à sa gauche : change de place s'il se libère.`);
    return { grade: "moyenne", title: "Table moyenne", reasons, fishSeats, bestSeat, rightSeat: right };
  }

  if (known >= Math.ceil((seatCount - 1) / 2)) {
    reasons.push("Aucun récréatif repéré : que des réguliers.");
    reasons.push("Même si tu es meilleur qu'eux, le rake te rend perdant à long terme. Cherche une autre table.");
    return { grade: "quitter", title: "Table à quitter", reasons, fishSeats, rightSeat: right };
  }

  reasons.push("Pas encore assez de joueurs connus pour juger la table : ajoute les pseudos et quelques mains.");
  return { grade: "inconnue", title: "Table à évaluer", reasons, fishSeats, rightSeat: right };
}
