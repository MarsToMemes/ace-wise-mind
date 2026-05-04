import { cn } from "@/lib/utils";
import { Crown, User, Coins } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ActionMenu, PlayerAction, ActionType } from "@/components/ActionMenu";
import { useState } from "react";

export type TableSize = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type SeatMode = "dealer" | "user" | "fold" | "action";
export type SimplePosition = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

const LABELS_BY_SIZE: Record<TableSize, string[]> = {
  2: ["BTN", "BB"],
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
  mode: SeatMode;
  folded: boolean[];
  streetContribs: number[]; // BB committed this street per seat
  lastActions: (PlayerAction | null)[]; // last action per seat (current street)
  currentBet: number; // BB to match this street
  defaultRaise: number;
  onSeatClick: (i: number) => void;
  onPlayerAction: (seatIdx: number, type: ActionType, amountBB: number) => void;
  onModeChange: (m: SeatMode) => void;
  onSizeChange: (s: TableSize) => void;
}

export const PokerTable = ({
  size, dealerIdx, userIdx, mode, folded, streetContribs, lastActions,
  currentBet, defaultRaise, onSeatClick, onPlayerAction, onModeChange, onSizeChange,
}: Props) => {
  const { t } = useI18n();
  const [actionSeat, setActionSeat] = useState<number | null>(null);

  const seats = Array.from({ length: size }, (_, i) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / size;
    const x = 50 + 42 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    return { i, x, y };
  });

  const handleClick = (i: number) => {
    if (mode === "action") {
      if (folded[i]) return;
      setActionSeat(i);
      return;
    }
    onSeatClick(i);
  };

  const anchor = actionSeat != null ? { x: seats[actionSeat].x, y: seats[actionSeat].y } : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-md bg-muted p-1 text-xs">
          <label htmlFor="table-size" className="px-2 text-muted-foreground">{t("table.seats")}</label>
          <select
            id="table-size"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value) as TableSize)}
            className="bg-card text-foreground rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {TABLE_SIZES.map((n) => (<option key={n} value={n}>{n}-max</option>))}
          </select>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs flex-wrap">
          <button onClick={() => onModeChange("dealer")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "dealer" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><Crown className="w-3 h-3" /> {t("table.dealer")}</button>
          <button onClick={() => onModeChange("user")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "user" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><User className="w-3 h-3" /> {t("table.you")}</button>
          <button onClick={() => onModeChange("fold")} className={cn("px-2.5 py-1 rounded transition", mode === "fold" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground")}>{t("table.fold")}</button>
          <button onClick={() => onModeChange("action")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "action" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} title={t("table.clickAction")}><Coins className="w-3 h-3" /> {t("table.action")}</button>
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
              {dealerIdx < 0 ? t("table.clickDealer") : userIdx < 0 ? t("table.clickUser") : mode === "action" ? t("table.clickAction") : t("table.ready")}
            </p>
          </div>
        </div>

        {seats.map(({ i, x, y }) => {
          const label = seatLabel(i, dealerIdx, size);
          const isDealer = i === dealerIdx;
          const isUser = i === userIdx;
          const isFolded = folded[i];
          const contrib = streetContribs[i] || 0;
          const last = lastActions[i];

          // chip marker offset toward center
          const cx = 50 + (x - 50) * 0.6;
          const cy = 50 + (y - 50) * 0.6;

          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => handleClick(i)}
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
                aria-label={`Seat ${i + 1} ${label}`}
              >
                {isDealer && <Crown className="w-3 h-3 absolute -top-1.5 -right-1.5 text-primary fill-primary" />}
                {isUser && <User className="w-3 h-3 absolute -top-1.5 -left-1.5" />}
                <span className="leading-tight">{label || `S${i + 1}`}</span>
                {isUser && !isFolded && <span className="text-[8px] opacity-80 leading-none">{t("table.you2")}</span>}
                {isFolded && <span className="text-[8px] leading-none">{t("table.foldedBadge")}</span>}
              </button>

              {/* Chips in front of player */}
              {contrib > 0 && !isFolded && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                >
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-card/90 border border-primary/50 text-[9px] font-bold text-primary shadow">
                    <Coins className="w-2.5 h-2.5" /> {contrib}
                  </div>
                </div>
              )}

              {/* Last action label */}
              {last && (
                <div
                  className="absolute -translate-x-1/2 pointer-events-none"
                  style={{ left: `${x}%`, top: `calc(${y}% + 32px)` }}
                >
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-semibold border whitespace-nowrap",
                    last.type === "Fold" && "bg-destructive/20 text-destructive border-destructive/40",
                    last.type === "Check" && "bg-muted text-muted-foreground border-border",
                    last.type === "Call" && "bg-primary/15 text-primary border-primary/40",
                    (last.type === "Bet" || last.type === "Raise") && "bg-warning/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40",
                  )}>
                    {t(`act.${last.type}`)}{last.amountBB > 0 ? ` ${last.amountBB}` : ""}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {mode === "action" && (
          <ActionMenu
            open={actionSeat != null}
            onOpenChange={(o) => { if (!o) setActionSeat(null); }}
            anchor={anchor}
            currentBet={Math.max(0, currentBet - (actionSeat != null ? (streetContribs[actionSeat] || 0) : 0))}
            defaultRaise={defaultRaise}
            onAction={({ type, amountBB }) => {
              if (actionSeat != null) onPlayerAction(actionSeat, type, amountBB);
            }}
          />
        )}
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground px-1 flex-wrap gap-2">
        <span>{dealerIdx >= 0 ? "✓ Dealer set" : "Set dealer (BTN)"}</span>
        <span>{`Active: ${folded.filter(f => !f).length}/${size}`}</span>
        <span>{`To call: ${currentBet} BB`}</span>
        {userIdx >= 0 && (
          <span className="text-primary font-semibold">{seatLabel(userIdx, dealerIdx, size)}</span>
        )}
      </div>
    </div>
  );
};
