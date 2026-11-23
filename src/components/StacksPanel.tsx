import { Button } from "@/components/ui/button";

interface Props {
  stacks: number[];
  /** Ordre d'affichage des sièges (comme sur la table). */
  order: number[];
  labelOf: (seat: number) => string;
  onChange: (stacks: number[]) => void;
}

/** Tapis de chaque siège, suivis d'une main à l'autre ; ici on les corrige à la main (recave, chiffre exact du site). */
export function StacksPanel({ stacks, order, labelOf, onChange }: Props) {
  const set = (i: number, v: number) => onChange(stacks.map((s, k) => (k === i ? Math.max(0, v) : s)));
  return (
    <details className="mt-2 rounded-md border border-border/50 px-3 py-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Tapis des joueurs (suivis d'une main à l'autre)</summary>
      <p className="mt-2 text-muted-foreground">
        Mis à jour à chaque nouvelle main : chacun perd ce qu'il a misé, le gagnant prend le pot (rake déduit). Corrige ici une recave ou recopie le chiffre exact.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {order.map(i => (
          <label key={i} className="block min-w-0 space-y-1">
            <span className="block truncate text-muted-foreground">{labelOf(i)}</span>
            <span className="flex items-center gap-1">
              <input type="number" inputMode="decimal" min={0} step={0.5} aria-label={labelOf(i)}
                value={Number.isFinite(stacks[i]) ? Math.round(stacks[i] * 10) / 10 : ""}
                onChange={e => { const v = parseFloat(e.target.value.replace(",", ".")); if (Number.isFinite(v)) set(i, v); }}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums" />
              <span className="text-muted-foreground">bb</span>
            </span>
          </label>
        ))}
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-2 text-xs" onClick={() => onChange(stacks.map(() => 100))}>Tous à 100 bb</Button>
    </details>
  );
}
