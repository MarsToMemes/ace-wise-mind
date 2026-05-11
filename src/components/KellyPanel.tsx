import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { perHandKelly, longRunKelly } from "@/engines/kellyBankroll";

interface Props {
  defaultEquityPct?: number;
  defaultRiskBB?: number;
  defaultRewardBB?: number;
}

export const KellyPanel = ({
  defaultEquityPct = 50,
  defaultRiskBB = 5,
  defaultRewardBB = 15,
}: Props) => {
  // Per-hand inputs
  const [equity, setEquity] = useState(defaultEquityPct);
  const [risk, setRisk] = useState(defaultRiskBB);
  const [reward, setReward] = useState(defaultRewardBB);
  const [bankrollBB, setBankrollBB] = useState(2000);

  useEffect(() => { setEquity(defaultEquityPct); }, [defaultEquityPct]);
  useEffect(() => { setRisk(defaultRiskBB); }, [defaultRiskBB]);
  useEffect(() => { setReward(defaultRewardBB); }, [defaultRewardBB]);

  // Long-run inputs
  const [winRate, setWinRate] = useState(5);
  const [stdDev, setStdDev] = useState(100);
  const [bankrollBuyins, setBankrollBuyins] = useState(30);
  const [sampleHands, setSampleHands] = useState(20000);

  const hand = useMemo(
    () => perHandKelly({ equityPct: equity, riskBB: risk, rewardBB: reward, bankrollBB }),
    [equity, risk, reward, bankrollBB],
  );

  const longRun = useMemo(
    () => longRunKelly({
      winRateBB100: winRate,
      stdDevBB100: stdDev,
      bankrollBuyins,
      sampleSizeHands: sampleHands,
    }),
    [winRate, stdDev, bankrollBuyins, sampleHands],
  );

  const verdictColor =
    hand.verdict === "play" ? "text-emerald-400"
    : hand.verdict === "play-with-caution" ? "text-amber-400"
    : hand.verdict === "overbet" ? "text-orange-400"
    : "text-destructive";

  const VerdictIcon =
    hand.verdict === "play" ? CheckCircle2
    : hand.verdict === "fold" ? AlertTriangle
    : AlertTriangle;

  return (
    <Card className="glass-panel p-6 space-y-6 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Kelly Bankroll</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          f* = (b·p − q) / b
        </Badge>
      </div>

      {/* ---------- Per-hand Kelly ---------- */}
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Per-hand Kelly</div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Equity (%)" value={equity} step={1} min={0} max={100} onChange={setEquity} />
          <Field label="Bankroll (BB)" value={bankrollBB} step={50} min={1} onChange={setBankrollBB} />
          <Field label="Risk (BB)" value={risk} step={0.5} min={0} onChange={setRisk} />
          <Field label="Reward (BB)" value={reward} step={0.5} min={0} onChange={setReward} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="EV" value={`${hand.evBB.toFixed(2)} BB`} hint={`edge ${(hand.edge * 100).toFixed(1)}%`} />
          <Stat label="Full Kelly" value={`${(hand.kellyFraction * 100).toFixed(2)}%`} hint={`${hand.kellyBB.toFixed(1)} BB`} />
          <Stat label="Half Kelly" value={`${(hand.halfKellyFraction * 100).toFixed(2)}%`} hint={`${hand.halfKellyBB.toFixed(1)} BB`} />
        </div>

        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${verdictColor} border-current/30`}>
          <VerdictIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold mb-0.5">{hand.verdict.replace("-", " ")}</div>
            <p className="text-foreground/85">{hand.message}</p>
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              You're risking {(hand.actualFraction * 100).toFixed(2)}% of bankroll · Kelly optimum {(hand.kellyFraction * 100).toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/50" />

      {/* ---------- Long-run Kelly ---------- */}
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Long-run bankroll</div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Win rate (bb/100)" value={winRate} step={0.5} onChange={setWinRate} />
          <Field label="Std dev (bb/100)" value={stdDev} step={5} min={1} onChange={setStdDev} />
          <Field label="Bankroll (buy-ins)" value={bankrollBuyins} step={1} min={0} onChange={setBankrollBuyins} />
          <Field label="Sample (hands)" value={sampleHands} step={1000} min={0} onChange={setSampleHands} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Full Kelly target"
            value={isFinite(longRun.fullKellyBuyins) ? `${longRun.fullKellyBuyins.toFixed(0)} bi` : "—"}
            hint="theoretical"
          />
          <Stat
            label="Half Kelly target"
            value={isFinite(longRun.halfKellyBuyins) ? `${longRun.halfKellyBuyins.toFixed(0)} bi` : "—"}
            hint="recommended"
          />
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-1.5 text-xs">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk of ruin (at current bankroll)</div>
          <div className="grid grid-cols-3 gap-2 font-mono">
            <RoR label="10k hands" value={longRun.riskOfRuin.at10k} />
            <RoR label="50k hands" value={longRun.riskOfRuin.at50k} />
            <RoR label="100k hands" value={longRun.riskOfRuin.at100k} />
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-1 text-xs">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">95% confidence interval on win rate</div>
          <div className="font-mono text-foreground">
            {longRun.confidenceInterval95.low.toFixed(2)} → {longRun.confidenceInterval95.high.toFixed(2)} bb/100
          </div>
          <p className="text-muted-foreground">
            To confirm ±1 bb/100 with 95% confidence you need
            <span className="text-foreground font-mono"> {Math.round(longRun.handsForOneBBConfidence).toLocaleString()} </span>
            hands.
          </p>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground/90">
          {longRun.recommendation}
        </div>
      </div>
    </Card>
  );
};

const Field = ({
  label, value, onChange, step = 1, min, max,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <div className="space-y-1.5">
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
    <Input
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={e => onChange(+e.target.value || 0)}
    />
  </div>
);

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="display text-2xl gold-text leading-tight">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);

const RoR = ({ label, value }: { label: string; value: number }) => {
  const pct = (value * 100);
  const tone = pct > 25 ? "text-destructive" : pct > 5 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${tone}`}>{pct.toFixed(1)}%</div>
    </div>
  );
};
