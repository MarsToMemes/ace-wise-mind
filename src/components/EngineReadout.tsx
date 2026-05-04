import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Target, Layers, Flame } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export interface EngineResult {
  category: string;
  score: number;
  adjScore: number;
  drawType: string;
  outs: number;
  equityPct: number;
  texture: "Dry" | "Semi-wet" | "Wet";
  heroRA: string;
  villainRA: string;
  potOdds: number | null;
  reqEquity: number | null;
  suggestedAction: "Raise" | "Call" | "Check" | "Fold";
  decisionReason: string;
}

const actionStyles: Record<string, string> = {
  Raise: "bg-success/20 text-[hsl(var(--success))] border-[hsl(var(--success))]/40",
  Call: "bg-primary/15 text-primary border-primary/40",
  Check: "bg-muted text-muted-foreground border-border",
  Fold: "bg-destructive/15 text-destructive border-destructive/40",
};

const textureStyles: Record<string, string> = {
  Dry: "bg-muted text-muted-foreground",
  "Semi-wet": "bg-warning/15 text-[hsl(var(--warning))]",
  Wet: "bg-destructive/15 text-destructive",
};

export const EngineReadout = ({ result }: { result: EngineResult | null }) => {
  const { t } = useI18n();
  if (!result) return (
    <Card className="glass-panel p-6 text-center text-muted-foreground">
      <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>{t("engine.empty")}</p>
    </Card>
  );

  const strengthPct = Math.min(100, (result.score / 180) * 100);

  return (
    <div className="space-y-4">
      <Card className="glass-panel p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t("engine.recommendation")}</p>
            <h3 className="text-3xl display gold-text">{result.suggestedAction}</h3>
          </div>
          <Badge variant="outline" className={`${actionStyles[result.suggestedAction]} px-4 py-2 text-base`}>
            {t("engine.engine")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3 italic">{result.decisionReason}</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("engine.handStrength")}</span>
            <span className="font-semibold text-primary">{result.category}</span>
          </div>
          <Progress value={strengthPct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("engine.score")} {result.score} → {result.adjScore}</span>
            <span>/ 180</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Target className="w-3.5 h-3.5" /> {t("engine.draw")}
          </div>
          <p className="font-semibold">{result.drawType}</p>
          {result.outs > 0 && <p className="text-xs text-muted-foreground mt-1">~{result.outs} {t("engine.outs")}</p>}
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Flame className="w-3.5 h-3.5" /> {t("engine.texture")}
          </div>
          <Badge variant="outline" className={textureStyles[result.texture]}>{result.texture}</Badge>
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> {t("engine.heroRange")}
          </div>
          <p className="font-semibold">{result.heroRA}</p>
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <TrendingDown className="w-3.5 h-3.5" /> {t("engine.villainRange")}
          </div>
          <p className="font-semibold">{result.villainRA}</p>
        </Card>

        {result.potOdds !== null && (
          <Card className="glass-panel p-4 col-span-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <Minus className="w-3.5 h-3.5" /> {t("engine.potOdds")}
            </div>
            <div className="flex justify-between">
              <p className="font-semibold">{(result.potOdds * 100).toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">{t("engine.needEquity", { n: result.reqEquity?.toFixed(1) ?? "0" })}</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
