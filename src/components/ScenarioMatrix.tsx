import { useState } from "react";
import {
  ScenarioAction,
  ScenarioRange,
  SCENARIO_ACTION_COLORS,
  SCENARIO_ACTION_LABELS,
  HandEntry,
  isMix,
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

/** Build a CSS background for a cell — solid color or gradient for mixed */
function cellBackground(entry: HandEntry): string {
  if (!isMix(entry)) return SCENARIO_ACTION_COLORS[entry];
  const stops: string[] = [];
  let acc = 0;
  for (const m of entry.mix) {
    const c = SCENARIO_ACTION_COLORS[m.action];
    stops.push(`${c} ${acc}%`);
    acc += m.pct;
    stops.push(`${c} ${acc}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

interface Props {
  scenario: ScenarioRange;
}

export function ScenarioMatrix({ scenario }: Props) {
  const [picked, setPicked] = useState<{
    hand: string;
    entry: HandEntry;
  } | null>(null);

  const inRangeSet = scenario.inRange ? new Set(scenario.inRange) : null;

  // total combos for action share %
  const handsList = Object.entries(scenario.hands);
  const totalCombosByAction: Record<string, number> = {};
  let totalCombos = 0;
  for (const [hand, entry] of handsList) {
    const c = combos(hand);
    totalCombos += c;
    if (isMix(entry)) {
      for (const m of entry.mix) {
        totalCombosByAction[m.action] =
          (totalCombosByAction[m.action] ?? 0) + c * (m.pct / 100);
      }
    } else {
      totalCombosByAction[entry] = (totalCombosByAction[entry] ?? 0) + c;
    }
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
            let entry: HandEntry | undefined = scenario.hands[label];
            if (!entry) {
              if (inRangeSet && !inRangeSet.has(label)) entry = "notInRange";
              else entry = "fold";
            }
            const isDim = entry === "notInRange";
            return (
              <button
                key={label}
                onClick={() => setPicked({ hand: label, entry: entry! })}
                className="relative aspect-square rounded-sm cursor-pointer transition-transform duration-150 hover:scale-110 hover:z-10 hover:ring-2 hover:ring-primary"
                style={{
                  background: cellBackground(entry),
                  opacity: isDim ? 0.35 : 1,
                }}
                title={
                  isMix(entry)
                    ? `${label} → ${entry.mix.map((m) => `${SCENARIO_ACTION_LABELS[m.action]} ${m.pct}%`).join(" / ")}`
                    : `${label} → ${SCENARIO_ACTION_LABELS[entry]}`
                }
              >
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-foreground mix-blend-difference">
                  {label}
                </span>
              </button>
            );
          })
        )}
      </div>

      <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <DialogContent className="max-w-xs">
          {picked && (() => {
            const entry = picked.entry;
            const mix = isMix(entry)
              ? entry.mix
              : [{ action: entry as ScenarioAction, pct: 100 }];
            const handEv = scenario.handEV?.[picked.hand];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-mono text-2xl flex items-center gap-2 flex-wrap">
                    {picked.hand}
                    {mix.map((m) => (
                      <span
                        key={m.action}
                        className="text-xs font-sans px-2 py-0.5 rounded-md text-white"
                        style={{ background: SCENARIO_ACTION_COLORS[m.action] }}
                      >
                        {SCENARIO_ACTION_LABELS[m.action]} {mix.length > 1 ? `${m.pct}%` : ""}
                      </span>
                    ))}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {scenario.label} · {scenario.action}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Combos</span>
                    <span className="font-mono">{combos(picked.hand)}</span>
                  </div>
                  {mix.map((m) => {
                    const stat = scenario.stats.find((s) => s.action === m.action);
                    return (
                      <div key={m.action} className="space-y-1 border-b border-border/30 pb-2 last:border-0">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {SCENARIO_ACTION_LABELS[m.action]} freq
                          </span>
                          <span className="font-mono">{m.pct}%</span>
                        </div>
                        {stat?.sizing && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Sizing</span>
                            <span className="font-mono">{stat.sizing}</span>
                          </div>
                        )}
                        {stat?.ev && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Scenario EV</span>
                            <span className="font-mono text-primary">{stat.ev}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {handEv && (
                    <div className="flex justify-between pt-1">
                      <span className="text-muted-foreground">Hand EV</span>
                      <span className="font-mono text-primary">{handEv}</span>
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
