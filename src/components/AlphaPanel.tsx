import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sigma, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { calculateAlpha, detectExploit, ALPHA_TABLE } from "@/engines/alphaEngine";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_ALPHA } from "@/lib/teachContent";

interface Props {
  defaultPot?: number;
  defaultBet?: number;
  /** Who currently faces the bet — drives the coaching copy. */
  perspective?: "hero-facing" | "hero-betting";
}

export const AlphaPanel = ({ defaultPot = 10, defaultBet = 5, perspective = "hero-facing" }: Props) => {
  const [pot, setPot] = useState(defaultPot);
  const [bet, setBet] = useState(defaultBet);
  const [villainFold, setVillainFold] = useState(50);

  useEffect(() => { setPot(defaultPot); }, [defaultPot]);
  useEffect(() => { setBet(defaultBet); }, [defaultBet]);

  const alpha = useMemo(() => calculateAlpha(bet, pot), [bet, pot]);
  const exploit = useMemo(() => detectExploit(pot, bet, villainFold), [pot, bet, villainFold]);

  const exploitTone =
    exploit.exploit === "BLUFF" ? "text-emerald-400"
    : exploit.exploit === "VALUE" ? "text-amber-400"
    : "text-muted-foreground";

  const ExploitIcon =
    exploit.exploit === "BLUFF" ? TrendingUp
    : exploit.exploit === "VALUE" ? TrendingDown
    : Scale;

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sigma className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Alpha Engine</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          Derived, not looked up
        </Badge>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pot (BB)</Label>
          <Input
            type="number" min={0.1} step={0.5}
            value={pot}
            onChange={e => setPot(Math.max(0.1, +e.target.value || 0))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bet (BB)</Label>
          <Input
            type="number" min={0} step={0.5}
            value={bet}
            onChange={e => setBet(Math.max(0, +e.target.value || 0))}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Bet size: <span className="text-foreground font-mono">{(alpha.s * 100).toFixed(0)}%</span> of pot ({alpha.sizeLabel})
      </div>

      {/* Core formulas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-primary/20 bg-secondary/30 p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">α (Alpha)</div>
          <div className="display text-3xl gold-text">{alpha.alphaPct.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1 font-mono">
            s/(1+s) = {alpha.s.toFixed(2)}/{(1 + alpha.s).toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-primary/20 bg-secondary/30 p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MDF</div>
          <div className="display text-3xl gold-text">{alpha.mdfPct.toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1 font-mono">1 − α</div>
        </div>
      </div>

      {/* Meaning */}
      <div className="space-y-2 text-sm">
        {perspective === "hero-betting" ? (
          <>
            <p><span className="text-primary font-medium">Bluff ratio:</span> {alpha.bluffToValueRatio}.</p>
            <p><span className="text-primary font-medium">Villain must defend:</span> {alpha.mdfPct.toFixed(0)}% of his range — folding more than {alpha.alphaPct.toFixed(0)}% lets any two cards bluff +EV.</p>
          </>
        ) : (
          <>
            <p><span className="text-primary font-medium">You must defend:</span> {alpha.mdfPct.toFixed(0)}% of your range.</p>
            <p><span className="text-primary font-medium">Break-even call equity:</span> {alpha.alphaPct.toFixed(1)}%. Folding more than this hands villain a free bluff.</p>
          </>
        )}
      </div>

      {/* Exploit detector */}
      <div className="rounded-lg border border-border/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Estimated villain fold %
          </Label>
          <span className="text-sm font-mono text-foreground">{villainFold.toFixed(0)}%</span>
        </div>
        <Slider
          value={[villainFold]}
          onValueChange={v => setVillainFold(v[0])}
          min={0} max={100} step={1}
        />
        <div className={`flex items-start gap-2 text-sm ${exploitTone}`}>
          <ExploitIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold uppercase tracking-wide text-xs mb-0.5">
              {exploit.exploit === "EQUILIBRIUM" ? "At equilibrium" : exploit.exploit === "BLUFF" ? "Bluff +EV" : "Value +EV"}
              {exploit.exploit !== "EQUILIBRIUM" && (
                <span className="ml-2 text-muted-foreground">
                  gap {exploit.gapPct >= 0 ? "+" : ""}{exploit.gapPct.toFixed(1)} pts
                </span>
              )}
            </div>
            <p className="text-foreground/85">{exploit.message}</p>
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Reference</div>
        <div className="grid grid-cols-7 gap-1 text-[11px] font-mono">
          {ALPHA_TABLE.map(row => {
            const active = Math.abs(row.sizePct - alpha.s * 100) < 8;
            return (
              <div
                key={row.sizePct}
                className={`rounded p-1.5 text-center border ${active ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"}`}
              >
                <div>{row.label}</div>
                <div className="text-foreground/80">α {row.alphaPct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <TeachAccordion content={TEACH_ALPHA} />
    </Card>
  );
};
