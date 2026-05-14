import { useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Filter, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_COLORS, PreflopAction } from "@/engines/preflopRanges";
import { POSITION_RANGE_CATALOG } from "@/engines/positionRangeCatalog";
import { RangeMatrix, MatrixHandData } from "@/components/RangeMatrix";
import { ScenarioMatrix } from "@/components/ScenarioMatrix";
import {
  groupedScenarios,
  SCENARIO_ACTION_COLORS,
  SCENARIO_ACTION_LABELS,
  ScenarioAction,
} from "@/engines/scenarioRanges";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_RANGES } from "@/lib/teachContent";

type RangeType = "open" | "3bet" | "defense" | "jam" | "scenarios";
type GameType = "cash" | "mtt";
type Pos = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

const POSITIONS: Pos[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

const SCENARIO_GROUPS = groupedScenarios();
const MATCHUP_KEYS = Object.keys(SCENARIO_GROUPS);

export function RangeExplorer() {
  const [open, setOpen] = useState(true);
  const [position, setPosition] = useState<Pos>("UTG");
  const [rangeType, setRangeType] = useState<RangeType>("open");
  const [gameType, setGameType] = useState<GameType>("cash");
  const [stackDepth, setStackDepth] = useState("100");
  const [vsPosition, setVsPosition] = useState<string>("none");
  const [hovered, setHovered] = useState<MatrixHandData | null>(null);

  // Scenario state
  const [matchup, setMatchup] = useState<string>(MATCHUP_KEYS[0]);
  const matchupScenarios = SCENARIO_GROUPS[matchup] ?? [];
  const [scenarioStack, setScenarioStack] = useState<number>(
    matchupScenarios[0]?.stackBB ?? 50,
  );
  const scenario =
    matchupScenarios.find((s) => s.stackBB === scenarioStack) ??
    matchupScenarios[0];

  const info = POSITION_RANGE_CATALOG[position];
  const has3bet = !!info.matrix3bet;
  const matrix =
    rangeType === "3bet" && info.matrix3bet ? info.matrix3bet : info.matrix;

  // Derived metrics
  const totalCombos = Object.values(matrix).reduce(
    (acc, h) => acc + h.combos * (((h.frequencies.raise ?? 0) + (h.frequencies.call ?? 0) + (h.frequencies.jam ?? 0)) / 100),
    0
  );
  const continuePct = (totalCombos / 1326) * 100;

  return (
    <>
      {/* Toggle button when collapsed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-card border border-l-0 border-border rounded-r-lg p-2 hover:bg-accent transition-colors shadow-lg"
          aria-label="Open Range Explorer"
        >
          <ChevronRight className="w-4 h-4" />
          <LayoutGrid className="w-4 h-4 mt-1" />
        </button>
      )}

      {/* Sliding panel */}
      <aside
        className={`fixed left-0 top-0 h-screen z-40 bg-card/95 backdrop-blur-md border-r border-border shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "min(440px, 92vw)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-background/60 to-transparent">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <h2 className="font-bold tracking-tight text-sm">Range Explorer</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              GTO baseline
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Position picker */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Position
            </div>
            <div className="grid grid-cols-6 gap-1">
              {POSITIONS.map(p => (
                <button
                  key={p}
                  onClick={() => setPosition(p)}
                  className={`px-2 py-2 rounded-md text-xs font-mono font-bold transition-all ${
                    position === p
                      ? "bg-primary text-primary-foreground shadow-md scale-105"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Range-type tabs */}
          <Tabs value={rangeType} onValueChange={v => setRangeType(v as RangeType)}>
            <TabsList className="grid grid-cols-5 h-8">
              <TabsTrigger value="open" className="text-[10px]">Open</TabsTrigger>
              <TabsTrigger value="3bet" className="text-[10px]">3bet</TabsTrigger>
              <TabsTrigger value="defense" className="text-[10px]">Def</TabsTrigger>
              <TabsTrigger value="jam" className="text-[10px]">Jam</TabsTrigger>
              <TabsTrigger value="scenarios" className="text-[10px]">Spots</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters — hidden in scenarios mode */}
          {rangeType !== "scenarios" && (
            <div className="grid grid-cols-3 gap-2">
              <Select value={gameType} onValueChange={v => setGameType(v as GameType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mtt">MTT</SelectItem>
                </SelectContent>
              </Select>
              <Select value={stackDepth} onValueChange={setStackDepth}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20bb</SelectItem>
                  <SelectItem value="40">40bb</SelectItem>
                  <SelectItem value="50">50bb</SelectItem>
                  <SelectItem value="100">100bb</SelectItem>
                  <SelectItem value="200">200bb</SelectItem>
                </SelectContent>
              </Select>
              <Select value={vsPosition} onValueChange={setVsPosition}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="vs" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">vs —</SelectItem>
                  {POSITIONS.filter(p => p !== position).map(p => (
                    <SelectItem key={p} value={p}>vs {p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rangeType === "scenarios" ? (
            /* ============== SCENARIO MODE ============== */
            <div className="space-y-3">
              {/* Matchup picker */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Matchup
                </div>
                <Select
                  value={matchup}
                  onValueChange={(v) => {
                    setMatchup(v);
                    const first = SCENARIO_GROUPS[v]?.[0];
                    if (first) setScenarioStack(first.stackBB);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCHUP_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k.replace("_vs_", " vs ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stack toggle (only when matchup has multiple depths) */}
              {matchupScenarios.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Stack
                  </span>
                  <div className="flex gap-1">
                    {matchupScenarios.map((s) => (
                      <button
                        key={s.stackBB}
                        onClick={() => setScenarioStack(s.stackBB)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all ${
                          scenarioStack === s.stackBB
                            ? s.stackBadgeColor ?? "bg-primary text-primary-foreground"
                            : "bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {s.stackBB}bb
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {scenario && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {scenario.label}
                    </div>
                    <Badge
                      className={`text-[10px] font-mono ${
                        scenario.stackBadgeColor ?? ""
                      }`}
                      variant={scenario.stackBadgeColor ? "default" : "outline"}
                    >
                      {scenario.stackBB}bb
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground -mt-1">
                    {scenario.action}
                  </div>

                  <ScenarioMatrix scenario={scenario} />

                  {/* Stats legend */}
                  <div className="space-y-1 rounded-md border border-border bg-background/50 p-3">
                    {scenario.stats.map((s) => (
                      <div
                        key={s.action}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ background: SCENARIO_ACTION_COLORS[s.action] }}
                        />
                        <span className="text-muted-foreground">
                          {SCENARIO_ACTION_LABELS[s.action]}
                          {s.sizing && (
                            <span className="ml-1 text-foreground font-mono">
                              [{s.sizing}]
                            </span>
                          )}
                        </span>
                        <span className="ml-auto font-mono">
                          {s.pct.toFixed(1)}%
                        </span>
                        {s.ev && (
                          <span className="font-mono text-primary text-[10px] w-16 text-right">
                            EV {s.ev}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-muted-foreground italic">
                    Click any hand to see its action, sizing & EV.
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Matrix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {rangeType === "3bet" && info.threeBetContext
                      ? info.threeBetContext
                      : `${position} · ${rangeType}`}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    {continuePct.toFixed(1)}% combos
                  </div>
                </div>
                <RangeMatrix data={matrix} onHover={setHovered} />

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
                  {(["raise", "call", "fold", "jam"] as PreflopAction[]).map(a => (
                    <div key={a} className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ background: ACTION_COLORS[a] }} />
                      <span className="capitalize text-muted-foreground">{a}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hover details */}
              <div className="rounded-md border border-border bg-background/50 p-3 min-h-[110px]">
                {hovered ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-lg">{hovered.hand}</span>
                      <Badge variant="outline" className="text-[10px]">{hovered.combos} combos</Badge>
                    </div>
                    <div className="space-y-1">
                      {(["raise", "call", "fold", "jam"] as PreflopAction[])
                        .filter(a => (hovered.frequencies[a] ?? 0) > 0)
                        .map(a => (
                          <div key={a} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-sm" style={{ background: ACTION_COLORS[a] }} />
                            <span className="capitalize w-12 text-muted-foreground">{a}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${hovered.frequencies[a]}%`,
                                  background: ACTION_COLORS[a],
                                }}
                              />
                            </div>
                            <span className="font-mono text-[10px] w-8 text-right">
                              {hovered.frequencies[a]}%
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/50">
                      EV: <span className="font-mono">+0.00 bb</span> · {hovered.notes ?? "Solver baseline"}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="w-3 h-3" />
                    Hover a hand to see frequencies, combos & EV.
                  </div>
                )}
              </div>

              {/* Insights */}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="w-3 h-3 text-primary" />
                  <span className="text-xs font-semibold">{info.label} · {info.archetype}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {info.openFrequencyPct}% RFI
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {info.insights.map((tip, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
                {info.calibration && (
                  <div className="mt-2 pt-2 border-t border-primary/20 text-[10px] text-muted-foreground italic leading-relaxed">
                    {info.calibration}
                  </div>
                )}
              </div>
            </>
          )}

          <TeachAccordion content={TEACH_RANGES} />
        </div>

        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground bg-background/40">
          Baseline GTO priors · used by engine for postflop range estimation
        </div>
      </aside>
    </>
  );
}
