import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gavel, Coins, Percent, ArrowRight } from "lucide-react";
import type { EngineResult } from "@/components/EngineReadout";
import type { PolarizationResult } from "@/engines/polarizationAssessor";

interface Props {
  street: "Preflop" | "Flop" | "Turn" | "River";
  engine: EngineResult | null;
  polar: PolarizationResult | null;
  pot: number;
  toCall: number;
  stack: number;
}

const ACTION_STYLES: Record<string, string> = {
  Raise: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Bet:   "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Call:  "bg-primary/15 text-primary border-primary/40",
  Check: "bg-muted text-muted-foreground border-border",
  Fold:  "bg-destructive/15 text-destructive border-destructive/40",
  Jam:   "bg-amber-500/15 text-amber-300 border-amber-500/40",
};

export const DecisionVerdict = ({ street, engine, polar, pot, toCall, stack }: Props) => {
  if (!engine) {
    return (
      <Card className="glass-panel p-5 border-primary/30 text-center text-muted-foreground text-sm">
        Sélectionne tes cartes et ta position pour obtenir la décision synthétique.
      </Card>
    );
  }

  // ---- Synthesize one clear verdict ----
  const engAction = engine.suggestedAction;     // Raise/Call/Check/Fold
  const sz = engine.sizing;
  const facingBet = toCall > 0;

  // Action label
  let action: string = engAction;
  if (action === "Raise" && !facingBet) action = "Bet";

  // Jam override: short stack & action is aggressive
  const spr = pot > 0 ? stack / pot : 99;
  if ((action === "Bet" || action === "Raise") && stack <= 15 && spr < 2.5) {
    action = "Jam";
  }

  // Sizing: prefer engine sizing; fall back to polarization recommendation
  let amountBB = 0;
  let pctOfPot = 0;
  let sizingLabel = "";
  if (action === "Jam") {
    amountBB = stack;
    pctOfPot = pot > 0 ? Math.round((stack / pot) * 100) : 0;
    sizingLabel = `All-in ${stack} BB`;
  } else if (action === "Call") {
    amountBB = toCall;
    pctOfPot = pot > 0 ? Math.round((toCall / pot) * 100) : 0;
    sizingLabel = `Suivre ${toCall} BB`;
  } else if (action === "Fold" || action === "Check") {
    sizingLabel = action === "Fold" ? "Coucher" : "Checker";
  } else if (sz && (sz.heroAction === "Bet" || sz.heroAction === "Raise")) {
    amountBB = sz.amountBB;
    pctOfPot = sz.pctTarget;
    sizingLabel = `${sz.heroAction === "Raise" ? "Relancer" : "Miser"} ${sz.amountBB} BB (${sz.pctMin}–${sz.pctMax}% du pot)`;
  } else if (polar && polar.sizing.action === "BET") {
    pctOfPot = Math.round(polar.sizing.fractionOfPot * 100);
    amountBB = Math.max(1, Math.round((pctOfPot / 100) * pot));
    sizingLabel = `${polar.sizing.label} (~${amountBB} BB)`;
  } else {
    sizingLabel = sz?.intent || "—";
  }

  // One-line "why"
  const why =
    polar && (polar.heroRangeAdvantage >= 55 || polar.villainRangeAdvantage >= 55)
      ? polar.heroRangeAdvantage >= polar.villainRangeAdvantage
        ? `Avantage de range Hero ${polar.heroRangeAdvantage}% sur board ${engine.texture}.`
        : `Range cappée — villain mène ${polar.villainRangeAdvantage}% sur board ${engine.texture}.`
      : `Équité ${Math.round(engine.equityPct)}%${engine.reqEquity ? ` vs cote ${engine.reqEquity}%` : ""} · ${engine.texture}.`;

  const style = ACTION_STYLES[action] || "bg-secondary text-secondary-foreground border-border";

  return (
    <Card className="glass-panel p-5 border-primary/40">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Gavel className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Décision synthétique
          </span>
          <Badge variant="outline" className="text-[10px] uppercase ml-1">{street}</Badge>
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">
          pot {pot} BB · stack {stack} BB · SPR {spr === 99 ? "∞" : spr.toFixed(1)}
        </div>
      </div>

      <div className="grid md:grid-cols-[auto,1fr,auto] gap-4 items-center">
        {/* Action verb */}
        <div className={`rounded-xl border px-5 py-4 ${style} text-center min-w-[140px]`}>
          <div className="text-[10px] uppercase tracking-widest opacity-70">Action</div>
          <div className="display text-3xl leading-none mt-1">{action.toUpperCase()}</div>
        </div>

        {/* Sizing + why */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Coins className="w-4 h-4 text-primary" />
            <span>{sizingLabel}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-snug flex items-start gap-1.5">
            <ArrowRight className="w-3.5 h-3.5 mt-1 text-primary flex-shrink-0" />
            {why}
          </p>
        </div>

        {/* Quick metrics */}
        <div className="grid grid-cols-2 gap-2 text-[11px] min-w-[160px]">
          <Metric icon={<Percent className="w-3 h-3" />} label="Équité" value={`${Math.round(engine.equityPct)}%`} />
          <Metric icon={<Percent className="w-3 h-3" />} label="% pot" value={pctOfPot ? `${pctOfPot}%` : "—"} />
          <Metric label="Range H" value={`${engine.heroRA}%`} />
          <Metric label="Range V" value={`${engine.villainRA}%`} />
        </div>
      </div>
    </Card>
  );
};

const Metric = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-md bg-secondary/30 border border-border/40 px-2 py-1.5">
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
      {icon}{label}
    </div>
    <div className="font-mono text-sm text-foreground">{value}</div>
  </div>
);
