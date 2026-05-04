import { cn } from "@/lib/utils";
import { Crown, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type TableSize = 6 | 9;
export type SimplePosition = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

const LABELS_6: string[] = ["BTN", "SB", "BB", "UTG", "MP", "CO"];
const LABELS_9: string[] = ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"];

export const getLabels = (size: TableSize) => (size === 6 ? LABELS_6 : LABELS_9);

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
  mode: "dealer" | "user";
  onSeatClick: (i: number) => void;
  onModeChange: (m: "dealer" | "user") => void;
  onSizeChange: (s: TableSize) => void;
}

export const PokerTable = ({ size, dealerIdx, userIdx, mode, onSeatClick, onModeChange, onSizeChange }: Props) => {
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
        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
          <button
            onClick={() => onSizeChange(6)}
            className={cn("px-3 py-1 rounded transition", size === 6 ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >6-max</button>
          <button
            onClick={() => onSizeChange(9)}
            className={cn("px-3 py-1 rounded transition", size === 9 ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >9-max</button>
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
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSeatClick(i)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex flex-col items-center justify-center transition-all duration-200",
                "w-12 h-12 sm:w-14 sm:h-14 text-[10px] font-semibold",
                "border-2 hover:scale-110 active:scale-95 animate-scale-in",
                isUser
                  ? "bg-primary text-primary-foreground border-primary shadow-[0_0_24px_hsl(var(--primary)/0.7)]"
                  : isDealer
                    ? "bg-card text-primary border-primary shadow-[0_0_18px_hsl(var(--primary)/0.5)]"
                    : "bg-card/90 text-foreground border-border hover:border-primary/60",
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`Seat ${i + 1} ${label}`}
            >
              {isDealer && <Crown className="w-3 h-3 absolute -top-1.5 -right-1.5 text-primary fill-primary" />}
              {isUser && <User className="w-3 h-3 absolute -top-1.5 -left-1.5" />}
              <span className="leading-tight">{label || `S${i + 1}`}</span>
              {isUser && <span className="text-[8px] opacity-80 leading-none">YOU</span>}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
        <span>{dealerIdx >= 0 ? "✓ Dealer set" : "Set dealer (BTN)"}</span>
        {userIdx >= 0 && (
          <span className="text-primary font-semibold">
            Your position: {seatLabel(userIdx, dealerIdx, size)}
          </span>
        )}
      </div>
    </div>
  );
};
