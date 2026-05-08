import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  TOURNAMENT_TYPES, BLIND_STRUCTURES, TournamentType,
  buildTournamentState, pushFoldDecision, icmAdjustedScore, stageLabel,
} from "@/lib/tournamentEngine";
import { CardPicker } from "@/components/CardPicker";
import { StreetSlots } from "@/components/StreetSlots";
import { PokerTable, TableSize, SeatMode, seatLabel, labelToPosition } from "@/components/PokerTable";
import { PlayerAction, ActionType } from "@/components/ActionMenu";
import { AIPanel, AIAnalysis } from "@/components/AIPanel";
import { Trophy, Sparkles } from "lucide-react";
import {
  evaluateBest, detectDraws, classifyTexture, estimateEquity,
  adjustedScore, decide, recommendSizing, classifyHandStrength, potOdds,
} from "@/lib/pokerEngine";
import { inferRanges } from "@/lib/rangeInference";
import { generateCoachAnalysis } from "@/engines/coachEngine";
import { useI18n } from "@/lib/i18n";

type PickMode = "hole" | "flop" | "turn" | "river";
type Street = "Preflop" | "Flop" | "Turn" | "River";

interface ActionLog extends PlayerAction {
  mAtAction: number;
  stageAtAction: string;
}

export function TournamentPanel() {
  const [type, setType] = useState<TournamentType>("standard");
  const [levelIdx, setLevelIdx] = useState(0);
  const [ante, setAnte] = useState(0);
  const [stackChips, setStackChips] = useState(20000);
  const [stackUnit, setStackUnit] = useState<"chips" | "bb">("chips");
  const [playersRemaining, setPlayersRemaining] = useState(120);
  const [payoutSpots, setPayoutSpots] = useState(15);

  // Table state
  const [tableSize, setTableSize] = useState<TableSize>(6);
  const [dealerIdx, setDealerIdx] = useState(-1);
  const [userIdx, setUserIdx] = useState(-1);
  const [seatMode, setSeatMode] = useState<SeatMode>("dealer");
  const [folded, setFolded] = useState<boolean[]>(() => Array(6).fill(false));
  const [seatStacksChips, setSeatStacksChips] = useState<number[]>(() => Array(6).fill(20000));
  const [actionHistory, setActionHistory] = useState<ActionLog[]>([]);

  // Cards
  const [hole, setHole] = useState<string[]>([]);
  const [flop, setFlop] = useState<string[]>([]);
  const [turn, setTurn] = useState<string | null>(null);
  const [river, setRiver] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("hole");

  // Timer
  const cfg = TOURNAMENT_TYPES[type];
  const blinds = BLIND_STRUCTURES[type];
  const BB = blinds[Math.min(levelIdx, blinds.length - 1)];
  const SB = Math.max(1, Math.round(BB / 2));
  const [timerSec, setTimerSec] = useState(cfg.blindIntervalMin * 60);
  const [flashMRatio, setFlashMRatio] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const prevStageRef = useRef<string>("deep");

  useEffect(() => {
    const id = window.setInterval(() => {
      setTimerSec(s => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-advance level
  useEffect(() => {
    if (timerSec === 0) {
      setLevelIdx(i => Math.min(blinds.length - 1, i + 1));
      setTimerSec(cfg.blindIntervalMin * 60);
      setFlashMRatio(true);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFlashMRatio(false), 3000);
    }
  }, [timerSec, blinds.length, cfg.blindIntervalMin]);

  // Reset timer when type changes
  useEffect(() => {
    setTimerSec(TOURNAMENT_TYPES[type].blindIntervalMin * 60);
    setLevelIdx(0);
    setPayoutSpots(TOURNAMENT_TYPES[type].payoutSpotsDefault);
    setAnte(TOURNAMENT_TYPES[type].anteFromLevel ? Math.round(BLIND_STRUCTURES[type][0] * 0.125) : 0);
  }, [type]);

  const board = useMemo(() => {
    const b = [...flop];
    if (turn) b.push(turn);
    if (river) b.push(river);
    return b;
  }, [flop, turn, river]);
  const selected = [...hole, ...board];
  const currentStreet: Street = board.length === 0 ? "Preflop" : board.length === 3 ? "Flop" : board.length === 4 ? "Turn" : "River";

  const stackChipsResolved = stackUnit === "chips" ? stackChips : stackChips * BB;

  // Sync hero stack into seat stacks at userIdx
  useEffect(() => {
    if (userIdx >= 0) {
      setSeatStacksChips(prev => {
        if (prev[userIdx] === stackChipsResolved) return prev;
        const next = [...prev];
        next[userIdx] = stackChipsResolved;
        return next;
      });
    }
  }, [stackChipsResolved, userIdx]);

  const playersAtTable = folded.filter(f => !f).length || tableSize;

  const state = useMemo(() => buildTournamentState({
    type, stackChips: stackChipsResolved, BB, SB, ante,
    playersAtTable, playersRemaining, payoutSpots,
  }), [type, stackChipsResolved, BB, SB, ante, playersAtTable, playersRemaining, payoutSpots]);

  // Toast on stage downgrade
  useEffect(() => {
    if (prevStageRef.current !== state.stage) {
      if (state.stage === "push-fold" && (prevStageRef.current === "middle" || prevStageRef.current === "deep")) {
        toast.error("Blind level up — you are now in Push-Fold territory");
      } else if (state.stage === "bubble") {
        toast.warning("Bubble approaching — ICM pressure rising");
      }
      prevStageRef.current = state.stage;
    }
  }, [state.stage]);

  const seatStacksBB = useMemo(
    () => seatStacksChips.map(c => (BB > 0 ? c / BB : 0)),
    [seatStacksChips, BB],
  );

  // Position
  const userLabel = userIdx >= 0 && dealerIdx >= 0 ? seatLabel(userIdx, dealerIdx, tableSize) : "";
  const position = userLabel ? labelToPosition(userLabel) : "BTN";

  // Action accounting (current street only for table contribs)
  const streetActions = actionHistory.filter(a => a.street === currentStreet);
  const streetContribs = useMemo(() => {
    const arr = Array(tableSize).fill(0);
    for (const a of streetActions) {
      if (a.amountBB > 0) arr[a.seatIdx] = Math.max(arr[a.seatIdx], a.amountBB);
    }
    return arr;
  }, [streetActions, tableSize]);
  const lastActions = useMemo(() => {
    const arr: (PlayerAction | null)[] = Array(tableSize).fill(null);
    for (const a of streetActions) arr[a.seatIdx] = a;
    return arr;
  }, [streetActions, tableSize]);
  const currentBet = streetContribs.reduce((m, v) => Math.max(m, v), 0);
  const defaultRaise = Math.max(currentBet * 3, currentBet + 2, 3);

  const handleSeatClick = (i: number) => {
    if (seatMode === "fold") {
      setFolded(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
      return;
    }
    if (seatMode === "action") return;
    if (seatMode === "dealer") { setDealerIdx(i); setSeatMode("user"); }
    else { setUserIdx(i); }
  };

  const handlePlayerAction = (seatIdx: number, t: ActionType, amountBB: number) => {
    setActionHistory(prev => [...prev, {
      seatIdx, street: currentStreet, type: t, amountBB,
      mAtAction: state.mRatio,
      stageAtAction: stageLabel(state.stage),
    }]);
    if (t === "Fold") {
      setFolded(prev => { const n = [...prev]; n[seatIdx] = true; return n; });
    }
  };

  const handleSizeChange = (s: TableSize) => {
    setTableSize(s);
    setDealerIdx(-1); setUserIdx(-1); setSeatMode("dealer");
    setFolded(Array(s).fill(false));
    setActionHistory([]);
    setSeatStacksChips(Array(s).fill(stackChipsResolved));
  };

  const removeCard = (c: string) => {
    if (hole.includes(c)) return setHole(hole.filter(x => x !== c));
    if (flop.includes(c)) { setFlop(flop.filter(x => x !== c)); setTurn(null); setRiver(null); return; }
    if (turn === c) { setTurn(null); setRiver(null); return; }
    if (river === c) { setRiver(null); }
  };
  const pickCard = (c: string) => {
    if (selected.includes(c)) return removeCard(c);
    if (pickMode === "hole") {
      if (hole.length >= 2) return;
      const next = [...hole, c]; setHole(next);
      if (next.length === 2) setPickMode("flop"); return;
    }
    if (pickMode === "flop") {
      if (flop.length >= 3) return;
      const next = [...flop, c]; setFlop(next);
      if (next.length === 3) setPickMode("turn"); return;
    }
    if (pickMode === "turn") { if (!turn) { setTurn(c); setPickMode("river"); } return; }
    if (pickMode === "river") { if (!river && turn) setRiver(c); }
  };

  const pf = useMemo(() => {
    if (hole.length < 2) return null;
    if (state.mRatio >= cfg.pushFoldThresholdM) return null;
    return pushFoldDecision(hole, position, state.mRatio, state.icmPressure, Math.max(1, playersAtTable - 1));
  }, [hole, position, state.mRatio, state.icmPressure, playersAtTable, cfg.pushFoldThresholdM]);

  const mColor = state.mRatio > 20 ? "text-emerald-400"
    : state.mRatio >= 10 ? "text-yellow-400"
    : state.mRatio >= 5 ? "text-orange-400"
    : "text-red-500";
  const icmColor = state.icmPressure === "critical" ? "bg-red-500/20 text-red-400 border-red-500/40"
    : state.icmPressure === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
    : state.icmPressure === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";

  // ===== AI Coach (Tournament Mode) =====
  const { lang } = useI18n();
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const runAI = async () => {
    if (hole.length < 2) { toast.error("Pick your hole cards first"); return; }
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      const all = [...hole, ...board];
      const ev = evaluateBest(all);
      const draws = detectDraws(hole, board);
      const texture = classifyTexture(board);
      const eq = estimateEquity(draws.outs, board.length);
      const adj = adjustedScore({ baseScore: ev.score, outs: draws.outs, texture, position });
      const liveOpponents: number[] = [];
      const positionsMap: Record<number, string> = {};
      const seatStacksBBMap: Record<number, number> = {};
      for (let i = 0; i < tableSize; i++) {
        if (i !== userIdx && !folded[i]) liveOpponents.push(i);
        if (dealerIdx >= 0) positionsMap[i] = seatLabel(i, dealerIdx, tableSize);
        seatStacksBBMap[i] = seatStacksBB[i] || 0;
      }
      const rr = inferRanges({
        actions: actionHistory, liveOpponentSeats: liveOpponents,
        positions: positionsMap, basePotBB: 1.5,
        boardTexture: texture, tournamentState: state,
        seatStacksBB: seatStacksBBMap, heroStackBB: state.stackBB,
      });
      const heroToCall = 0;
      const dynPot = 1.5;
      const po = potOdds(heroToCall, dynPot);
      const handClass = classifyHandStrength({
        baseScore: ev.score, category: ev.category, outs: draws.outs,
        drawType: draws.drawType, equityPct: eq, texture,
        opponents: liveOpponents.length, position, street: currentStreet,
        facingAggression: false, betSizePct: 0,
      });
      const dec = decide({
        baseScore: ev.score, adjScore: adj, outs: draws.outs, equityPct: eq,
        potOddsPct: po?.reqEquity ?? null, boardLen: board.length,
        facingRaise: false, betSizePct: 0, street: currentStreet,
        texture, opponents: liveOpponents.length, position, handClass,
      });
      const sizing = recommendSizing({
        street: currentStreet, baseScore: ev.score, adjScore: adj,
        outs: draws.outs, equityPct: eq, texture, position,
        pot: dynPot, call: heroToCall, opponents: liveOpponents.length,
        action: dec.action,
      });
      const stacks = seatStacksBB.filter((_, i) => liveOpponents.includes(i));
      const biggest = stacks.length ? Math.max(...stacks) : 0;
      const smallest = stacks.length ? Math.min(...stacks) : 0;
      const heroStackRelative = state.stackBB > biggest * 2 ? "big"
        : state.stackBB < smallest * 0.5 ? "short" : "medium";

      const ip = ["BTN", "CO", "HJ"].includes(position);
      const analysis = generateCoachAnalysis({
        action: pf?.action ?? dec.action,
        reasoning: pf?.reasoning ?? dec.reason,
        handCategory: ev.category,
        adjScore: adj,
        baseScore: ev.score,
        outs: draws.outs,
        drawType: draws.drawType,
        equityPct: eq,
        texture,
        potOdds: po?.odds ?? null,
        reqEquity: po?.reqEquity ?? null,
        heroRA: 50,
        villainRA: 50,
        sizing,
        rangeReadout: {
          aggregateStrength: rr.aggregateStrength,
          dominantRangeType: rr.dominantRangeType,
          aggregateBluffFreq: rr.aggregateBluffFreq,
          opponents: rr.opponents.map(o => ({
            position: o.position, estimatedStrength: o.estimatedStrength, rangeType: o.rangeType,
          })),
        },
        street: currentStreet,
        position,
        opponents: liveOpponents.length,
        inPosition: ip,
        tournament: {
          type: state.type,
          mRatio: state.mRatio,
          stackBB: state.stackBB,
          stage: state.stage,
          icmPressure: state.icmPressure,
          playersRemaining: state.playersRemaining,
          payoutSpots: state.payoutSpots,
          isNearBubble: state.playersRemaining <= state.payoutSpots * 1.3,
          isFinalTable: state.playersRemaining <= state.payoutSpots,
          heroStackRelative,
          pushFold: pf ? { action: pf.action, reasoning: pf.reasoning, handTier: pf.handTier } : null,
        },
        lang,
      });
      setAiResult(analysis);
    } catch (e: any) {
      const msg = e?.message || "Local analysis failed";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="space-y-6">
      <Card className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="display text-xl">Tournament Type</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.values(TOURNAMENT_TYPES).map(c => (
            <button
              key={c.id}
              onClick={() => setType(c.id)}
              className={`text-left p-3 rounded-lg border transition ${
                type === c.id ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/50"
              }`}
            >
              <div className="font-semibold text-sm">{c.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{c.startingStackBB}BB · {c.blindIntervalMin}min</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{c.description}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="glass-panel p-6">
        <h2 className="display text-xl mb-4">Tournament State</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Level / BB (chips)</Label>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">L{levelIdx + 1}</span>
              <Input type="number" min={1} value={BB} readOnly className="bg-muted/30" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Ante (chips)</Label>
            <Input type="number" min={0} value={ante} onChange={e => setAnte(+e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hero stack ({stackUnit})</Label>
            <div className="flex gap-2">
              <Input type="number" min={0} value={stackChips} onChange={e => setStackChips(+e.target.value)} />
              <Button type="button" variant="outline" size="sm"
                onClick={() => setStackUnit(u => u === "chips" ? "bb" : "chips")}>
                {stackUnit === "chips" ? "→ BB" : "→ Chips"}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Players remaining</Label>
            <Input type="number" min={1} value={playersRemaining} onChange={e => setPlayersRemaining(+e.target.value || 1)} />
          </div>
          <div className="space-y-1.5">
            <Label>Players paid</Label>
            <Input type="number" min={0} value={payoutSpots} onChange={e => setPayoutSpots(+e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Next level in</Label>
            <Input value={`${String(Math.floor(timerSec / 60)).padStart(2, "0")}:${String(timerSec % 60).padStart(2, "0")}`} readOnly className="font-mono bg-muted/30" />
          </div>
        </div>
      </Card>
      <Card className="glass-panel p-6">
        <h2 className="display text-xl mb-4">Table & Position</h2>
        <PokerTable
          size={tableSize}
          dealerIdx={dealerIdx}
          userIdx={userIdx}
          mode={seatMode}
          folded={folded}
          streetContribs={streetContribs}
          lastActions={lastActions}
          currentBet={currentBet}
          defaultRaise={defaultRaise}
          onSeatClick={handleSeatClick}
          onPlayerAction={handlePlayerAction}
          onModeChange={setSeatMode}
          onSizeChange={handleSizeChange}
          tournamentState={state}
          seatStacksBB={seatStacksBB}
          levelTimerSec={timerSec}
          flashMRatio={flashMRatio}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          {seatStacksChips.slice(0, tableSize).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-10">S{i + 1}</span>
              <Input
                type="number"
                min={0}
                value={s}
                onChange={e => {
                  const v = +e.target.value;
                  setSeatStacksChips(prev => { const n = [...prev]; n[i] = v; return n; });
                }}
                className="h-7 text-xs"
              />
              <span className="text-muted-foreground">{(s / BB).toFixed(1)}BB</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="glass-panel p-5">
        <StreetSlots
          hole={hole} flop={flop} turn={turn} river={river}
          pickMode={pickMode} setPickMode={setPickMode}
          onRemove={removeCard} currentStreet={currentStreet}
        />
        <div className="pt-5 mt-5 border-t border-border/40">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Deck</p>
          <CardPicker selected={selected} hole={hole} board={board} onPick={pickCard} />
        </div>
      </Card>
      </div>

      <div className="space-y-6">
      <Card className="glass-panel p-6">
        <h2 className="display text-xl mb-4">Live Read</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">M-Ratio</div>
            <div className={`text-3xl font-bold ${mColor} ${flashMRatio ? "animate-pulse" : ""}`}>{state.mRatio.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Stack (BB)</div>
            <div className="text-3xl font-bold">{state.stackBB.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Stage</div>
            <Badge variant="outline" className="text-sm mt-1">{stageLabel(state.stage)}</Badge>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">ICM Pressure</div>
            <Badge className={`text-sm mt-1 ${icmColor}`} variant="outline">{state.icmPressure.toUpperCase()}</Badge>
          </div>
        </div>
      </Card>

      {pf && (
        <Card className="glass-panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="display text-lg gold-text">Push / Fold Decision</h3>
            <Badge variant="outline" className="text-sm">{pf.handTier}</Badge>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Badge
              className={`text-base px-3 py-1 ${
                pf.action === "Shove" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : pf.action === "Call-Shove" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                  : "bg-red-500/20 text-red-400 border-red-500/40"
              }`}
              variant="outline"
            >
              {pf.action}
            </Badge>
            <span className="text-xs text-muted-foreground">M={state.mRatio.toFixed(1)} · {position}</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{pf.reasoning}</p>
          <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
            ICM-adjusted aggression factor:{" "}
            <span className="text-foreground font-medium">
              {(icmAdjustedScore(100, state.icmPressure, state.stage) / 100).toFixed(2)}x
            </span>
          </div>
        </Card>
      )}

      <Card className="glass-panel p-6">
        <h3 className="display text-lg mb-3">Action History</h3>
        {actionHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground">No actions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left pr-2">Seat</th>
                  <th className="text-left pr-2">Street</th>
                  <th className="text-left pr-2">Action</th>
                  <th className="text-left pr-2">BB</th>
                  <th className="text-left pr-2">M</th>
                  <th className="text-left pr-2">Stage</th>
                </tr>
              </thead>
              <tbody>
                {actionHistory.map((a, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="pr-2">S{a.seatIdx + 1}</td>
                    <td className="pr-2">{a.street}</td>
                    <td className="pr-2 font-semibold">{a.type}</td>
                    <td className="pr-2">{a.amountBB || "-"}</td>
                    <td className="pr-2 font-mono">{a.mAtAction.toFixed(1)}</td>
                    <td className="pr-2">{a.stageAtAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Button
        onClick={runAI}
        disabled={aiLoading || hole.length < 2}
        className="w-full h-12 text-base font-semibold"
        style={{ background: "var(--gradient-gold)", color: "hsl(var(--primary-foreground))" }}
      >
        <Sparkles className="w-5 h-5 mr-2" />
        {aiLoading ? "Analyzing..." : `Run AI Tournament Coach (${currentStreet})`}
      </Button>

      <AIPanel analysis={aiResult} loading={aiLoading} error={aiError} />

    </div>
  );
}

