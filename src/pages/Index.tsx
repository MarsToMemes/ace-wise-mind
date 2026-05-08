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
  classifyHandStrength,
} from "@/lib/pokerEngine";
import { inferRanges, rangeModifiers } from "@/lib/rangeInference";
import { evaluateHandVsRange } from "@/lib/handVsRange";
import { buildExplanation } from "@/lib/explanationEngine";
import { buildConditionalLines } from "@/lib/conditionalLines";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrainingMode } from "@/components/TrainingMode";
import { TournamentPanel } from "@/components/TournamentPanel";

type PickMode = "hole" | "flop" | "turn" | "river";
type Street = "Preflop" | "Flop" | "Turn" | "River";
type AnalyzerMode = "cash" | "tournament";

const Index = () => {
  const { t, lang } = useI18n();
  const [appMode, setAppMode] = useState<"analyzer" | "training">("analyzer");
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("cash");
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
  const [geminiText, setGeminiText] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);

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

    // ===== Hand vs Range — Monte Carlo equity vs opponent distributions =====
    const hvr = board.length >= 3 && hole.length === 2 && rangeReadout.opponents.length > 0
      ? evaluateHandVsRange({ hole, board, opponentRanges: rangeReadout.opponents })
      : null;

    // Apply range strength delta to effective adjScore for decision making
    const effAdjScore = Math.max(0, adjScore + rangeMods.strengthDelta);
    // Prefer the range-relative equity when available — it's contextual, not absolute.
    const effEquityPct = hvr
      ? hvr.equity_percentage
      : Math.max(0, Math.min(100, equityPct + rangeMods.aggressionDelta * 5));

    // Detect "facing a raise": hero has already bet/raised this street AND there is now a higher bet to call
    const heroBetThisStreet = userIdx >= 0 && streetActions.some(
      a => a.seatIdx === userIdx && (a.type === "Bet" || a.type === "Raise"),
    );
    const facingRaise = heroBetThisStreet && userToCall > 0;
    const betSizePct = dynamicPot > 0 ? (userToCall / dynamicPot) * 100 : 0;

    let handClass = classifyHandStrength({
      baseScore: ev.score,
      category: ev.category,
      outs: draws.outs,
      drawType: draws.drawType,
      equityPct: effEquityPct,
      texture,
      opponents,
      position,
      street: currentStreet,
      facingAggression: userToCall > 0 || facingRaise,
      betSizePct,
    });

    // OVERRIDE absolute classification with range-relative verdict when available.
    // This eliminates false "weak hand" bias when hero crushes opponents' actual ranges.
    if (hvr) {
      const map: Record<string, "Strong" | "Medium" | "Weak"> = {
        "Strong vs Range": "Strong",
        "Medium vs Range": "Medium",
        "Weak vs Range": "Weak",
      };
      const rangeCat = map[hvr.hand_vs_range_strength];
      // Draws keep their Draw label (equity is realized later).
      if (handClass.hand_category !== "Draw") {
        handClass = {
          hand_category: rangeCat,
          confidence_level: hvr.confidence_level,
          reason: `vs opp range: ${hvr.detail}`,
        };
      }
    }

    const decision = decide({
      baseScore: ev.score,
      adjScore: effAdjScore,
      outs: draws.outs,
      equityPct: effEquityPct,
      potOddsPct: po ? po.reqEquity : null,
      boardLen: board.length,
      facingRaise,
      betSizePct,
      street: currentStreet,
      texture,
      opponents,
      position,
      handClass,
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
      equityPct: hvr ? hvr.equity_percentage : equityPct,
      texture, heroRA: ra.hero, villainRA: ra.villain,
      potOdds: po?.odds ?? null, reqEquity: po?.reqEquity ?? null,
      suggestedAction: decision.action,
      decisionReason: decision.reason + ` ${rangeMods.reason}`,
      sizing,
      rangeReadout,
      handClass,
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
      // Local deterministic analysis — no external AI required.
      const action = engine.suggestedAction || "Check";
      const sizing = engine.sizing;
      const rr = engine.rangeReadout;
      const ip = ["BTN", "CO", "HJ"].includes(position);
      const explanation = buildExplanation({
        engine, street: currentStreet, position, opponents,
        userToCall, pot: dynamicPot, lang,
      });
      const reasoning = explanation.fullText;
      const sizingLine = sizing
        ? `${t(`act.${sizing.heroAction}`) || sizing.heroAction} ${sizing.amountBB} BB (${sizing.pctMin}–${sizing.pctMax}% ${t("engine.ofPot")}) — ${sizing.intent}. ${sizing.explanation}`
        : t("local.noBet");
      const rangeLine = rr && rr.opponents.length
        ? t("local.oppRange", { s: rr.aggregateStrength, type: rr.dominantRangeType, bf: Math.round(rr.aggregateBluffFreq * 100) })
        : t("local.noOpp");
      const flushDrawOnBoard = /([shdc]).*\1.*\1/.test(board.join(""));
      const boardVals = board.map(c => "23456789TJQKA".indexOf(c[0]) + 2).sort((a, b) => a - b);
      let straightDrawOnBoard = false;
      for (let i = 0; i + 1 < boardVals.length; i++) {
        if (boardVals[i + 1] - boardVals[i] <= 2) { straightDrawOnBoard = true; break; }
      }
      const conditional = buildConditionalLines({
        engine, street: currentStreet, position, opponents,
        userToCall, pot: dynamicPot, lang,
        flushDrawOnBoard, straightDrawOnBoard,
      });

      const analysis: AIAnalysis = {
        decision_explanation: {
          action: (["Raise", "Call", "Check", "Fold"].includes(action) ? action : "Check") as string,
          reasoning: `${reasoning} ${sizingLine}`.trim(),
          confidence: Math.max(0.5, Math.min(0.95, (engine.adjScore || 50) / 100)),
        },
        street_strategy: {
          current_street_plan: `${currentStreet}: ${sizingLine}`,
          turn_plan: currentStreet === "Preflop" || currentStreet === "Flop"
            ? (engine.adjScore >= 65 ? t("local.turnContinue") : engine.outs >= 8 ? t("local.turnBarrel") : t("local.turnControl"))
            : t("local.recap"),
          river_plan: currentStreet === "River"
            ? t("local.riverFinal")
            : (engine.adjScore >= 70 ? t("local.riverValue") : engine.adjScore <= 35 ? t("local.riverGiveup") : t("local.riverCatch")),
        },
        conditional_lines: conditional,
        range_thinking: {
          what_you_represent: `${ip ? "IP" : "OOP"} ${userLabel || position}: ${Number(engine.heroRA) >= 55 ? t("local.repAdv") : t("local.repCap")}.`,
          what_opponent_represents: rangeLine,
        },
        key_concepts: [
          t("local.kc.equity"),
          t("local.kc.range", { h: engine.heroRA, v: engine.villainRA }),
          t("local.kc.texture", { t: t(`texture.${engine.texture}`) }),
          opponents >= 2 ? t("local.kc.multi") : t("local.kc.hu"),
        ],
        mistakes_to_avoid: [
          engine.adjScore <= 35 ? t("local.av.bluff") : t("local.av.slow"),
          sizing?.facingBet && (engine.potOdds && engine.reqEquity && engine.equityPct < engine.reqEquity)
            ? t("local.av.callPrice")
            : t("local.av.sizeOut"),
          t("local.av.position"),
        ],
      };
      setAiResult(analysis);
    } catch (e: any) {
      const msg = e?.message || "Local analysis failed";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const explainWithGemini = async () => {
    if (!engine) { toast.error(t("toast.pickHole")); return; }
    setGeminiLoading(true); setGeminiText(null);
    try {
      const ctx: string[] = [];
      if (engine.equityPct && engine.reqEquity) {
        ctx.push(engine.equityPct >= engine.reqEquity ? "equity exceeds pot odds" : "equity below pot odds");
      }
      if (engine.drawType && engine.drawType !== "None") ctx.push(engine.drawType);
      if (engine.texture) ctx.push(`${engine.texture} board`);
      if (opponents >= 2) ctx.push("multiway pot");
      if (engine.sizing?.facingBet) ctx.push("facing a bet");
      const lastAggressive = [...actionHistory].reverse().find(a => a.type === "Bet" || a.type === "Raise");
      if (lastAggressive) ctx.push(`opponent ${lastAggressive.type.toLowerCase()} ${lastAggressive.amountBB}bb`);

      const { data, error } = await supabase.functions.invoke("gemini-explain", {
        body: {
          hand: hole.join(" "),
          board: board.join(" "),
          street: currentStreet,
          position,
          action_taken: actionHistory.length ? actionHistory[actionHistory.length - 1].type : "",
          recommended_action: engine.suggestedAction,
          bet_size: userToCall,
          pot_size: dynamicPot,
          active_players: opponents + 1,
          explanation_context: ctx,
          lang,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeminiText(data?.explanation || "");
    } catch (e: any) {
      toast.error(e?.message || "Gemini error");
    } finally {
      setGeminiLoading(false);
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

                {aiResult && (
                  <Card className="glass-panel p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="display text-lg gold-text">{lang === "fr" ? "Explication IA (Gemini)" : "AI Explanation (Gemini)"}</h4>
                      <Button size="sm" variant="outline" onClick={explainWithGemini} disabled={geminiLoading}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {geminiLoading ? (lang === "fr" ? "Analyse..." : "Thinking...") : (lang === "fr" ? "Expliquer la décision" : "Explain decision")}
                      </Button>
                    </div>
                    {geminiText && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{geminiText}</p>}
                  </Card>
                )}
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
