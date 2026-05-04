import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export type ActionType = "Fold" | "Check" | "Call" | "Bet" | "Raise";
export interface PlayerAction {
  seatIdx: number;
  street: "Preflop" | "Flop" | "Turn" | "River";
  type: ActionType;
  amountBB: number; // 0 for Fold/Check
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: { x: number; y: number } | null;
  currentBet: number; // BB to call
  defaultRaise: number;
  onAction: (a: { type: ActionType; amountBB: number }) => void;
}

export const ActionMenu = ({ open, onOpenChange, anchor, currentBet, defaultRaise, onAction }: Props) => {
  const { t } = useI18n();
  const [amt, setAmt] = useState<number>(defaultRaise);

  const submit = (type: ActionType) => {
    let amount = 0;
    if (type === "Call") amount = currentBet;
    else if (type === "Bet" || type === "Raise") amount = Math.max(amt, currentBet || 1);
    onAction({ type, amountBB: amount });
    onOpenChange(false);
  };

  if (!anchor) return null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          style={{
            position: "absolute",
            left: `${anchor.x}%`,
            top: `${anchor.y}%`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64 z-50" side="bottom" align="center">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Player action {currentBet > 0 ? `· facing ${currentBet} BB` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="destructive" onClick={() => submit("Fold")}>Fold</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => submit("Check")}
              disabled={currentBet > 0}
            >Check</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => submit("Call")}
              disabled={currentBet <= 0}
            >Call {currentBet > 0 ? `${currentBet}` : ""}</Button>
            <Button
              size="sm"
              onClick={() => submit(currentBet > 0 ? "Raise" : "Bet")}
            >{currentBet > 0 ? "Raise" : "Bet"}</Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bet / Raise size (BB)</Label>
            <Input
              type="number"
              min={currentBet || 1}
              value={amt}
              onChange={(e) => setAmt(+e.target.value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
