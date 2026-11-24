import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";

export type ActionType = "Fold" | "Check" | "Call" | "Bet" | "Raise";
export interface PlayerAction {
  seatIdx: number;
  street: "Preflop" | "Flop" | "Turn" | "River";
  type: ActionType;
  amountBB: number; // 0 for Fold/Check
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  anchor: { x: number; y: number } | null;
  currentBet: number; // BB à payer pour ce joueur
  defaultRaise: number;
  onAction: (a: { type: ActionType; amountBB: number }) => void;
  /** Contexte pour les tailles rapides (facultatif). */
  street?: "Preflop" | "Flop" | "Turn" | "River";
  potBB?: number;
  stackBB?: number;
  /** Mise la plus haute de la street (montant « relance à »). */
  betLevel?: number;
}

/** Lit « 2,5 », « 2.5 », « 60 » ; renvoie NaN si vide ou invalide. */
const parseAmount = (text: string) => parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
const fmt = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");

export const ActionMenu = ({ open, onOpenChange, anchor, currentBet, defaultRaise, onAction, street = "Preflop", potBB = 0, stackBB = 100, betLevel }: Props) => {
  const { t } = useI18n();
  const level = betLevel ?? currentBet;
  const minAmt = level > 0 ? Math.max(level * 2, level + 1) : street === "Preflop" ? 2 : 1;
  // tapis = tout ce qui reste au joueur (un tapis plus court que la relance minimum reste permis)
  const maxAmt = stackBB > 0 ? stackBB : minAmt;
  const [text, setText] = useState<string>(fmt(Math.min(maxAmt, Math.max(minAmt, defaultRaise))));
  const amt = parseAmount(text);
  // à chaque ouverture, repartir de la taille proposée
  useEffect(() => {
    if (open) setText(fmt(Math.min(maxAmt, Math.max(minAmt, defaultRaise))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = (type: ActionType, amount: number) => {
    onAction({ type, amountBB: Math.round(amount * 100) / 100 });
    onOpenChange(false);
  };
  const submit = (type: ActionType) => {
    if (type === "Call") return send("Call", currentBet);
    if (type === "Bet" || type === "Raise") return send(type, Math.max(Number.isFinite(amt) ? amt : minAmt, currentBet || 1));
    send(type, 0);
  };
  const aggressive: ActionType = level > 0 ? "Raise" : "Bet";

  // tailles rapides : un clic = action enregistrée
  const quick: { label: string; amount: number }[] = [];
  if (street === "Preflop") {
    if (level <= 1) [2, 2.2, 2.5, 3].forEach(x => quick.push({ label: `${fmt(x)} bb`, amount: x }));
    else [2.5, 3, 3.5, 4].forEach(m => quick.push({ label: `${fmt(m)}×`, amount: level * m }));
  } else if (level > 0) {
    [2.5, 3].forEach(m => quick.push({ label: `${fmt(m)}×`, amount: level * m }));
    if (potBB > 0) quick.push({ label: "Pot", amount: potBB + 2 * level });
  } else if (potBB > 0) {
    [[1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"], [1, "Pot"], [1.5, "1,5×"]].forEach(([f, l]) =>
      quick.push({ label: l as string, amount: (f as number) * potBB }));
  }
  const shown = quick.map(q => ({ ...q, amount: Math.round(Math.min(q.amount, maxAmt) * 10) / 10 })).filter(q => q.amount >= Math.min(minAmt, maxAmt));

  if (!anchor) return null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          style={{
            position: "absolute",
            left: `${anchor.x}%`,
            top: `${anchor.y}%`,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-72 z-50" side="bottom" align="center">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("action.title")} {currentBet > 0 ? `· ${t("action.facing", { n: currentBet })}` : ""}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="destructive" onClick={() => submit("Fold")}>{t("action.fold")}</Button>
            {currentBet > 0
              ? <Button size="sm" variant="outline" onClick={() => submit("Call")}>{t("action.call")} {fmt(currentBet)}</Button>
              : <Button size="sm" variant="secondary" onClick={() => submit("Check")}>{t("action.check")}</Button>}
            <Button size="sm" variant="secondary" onClick={() => send(aggressive, maxAmt)}>Tapis</Button>
          </div>

          {shown.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{level > 0 ? "Relance à (un clic)" : "Mise (un clic)"}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {shown.map(q => (
                  <Button key={q.label} size="sm" variant="outline" className="h-auto py-1.5 flex flex-col leading-tight"
                    onClick={() => send(aggressive, q.amount)}>
                    <span className="text-xs font-semibold">{q.label}</span>
                    {!q.label.endsWith("bb") && <span className="text-[10px] text-muted-foreground">{fmt(q.amount)} bb</span>}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">{t("action.size")}</Label>
            <Slider min={minAmt} max={maxAmt} step={maxAmt - minAmt > 30 ? 1 : 0.5}
              value={[Math.min(maxAmt, Math.max(minAmt, Number.isFinite(amt) ? amt : minAmt))]}
              onValueChange={v => setText(fmt(v[0]))} />
            <div className="flex gap-2">
              <Input inputMode="decimal" value={text} onFocus={e => e.target.select()}
                onChange={e => setText(e.target.value)} className="h-9" aria-label={t("action.size")} />
              <Button size="sm" className="h-9 whitespace-nowrap" onClick={() => submit(aggressive)} disabled={!Number.isFinite(amt) || amt <= 0}>
                {level > 0 ? t("action.raise") : t("action.bet")} {Number.isFinite(amt) ? fmt(amt) : ""}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
