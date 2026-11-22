import { useEffect, useMemo, useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SUIT_SYMBOLS, parseCard } from "@/lib/pokerEngine";
import { HISTORY_EVENT, clearHands, deleteHand, loadHands, summarizeLine, type SavedHand } from "@/lib/handHistory";
import { cn } from "@/lib/utils";

const ORDER = ["UTG", "UTG+1", "UTG+2", "LJ", "MP", "HJ", "CO", "BTN", "SB", "BB"];

/** Carte miniature, affichage seul (pas un bouton). */
const Mini = ({ card }: { card: string }) => {
  const { rank, suit } = parseCard(card);
  const red = suit === "h" || suit === "d";
  return (
    <span
      aria-label={`${rank}${SUIT_SYMBOLS[suit]}`}
      className={cn(
        "inline-flex h-7 w-5 flex-col items-center justify-center rounded-[4px] bg-[#f4f1e8] text-[10px] font-bold leading-none shadow-sm",
        red ? "text-red-600" : "text-zinc-900",
      )}
    >
      <span aria-hidden>{rank}</span>
      <span aria-hidden className="text-[11px]">{SUIT_SYMBOLS[suit]}</span>
    </span>
  );
};

const when = (at: number) => {
  const d = new Date(at);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
};

function useHands() {
  const [hands, setHands] = useState<SavedHand[]>(loadHands);
  useEffect(() => {
    const on = () => setHands(loadHands());
    window.addEventListener(HISTORY_EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(HISTORY_EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return hands;
}

/** Bouton « Historique » et panneau latéral des mains enregistrées. */
export function HandHistory({ onReview }: { onReview: (h: SavedHand) => void }) {
  const hands = useHands();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<string | null>(null);

  const positions = useMemo(() => {
    const seen = new Set(hands.map(h => h.hero).filter(Boolean));
    return [...seen].sort((a, b) => (ORDER.indexOf(a) + 99 * +(ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 99 * +(ORDER.indexOf(b) < 0)));
  }, [hands]);
  const shown = pos ? hands.filter(h => h.hero === pos) : hands;
  useEffect(() => { if (pos && !positions.includes(pos)) setPos(null); }, [pos, positions]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gold-border">
          <History className="w-4 h-4 sm:mr-2" />
          <span className="sr-only sm:not-sr-only">Historique</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/50 px-5 pb-4 pt-5 text-left">
          <SheetTitle className="display text-xl">Historique des mains</SheetTitle>
          <SheetDescription className="text-xs">
            {hands.length
              ? `${hands.length} main${hands.length > 1 ? "s" : ""}, gardée${hands.length > 1 ? "s" : ""} dans ce navigateur.`
              : "Gardé dans ce navigateur."}
          </SheetDescription>
          {positions.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Filtrer par position">
              {[null, ...positions].map(p => (
                <button
                  key={p ?? "all"}
                  type="button"
                  aria-pressed={pos === p}
                  onClick={() => setPos(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                    pos === p ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p ?? "Toutes"}
                </button>
              ))}
            </div>
          )}
        </SheetHeader>

        {hands.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Aucune main pour l'instant. Une main est enregistrée quand tu passes à la suivante avec « Réinitialiser » (ou « nouvelle main » à la voix), dès que tes deux cartes sont entrées.
          </p>
        ) : (
          <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
            {shown.map(h => {
              const board = [...h.flop, ...(h.turn ? [h.turn] : []), ...(h.river ? [h.river] : [])];
              const line = summarizeLine(h);
              return (
                <li key={h.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-0.5">{h.hole.map(c => <Mini key={c} card={c} />)}</div>
                    {h.hero && <span className="rounded-md border border-primary/40 px-1.5 py-0.5 text-[11px] font-bold text-primary">{h.hero}</span>}
                    {board.length > 0 && (
                      <div className="flex gap-0.5 opacity-90">{board.map(c => <Mini key={c} card={c} />)}</div>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{when(h.at)}</span>
                  </div>
                  {line && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{line}</p>}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" className="h-7 gap-1.5 px-2.5 text-xs"
                      onClick={() => { onReview(h); setOpen(false); }}>
                      <RotateCcw className="h-3.5 w-3.5" /> Revoir
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Supprimer la main ${h.hole.join(" ")}`} onClick={() => deleteHand(h.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hands.length > 0 && (
          <div className="border-t border-border/50 px-5 py-3">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive"
              onClick={() => { if (window.confirm(`Effacer les ${hands.length} mains de l'historique ? C'est définitif.`)) clearHands(); }}>
              Tout effacer
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
