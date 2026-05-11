import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Layers, Target, AlertTriangle, Sparkles, Crosshair } from "lucide-react";
import type { CashPreflopOutput } from "@/engines/cashPreflopEngine";

interface CashHUDProps {
  preflop: CashPreflopOutput | null;
  street: string;
  stackBB: number;
  opponents: number;
}

const catColor = (c: string) =>
  c === "Premium" ? "bg-primary text-primary-foreground"
    : c === "Strong" ? "bg-emerald-500/80 text-white"
      : c === "Speculative" ? "bg-amber-500/80 text-white"
        : c === "Trap" ? "bg-destructive text-destructive-foreground"
          : "bg-secondary text-secondary-foreground";

const evColor = (ev: string) =>
  ev === "high" ? "text-emerald-400"
    : ev === "medium" ? "text-amber-400"
      : ev === "low" ? "text-orange-400"
        : "text-destructive";

const riskColor = (r: string) =>
  r === "low" ? "text-emerald-400" : r === "medium" ? "text-amber-400" : "text-destructive";

export const CashHUD = ({ preflop, street, stackBB, opponents }: CashHUDProps) => {
  if (!preflop) return null;
  const p = preflop;

  return (
    <Card className="glass-panel p-5 space-y-4 border-primary/30">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Cash HUD</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1"><MapPin className="w-3 h-3" />{p.positionGroup}</Badge>
          <Badge variant="outline" className="gap-1"><Layers className="w-3 h-3" />{stackBB}BB · {p.stackDepth}</Badge>
          <Badge variant="outline">{opponents + 1}-way</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hand</p>
          <div className="flex items-center gap-2">
            <span className="display text-2xl gold-text">{p.handLabel}</span>
            <Badge className={catColor(p.category)}>{p.category}</Badge>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended ({street})</p>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="display text-xl">{p.recommendedAction}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Metric label="EV quality" value={p.evQuality} className={evColor(p.evQuality)} />
        <Metric label="Risk" value={p.risk} className={riskColor(p.risk)} />
        <Metric label="Bluff viability" value={p.bluffViability} />
        <Metric label="Realized equity" value={p.realizedEquity} />
      </div>

      <p className="text-sm text-foreground/85 leading-relaxed border-l-2 border-primary/40 pl-3">
        {p.reason}
      </p>

      {p.warnings.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-destructive font-semibold">Leak alert</p>
            <ul className="text-xs text-foreground/80 space-y-0.5">
              {p.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </div>
        </div>
      )}

      {p.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5" />
          {p.badges.map((b, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">{b}</Badge>
          ))}
        </div>
      )}
    </Card>
  );
};

const Metric = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="space-y-0.5">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold capitalize ${className || "text-foreground"}`}>{value}</p>
  </div>
);
