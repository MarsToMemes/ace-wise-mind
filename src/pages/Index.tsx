import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, RotateCcw, Spade } from "lucide-react";
import { CardPicker } from "@/components/CardPicker";
import { StreetSlots } from "@/components/StreetSlots";
import { EngineReadout, EngineResult } from "@/components/EngineReadout";
import { AIPanel, AIAnalysis } from "@/components/AIPanel";
import { PokerTable, TableSize, SeatMode, labelToPosition, seatLabel } from "@/components/PokerTable";
import { PlayerAction, ActionType } from "@/components/ActionMenu";
import {
  evaluateBest, detectDraws, classifyTexture, rangeAdvantage,
  potOdds, estimateEquity, adjustedScore, decide, recommendSizing,
} from "@/lib/pokerEngine";
import { inferRanges, rangeModifiers } from "@/lib/rangeInference";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrainingMode } from "@/components/TrainingMode";

type PickMode = "hole" | "flop" | "turn" | "river";
type Street = "Preflop" | "Flop" | "Turn" | "River";

const Index = () => {
  const { t, lang } = useI18n();
  const [appMode, setAppMode] = useState<"analyzer" | "training">("analyzer");
  const [hole, setHole] = useState<string[]>([]);
  const [flop, setFlop] = useState<string[]>([]);
  const [turn, setTurn] = useState<string | null>(null);
  const [river, setRiver] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("hole");
  const [tableSize, setTableSize] = useState<TableSize>(6);
  const [dealerIdx, setDealerIdx] = useState<number>(-1);
  const [userIdx, setUserIdx] = useState<number>(-1);
  const [seatMode, setSeatMode] = useState<SeatMode>("dealer");
  const [folded, setFolded] = useState<boolean[]>(() => Array(6).fill(false));
  const [stack, setStack] = useState(100);
  const [pot, setPot] = useState(10);
  const [call, setCall] = useState(0);
  const [actionHistory, setActionHistory] = useState<PlayerAction[]>([]);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const userLabel = userIdx >= 0 && dealerIdx >= 0 ? seatLabel(userIdx, dealerIdx, tableSize) : "";
  const position = userLabel ? labelToPosition(userLabel) : "BTN";
  // Active opponents = seats not folded, excluding the user
  const activeSeats = folded.reduce((n, f) => n + (f ? 0 : 1), 0);
  const opponents = Math.max(
    0,
    activeSeats - (userIdx >= 0 && !folded[userIdx] ? 1 : 0),
  );
  // Heads-up (2 players): BTN posts SB, the other seat is BB
  const sbIdx = dealerIdx >= 0 ? (tableSize === 2 ? dealerIdx : (dealerIdx + 1) % tableSize) : -1;
  const bbIdx = dealerIdx >= 0 ? (tableSize === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % tableSize) : -1;

  const board = useMemo(() => {
    const b = [...flop];
    if (turn) b.push(turn);
    if (river) b.push(river);
    return b;
  }, [flop, turn, river]);

  const selected = [...hole, ...board];

  const currentStreet: Street = useMemo(() => {
    if (board.length === 0) return "Preflop";
    if (board.length === 3) return "Flop";
    if (board.length === 4) return "Turn";
    if (board.length === 5) return "River";
    return "Preflop";
  }, [board.length]);

  // === Action tracking (per current street) ===
  const streetActions = useMemo(
    () => actionHistory.filter(a => a.street === currentStreet),
    [actionHistory, currentStreet],
  );
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
  const currentBet = useMemo(
    () => streetContribs.reduce((m, v) => Math.max(m, v), 0),
    [streetContribs],
  );
  const totalCommitted = useMemo(
    () => actionHistory.reduce((s, a) => s + (a.amountBB || 0), 0),
    [actionHistory],
  );
  const dynamicPot = pot + totalCommitted;
  const userToCall = userIdx >= 0
    ? Math.max(0, currentBet - (streetContribs[userIdx] || 0))
    : call;
  const defaultRaise = Math.max(currentBet * 3, currentBet + 2, Math.round(dynamicPot * 0.66));

  const engine = useMemo<EngineResult | null>(() => {
    if (hole.length < 2) return null;
    const all = [...hole, ...board];
    const ev = evaluateBest(all);
    const draws = detectDraws(hole, board);
    const texture = classifyTexture(board);
    const ra = rangeAdvantage(position, board);
    const po = potOdds(userToCall, dynamicPot);
    const equityPct = estimateEquity(draws.outs, board.length);
    const adjScore = adjustedScore({ baseScore: ev.score, outs: draws.outs, texture, position });

    // Range inference from action history
    const liveOpponentSeats: number[] = [];
    if (dealerIdx >= 0) {
      for (let i = 0; i < tableSize; i++) {
        if (i === userIdx) continue;
        if (!folded[i]) liveOpponentSeats.push(i);
      }
    }
    const positionsMap: Record<number, string> = {};
    if (dealerIdx >= 0) {
      for (let i = 0; i < tableSize; i++) positionsMap[i] = seatLabel(i, dealerIdx, tableSize);
    }
    const rangeReadout = inferRanges({
      actions: actionHistory,
      liveOpponentSeats,
      positions: positionsMap,
      basePotBB: pot,
    });
    const rangeMods = rangeModifiers(rangeReadout);

    // Apply range strength delta to effective adjScore for decision making
    const effAdjScore = Math.max(0, adjScore + rangeMods.strengthDelta);
    const effEquityPct = Math.max(0, Math.min(100, equityPct + rangeMods.aggressionDelta * 5));

    const decision = decide({
      baseScore: ev.score,
      adjScore: effAdjScore,
      outs: draws.outs,
      equityPct: effEquityPct,
      potOddsPct: po ? po.reqEquity : null,
      boardLen: board.length,
    });
    const sizing = recommendSizing({
      street: currentStreet,
      baseScore: ev.score,
      adjScore: effAdjScore,
      outs: draws.outs,
      equityPct: effEquityPct,
      texture,
      position,
      pot: dynamicPot,
      call: userToCall,
      opponents,
      action: decision.action,
      rangeMods,
    });
    return {
      category: ev.category, score: ev.score,
      adjScore,
      drawType: draws.drawType, outs: draws.outs,
      equityPct,
      texture, heroRA: ra.hero, villainRA: ra.villain,
      potOdds: po?.odds ?? null, reqEquity: po?.reqEquity ?? null,
      suggestedAction: decision.action,
      decisionReason: decision.reason + ` ${rangeMods.reason}`,
      sizing,
      rangeReadout,
    } as EngineResult;
  }, [hole, board, position, dynamicPot, userToCall, currentStreet, opponents, actionHistory, dealerIdx, userIdx, tableSize, folded, pot]);

  const removeCard = (card: string) => {
    if (hole.includes(card)) return setHole(hole.filter(c => c !== card));
    if (flop.includes(card)) {
      // removing a flop card invalidates turn/river
      setFlop(flop.filter(c => c !== card));
      setTurn(null); setRiver(null);
      return;
    }
    if (turn === card) { setTurn(null); setRiver(null); return; }
    if (river === card) { setRiver(null); return; }
  };

  const pickCard = (card: string) => {
    if (selected.includes(card)) return removeCard(card);

    if (pickMode === "hole") {
      if (hole.length >= 2) { toast.error(t("toast.holeFull")); return; }
      const next = [...hole, card];
      setHole(next);
      if (next.length === 2) setPickMode("flop");
      return;
    }
    if (pickMode === "flop") {
      if (flop.length >= 3) { toast.error(t("toast.flopFull")); return; }
      const next = [...flop, card];
      setFlop(next);
      if (next.length === 3) setPickMode("turn");
      return;
    }
    if (pickMode === "turn") {
      if (flop.length < 3) { toast.error(t("toast.completeFlop")); return; }
      if (turn) { toast.error(t("toast.turnSet")); return; }
      setTurn(card);
      setPickMode("river");
      return;
    }
    if (pickMode === "river") {
      if (!turn) { toast.error(t("toast.setTurn")); return; }
      if (river) { toast.error(t("toast.riverSet")); return; }
      setRiver(card);
    }
  };

  const reset = () => {
    setHole([]); setFlop([]); setTurn(null); setRiver(null);
    setAiResult(null); setAiError(null);
    setPickMode("hole");
    setDealerIdx(-1); setUserIdx(-1); setSeatMode("dealer");
    setFolded(Array(tableSize).fill(false));
    setStack(100); setPot(10); setCall(0);
    setActionHistory([]);
  };

  const handleSeatClick = (i: number) => {
    if (seatMode === "fold") {
      setFolded(prev => {
        const next = [...prev];
        next[i] = !next[i];
        return next;
      });
      return;
    }
    if (seatMode === "action") return; // handled by ActionMenu inside table
    if (seatMode === "dealer") {
      setDealerIdx(i);
      setSeatMode("user");
    } else {
      setUserIdx(i);
    }
  };

  const handlePlayerAction = (seatIdx: number, type: ActionType, amountBB: number) => {
    setActionHistory(prev => [...prev, { seatIdx, street: currentStreet, type, amountBB }]);
    if (type === "Fold") {
      setFolded(prev => {
        const next = [...prev];
        next[seatIdx] = true;
        return next;
      });
    }
  };

  const handleSizeChange = (s: TableSize) => {
    setTableSize(s);
    setDealerIdx(-1); setUserIdx(-1); setSeatMode("dealer");
    setFolded(Array(s).fill(false));
    setActionHistory([]);
  };

  const runAI = async () => {
    if (!engine) { toast.error(t("toast.pickHole")); return; }
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("poker-coach", {
        body: {
          hole, board, flop, turn, river,
          currentStreet,
          lang,
          position, opponents, stack,
          pot: dynamicPot,
          basePot: pot,
          call: userToCall,
          userPosition: userLabel || position,
          inPosition: ["BTN", "CO", "HJ"].includes(position),
          relativePosition: ["BTN", "CO", "HJ"].includes(position) ? "IP" : "OOP",
          table: {
            number_of_players: tableSize,
            dealer_position_index: dealerIdx,
            user_position_index: userIdx,
            user_position: userLabel || position,
            sb_index: sbIdx,
            bb_index: bbIdx,
            active_players: activeSeats,
            active_opponents: opponents,
            folded_seats: folded.map((f, i) => f ? i : -1).filter(i => i >= 0),
            multiway: opponents >= 2,
          },
          action_history: actionHistory.map(a => ({
            seat: a.seatIdx,
            position: dealerIdx >= 0 ? seatLabel(a.seatIdx, dealerIdx, tableSize) : `S${a.seatIdx + 1}`,
            street: a.street,
            type: a.type,
            amount_bb: a.amountBB,
          })),
          current_street_actions: streetActions.map(a => ({
            seat: a.seatIdx,
            type: a.type,
            amount_bb: a.amountBB,
          })),
          current_bet_to_match_bb: currentBet,
          total_committed_bb: totalCommitted,
          handCategory: engine.category,
          handScore: engine.score,
          adjScore: engine.adjScore,
          drawType: engine.drawType,
          outs: engine.outs,
          equityPct: engine.equityPct,
          texture: engine.texture,
          potOdds: engine.potOdds ? (engine.potOdds * 100).toFixed(1) + "%" : null,
          reqEquity: engine.reqEquity ? engine.reqEquity.toFixed(1) + "%" : null,
          heroRA: engine.heroRA,
          villainRA: engine.villainRA,
          suggestedAction: engine.suggestedAction,
          decisionReason: engine.decisionReason,
          sizing: engine.sizing,
          range_inference: engine.rangeReadout ? {
            aggregate_strength: engine.rangeReadout.aggregateStrength,
            aggregate_bluff_frequency: engine.rangeReadout.aggregateBluffFreq,
            dominant_range_type: engine.rangeReadout.dominantRangeType,
            opponents: engine.rangeReadout.opponents.map(o => ({
              seat: o.seatIdx,
              position: o.position,
              estimated_strength: o.estimatedStrength,
              range_type: o.rangeType,
              bluff_frequency: o.bluffFrequency,
              notes: o.notes,
            })),
            notes: engine.rangeReadout.notes,
          } : null,
        },
      });
      if (error) throw error;
      if (data?.error) { setAiError(data.error); toast.error(data.error); return; }
      setAiResult(data.analysis);
    } catch (e: any) {
      const msg = e?.message || "Failed to get AI analysis";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/40 sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-gold)" }}>
              <Spade className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="display text-2xl gold-text leading-none">{t("app.title")}</h1>
              <p className="text-xs text-muted-foreground">{t("app.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            {appMode === "analyzer" && (
              <Button variant="outline" size="sm" onClick={reset} className="gold-border">
                <RotateCcw className="w-4 h-4 mr-2" /> {t("btn.reset")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container pt-6">
        <Tabs value={appMode} onValueChange={(v) => setAppMode(v as "analyzer" | "training")}>
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="analyzer">{t("mode.analyzer")}</TabsTrigger>
            <TabsTrigger value="training">{t("mode.training")}</TabsTrigger>
          </TabsList>

          <TabsContent value="analyzer">
            <main className="py-6 grid lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <Card className="glass-panel p-5">
                  <StreetSlots
                    hole={hole}
                    flop={flop}
                    turn={turn}
                    river={river}
                    pickMode={pickMode}
                    setPickMode={setPickMode}
                    onRemove={removeCard}
                    currentStreet={currentStreet}
                  />
                  <div className="pt-5 mt-5 border-t border-border/40">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("section.deck")}</p>
                    <CardPicker selected={selected} hole={hole} board={board} onPick={pickCard} />
                  </div>
                </Card>

                <Card className="glass-panel p-6">
                  <h2 className="display text-xl mb-4">{t("section.tableAndPosition")}</h2>
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
                  />
                </Card>

                <Card className="glass-panel p-6">
                  <h2 className="display text-xl mb-4">{t("section.stakes")}</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("field.stack")}</Label>
                      <Input type="number" min={0} value={stack} onChange={e => setStack(+e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("field.pot")}</Label>
                      <Input type="number" min={0} value={pot} onChange={e => setPot(+e.target.value)} />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>{t("field.call")}</Label>
                      <Input type="number" min={0} value={call} onChange={e => setCall(+e.target.value)} />
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <EngineReadout result={engine} />

                <Button
                  onClick={runAI}
                  disabled={!engine || aiLoading}
                  className="w-full h-12 text-base font-semibold"
                  style={{ background: "var(--gradient-gold)", color: "hsl(var(--primary-foreground))" }}
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  {aiLoading ? t("btn.analyzing") : `${t("btn.runAi")} (${currentStreet})`}
                </Button>

                <AIPanel analysis={aiResult} loading={aiLoading} error={aiError} />
              </div>
            </main>
          </TabsContent>

          <TabsContent value="training">
            <main className="py-6">
              <TrainingMode />
            </main>
          </TabsContent>
        </Tabs>
      </div>

      <footer className="container py-8 text-center text-xs text-muted-foreground">
        {t("footer.note")}
      </footer>
    </div>
  );
};

export default Index;
