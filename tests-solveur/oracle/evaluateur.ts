// A1 — Évaluateur de mains de l'arbitre, écrit pour être relu, pas pour être rapide : les 21 combinaisons de 5 cartes
// parmi 7 sont notées, la meilleure l'emporte. Indépendant de src/ (aucun import du site).
// Note d'une main de 5 cartes : [catégorie, départages…] comparés dans l'ordre, puis codés en un seul nombre.

const RANKS = "23456789TJQKA";
export const rankOf = (card: string) => RANKS.indexOf(card[0]) + 2;   // 2..14
export const suitOf = (card: string) => card[1];

export const CATEGORIES = ["hauteur", "paire", "deux paires", "brelan", "quinte", "couleur", "full", "carré", "quinte flush"];

/** Note d'une main de exactement 5 cartes ; plus grand = meilleur. */
export function score5(cards: string[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every(x => suitOf(x) === suitOf(cards[0]));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === "14,5,4,3,2") straightHigh = 5;      // la roue A-2-3-4-5
  }
  // groupes : (nombre, hauteur), du plus fréquent au moins fréquent puis du plus haut au plus bas
  const groups = uniq.map(r => [ranks.filter(x => x === r).length, r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const counts = groups.map(g => g[0]).join("");
  let cat: number, keys: number[];
  if (straightHigh && flush) { cat = 8; keys = [straightHigh]; }
  else if (counts === "41") { cat = 7; keys = groups.map(g => g[1]); }
  else if (counts === "32") { cat = 6; keys = groups.map(g => g[1]); }
  else if (flush) { cat = 5; keys = ranks; }
  else if (straightHigh) { cat = 4; keys = [straightHigh]; }
  else if (counts === "311") { cat = 3; keys = groups.map(g => g[1]); }
  else if (counts === "221") { cat = 2; keys = groups.map(g => g[1]); }
  else if (counts === "2111") { cat = 1; keys = groups.map(g => g[1]); }
  else { cat = 0; keys = ranks; }
  let v = cat;
  for (let k = 0; k < 5; k++) v = v * 15 + (keys[k] ?? 0);
  return v;
}

/** Meilleure note parmi toutes les mains de 5 cartes tirées de `cards` (5 à 7 cartes). */
export function best(cards: string[]): number {
  let top = -1;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    // on retire 2 cartes (7 cartes) ; avec 6 cartes, b parcourt une carte « fantôme » ; avec 5, une seule main
    const rest = cards.filter((_, k) => k !== a && k !== b);
    if (rest.length === 5) top = Math.max(top, score5(rest));
  }
  if (n === 6) for (let a = 0; a < n; a++) top = Math.max(top, score5(cards.filter((_, k) => k !== a)));
  if (n === 5) top = score5(cards);
  return top;
}

export const categoryOfScore = (v: number) => Math.floor(v / 15 ** 5);
