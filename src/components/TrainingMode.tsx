import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlayingCard } from "./PlayingCard";
import {
  generateScenario, evaluateDecision, loadStats, saveStats, resetStats,
  Scenario, UserAction, Evaluation, Stats,
} from "@/lib/scenarioGenerator";
import { useI18n } from "@/lib/i18n";
import { Sparkles, RotateCcw, ArrowRight, Check, X, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ACTIONS: UserAction[] = ["Fold", "Call", "Check", "Raise"];

export const TrainingMode = () => {
  const { t, lang } = useI18n();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [userChoice, setUserChoice] = useState<UserAction | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [aiCoach, setAiCoach] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!scenario) setScenario(generateScenario());
  }, []);

  const next = () => {
    setScenario(generateScenario());
    setEvaluation(null);
    setUserChoice(null);
    setAiCoach(null);
  };

  const choose = async (a: UserAction) => {
    if (!scenario || evaluation) return;
    const ev = evaluateDecision(scenario, a);
    setUserChoice(a);
    setEvaluation(ev);
    const newStats: Stats = {
      total: stats.total + 1,
      correct: stats.correct + (ev.correct ? 1 : 0),
      evSum: +(stats.evSum + ev.evDiff).toFixed(2),
      byAction: {
        ...stats.byAction,
        [a]: {
          picked: stats.byAction[a].picked + 1,
          correct: stats.byAction[a].correct + (ev.correct ? 1 : 0),
        },
      },
    };
    setStats(newStats);
    saveStats(newStats);

    // Optional AI coaching
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke("poker-coach", {
        body: {
          hole: scenario.hole, board: scenario.board,
          flop: scenario.board.slice(0, 3),
          turn: scenario.board[3] ?? null,
          river: scenario.board[4] ?? null,
          currentStreet: scenario.street,
          lang,
          position: scenario.position,
          opponents: scenario.opponents,
          stack: scenario.stack, pot: scenario.pot, call: scenario.call,
          handCategory: scenario.category,
          handScore: 0,
          adjScore: scenario.adjScore,
          drawType: scenario.drawType,
          outs: scenario.outs,
          equityPct: scenario.equityPct,
          texture: scenario.texture,
          potOdds: scenario.reqEquity ? scenario.reqEquity.toFixed(1) + "%" : null,
          reqEquity: scenario.reqEquity ? scenario.reqEquity.toFixed(1) + "%" : null,
          heroRA: "Neutral", villainRA: "Neutral",
          suggestedAction: scenario.correctAction,
          decisionReason: scenario.reason,
          training: { userChoice: a, correctAction: scenario.correctAction, evDiff: ev.evDiff },
        },
      });
      if (data?.analysis?.summary) setAiCoach(data.analysis.summary);
    } catch {}
    setAiLoading(false);
  };

  const handleReset = () => setStats(resetStats());

  if (!scenario) return null;

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Scenario */}
      <Card className="glass-panel p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-xl">{t("training.scenario")}</h2>
          <Badge variant="outline" className="gold-border">{scenario.street}</Badge>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("slots.yourHand")}</p>
          <div className="flex gap-2">
            {scenario.hole.map(c => <PlayingCard key={c} card={c} size="md" animated />)}
          </div>
        </div>

        {scenario.board.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("training.board")}</p>
            <div className="flex gap-2 flex-wrap">
              {scenario.board.map(c => <PlayingCard key={c} card={c} size="md" animated />)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("training.position")}</p>
            <p className="font-semibold">{scenario.position}</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("training.opponents")}</p>
            <p className="font-semibold">{scenario.opponents}</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("field.pot")}</p>
            <p className="font-semibold">{scenario.pot} BB</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">{t("training.toCall")}</p>
            <p className="font-semibold">{scenario.call > 0 ? `${scenario.call} BB` : "—"}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("training.yourAction")}</p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map(a => {
              const isChosen = userChoice === a;
              const isCorrect = scenario.correctAction === a;
              const showResult = !!evaluation;
              return (
                <Button
                  key={a}
                  variant="outline"
                  disabled={!!evaluation}
                  onClick={() => choose(a)}
                  className={
                    showResult && isCorrect ? "border-green-500/60 bg-green-500/10" :
                    showResult && isChosen && !isCorrect ? "border-red-500/60 bg-red-500/10" : ""
                  }
                >
                  {a}
                  {showResult && isCorrect && <Check className="w-4 h-4 ml-1 text-green-500" />}
                  {showResult && isChosen && !isCorrect && <X className="w-4 h-4 ml-1 text-red-500" />}
                </Button>
              );
            })}
          </div>
        </div>

        {evaluation && (
          <Button onClick={next} className="w-full" style={{ background: "var(--gradient-gold)", color: "hsl(var(--primary-foreground))" }}>
            {t("training.next")} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </Card>

      {/* Feedback + Stats */}
      <div className="space-y-6">
        <Card className="glass-panel p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="display text-xl">{t("training.feedback")}</h2>
          </div>
          {!evaluation ? (
            <p className="text-muted-foreground text-sm">{t("training.pickToSee")}</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {evaluation.correct ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/40">{t("training.correct")}</Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/40">{t("training.incorrect")}</Badge>
                )}
                <Badge variant="outline" className={evaluation.evDiff >= 0 ? "border-green-500/40" : "border-red-500/40"}>
                  {evaluation.evDiff >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  EV {evaluation.evDiff >= 0 ? "+" : ""}{evaluation.evDiff} BB
                </Badge>
              </div>
              <p className="text-sm">{evaluation.feedback}</p>
              <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">{t("engine.handStrength")}:</span> {scenario.category}</p>
                <p><span className="text-muted-foreground">{t("engine.draw")}:</span> {scenario.drawType} ({scenario.outs} outs)</p>
                <p><span className="text-muted-foreground">{t("engine.equity")}:</span> {scenario.equityPct.toFixed(0)}%
                  {scenario.reqEquity !== null && <> · {t("engine.needEquity", { n: scenario.reqEquity.toFixed(0) })}</>}
                </p>
              </div>
              {(aiLoading || aiCoach) && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wider text-primary mb-1">{t("ai.coach")}</p>
                  {aiLoading ? <p className="text-muted-foreground italic">{t("ai.thinking")}</p> : <p>{aiCoach}</p>}
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="glass-panel p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="display text-xl">{t("training.performance")}</h2>
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw className="w-3 h-3 mr-1" /> {t("btn.reset")}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("training.accuracy")}</span>
              <span className="font-semibold">{accuracy}% ({stats.correct}/{stats.total})</span>
            </div>
            <Progress value={accuracy} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("training.totalEv")}</span>
            <span className={"font-semibold " + (stats.evSum >= 0 ? "text-green-400" : "text-red-400")}>
              {stats.evSum >= 0 ? "+" : ""}{stats.evSum.toFixed(2)} BB
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 pt-2">
            {ACTIONS.map(a => {
              const s = stats.byAction[a];
              const acc = s.picked > 0 ? Math.round((s.correct / s.picked) * 100) : 0;
              return (
                <div key={a} className="rounded-md bg-muted/30 px-2 py-2 text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">{a}</p>
                  <p className="text-sm font-semibold">{acc}%</p>
                  <p className="text-[10px] text-muted-foreground">{s.correct}/{s.picked}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};
