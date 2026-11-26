import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setSolverBaseGame, firstInSpot, getOpenRange, type SolverGame } from "@/engines/solverSpots";
import { getRange } from "@/engines/matchupRanges";
import { explorerOpen } from "@/lib/explorerOpen";

// Problème 1 : le Range Explorer doit montrer, pour l'ouverture, exactement la bibliothèque du solveur (celle du conseiller).
const g = JSON.parse(readFileSync(join(process.cwd(), "public/solver/cash100.json"), "utf8")) as SolverGame;
const POS = ["UTG", "MP", "CO", "BTN", "SB"];
const combos = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);
/** % d'ouverture d'une main lu directement dans la bibliothèque (relance + tapis). */
const libOpen = (pos: string, hand: string) => {
  const s = firstInSpot(g, pos)!;
  return s.acts.reduce((t, a, i) => t + (a.startsWith("R") || a.startsWith("A") ? (s.h[hand]?.[i] ?? 0) : 0), 0);
};
const libPct = (pos: string) => Object.keys(firstInSpot(g, pos)!.h).reduce((t, h) => t + combos(h) * libOpen(pos, h), 0) / 1326;

beforeAll(() => setSolverBaseGame(g));

describe("Range Explorer : ouverture lue dans la bibliothèque du solveur", () => {
  it("T1 : % d'ouverture de l'Explorer = % calculé depuis la bibliothèque (0,1 point), valeurs attendues 17,8 / 21,6 / 27,4 / 43,1 / 46,8", () => {
    const expected: Record<string, number> = { UTG: 17.8, MP: 21.6, CO: 27.4, BTN: 43.1, SB: 46.8 };
    for (const p of POS) {
      const v = explorerOpen(p, g)!;
      expect(Math.abs(v.pct - libPct(p))).toBeLessThanOrEqual(0.1);
      expect(Math.round(v.pct * 10) / 10).toBe(expected[p]);
    }
  });

  it("T2 : 169 mains × 5 positions = 845 comparaisons, écart maximal 0 point", () => {
    let n = 0, ecarts = 0, max = 0;
    for (const p of POS) {
      const v = explorerOpen(p, g)!;
      for (const hand of Object.keys(firstInSpot(g, p)!.h)) {
        const f = v.matrix[hand]?.frequencies ?? {};
        const d = Math.abs((f.raise ?? 0) + (f.jam ?? 0) - libOpen(p, hand));
        n++; if (d > 0) ecarts++; max = Math.max(max, d);
      }
    }
    expect(n).toBe(845);
    expect(ecarts).toBe(0);
    expect(max).toBe(0);
  });

  it("T3 : 55 et 66 en UTG à 100 % d'ouverture dans l'Explorer", () => {
    const v = explorerOpen("UTG", g)!;
    for (const h of ["55", "66"]) expect((v.matrix[h].frequencies.raise ?? 0) + (v.matrix[h].frequencies.jam ?? 0)).toBe(100);
  });

  it("T4 : une seule source d'ouverture — l'Explorer et le conseiller passent par getOpenRange, l'ancienne table n'existe plus", () => {
    const src = (f: string) => readFileSync(join(process.cwd(), "src", f), "utf8");
    // l'Explorer lit l'ouverture par explorerOpen, qui lit getOpenRange
    expect(src("components/RangeExplorer.tsx")).toMatch(/explorerOpen\(/);
    expect(src("lib/explorerOpen.ts")).toMatch(/getOpenRange\(/);
    expect(src("components/RangeExplorer.tsx")).not.toMatch(/showScenarioInOpen|openRaiseScenarios/);
    // le conseiller (ranges du site) : solverRangeForSlot et la range de secours passent par getOpenRange
    const spots = src("engines/solverSpots.ts");
    expect(spots.slice(spots.indexOf("export function solverRangeForSlot"), spots.indexOf("export function solverRangeForSlot") + 900)).toMatch(/getOpenRange\(/);
    const mr = src("engines/matchupRanges.ts");
    expect(mr.slice(mr.indexOf("function baseRange"), mr.indexOf("function baseRange") + 600)).toMatch(/getOpenRange\(/);
    // plus aucune table d'ouverture écrite en dur dans le code du site
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (e.name === "test" ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
    const offenders = walk(join(process.cwd(), "src")).filter(f => /\.(ts|tsx)$/.test(f) && /\b(UTG|MP|CO|BTN|SB)_OPEN_MATRIX\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    // et le conseiller voit la même range que l'Explorer
    for (const p of POS) {
      const o = getOpenRange(p, g)!;
      const w = getRange(`open:${p}`).weights;
      for (const [h, x] of Object.entries(o.open)) if (x > 0.005) expect(w[h]).toBe(Math.min(1, Math.round(x * 100) / 100));
    }
  });

  it("T5 : fréquences entre 0 et 100 %, somme des actions de chaque main = 100 % (±0,01) — sauf les lignes déjà arrondies à l'export de la bibliothèque (non modifiée), affichées telles quelles et listées", () => {
    const arrondies: string[] = [];
    for (const p of POS) {
      const v = explorerOpen(p, g)!, s = firstInSpot(g, p)!;
      for (const [hand, d] of Object.entries(v.matrix)) {
        const fs = Object.values(d.frequencies) as number[];
        for (const x of fs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); }
        const sum = fs.reduce((a, b) => a + b, 0), lib = s.h[hand].reduce((a, b) => a + b, 0);
        expect(sum).toBe(lib);                                        // l'Explorer montre la bibliothèque telle quelle
        if (Math.abs(sum - 100) > 0.01) { arrondies.push(`${p} ${hand} ${sum} %`); expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1); }
      }
    }
    // une seule ligne arrondie à l'export dans les 5 nœuds d'ouverture : 22 en MP (fold 46 + relance 55 = 101 %)
    expect(arrondies).toEqual(["MP 22 101 %"]);
  });
});
