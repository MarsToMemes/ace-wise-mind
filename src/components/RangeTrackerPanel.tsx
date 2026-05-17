import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RangeGrid, RangeCombo } from "@/components/RangeGrid";
import {
  initializePreflopRange, applyCardRemoval,
  filterByFlopAction, filterByTurnAction, categorizeRiverRange,
} from "@/engines/rangeFilterEngine";
import {
  analyzeBluffDetailed, classifySizing,
  type VillainType, type PositionRel,
} from "@/engines/bluffDetectionEngine";

interface Props {
  hole: string[];
  board: string[];
  potBB?: number;
  texture?: "Dry" | "Semi-wet" | "Wet";
}

type FT = "Bet" | "Check" | null;

const RANK = "AKQJT98765432";

function detectRunoutFlags(board: string[]) {
  if (board.length !== 5) return {};
  const ranks = board.map(c => c[0]);
  const suits = board.map(c => c[1]);
  const counts: Record<string, number> = {};
  ranks.forEach(r => (counts[r] = (counts[r] || 0) + 1));
  const paired = Object.values(counts).some(v => v >= 2);
  const suitCounts: Record<string, number> = {};
  suits.forEach(s => (suitCounts[s] = (suitCounts[s] || 0) + 1));
  const flushCompleted = Object.values(suitCounts).some(v => v >= 3);
  // straight detection: sorted unique rank indices, look for 5 in a row
  const idx = [...new Set(ranks.map(r => RANK.indexOf(r)))].sort((a, b) => a - b);
  let straightCompleted = false;
  for (let i = 0; i <= idx.length - 5; i++) {
    if (idx[i + 4] - idx[i] === 4) { straightCompleted = true; break; }
  }
  const riverCard = board[4][0];
  const scareCardBroadway = "AKQ".includes(riverCard);
  const lowCard = "23456".includes(riverCard);
  const brickRiver = !flushCompleted && !straightCompleted && !paired && !scareCardBroadway;
  return { paired, flushCompleted, straightCompleted, scareCardBroadway, lowCard, brickRiver };
}

export function RangeTrackerPanel({ hole, board, potBB = 20, texture = "Semi-wet" }: Props) {
  const [villainPosition, setVillainPosition] = useState("BTN");
  const [colorMode, setColorMode] = useState<"probability" | "category">("probability");
  const [flopAction, setFlopAction] = useState<FT>(null);
  const [turnAction, setTurnAction] = useState<FT>(null);
  const [riverSizeBB, setRiverSizeBB] = useState(0);

  // New bluff-detection inputs
  const [villainType, setVillainType] = useState<VillainType>("Unknown");
  const [relPosition, setRelPosition] = useState<PositionRel>("IP");
  const [villainStackBB, setVillainStackBB] = useState(100);
  const [isLive, setIsLive] = useState(false);
  const [isCheckRaise, setIsCheckRaise] = useState(false);
  const [isDonkBet, setIsDonkBet] = useState(false);
  const [isDelayedCbet, setIsDelayedCbet] = useState(false);
  const [isBlockBet, setIsBlockBet] = useState(false);
  const [isAllIn, setIsAllIn] = useState(false);

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
  const runout = useMemo(() => detectRunoutFlags(board), [board]);
  const analysis = riverBet
    ? analyzeBluffDetailed({
        street: "River",
        sizeBB: riverSizeBB,
        potBB,
        texture,
        villainCbetFlop: flopAction === "Bet",
        villainBarrelTurn: turnAction === "Bet",
        isCheckRaise, isDonkBet, isDelayedCbet, isBlockBet, isAllIn,
        villainType, villainPosition: relPosition,
        villainStackBB, isLive,
        ...runout,
      })
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
        <FieldSelect label="Villain Position" value={villainPosition} onChange={setVillainPosition}
          options={["UTG","MP","CO","BTN","SB"]} />
        <FieldSelect label="Flop Action" value={flopAction ?? "none"} onChange={(v) => setFlopAction(v === "none" ? null : v as FT)}
          options={["none","Bet","Check"]} />
        <FieldSelect label="Turn Action" value={turnAction ?? "none"} onChange={(v) => setTurnAction(v === "none" ? null : v as FT)}
          options={["none","Bet","Check"]} />
        <div className="space-y-1">
          <Label className="text-xs">River Bet (BB)</Label>
          <Input type="number" min={0} value={riverSizeBB || ""}
            onChange={(e) => setRiverSizeBB(Number(e.target.value) || 0)} placeholder="0" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={colorMode === "probability" ? "default" : "outline"} onClick={() => setColorMode("probability")}>Heat Map</Button>
        <Button size="sm" variant={colorMode === "category" ? "default" : "outline"} onClick={() => setColorMode("category")}>Value / Bluff</Button>
      </div>

      <RangeGrid range={range} colorMode={colorMode} />

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Total Combos" value={totalCombos} />
        <Stat label="Value Combos" value={valueCombos} className="text-green-600" />
        <Stat label="Bluff Combos" value={bluffCombos} className="text-red-600" />
      </div>

      {/* Bluff Detection Inputs */}
      <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bluff Detection Context</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FieldSelect label="Villain Type" value={villainType} onChange={(v) => setVillainType(v as VillainType)}
            options={["Unknown","Nit","TAG","LAG","Maniac","Station","Whale"]} />
          <FieldSelect label="Villain vs Hero" value={relPosition} onChange={(v) => setRelPosition(v as PositionRel)}
            options={["IP","OOP"]} />
          <div className="space-y-1">
            <Label className="text-xs">Villain Stack (BB)</Label>
            <Input type="number" min={1} value={villainStackBB}
              onChange={(e) => setVillainStackBB(Number(e.target.value) || 0)} />
          </div>
          <ToggleRow label="Live game" value={isLive} onChange={setIsLive} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <ToggleRow label="Check-raise" value={isCheckRaise} onChange={setIsCheckRaise} />
          <ToggleRow label="Donk bet" value={isDonkBet} onChange={setIsDonkBet} />
          <ToggleRow label="Delayed c-bet" value={isDelayedCbet} onChange={setIsDelayedCbet} />
          <ToggleRow label="Block bet" value={isBlockBet} onChange={setIsBlockBet} />
          <ToggleRow label="All-in" value={isAllIn} onChange={setIsAllIn} />
        </div>
      </div>

      {analysis && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-semibold text-sm">🎲 Bluff Detection</h4>
            <span className="text-xs text-muted-foreground">
              Sizing: {classifySizing(riverSizeBB, potBB)} ({((riverSizeBB / Math.max(1, potBB)) * 100).toFixed(0)}% pot)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Base Bluff %" value={Math.round(analysis.baseBluffFrequency)} className="text-amber-600" />
            <Stat label="Adjusted Bluff %" value={Math.round(analysis.bluffFrequency)} className="text-red-600" />
            <Stat label="Confidence" value={Math.round(analysis.confidence)} />
          </div>

          <div className="text-xs space-y-1">
            <p><span className="font-medium">Heuristic:</span> {analysis.heuristicUsed}</p>
            <p className="text-muted-foreground">{analysis.reasoning}</p>
            {analysis.potOddsPct != null && (
              <p>• Break-even equity needed: <span className="font-mono">{analysis.potOddsPct.toFixed(1)}%</span></p>
            )}
            <p>• Range: {valueCombos} value vs {bluffCombos} bluff combos</p>
          </div>

          {analysis.adjustments.length > 0 && (
            <div className="text-xs">
              <p className="font-medium mb-1">Adjustment trail:</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {analysis.adjustments.map((a, i) => <li key={i}>· {a}</li>)}
              </ul>
            </div>
          )}

          <div className={`mt-1 p-2 rounded font-semibold text-sm ${
            analysis.recommendation === "Call"
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : "bg-red-500/15 text-red-700 dark:text-red-400"
          }`}>
            💡 {analysis.recommendation.toUpperCase()}: {analysis.recommendationReasoning}
          </div>
        </Card>
      )}
    </Card>
  );
}

function FieldSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o === "none" ? "—" : o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background/60 border">
      <Label className="text-xs cursor-pointer">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
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
