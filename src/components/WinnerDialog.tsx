import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PotToAsk { pot: number; amount: number; eligible: number[]; main: boolean }

interface Props {
  /** Pots dont le gagnant n'est pas connu (cartes adverses non saisies). */
  pots: PotToAsk[];
  labelOf: (seat: number) => string;
  /** Gagnant(s) de chaque pot, par numéro de pot. */
  onPick: (choices: Record<number, number[]>) => void;
  onSkip: () => void;
}

const fr = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

/**
 * Fin de main à l'abattage sans les cartes de tout le monde : le joueur dit qui a gagné, pot par pot (pot principal,
 * pots annexes), pour mettre les tapis à jour. Un seul pot : un clic suffit.
 */
export function WinnerDialog({ pots, labelOf, onPick, onSkip }: Props) {
  const [chosen, setChosen] = useState<Record<number, number[]>>({});
  const single = pots.length === 1;
  const pick = (pot: number, winners: number[]) => {
    if (single) { onPick({ [pot]: winners }); return; }
    setChosen(c => ({ ...c, [pot]: winners }));
  };
  const same = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
  return (
    <Dialog open onOpenChange={o => { if (!o) onSkip(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="display">Qui a gagné {single ? "le pot" : "chaque pot"} ?</DialogTitle>
          <DialogDescription>Pour mettre à jour les tapis de la table avant la main suivante.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {pots.map(p => (
            <section key={p.pot} className="space-y-2">
              {!single && <h3 className="text-sm font-semibold">{p.main ? "Pot principal" : "Pot annexe"} · {fr(p.amount)} bb</h3>}
              <div className="grid gap-2">
                {p.eligible.map(s => (
                  <Button key={s} type="button" variant="secondary" aria-pressed={same(chosen[p.pot], [s])}
                    className={cn(same(chosen[p.pot], [s]) && "ring-2 ring-primary")} onClick={() => pick(p.pot, [s])}>
                    {labelOf(s)}
                  </Button>
                ))}
                <Button type="button" variant="outline" aria-pressed={same(chosen[p.pot], p.eligible)}
                  className={cn(same(chosen[p.pot], p.eligible) && "ring-2 ring-primary")} onClick={() => pick(p.pot, p.eligible)}>
                  Pot partagé
                </Button>
              </div>
            </section>
          ))}
          {!single && (
            <Button type="button" className="w-full" disabled={pots.some(p => !chosen[p.pot])} onClick={() => onPick(chosen)}>
              Valider
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onSkip}>Ne pas changer les tapis</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
