import { useState } from "react";
import { ACTION_COLORS, PreflopAction } from "@/engines/preflopRanges";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export interface MatrixHandData {
  hand: string;
  frequencies: Partial<Record<PreflopAction, number>>;
  combos: number;
  notes?: string;
}

export interface RangeMatrixProps {
  data: Record<string, MatrixHandData>;
  onHover?: (h: MatrixHandData | null) => void;
}

function handLabel(r: number, c: number): string {
  const hi = RANKS[r];
  const lo = RANKS[c];
  if (r === c) return `${hi}${hi}`;
  if (r < c) return `${hi}${lo}s`;
  return `${lo}${hi}o`;
}

function cellStyle(freq: Partial<Record<PreflopAction, number>>): React.CSSProperties {
  const acts: PreflopAction[] = ["raise", "call", "fold", "jam"];
  const stops: string[] = [];
  let acc = 0;
  for (const a of acts) {
    const v = freq[a] ?? 0;
    if (v <= 0) continue;
    const start = acc;
    acc += v;
    stops.push(`${ACTION_COLORS[a]} ${start}% ${acc}%`);
  }
  if (stops.length === 0) {
    return { background: ACTION_COLORS.fold, opacity: 0.25 };
  }
  return { background: `linear-gradient(to top, ${stops.join(", ")})` };
}

export function RangeMatrix({ data, onHover }: RangeMatrixProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-13 gap-[2px] p-2 bg-background/40 rounded-md border border-border/40">
      {RANKS.map((_, r) =>
        RANKS.map((__, c) => {
          const label = handLabel(r, c);
          const entry = data[label];
          const freq = entry?.frequencies ?? { fold: 100 };
          const isHover = hovered === label;
          return (
            <div
              key={label}
              onMouseEnter={() => {
                setHovered(label);
                if (entry) onHover?.(entry);
                else onHover?.({ hand: label, frequencies: { fold: 100 }, combos: 0 });
              }}
              onMouseLeave={() => {
                setHovered(null);
                onHover?.(null);
              }}
              className={`relative aspect-square rounded-sm cursor-pointer transition-transform duration-150 ${
                isHover ? "scale-110 z-10 ring-2 ring-primary" : ""
              }`}
              style={cellStyle(freq)}
              title={label}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-foreground mix-blend-difference">
                {label}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
