import React from "react";
import { cn } from "@/lib/utils";

export interface RangeCombo {
  hand: string;
  probability: number;
  combos: number;
  category?: "value" | "bluff" | "medium";
}

export interface RangeGridProps {
  range: RangeCombo[];
  colorMode: "probability" | "category";
  onHandClick?: (hand: string) => void;
  showCombos?: boolean;
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

export function RangeGrid({ range, colorMode, onHandClick, showCombos = true }: RangeGridProps) {
  const grid: string[][] = [];
  for (let i = 0; i < 13; i++) {
    const row: string[] = [];
    for (let j = 0; j < 13; j++) {
      if (i === j) row.push(`${RANKS[i]}${RANKS[i]}`);
      else if (i < j) row.push(`${RANKS[i]}${RANKS[j]}s`);
      else row.push(`${RANKS[j]}${RANKS[i]}o`);
    }
    grid.push(row);
  }

  const map = new Map(range.map(r => [r.hand, r]));
  const get = (h: string) => map.get(h);

  const getCellColor = (hand: string): string => {
    const d = get(hand);
    if (!d || d.combos === 0) return "bg-muted/40 text-muted-foreground";
    if (colorMode === "probability") {
      if (d.probability >= 80) return "bg-red-600 text-white";
      if (d.probability >= 60) return "bg-red-500 text-white";
      if (d.probability >= 40) return "bg-orange-400 text-black";
      if (d.probability >= 20) return "bg-yellow-300 text-black";
      return "bg-green-200 text-black";
    }
    if (d.category === "value") return "bg-green-500 text-white";
    if (d.category === "bluff") return "bg-red-500 text-white";
    if (d.category === "medium") return "bg-yellow-400 text-black";
    return "bg-muted text-foreground";
  };

  return (
    <div className="space-y-3">
      <div
        className="grid gap-px bg-border rounded overflow-hidden"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {grid.flat().map((hand) => {
          const d = get(hand);
          return (
            <button
              key={hand}
              type="button"
              onClick={() => onHandClick?.(hand)}
              title={d ? `${hand}: ${d.combos} combos` : `${hand}: not in range`}
              className={cn(
                "aspect-square flex flex-col items-center justify-center text-[9px] sm:text-[10px] font-mono transition-opacity hover:opacity-80",
                getCellColor(hand),
              )}
            >
              <span className="font-semibold leading-none">{hand}</span>
              {showCombos && d && d.combos > 0 && (
                <span className="text-[7px] opacity-80 leading-none mt-0.5">{d.combos}c</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {colorMode === "category" ? (
          <>
            <Legend swatch="bg-green-500" label="Value" />
            <Legend swatch="bg-yellow-400" label="Medium" />
            <Legend swatch="bg-red-500" label="Bluff" />
          </>
        ) : (
          <>
            <Legend swatch="bg-red-600" label="Very likely (80%+)" />
            <Legend swatch="bg-orange-400" label="Likely (40–60%)" />
            <Legend swatch="bg-green-200" label="Possible (<20%)" />
          </>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block w-3 h-3 rounded-sm", swatch)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
