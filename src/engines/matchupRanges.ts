// Ranges par situation (slot), avec priorité :
//   range de l'utilisateur ("Mes ranges") > range de base du site > range estimée.
// Slots : open:POS · call:POS:vs:OPENER · 3bet:POS:vs:OPENER · call3bet:OPENER:vs:3BETTOR

import { POSITION_RANGE_CATALOG, BB_DEFENSE_MATRIX } from "@/engines/positionRangeCatalog";
import {
  RANGE_VS_UTG_OPEN_100BB,
  RANGE_CO_VS_MP_OPEN_100BB,
  RANGE_BTN_VS_CO_OPEN_100BB,
  PreflopRange,
} from "@/engines/preflopRanges";
import { loadMyRanges, RangeWeights, handCombos } from "@/engines/myRanges";
import { EQ_VS_RANDOM } from "@/engines/preflopEquity";

export type Pos = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";
export const POSITIONS: Pos[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
export type PotType = "srp" | "3bet";
export type RangeSource = "user" | "base" | "estimated";

export interface ResolvedRange {
  slot: string;
  weights: RangeWeights;
  source: RangeSource;
  label: string;
}

const POSTFLOP_ORDER: Pos[] = ["SB", "BB", "UTG", "MP", "CO", "BTN"];
export const actsFirstPostflop = (a: string, b: string) =>
  POSTFLOP_ORDER.indexOf(a as Pos) < POSTFLOP_ORDER.indexOf(b as Pos);

export function slotsFor(pfr: string, caller: string, potType: PotType) {
  return potType === "srp"
    ? { pfr: `open:${pfr}`, caller: `call:${caller}:vs:${pfr}` }
    : { pfr: `3bet:${pfr}:vs:${caller}`, caller: `call3bet:${caller}:vs:${pfr}` };
}

export function slotLabel(slot: string): string {
  const [kind, pos, , vs] = slot.split(":");
  switch (kind) {
    case "open": return `${pos} ouvre`;
    case "call": return `${pos} paie l'open de ${vs}`;
    case "3bet": return `${pos} 3-bet l'open de ${vs}`;
    case "call3bet": return `${pos} paie le 3-bet de ${vs}`;
    default: return slot;
  }
}

/** Toutes les situations éditables dans « Mes ranges ». */
export function allSlots(): string[] {
  const out: string[] = [];
  for (const p of POSITIONS) if (p !== "BB") out.push(`open:${p}`);
  for (const opener of POSITIONS) {
    if (opener === "BB") continue;
    const after = POSITIONS.slice(POSITIONS.indexOf(opener) + 1);
    for (const p of after) out.push(`call:${p}:vs:${opener}`, `3bet:${p}:vs:${opener}`);
    for (const p of after) out.push(`call3bet:${opener}:vs:${p}`);
  }
  return out;
}

// ---------- conversions ----------
type Freqs = Partial<Record<"raise" | "call" | "fold" | "jam", number>>;

function fromFreqMap(entries: { hand: string; frequencies: Freqs }[], action: "raise" | "call"): RangeWeights {
  const out: RangeWeights = {};
  for (const e of entries) {
    const f = (e.frequencies[action] ?? 0) + (action === "raise" ? e.frequencies.jam ?? 0 : 0);
    if (f > 0) out[e.hand] = Math.min(1, f / 100);
  }
  return out;
}

function facingOpenTable(opener: string): PreflopRange {
  if (opener === "UTG") return RANGE_VS_UTG_OPEN_100BB;
  if (opener === "MP") return RANGE_CO_VS_MP_OPEN_100BB;
  return RANGE_BTN_VS_CO_OPEN_100BB;
}

function exactFacingOpen(pos: string, opener: string): boolean {
  if (opener === "UTG") return pos !== "BB";
  if (opener === "MP") return pos === "CO";
  if (opener === "CO") return pos === "BTN";
  return false;
}

/** Force préflop (équité contre une main au hasard, calculée par le site). */
export function preflopStrength(hand: string): number {
  return EQ_VS_RANDOM[hand] ?? 0;
}

function baseRange(slot: string): { weights: RangeWeights; source: RangeSource } {
  const [kind, pos, , vs] = slot.split(":");
  if (kind === "open") {
    const cat = POSITION_RANGE_CATALOG[pos];
    return cat ? { weights: fromFreqMap(Object.values(cat.matrix), "raise"), source: "base" } : { weights: {}, source: "estimated" };
  }
  if (kind === "call" || kind === "3bet") {
    const action = kind === "call" ? "call" : "raise";
    if (pos === "BB") {
      return { weights: fromFreqMap(Object.values(BB_DEFENSE_MATRIX), action), source: vs === "BTN" ? "base" : "estimated" };
    }
    return {
      weights: fromFreqMap(facingOpenTable(vs).hands, action),
      source: exactFacingOpen(pos, vs) ? "base" : "estimated",
    };
  }
  if (kind === "call3bet") {
    // L'ouvreur paie le 3-bet avec le haut de sa range d'ouverture (≈45 % des combos),
    // hors AA/KK qui partent en 4-bet.
    const open = baseOrUser(`open:${pos}`);
    const hands = Object.keys(open).sort((a, b) => preflopStrength(b) - preflopStrength(a));
    const total = hands.reduce((s, h) => s + handCombos(h) * open[h], 0);
    const out: RangeWeights = {};
    let acc = 0;
    for (const h of hands) {
      if (acc >= total * 0.45) break;
      acc += handCombos(h) * open[h];
      if (h === "AA" || h === "KK") continue;
      out[h] = open[h];
    }
    return { weights: out, source: "estimated" };
  }
  return { weights: {}, source: "estimated" };
}

function baseOrUser(slot: string): RangeWeights {
  return loadMyRanges()[slot] ?? baseRange(slot).weights;
}

export function getRange(slot: string): ResolvedRange {
  const user = loadMyRanges()[slot];
  if (user && Object.keys(user).length) return { slot, weights: user, source: "user", label: slotLabel(slot) };
  const b = baseRange(slot);
  return { slot, weights: b.weights, source: b.source, label: slotLabel(slot) };
}

/** Range de base (sans la range utilisateur), pour « Revenir à la range de base ». */
export const getBaseRange = (slot: string) => baseRange(slot);
