import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, TrendingUp, TrendingDown, Scale, AlertTriangle } from "lucide-react";
import { solveJamFold } from "@/engines/jamFoldSolver";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_JAMFOLD } from "@/lib/teachContent";

interface Props {
  defaultPotBB?: number;
  defaultStackBB?: number;
  defaultEquityPct?: number;
  defaultFoldPct?: number;
}

type Context = "mtt" | "sng" | "cash-short";

const CONTEXT_LABEL: Record<Context, string> = {
  mtt: "MTT push/fold (stack ≤ 15bb)",
  sng: "SNG bubble (stack ≤ 20bb)",
  "cash-short": "Cash 4bet/5bet preflop short (stack ≤ 30bb)",
};

export const JamFoldPanel = ({
  defaultPotBB = 1.5,
  defaultStackBB = 10,
  defaultEquityPct = 35,
  defaultFoldPct = 60,
}: Props) => {
  const [context, setContext] = useState<Context>("mtt");
  const [pot, setPot] = useState(defaultPotBB);
  const [stack, setStack] = useState(defaultStackBB);
  const [equity, setEquity] = useState(defaultEquityPct);
  const [fold, setFold] = useState(defaultFoldPct);

  useEffect(() => { setPot(defaultPotBB); }, [defaultPotBB]);
  useEffect(() => { setStack(defaultStackBB); }, [defaultStackBB]);
  useEffect(() => { setEquity(defaultEquityPct); }, [defaultEquityPct]);

  const result = useMemo(
    () => solveJamFold({
      potBB: pot,
      heroStackBB: stack,
      villainFoldPct: fold,
      equityWhenCalledPct: equity,
    }),
    [pot, stack, equity, fold],
  );

  const stackTooDeep = stack > 25;

  const Icon = result.decision === "JAM" ? TrendingUp : result.decision === "FOLD" ? TrendingDown : Scale;
  const tone =
    result.decision === "JAM" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
    : result.decision === "FOLD" ? "text-destructive border-destructive/40 bg-destructive/5"
    : "text-muted-foreground border-border/50 bg-secondary/20";

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Jam-or-Fold Solver</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          EV = f·P + (1−f)·[eq·(P+2S) − S]
        </Badge>
      </div>

      {/* Context selector */}
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contexte</Label>
        <Select value={context} onValueChange={(v) => setContext(v as Context)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(CONTEXT_LABEL) as Context[]).map(c => (
              <SelectItem key={c} value={c}>{CONTEXT_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Blocking warning > 25bb */}
      {stackTooDeep && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-100/90 leading-relaxed">
            <strong className="text-amber-300">⚠️ Jam préflop avec un stack &gt; 25bb est rarement optimal.</strong>{" "}
            Cet outil est conçu pour le push/fold MTT/SNG et les contextes short stack. Pour le cash 100bb,
            utilisez le <strong>Range Explorer</strong> (modules Open / 3bet / Defense).
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Pot / dead money (BB)" value={pot} step={0.5} min={0} onChange={setPot} />
        <NumField label="Jam size S (BB)" value={stack} step={0.5} min={0} onChange={setStack} />
      </div>

      <div className="space-y-3">
        <SliderRow label="Villain fold %" value={fold} onChange={setFold}
          rightHint={`needed for break-even: ${result.minFoldEquityNeeded.toFixed(0)}%`} />
        <SliderRow label="Equity when called %" value={equity} onChange={setEquity}
          rightHint={`needed for break-even: ${result.minEquityWhenCalledNeeded.toFixed(0)}%`} />
      </div>

      {/* Decision */}
      <div className={`rounded-lg border p-4 ${tone} ${stackTooDeep ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-3">
          <Icon className="w-6 h-6 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="display text-2xl">{result.decision}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{result.confidence} confidence</Badge>
            </div>
            <p className="text-sm">
              EV(jam) = <span className="font-mono font-semibold">{result.evJam.toFixed(2)} BB</span>
              <span className="text-muted-foreground"> · EV(fold) = 0</span>
              <span className="ml-2">Δ = <span className="font-mono">{result.evDelta >= 0 ? "+" : ""}{result.evDelta.toFixed(2)} BB</span></span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Outcome label="Villain folds" prob={result.ifFolds.prob * 100}
          delta={`+${result.ifFolds.winBB.toFixed(1)} BB`} tone="text-emerald-400" />
        <Outcome label="Called, win" prob={result.ifCalledWins.prob * 100}
          delta={`+${result.ifCalledWins.winBB.toFixed(1)} BB`} tone="text-emerald-400" />
        <Outcome label="Called, lose" prob={result.ifCalledLoses.prob * 100}
          delta={`−${result.ifCalledLoses.loseBB.toFixed(1)} BB`} tone="text-destructive" />
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Mathematical justification</div>
        <ul className="space-y-0.5 text-xs font-mono text-foreground/75">
          {result.reasoning.map((r, i) => (
            <li key={i} className="flex gap-1.5"><span className="text-primary">→</span>{r}</li>
          ))}
        </ul>
      </div>

      <TeachAccordion content={TEACH_JAMFOLD} />
    </Card>
  );
};

const NumField = ({ label, value, onChange, step, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) => (
  <div className="space-y-1.5">
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
    <Input type="number" value={value} step={step} min={min} onChange={e => onChange(+e.target.value || 0)} />
  </div>
);

const SliderRow = ({ label, value, onChange, rightHint }: { label: string; value: number; onChange: (v: number) => void; rightHint?: string }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <span className="text-xs font-mono text-foreground">{value.toFixed(0)}%</span>
    </div>
    <Slider value={[value]} onValueChange={v => onChange(v[0])} min={0} max={100} step={1} />
    {rightHint && <div className="text-[10px] text-muted-foreground text-right">{rightHint}</div>}
  </div>
);

const Outcome = ({ label, prob, delta, tone }: { label: string; prob: number; delta: string; tone: string }) => (
  <div className="rounded-md border border-border/50 bg-secondary/20 p-2 text-center">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-sm font-mono text-foreground">{prob.toFixed(0)}%</div>
    <div className={`text-xs font-mono ${tone}`}>{delta}</div>
  </div>
);
