import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RangeGrid, RangeCombo } from "@/components/RangeGrid";
import {
  initializePreflopRange, applyCardRemoval,
  filterByFlopAction, filterByTurnAction, categorizeRiverRange,
} from "@/engines/rangeFilterEngine";
import { analyzeBluffLikelihood, classifySizing } from "@/engines/bluffDetectionEngine";

interface Props {
  hole: string[];
  board: string[];
  potBB?: number;
  texture?: "Dry" | "Semi-wet" | "Wet";
}

type FT = "Bet" | "Check" | null;

export function RangeTrackerPanel({ hole, board, potBB = 20, texture = "Semi-wet" }: Props) {
  const [villainPosition, setVillainPosition] = useState("BTN");
  const [colorMode, setColorMode] = useState<"probability" | "category">("probability");
  const [flopAction, setFlopAction] = useState<FT>(null);
  const [turnAction, setTurnAction] = useState<FT>(null);
  const [riverSizeBB, setRiverSizeBB] = useState(0);

  const range = useMemo<RangeCombo[]>(() => {
    let r = initializePreflopRange(villainPosition);
    if (board.length >= 3 && flopAction) r = filterByFlopAction(r, flopAction);
    if (board.length >= 4 && turnAction) r = filterByTurnAction(r, turnAction);
    if (board.length === 5 && riverSizeBB > 0) r = categorizeRiverRange(r, board);
    r = applyCardRemoval(r, [...hole, ...board]);
    return r;
  }, [villainPosition, flopAction, turnAction, riverSizeBB, board, hole]);

  useEffect(() => {
    if (board.length === 5 && riverSizeBB > 0) setColorMode("category");
  }, [board.length, riverSizeBB]);

  const totalCombos = range.reduce((s, c) => s + c.combos, 0);
  const valueCombos = range.filter(c => c.category === "value").reduce((s, c) => s + c.combos, 0);
  const bluffCombos = range.filter(c => c.category === "bluff").reduce((s, c) => s + c.combos, 0);

  const riverBet = board.length === 5 && riverSizeBB > 0;
  const analysis = riverBet
    ? analyzeBluffLikelihood(
        "River",
        classifySizing(riverSizeBB, potBB),
        texture,
        flopAction === "Bet",
        turnAction === "Bet",
      )
    : null;

  const potOdds = riverBet ? riverSizeBB / (potBB + riverSizeBB) : 0;
  const recommendation = analysis
    ? bluffCombos > valueCombos * 0.5
      ? { label: "CALL", reason: "Villain has many bluffs in range." }
      : { label: "FOLD", reason: "Villain is value-heavy." }
    : null;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">🎯 Villain Range Tracker</h3>
        <p className="text-xs text-muted-foreground">
          Narrow villain's range action-by-action and detect bluffs.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Villain Position</Label>
          <Select value={villainPosition} onValueChange={setVillainPosition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["UTG","MP","CO","BTN","SB"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flop Action</Label>
          <Select value={flopAction ?? "none"} onValueChange={(v) => setFlopAction(v === "none" ? null : v as FT)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="Bet">Bet</SelectItem>
              <SelectItem value="Check">Check</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Turn Action</Label>
          <Select value={turnAction ?? "none"} onValueChange={(v) => setTurnAction(v === "none" ? null : v as FT)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="Bet">Bet</SelectItem>
              <SelectItem value="Check">Check</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">River Bet (BB)</Label>
          <Input
            type="number"
            min={0}
            value={riverSizeBB || ""}
            onChange={(e) => setRiverSizeBB(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={colorMode === "probability" ? "default" : "outline"} onClick={() => setColorMode("probability")}>
          Heat Map
        </Button>
        <Button size="sm" variant={colorMode === "category" ? "default" : "outline"} onClick={() => setColorMode("category")}>
          Value / Bluff
        </Button>
      </div>

      <RangeGrid range={range} colorMode={colorMode} />

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Total Combos" value={totalCombos} />
        <Stat label="Value Combos" value={valueCombos} className="text-green-600" />
        <Stat label="Bluff Combos" value={bluffCombos} className="text-red-600" />
      </div>

      {analysis && recommendation && (
        <Card className="p-4 space-y-2 border-primary/30 bg-primary/5">
          <h4 className="font-semibold text-sm">🎲 Bluff Detection</h4>
          <div className="text-xs space-y-1">
            <p><span className="font-medium">Heuristic:</span> {analysis.heuristicUsed}</p>
            <p><span className="font-medium">Estimated bluff frequency:</span> {analysis.bluffFrequency}%</p>
            <p><span className="font-medium">Confidence:</span> {analysis.confidence}%</p>
            <p className="text-muted-foreground">{analysis.reasoning}</p>
            <div className="pt-2 border-t border-border/50">
              <p>• {valueCombos} value combos vs {bluffCombos} bluff combos</p>
              <p>• Pot odds: {(potOdds * 100).toFixed(1)}%</p>
            </div>
          </div>
          <div className={`mt-2 p-2 rounded font-semibold text-sm ${recommendation.label === "CALL" ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>
            💡 {recommendation.label}: {recommendation.reason}
          </div>
        </Card>
      )}
    </Card>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="p-2 rounded bg-muted/40">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${className}`}>{value}</p>
    </div>
  );
}
