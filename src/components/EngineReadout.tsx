import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Target, Layers, Flame } from "lucide-react";

export interface EngineResult {
  category: string;
  score: number;
  drawType: string;
  outs: number;
  texture: "Dry" | "Semi-wet" | "Wet";
  heroRA: string;
  villainRA: string;
  potOdds: number | null;
  reqEquity: number | null;
  suggestedAction: "Raise" | "Call" | "Check" | "Fold";
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
  if (!result) return (
    <Card className="glass-panel p-6 text-center text-muted-foreground">
      <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>Select your hole cards to begin analysis.</p>
    </Card>
  );

  const strengthPct = Math.min(100, (result.score / 180) * 100);

  return (
    <div className="space-y-4">
      <Card className="glass-panel p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Recommendation</p>
            <h3 className="text-3xl display gold-text">{result.suggestedAction}</h3>
          </div>
          <Badge variant="outline" className={`${actionStyles[result.suggestedAction]} px-4 py-2 text-base`}>
            Engine
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Hand Strength</span>
            <span className="font-semibold text-primary">{result.category}</span>
          </div>
          <Progress value={strengthPct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Score {result.score}</span>
            <span>/ 180</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Target className="w-3.5 h-3.5" /> Draw
          </div>
          <p className="font-semibold">{result.drawType}</p>
          {result.outs > 0 && <p className="text-xs text-muted-foreground mt-1">~{result.outs} outs</p>}
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Flame className="w-3.5 h-3.5" /> Texture
          </div>
          <Badge variant="outline" className={textureStyles[result.texture]}>{result.texture}</Badge>
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Hero Range
          </div>
          <p className="font-semibold">{result.heroRA}</p>
        </Card>

        <Card className="glass-panel p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <TrendingDown className="w-3.5 h-3.5" /> Villain Range
          </div>
          <p className="font-semibold">{result.villainRA}</p>
        </Card>

        {result.potOdds !== null && (
          <Card className="glass-panel p-4 col-span-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <Minus className="w-3.5 h-3.5" /> Pot Odds
            </div>
            <div className="flex justify-between">
              <p className="font-semibold">{(result.potOdds * 100).toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Need {result.reqEquity?.toFixed(1)}% equity</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
