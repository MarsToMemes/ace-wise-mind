import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

type PickMode = "hole" | "flop" | "turn" | "river";

interface SlotsProps {
  hole: string[];
  flop: string[];
  turn: string | null;
  river: string | null;
  pickMode: PickMode;
  setPickMode: (m: PickMode) => void;
  onRemove: (card: string) => void;
  currentStreet: string;
}

const Slot = ({ filled, onClick, locked }: { filled?: string; onClick?: () => void; locked?: boolean }) => {
  if (filled) return <PlayingCard card={filled} animated onClick={onClick} />;
  return (
    <div
      className={cn(
        "w-12 h-16 rounded-md border-2 border-dashed flex items-center justify-center transition-all",
        locked
          ? "border-border/30 bg-muted/20 text-muted-foreground/40"
          : "border-border/60 bg-muted/30 text-muted-foreground/50",
      )}
    >
      {locked ? <Lock className="w-3.5 h-3.5" /> : <span className="text-xs">?</span>}
    </div>
  );
};

const Section = ({
  title, badge, active, locked, onActivate, children,
}: {
  title: string; badge: string; active: boolean; locked: boolean;
  onActivate: () => void; children: React.ReactNode;
}) => (
  <button
    type="button"
    disabled={locked}
    onClick={onActivate}
    className={cn(
      "w-full text-left rounded-xl p-3 transition-all border",
      active && !locked && "border-primary/60 bg-primary/5 shadow-[var(--shadow-gold)]",
      !active && !locked && "border-border/40 hover:border-primary/30 bg-muted/20",
      locked && "border-border/20 bg-muted/10 cursor-not-allowed opacity-60",
    )}
  >
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">{title}</p>
      <span className={cn(
        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
        active && !locked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}>{badge}</span>
    </div>
    <div className="flex gap-2">{children}</div>
  </button>
);

export const StreetSlots = ({
  hole, flop, turn, river, pickMode, setPickMode, onRemove, currentStreet,
}: SlotsProps) => {
  const flopComplete = flop.length === 3;
  const turnLocked = !flopComplete;
  const riverLocked = !turn;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Selection</p>
        <span className="text-xs font-semibold gold-text">Street: {currentStreet}</span>
      </div>

      <Section
        title="Your Hand"
        badge={`${hole.length}/2`}
        active={pickMode === "hole"}
        locked={false}
        onActivate={() => setPickMode("hole")}
      >
        <Slot filled={hole[0]} onClick={() => hole[0] && onRemove(hole[0])} />
        <Slot filled={hole[1]} onClick={() => hole[1] && onRemove(hole[1])} />
      </Section>

      <Section
        title="Flop"
        badge={`${flop.length}/3`}
        active={pickMode === "flop"}
        locked={false}
        onActivate={() => setPickMode("flop")}
      >
        <Slot filled={flop[0]} onClick={() => flop[0] && onRemove(flop[0])} />
        <Slot filled={flop[1]} onClick={() => flop[1] && onRemove(flop[1])} />
        <Slot filled={flop[2]} onClick={() => flop[2] && onRemove(flop[2])} />
      </Section>

      <Section
        title="Turn"
        badge={turnLocked ? "Locked" : turn ? "1/1" : "0/1"}
        active={pickMode === "turn"}
        locked={turnLocked}
        onActivate={() => !turnLocked && setPickMode("turn")}
      >
        <Slot filled={turn ?? undefined} locked={turnLocked} onClick={() => turn && onRemove(turn)} />
      </Section>

      <Section
        title="River"
        badge={riverLocked ? "Locked" : river ? "1/1" : "0/1"}
        active={pickMode === "river"}
        locked={riverLocked}
        onActivate={() => !riverLocked && setPickMode("river")}
      >
        <Slot filled={river ?? undefined} locked={riverLocked} onClick={() => river && onRemove(river)} />
      </Section>
    </div>
  );
};
