import { cn } from "@/lib/utils";
import { Crown, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type TableSize = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type SimplePosition = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

// Position labels by table size, ordered clockwise starting from BTN
const LABELS_BY_SIZE: Record<TableSize, string[]> = {
  2: ["BTN", "BB"], // heads-up: BTN posts SB
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
};

export const getLabels = (size: TableSize) => LABELS_BY_SIZE[size];

export const TABLE_SIZES: TableSize[] = [2, 3, 4, 5, 6, 7, 8, 9];

export const labelToPosition = (label: string): SimplePosition => {
  if (label === "BTN" || label === "SB" || label === "BB" || label === "CO") return label;
  if (label.startsWith("UTG")) return "UTG";
  if (label === "LJ" || label === "HJ" || label === "MP") return "MP";
  return "MP";
};

/** Compute label for a seat given dealer index, size, and clockwise rotation */
export const seatLabel = (seatIdx: number, dealerIdx: number, size: TableSize) => {
  if (dealerIdx < 0) return "";
  const labels = getLabels(size);
  const offset = (seatIdx - dealerIdx + size) % size;
  return labels[offset];
};

interface Props {
  size: TableSize;
  dealerIdx: number;
  userIdx: number;
  mode: "dealer" | "user" | "fold";
  folded: boolean[]; // length === size; true = folded/out of hand
  onSeatClick: (i: number) => void;
  onModeChange: (m: "dealer" | "user" | "fold") => void;
  onSizeChange: (s: TableSize) => void;
}

export const PokerTable = ({ size, dealerIdx, userIdx, mode, folded, onSeatClick, onModeChange, onSizeChange }: Props) => {
  const { t } = useI18n();
  // seat positions on an ellipse
  const seats = Array.from({ length: size }, (_, i) => {
    // Start at top (-90deg) and go clockwise
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / size;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    return { i, x, y };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-md bg-muted p-1 text-xs">
          <label htmlFor="table-size" className="px-2 text-muted-foreground">Seats</label>
          <select
            id="table-size"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value) as TableSize)}
            className="bg-card text-foreground rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {TABLE_SIZES.map((n) => (
              <option key={n} value={n}>{n}-max</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
          <button
            onClick={() => onModeChange("dealer")}
            className={cn("px-3 py-1 rounded transition flex items-center gap-1", mode === "dealer" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          ><Crown className="w-3 h-3" /> Dealer</button>
          <button
            onClick={() => onModeChange("user")}
            className={cn("px-3 py-1 rounded transition flex items-center gap-1", mode === "user" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          ><User className="w-3 h-3" /> You</button>
          <button
            onClick={() => onModeChange("fold")}
            className={cn("px-3 py-1 rounded transition flex items-center gap-1", mode === "fold" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground")}
            title="Toggle player folded/active"
          >Fold</button>
        </div>
      </div>

      <div className="relative w-full aspect-[5/4] rounded-[50%] overflow-visible"
        style={{
          background: "radial-gradient(ellipse at center, hsl(150 65% 28%) 0%, hsl(150 70% 16%) 60%, hsl(150 75% 10%) 100%)",
          boxShadow: "inset 0 0 40px hsl(0 0% 0% / 0.6), 0 12px 40px hsl(0 0% 0% / 0.5), 0 0 0 6px hsl(45 60% 25%), 0 0 0 8px hsl(45 70% 40%)",
        }}
      >
        <div className="absolute inset-[12%] rounded-[50%] border border-[hsl(45_60%_45%/0.25)]" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="display gold-text text-lg leading-none">Ace Analyst</p>
            <p className="text-[10px] uppercase tracking-widest text-[hsl(45_30%_70%/0.6)] mt-1">
              {dealerIdx < 0 ? "Click a seat: Dealer" : userIdx < 0 ? "Click your seat" : "Ready"}
            </p>
          </div>
        </div>

        {seats.map(({ i, x, y }) => {
          const label = seatLabel(i, dealerIdx, size);
          const isDealer = i === dealerIdx;
          const isUser = i === userIdx;
          const isFolded = folded[i];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSeatClick(i)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex flex-col items-center justify-center transition-all duration-200",
                "w-12 h-12 sm:w-14 sm:h-14 text-[10px] font-semibold",
                "border-2 hover:scale-110 active:scale-95 animate-scale-in",
                isFolded
                  ? "bg-muted/40 text-muted-foreground border-dashed border-muted-foreground/40 opacity-50 grayscale"
                  : isUser
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_24px_hsl(var(--primary)/0.7)]"
                    : isDealer
                      ? "bg-card text-primary border-primary shadow-[0_0_18px_hsl(var(--primary)/0.5)]"
                      : "bg-card/90 text-foreground border-border hover:border-primary/60",
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`Seat ${i + 1} ${label}${isDealer ? " dealer" : ""}${isUser ? " you" : ""}${isFolded ? " folded" : " active"}`}
            >
              {isDealer && <Crown className="w-3 h-3 absolute -top-1.5 -right-1.5 text-primary fill-primary" />}
              {isUser && <User className="w-3 h-3 absolute -top-1.5 -left-1.5" />}
              <span className="leading-tight">{label || `S${i + 1}`}</span>
              {isUser && !isFolded && <span className="text-[8px] opacity-80 leading-none">YOU</span>}
              {isFolded && <span className="text-[8px] leading-none">FOLD</span>}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
        <span>{dealerIdx >= 0 ? "✓ Dealer set" : "Set dealer (BTN)"}</span>
        <span>{`Active: ${folded.filter(f => !f).length}/${size}`}</span>
        {userIdx >= 0 && (
          <span className="text-primary font-semibold">
            {seatLabel(userIdx, dealerIdx, size)}
          </span>
        )}
      </div>
    </div>
  );
};
