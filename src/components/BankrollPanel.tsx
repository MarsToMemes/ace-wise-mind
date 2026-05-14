import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { longRunKelly } from "@/engines/kellyBankroll";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_BANKROLL } from "@/lib/teachContent";

type RiskLevel = "conservative" | "moderate" | "aggressive";

const RISK_MULTIPLIER: Record<RiskLevel, number> = {
  conservative: 1.5, // 1.5× half-Kelly buy-ins
  moderate: 1.0,     // = half-Kelly
  aggressive: 0.6,   // 0.6× half-Kelly (closer to full Kelly)
};

const RISK_LABEL: Record<RiskLevel, string> = {
  conservative: "Conservatif (recommandé débutants / pros)",
  moderate: "Modéré (Half-Kelly standard)",
  aggressive: "Agressif (proche Full-Kelly)",
};

/**
 * Bankroll Management — Kelly correctement appliqué au sizing GLOBAL
 * de bankroll (combien de buy-ins par limite), PAS à une main individuelle.
 */
export const BankrollPanel = () => {
  const [winRate, setWinRate] = useState(5);
  const [stdDev, setStdDev] = useState(100);
  const [bankrollMoney, setBankrollMoney] = useState(3000);
  const [buyinMoney, setBuyinMoney] = useState(100);
  const [risk, setRisk] = useState<RiskLevel>("moderate");
  const [sampleHands, setSampleHands] = useState(20000);

  const longRun = useMemo(
    () => longRunKelly({
      winRateBB100: winRate,
      stdDevBB100: stdDev,
      bankrollBuyins: buyinMoney > 0 ? bankrollMoney / buyinMoney : 0,
      sampleSizeHands: sampleHands,
    }),
    [winRate, stdDev, bankrollMoney, buyinMoney, sampleHands],
  );

  const currentBuyins = buyinMoney > 0 ? bankrollMoney / buyinMoney : 0;
  const targetBuyins = isFinite(longRun.halfKellyBuyins)
    ? longRun.halfKellyBuyins * RISK_MULTIPLIER[risk]
    : Infinity;

  // Move-up / move-down recommendation
  const moveUpThreshold = targetBuyins * 1.5;     // 50% over target → move up
  const moveDownThreshold = targetBuyins * 0.6;   // below 60% of target → move down

  let recommendation: { type: "up" | "stay" | "down"; message: string };
  if (winRate <= 0) {
    recommendation = { type: "down", message: "Winrate ≤ 0 — corrigez les fuites avant de penser bankroll. Move down." };
  } else if (currentBuyins >= moveUpThreshold) {
    recommendation = { type: "up", message: `Bankroll suffisante pour la limite supérieure (${currentBuyins.toFixed(1)} bi vs ${targetBuyins.toFixed(0)} cible). Move up envisageable.` };
  } else if (currentBuyins < moveDownThreshold) {
    recommendation = { type: "down", message: `Sous-rolled (${currentBuyins.toFixed(1)} bi vs ${targetBuyins.toFixed(0)} cible). Move down recommandé.` };
  } else {
    recommendation = { type: "stay", message: `Bankroll cohérente avec la limite (${currentBuyins.toFixed(1)} bi vs ${targetBuyins.toFixed(0)} cible).` };
  }

  const recoTone =
    recommendation.type === "up" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : recommendation.type === "down" ? "text-destructive border-destructive/40 bg-destructive/5"
    : "text-muted-foreground border-border/50 bg-secondary/20";
  const RecoIcon = recommendation.type === "up" ? TrendingUp : recommendation.type === "down" ? TrendingDown : ArrowRight;

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Bankroll Management</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          Kelly · sizing global
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Kelly s'applique au sizing GLOBAL de bankroll (combien de buy-ins garder par limite),
        PAS à une décision de main individuelle. Pour une décision call/fold, utilisez l'EV Calculator ci-dessus.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bankroll actuelle (€/$)" value={bankrollMoney} step={50} min={0} onChange={setBankrollMoney} />
        <Field label="Buy-in cible (€/$)" value={buyinMoney} step={5} min={1} onChange={setBuyinMoney} />
        <Field label="Winrate (bb/100)" value={winRate} step={0.5} onChange={setWinRate} />
        <Field label="Std dev (bb/100)" value={stdDev} step={5} min={1} onChange={setStdDev} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Niveau de risque</Label>
        <Select value={risk} onValueChange={(v) => setRisk(v as RiskLevel)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RISK_LABEL) as RiskLevel[]).map(k => (
              <SelectItem key={k} value={k}>{RISK_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Bankroll actuelle" value={`${currentBuyins.toFixed(1)} bi`} hint={`€${bankrollMoney}`} />
        <Stat label="Buy-ins recommandés" value={isFinite(targetBuyins) ? `${targetBuyins.toFixed(0)} bi` : "—"} hint={RISK_LABEL[risk].split(" (")[0]} />
        <Stat label="Half-Kelly théorique" value={isFinite(longRun.halfKellyBuyins) ? `${longRun.halfKellyBuyins.toFixed(0)} bi` : "—"} hint="ref. mathématique" />
      </div>

      <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-1.5 text-xs">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Risque de ruine (à la bankroll actuelle)</div>
        <div className="grid grid-cols-3 gap-2 font-mono">
          <RoR label="10k mains" value={longRun.riskOfRuin.at10k} />
          <RoR label="50k mains" value={longRun.riskOfRuin.at50k} />
          <RoR label="100k mains" value={longRun.riskOfRuin.at100k} />
        </div>
      </div>

      <div className={`rounded-lg border p-4 ${recoTone}`}>
        <div className="flex items-start gap-3">
          <RecoIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="display text-base mb-0.5 uppercase tracking-wide">
              {recommendation.type === "up" ? "Move up" : recommendation.type === "down" ? "Move down" : "Stay"}
            </div>
            <p className="text-sm">{recommendation.message}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-1 text-xs">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample size (mains jouées)</div>
        <Field label="" value={sampleHands} step={1000} min={0} onChange={setSampleHands} />
        <div className="font-mono text-foreground pt-1">
          IC 95% winrate : {longRun.confidenceInterval95.low.toFixed(2)} → {longRun.confidenceInterval95.high.toFixed(2)} bb/100
        </div>
        <p className="text-muted-foreground">
          Pour confirmer ±1 bb/100 à 95% il faut{" "}
          <span className="text-foreground font-mono">{Math.round(longRun.handsForOneBBConfidence).toLocaleString()}</span> mains.
        </p>
      </div>

      <TeachAccordion content={TEACH_BANKROLL} />
    </Card>
  );
};

const Field = ({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <div className="space-y-1.5">
    {label && <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>}
    <Input type="number" value={value} step={step} min={min} max={max} onChange={e => onChange(+e.target.value || 0)} />
  </div>
);

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="display text-xl gold-text leading-tight">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);

const RoR = ({ label, value }: { label: string; value: number }) => {
  const pct = value * 100;
  const tone = pct > 25 ? "text-destructive" : pct > 5 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${tone}`}>{pct.toFixed(1)}%</div>
    </div>
  );
};
