import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, AlertTriangle, Target } from "lucide-react";
import { calculateGeometricSizing } from "@/engines/geometricSizing";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_GEOMETRIC } from "@/lib/teachContent";

interface Props {
  defaultPot?: number;
  defaultHeroStack?: number;
  defaultVillainStack?: number;
  streetsRemaining?: 1 | 2 | 3;
}

export const GeometricSizingPanel = ({
  defaultPot = 10,
  defaultHeroStack = 100,
  defaultVillainStack = 100,
  streetsRemaining = 2,
}: Props) => {
  const [pot, setPot] = useState(defaultPot);
  const [hero, setHero] = useState(defaultHeroStack);
  const [villain, setVillain] = useState(defaultVillainStack);
  const [streets, setStreets] = useState<1 | 2 | 3>(streetsRemaining);

  useEffect(() => { setPot(defaultPot); }, [defaultPot]);
  useEffect(() => { setHero(defaultHeroStack); }, [defaultHeroStack]);
  useEffect(() => { setVillain(defaultVillainStack); }, [defaultVillainStack]);
  useEffect(() => { setStreets(streetsRemaining); }, [streetsRemaining]);

  const result = useMemo(
    () => calculateGeometricSizing({
      currentPotBB: pot,
      heroStackBB: hero,
      villainStackBB: villain,
      streetsRemaining: streets,
    }),
    [pot, hero, villain, streets],
  );

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Geometric Stack-Off</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          R = (Pf/Pi)^(1/n) − 1
        </Badge>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pot (BB)</Label>
          <Input type="number" min={0.1} step={0.5}
            value={pot} onChange={e => setPot(Math.max(0.1, +e.target.value || 0))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hero stack</Label>
          <Input type="number" min={0} step={1}
            value={hero} onChange={e => setHero(Math.max(0, +e.target.value || 0))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Villain stack</Label>
          <Input type="number" min={0} step={1}
            value={villain} onChange={e => setVillain(Math.max(0, +e.target.value || 0))} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Streets left</Label>
        {[1, 2, 3].map(n => (
          <Button
            key={n}
            size="sm"
            variant={streets === n ? "default" : "outline"}
            onClick={() => setStreets(n as 1 | 2 | 3)}
            className="h-8 w-10 p-0"
          >
            {n}
          </Button>
        ))}
      </div>

      {/* Headline */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Growth rate R" value={`${result.growthPct.toFixed(0)}%`} hint="bet/pot each street" />
        <Stat label="Effective stack" value={`${result.effectiveStackBB} BB`} hint="min(hero, villain)" />
        <Stat label="SPR" value={result.spr.toFixed(2)} hint="stack ÷ pot" />
      </div>

      {/* Street plan */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Optimal stack-off plan</div>
        <div className="space-y-1.5">
          {result.streets.map(s => (
            <div
              key={s.street}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                s.isAllIn
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/50 bg-secondary/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="font-medium">
                  Street {s.street}
                  {s.isAllIn && <span className="ml-2 text-primary text-xs uppercase tracking-wider">All-in</span>}
                </span>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-foreground">
                  Bet <span className="text-primary font-semibold">{s.betSizeBB} BB</span>
                  <span className="text-muted-foreground"> ({(s.betFraction * 100).toFixed(0)}% pot)</span>
                </div>
                <div className="text-muted-foreground">
                  pot {s.potBeforeBB} → {s.potAfterBB} · stack left {s.stackAfterBB}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Final pot at showdown: <span className="text-foreground font-mono">{result.finalPotBB} BB</span>.
          Each call is equally painful — villain's indifference is preserved street to street.
        </p>
      </div>

      {/* Advice */}
      <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm text-foreground/85">
        {result.sprAdvice}
      </div>

      {result.warning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{result.warning}</span>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground leading-relaxed">
        <span className="text-primary font-semibold">Use when:</span> strong hand (&gt;75% equity), SPR 2–10, villain calls ≥ 2 streets.
        <br />
        <span className="text-primary font-semibold">Avoid when:</span> dynamic board (flush/straight completes), calling station (small sizing extracts more), or SPR &gt; 12.
      </div>

      <TeachAccordion content={TEACH_GEOMETRIC} />
    </Card>
  );
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="display text-2xl gold-text leading-tight">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);
