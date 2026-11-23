import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  /** Sièges encore dans le coup à l'abattage. */
  candidates: number[];
  labelOf: (seat: number) => string;
  onPick: (winners: number[]) => void;
  onSkip: () => void;
}

/** Fin de main à l'abattage sans les cartes de tout le monde : le joueur dit qui a gagné, pour mettre les tapis à jour. */
export function WinnerDialog({ candidates, labelOf, onPick, onSkip }: Props) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onSkip(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="display">Qui a gagné le pot ?</DialogTitle>
          <DialogDescription>Pour mettre à jour les tapis de la table avant la main suivante.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {candidates.map(s => (
            <Button key={s} type="button" variant="secondary" onClick={() => onPick([s])}>{labelOf(s)}</Button>
          ))}
          <Button type="button" variant="outline" onClick={() => onPick(candidates)}>Pot partagé</Button>
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onSkip}>Ne pas changer les tapis</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
