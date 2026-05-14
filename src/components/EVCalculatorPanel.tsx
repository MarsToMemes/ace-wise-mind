import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calculator, CheckCircle2, AlertTriangle } from "lucide-react";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_EV } from "@/lib/teachContent";

interface Props {
  defaultEquityPct?: number;
  defaultRiskBB?: number;
  defaultRewardBB?: number;
}

/**
 * EV Calculator (anciennement "Per-hand Kelly" — Kelly retiré car
 * inapplicable conceptuellement à une décision de main individuelle).
 *
 * Inputs : pot, montant à suivre, équité.
 * Outputs : EV, équité requise (pot odds), décision +EV/−EV avec décomposition.
 */
export const EVCalculatorPanel = ({
  defaultEquityPct = 50,
  defaultRiskBB = 5,
  defaultRewardBB = 15,
}: Props) => {
  const [equity, setEquity] = useState(defaultEquityPct);
  const [risk, setRisk] = useState(defaultRiskBB);
  const [pot, setPot] = useState(defaultRewardBB);

  useEffect(() => { setEquity(defaultEquityPct); }, [defaultEquityPct]);
  useEffect(() => { setRisk(defaultRiskBB); }, [defaultRiskBB]);
  useEffect(() => { setPot(defaultRewardBB); }, [defaultRewardBB]);

  const calc = useMemo(() => {
    const p = Math.max(0, Math.min(1, equity / 100));
    const q = 1 - p;
    const r = Math.max(0, risk);
    const reward = Math.max(0, pot); // amount won if call wins
    const ev = p * reward - q * r;
    const requiredEquityPct = r > 0 ? (r / (reward + r)) * 100 : 0;
    const decision: "CALL" | "FOLD" | "INDIFFERENT" =
      Math.abs(ev) < 0.05 ? "INDIFFERENT" : ev > 0 ? "CALL" : "FOLD";
    return { ev, requiredEquityPct, decision, reward, risk: r };
  }, [equity, risk, pot]);

  const tone =
    calc.decision === "CALL" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : calc.decision === "FOLD" ? "text-destructive border-destructive/40 bg-destructive/5"
    : "text-muted-foreground border-border/50 bg-secondary/20";

  const Icon = calc.decision === "CALL" ? CheckCircle2 : AlertTriangle;

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">EV Calculator</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          EV = EQ·(P+B) − (1−EQ)·B
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Pot avant call (BB)" value={pot} step={0.5} min={0} onChange={setPot} />
        <Field label="À payer (BB)" value={risk} step={0.5} min={0} onChange={setRisk} />
        <Field label="Équité estimée (%)" value={equity} step={1} min={0} max={100} onChange={setEquity} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="EV du call" value={`${calc.ev >= 0 ? "+" : ""}${calc.ev.toFixed(2)} BB`}
          hint={calc.ev >= 0 ? "espérance positive" : "espérance négative"} />
        <Stat label="Équité requise (pot odds)" value={`${calc.requiredEquityPct.toFixed(1)}%`}
          hint={`vs ${equity.toFixed(0)}% estimée`} />
      </div>

      <div className={`rounded-lg border p-4 ${tone}`}>
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="display text-xl mb-1">{calc.decision}</div>
            <p className="text-sm">
              {calc.decision === "CALL" && `Équité (${equity.toFixed(0)}%) > requise (${calc.requiredEquityPct.toFixed(1)}%) → call +EV.`}
              {calc.decision === "FOLD" && `Équité (${equity.toFixed(0)}%) < requise (${calc.requiredEquityPct.toFixed(1)}%) → fold.`}
              {calc.decision === "INDIFFERENT" && "Équité ≈ requise. Décision break-even."}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Décomposition</div>
        <ul className="space-y-0.5 text-xs font-mono text-foreground/75">
          <li><span className="text-primary">→</span> EV(call) = {(equity / 100).toFixed(2)}·{(pot + risk).toFixed(1)} − {(1 - equity / 100).toFixed(2)}·{risk.toFixed(1)} = {calc.ev.toFixed(2)} BB</li>
          <li><span className="text-primary">→</span> Pot odds requis : {risk.toFixed(1)} / ({pot.toFixed(1)} + {risk.toFixed(1)}) = {calc.requiredEquityPct.toFixed(1)}%</li>
        </ul>
      </div>

      <TeachAccordion content={TEACH_EV} />
    </Card>
  );
};

const Field = ({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <div className="space-y-1.5">
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
    <Input type="number" value={value} step={step} min={min} max={max} onChange={e => onChange(+e.target.value || 0)} />
  </div>
);

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="display text-2xl gold-text leading-tight">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);
