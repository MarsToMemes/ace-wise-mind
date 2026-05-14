import { useState } from "react";
import {
  ScenarioAction,
  ScenarioRange,
  SCENARIO_ACTION_COLORS,
  SCENARIO_ACTION_LABELS,
} from "@/engines/scenarioRanges";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"] as const;

function handLabel(r: number, c: number): string {
  const hi = RANKS[r], lo = RANKS[c];
  if (r === c) return `${hi}${hi}`;
  if (r < c) return `${hi}${lo}s`;
  return `${lo}${hi}o`;
}

function combos(h: string) {
  return h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12;
}

interface Props {
  scenario: ScenarioRange;
}

export function ScenarioMatrix({ scenario }: Props) {
  const [picked, setPicked] = useState<{
    hand: string;
    action: ScenarioAction;
  } | null>(null);

  const inRangeSet = scenario.inRange ? new Set(scenario.inRange) : null;

  // total combos for action share %
  const handsList = Object.entries(scenario.hands);
  const totalCombosByAction: Record<string, number> = {};
  let totalCombos = 0;
  for (const [hand, act] of handsList) {
    totalCombosByAction[act] = (totalCombosByAction[act] ?? 0) + combos(hand);
    totalCombos += combos(hand);
  }

  return (
    <>
      <div
        className="grid gap-[2px] p-2 bg-background/40 rounded-md border border-border/40"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {RANKS.map((_, r) =>
          RANKS.map((__, c) => {
            const label = handLabel(r, c);
            let action: ScenarioAction | undefined = scenario.hands[label];
            if (!action) {
              if (inRangeSet && !inRangeSet.has(label)) action = "notInRange";
              else action = "fold";
            }
            const isDim = action === "notInRange";
            return (
              <button
                key={label}
                onClick={() => setPicked({ hand: label, action: action! })}
                className="relative aspect-square rounded-sm cursor-pointer transition-transform duration-150 hover:scale-110 hover:z-10 hover:ring-2 hover:ring-primary"
                style={{
                  background: SCENARIO_ACTION_COLORS[action],
                  opacity: isDim ? 0.35 : 1,
                }}
                title={`${label} → ${SCENARIO_ACTION_LABELS[action]}`}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-foreground mix-blend-difference">
                  {label}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Popup */}
      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="max-w-xs">
          {picked && (() => {
            const stat = scenario.stats.find((s) => s.action === picked.action);
            const actionCombos = totalCombosByAction[picked.action] ?? 0;
            const sharePct = totalCombos
              ? (actionCombos / totalCombos) * 100
              : 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-mono text-2xl flex items-center gap-3">
                    {picked.hand}
                    <span
                      className="text-xs font-sans px-2 py-0.5 rounded-md"
                      style={{
                        background: SCENARIO_ACTION_COLORS[picked.action],
                        color: "white",
                      }}
                    >
                      {SCENARIO_ACTION_LABELS[picked.action]}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {scenario.label} · {scenario.action}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Action share</span>
                    <span className="font-mono">
                      {sharePct.toFixed(1)}% ({combos(picked.hand)} combos)
                    </span>
                  </div>
                  {stat && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scenario freq</span>
                      <span className="font-mono">{stat.pct}%</span>
                    </div>
                  )}
                  {stat?.sizing && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sizing</span>
                      <span className="font-mono">{stat.sizing}</span>
                    </div>
                  )}
                  {stat?.ev && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">EV</span>
                      <span className="font-mono text-primary">{stat.ev}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
