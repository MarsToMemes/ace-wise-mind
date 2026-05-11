import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crosshair, ShieldAlert, Eye } from "lucide-react";
import { PolarizationResult, RangeShape } from "@/engines/polarizationAssessor";

const SHAPE_COLOR: Record<RangeShape, string> = {
  POLARIZED: "bg-primary/15 text-primary border-primary/40",
  CONDENSED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  MERGED:    "bg-blue-500/10 text-blue-300 border-blue-500/30",
  CAPPED:    "bg-destructive/10 text-destructive border-destructive/30",
  LINEAR:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

export const PolarizationPanel = ({ result }: { result: PolarizationResult | null }) => {
  if (!result) return null;

  const { heroShape, villainShape, nutAdvantage, heroRangeAdvantage, villainRangeAdvantage, sizing, balanceNote, informationHiding, reasoning } = result;

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Range Polarization</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          Nut adv: {nutAdvantage}
        </Badge>
      </div>

      {/* Range shapes */}
      <div className="grid grid-cols-2 gap-3">
        <ShapeCard who="Hero" shape={heroShape} advantage={heroRangeAdvantage} />
        <ShapeCard who="Villain" shape={villainShape} advantage={villainRangeAdvantage} />
      </div>

      {/* Advantage bar */}
      <div>
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          <span>Hero advantage</span>
          <span>Villain advantage</span>
        </div>
        <div className="h-2 rounded-full bg-secondary/40 overflow-hidden flex">
          <div className="bg-primary h-full" style={{ width: `${heroRangeAdvantage}%` }} />
          <div className="bg-destructive/70 h-full" style={{ width: `${villainRangeAdvantage}%` }} />
        </div>
        <div className="flex justify-between text-[11px] font-mono mt-1">
          <span className="text-primary">{heroRangeAdvantage}%</span>
          <span className="text-destructive">{villainRangeAdvantage}%</span>
        </div>
      </div>

      {/* Sizing recommendation */}
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recommended action</div>
          <Badge className="bg-primary text-primary-foreground">{sizing.label}</Badge>
        </div>
        <p className="text-sm text-foreground/90">{sizing.rationale}</p>
        <p className="text-xs text-muted-foreground italic">{sizing.theory}</p>
      </div>

      {/* Balance + info hiding */}
      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2 rounded-md border border-border/50 bg-secondary/20 p-2.5">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
          <span className="text-foreground/85">{balanceNote}</span>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-border/50 bg-secondary/20 p-2.5">
          <Eye className="w-4 h-4 mt-0.5 text-blue-300 flex-shrink-0" />
          <span className="text-foreground/85">{informationHiding}</span>
        </div>
      </div>

      {/* Reasoning chain */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reasoning chain</div>
        <ul className="space-y-0.5 text-xs text-foreground/75">
          {reasoning.map((r, i) => (
            <li key={i} className="flex gap-1.5"><span className="text-primary">→</span>{r}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
};

const ShapeCard = ({ who, shape, advantage }: { who: string; shape: RangeShape; advantage: number }) => (
  <div className={`rounded-lg border p-3 ${SHAPE_COLOR[shape]}`}>
    <div className="text-[10px] uppercase tracking-widest opacity-70">{who} range</div>
    <div className="display text-xl leading-tight">{shape}</div>
    <div className="text-[11px] font-mono opacity-80 mt-1">advantage {advantage}%</div>
  </div>
);
