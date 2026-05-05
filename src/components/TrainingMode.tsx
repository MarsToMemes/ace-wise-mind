import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PlayingCard } from "./PlayingCard";
import {
  generateScenario, evaluateDecision, loadStats, saveStats, resetStats,
  computeActionEVs, buildOptimalLine,
  Scenario, UserAction, Evaluation, Stats, RangeGuess, RANGE_GUESSES, LEAK_TAGS,
} from "@/lib/scenarioGenerator";
import { useI18n } from "@/lib/i18n";
import { Sparkles, RotateCcw, ArrowRight, Check, X, TrendingUp, TrendingDown, Timer, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ACTIONS: UserAction[] = ["Fold", "Call", "Check", "Raise"];
const TIMER_SECONDS = 15;

export const TrainingMode = () => {
  const { t, lang } = useI18n();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [userChoice, setUserChoice] = useState<UserAction | null>(null);
  const [rangeGuess, setRangeGuess] = useState<RangeGuess | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(TIMER_SECONDS);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [aiCoach, setAiCoach] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const finalize = useCallback(async (s: Scenario, choice: UserAction, range: RangeGuess | null, timeout: boolean) => {
    stopTimer();
    const ev = evaluateDecision(s, choice, range, timeout);
    setUserChoice(choice);
    setEvaluation(ev);

    const newStreak = ev.correct ? stats.streak + 1 : 0;
    const newStats: Stats = {
      total: stats.total + 1,
      correct: stats.correct + (ev.correct ? 1 : 0),
      evSum: +(stats.evSum + ev.evDiff).toFixed(2),
      byAction: {
        ...stats.byAction,
        [choice]: {
          picked: stats.byAction[choice].picked + 1,
          correct: stats.byAction[choice].correct + (ev.correct ? 1 : 0),
        },
      },
      leaks: { ...stats.leaks },
      rangeAttempts: stats.rangeAttempts + (range ? 1 : 0),
      rangeCorrect: stats.rangeCorrect + (ev.rangeCorrect ? 1 : 0),
      streak: newStreak,
      bestStreak: Math.max(stats.bestStreak, newStreak),
      sessionTotal: stats.sessionTotal + 1,
      sessionCorrect: stats.sessionCorrect + (ev.correct ? 1 : 0),
    };
    ev.leakTags.forEach(tag => { newStats.leaks[tag] = (newStats.leaks[tag] || 0) + 1; });
    setStats(newStats);
    saveStats(newStats);

    setAiLoading(true);
    try {
      // Local deterministic coach feedback — no external AI.
      const verdict = ev.correct ? t("tm.correct") : t("tm.suboptimal", { a: s.correctAction });
      const evLine = t("tm.evLine", { d: ev.evDiff, u: ev.evUser, o: ev.evOptimal });
      const rangeLine = range
        ? (ev.rangeCorrect ? t("tm.rangeOk") : t("tm.rangeOff", { r: s.impliedOpponentRange }))
        : t("tm.noRange");
      const leakLine = ev.leakTags.length ? t("tm.leaks", { l: ev.leakTags.join(", ") }) : t("tm.noLeaks");
      setAiCoach(`${verdict}. ${evLine} ${rangeLine} ${leakLine} ${t("tm.reason")}: ${s.reason}`);
    } catch {}
    setAiLoading(false);
  }, [stats, lang]);

  const startTimer = useCallback((s: Scenario) => {
    stopTimer();
    setTimeLeft(TIMER_SECONDS);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          stopTimer();
          finalize(s, "Fold", rangeGuess, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [finalize, rangeGuess]);

  useEffect(() => {
    if (!scenario) {
      const s = generateScenario();
      setScenario(s);
      startTimer(s);
    }
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    const s = generateScenario();
    setScenario(s);
    setEvaluation(null);
    setUserChoice(null);
    setAiCoach(null);
    setRangeGuess(null);
    startTimer(s);
  };

  const choose = (a: UserAction) => {
    if (!scenario || evaluation) return;
    finalize(scenario, a, rangeGuess, false);
  };

  const handleReset = () => setStats(resetStats());

  if (!scenario) return null;

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const rangeAcc = stats.rangeAttempts > 0 ? Math.round((stats.rangeCorrect / stats.rangeAttempts) * 100) : 0;
  const evs = computeActionEVs(scenario);
  const optimalLine = buildOptimalLine(scenario);
  const timerPct = (timeLeft / TIMER_SECONDS) * 100;
  const timerCritical = timeLeft <= 5;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="glass-panel p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-xl">{t("training.scenario")}</h2>
          <Badge variant="outline" className="gold-border">{scenario.street}</Badge>
        </div>

        {/* Timer */}
        {!evaluation && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Timer className="w-3 h-3" /> {t("training.timeLeft")}
              </span>
              <span className={"font-semibold " + (timerCritical ? "text-red-400" : "text-foreground")}>
                {timeLeft}s
              </span>
            </div>
            <Progress value={timerPct} className={timerCritical ? "[&>div]:bg-red-500" : ""} />
          </div>
        )}

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

        {/* Range guess */}
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {t("training.rangeQuestion")}
          </p>
          <p className="text-[10px] text-muted-foreground mb-2 italic">{t("training.rangeOptional")}</p>
          <div className="flex flex-wrap gap-2">
            {RANGE_GUESSES.map(r => (
              <Button
                key={r}
                size="sm"
                variant={rangeGuess === r ? "default" : "outline"}
                disabled={!!evaluation}
                onClick={() => setRangeGuess(r)}
                className="text-xs"
              >
                {r}
              </Button>
            ))}
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
              <div className="flex flex-wrap items-center gap-2">
                {evaluation.timeout ? (
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40">{t("training.timeUp")}</Badge>
                ) : evaluation.correct ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/40">{t("training.correct")}</Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/40">{t("training.incorrect")}</Badge>
                )}
                <Badge variant="outline" className={evaluation.evDiff >= 0 ? "border-green-500/40" : "border-red-500/40"}>
                  {evaluation.evDiff >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                  {evaluation.evDiff >= 0 ? t("training.evGain") : t("training.evLoss")}: {evaluation.evDiff >= 0 ? "+" : ""}{evaluation.evDiff} BB
                </Badge>
                {evaluation.rangeCorrect !== null && (
                  <Badge variant="outline" className={evaluation.rangeCorrect ? "border-green-500/40" : "border-yellow-500/40"}>
                    {evaluation.rangeCorrect ? t("training.rangeCorrect") : t("training.rangeWrong")}
                  </Badge>
                )}
              </div>

              {/* EV breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-muted-foreground">{t("training.evUser")}</p>
                  <p className="font-semibold">{evaluation.evUser >= 0 ? "+" : ""}{evaluation.evUser} BB</p>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-muted-foreground">{t("training.evOptimal")}</p>
                  <p className="font-semibold">{evaluation.evOptimal >= 0 ? "+" : ""}{evaluation.evOptimal} BB</p>
                </div>
              </div>

              <p className="text-sm">{evaluation.feedback}</p>

              <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
                <p><span className="text-muted-foreground">{t("engine.handStrength")}:</span> {scenario.category}</p>
                <p><span className="text-muted-foreground">{t("engine.draw")}:</span> {scenario.drawType} ({scenario.outs} outs)</p>
                <p><span className="text-muted-foreground">{t("engine.equity")}:</span> {scenario.equityPct.toFixed(0)}%
                  {scenario.reqEquity !== null && <> · {t("engine.needEquity", { n: scenario.reqEquity.toFixed(0) })}</>}
                </p>
                <p><span className="text-muted-foreground">{t("training.rangeImplied")}:</span> {scenario.impliedOpponentRange}</p>
              </div>

              {evaluation.leakTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {evaluation.leakTags.map(tag => (
                    <Badge key={tag} variant="outline" className="border-yellow-500/40 text-yellow-400 text-[10px]">
                      <AlertTriangle className="w-3 h-3 mr-1" /> {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {(aiLoading || aiCoach) && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wider text-primary mb-1">{t("ai.coach")}</p>
                  {aiLoading ? <p className="text-muted-foreground italic">{t("ai.thinking")}</p> : <p>{aiCoach}</p>}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Replay / optimal line */}
        {evaluation && (
          <Card className="glass-panel p-6 space-y-3">
            <h2 className="display text-xl">{t("training.replay")}</h2>
            <div>
              <p className="text-xs uppercase tracking-wider text-primary mb-2">{t("training.optimalLine")}</p>
              <ol className="space-y-1 text-sm">
                {optimalLine.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
              <p><span className="text-muted-foreground">{t("training.yourLine")}:</span> {userChoice} (EV {evaluation.evUser >= 0 ? "+" : ""}{evaluation.evUser} BB)</p>
              <p><span className="text-muted-foreground">{t("training.keyDiff")}:</span> {
                evaluation.correct
                  ? "—"
                  : `${scenario.correctAction} captures ${(evaluation.evOptimal - evaluation.evUser).toFixed(2)} BB more vs ${userChoice}.`
              }</p>
            </div>
          </Card>
        )}

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
          {stats.rangeAttempts > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("training.rangeAccuracy")}</span>
              <span className="font-semibold">{rangeAcc}% ({stats.rangeCorrect}/{stats.rangeAttempts})</span>
            </div>
          )}
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

          <div className="pt-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("training.leaks")}</p>
            {LEAK_TAGS.every(tag => !stats.leaks[tag]) ? (
              <p className="text-xs text-muted-foreground italic">{t("training.noLeaks")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {LEAK_TAGS.filter(tag => stats.leaks[tag] > 0).map(tag => (
                  <Badge key={tag} variant="outline" className="border-yellow-500/40 text-yellow-400 text-[10px]">
                    {tag} · {stats.leaks[tag]}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
