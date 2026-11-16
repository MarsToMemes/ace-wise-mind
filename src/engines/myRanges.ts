// "Mes ranges" — ranges saisies par l'utilisateur, gardées dans son navigateur
// (localStorage), jamais dans le code. Format : { "AKs": 1, "AKo": 0.5, ... }
// où la valeur est le poids (0..1) de la main dans la range.

export type RangeWeights = Record<string, number>;

export const RANK_ORDER = "AKQJT98765432"; // index 0 = As
const idx = (r: string) => RANK_ORDER.indexOf(r);

/** Les 169 mains, dans l'ordre de la grille 13×13 (ligne i, colonne j). */
export const ALL_HANDS: string[] = (() => {
  const out: string[] = [];
  for (let i = 0; i < 13; i++)
    for (let j = 0; j < 13; j++) {
      const a = RANK_ORDER[i], b = RANK_ORDER[j];
      out.push(i === j ? a + b : i < j ? a + b + "s" : b + a + "o");
    }
  return out;
})();

export const handCombos = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);

export function countCombos(r: RangeWeights): number {
  let n = 0;
  for (const [h, w] of Object.entries(r)) n += handCombos(h) * w;
  return Math.round(n * 100) / 100;
}

const TOKEN =
  /^([AKQJT2-9])([AKQJT2-9])([so])?(\+)?(?:-([AKQJT2-9])([AKQJT2-9])([so])?)?(?::(\d+(?:\.\d+)?))?$/;

function expandToken(raw: string): { hands: string[]; weight: number } | null {
  const t = raw.trim();
  if (!t) return null;
  const norm = t.toUpperCase().replace(/([AKQJT2-9]{2})([SO])/g, (_, r, x) => r + x.toLowerCase());
  const m = norm.match(TOKEN);
  if (!m) return null;
  let [, a, b, suit, plus, ea, eb, , wRaw] = m;
  if (idx(a) > idx(b)) [a, b] = [b, a]; // high card first
  let weight = wRaw ? parseFloat(wRaw) : 1;
  if (weight > 1) weight /= 100;
  weight = Math.max(0, Math.min(1, weight));

  const hands: string[] = [];
  const kinds = (x: string, y: string) =>
    x === y ? [x + y] : suit ? [x + y + suit] : [x + y + "s", x + y + "o"];

  if (a === b) {
    // pairs
    let lo = idx(a), hi = idx(a); // remember: smaller index = higher rank
    if (plus) hi = 0;
    if (ea && eb && ea === eb) { const k = idx(ea); lo = Math.max(lo, k); hi = Math.min(hi, k); }
    for (let k = hi; k <= lo; k++) hands.push(RANK_ORDER[k] + RANK_ORDER[k]);
    return { hands, weight };
  }

  let from = idx(b), to = idx(b); // kicker indexes
  if (plus) to = idx(a) + 1;
  if (ea && eb) {
    let [x, y] = idx(ea) > idx(eb) ? [eb, ea] : [ea, eb];
    if (x !== a) return null;
    const k = idx(y);
    from = Math.max(idx(b), k); to = Math.min(idx(b), k);
  }
  for (let k = Math.min(from, to); k <= Math.max(from, to); k++) {
    if (k <= idx(a)) continue;
    hands.push(...kinds(a, RANK_ORDER[k]));
  }
  return { hands, weight };
}

/** Lit un texte du type "22+, A2s+, KTo+, AK, 77-55, AKo:50". Les morceaux illisibles sont ignorés. */
export function parseRangeText(text: string): RangeWeights {
  const out: RangeWeights = {};
  for (const tok of text.split(/[,\s;]+/)) {
    const e = expandToken(tok);
    if (!e) continue;
    for (const h of e.hands) {
      if (e.weight > 0) out[h] = e.weight;
      else delete out[h];
    }
  }
  return out;
}

export function rangeToText(r: RangeWeights): string {
  return ALL_HANDS.filter(h => (r[h] ?? 0) > 0)
    .map(h => (r[h] >= 1 ? h : `${h}:${Math.round(r[h] * 100)}`))
    .join(", ");
}

// ---------- stockage ----------
const KEY = "ace:myRanges:v1";

export function loadMyRanges(): Record<string, RangeWeights> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, RangeWeights>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("ace:myRanges"));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function saveMyRange(slot: string, r: RangeWeights) {
  const all = loadMyRanges();
  all[slot] = r;
  saveAll(all);
}

export function clearMyRange(slot: string) {
  const all = loadMyRanges();
  delete all[slot];
  saveAll(all);
}

export function exportMyRanges(): string {
  return JSON.stringify({ format: "ace-my-ranges", version: 1, ranges: loadMyRanges() }, null, 2);
}

/** Importe un export ; renvoie le nombre de situations importées (0 si fichier invalide). */
export function importMyRanges(json: string): number {
  try {
    const data = JSON.parse(json);
    const ranges = data?.ranges;
    if (!ranges || typeof ranges !== "object") return 0;
    const all = loadMyRanges();
    let n = 0;
    for (const [slot, r] of Object.entries(ranges)) {
      if (!r || typeof r !== "object") continue;
      const clean: RangeWeights = {};
      for (const [h, w] of Object.entries(r as Record<string, unknown>)) {
        if (ALL_HANDS.includes(h) && typeof w === "number" && w > 0) clean[h] = Math.min(1, w);
      }
      all[slot] = clean;
      n++;
    }
    saveAll(all);
    return n;
  } catch {
    return 0;
  }
}
