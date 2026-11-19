import { useMemo, useState } from "react";
import { Eye, X } from "lucide-react";
import { equityByStreet } from "@/engines/showdown";

const SUIT_SYM: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUITS = ["s", "h", "d", "c"] as const;
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const pretty = (c: string) => `${c[0] === "T" ? "10" : c[0]}${SUIT_SYM[c[1]]}`;
const isRed = (c: string) => c[1] === "h" || c[1] === "d";

interface Props {
  /** Sièges encore dans le coup (hors héros), avec leur position et le pseudo associé. */
  seats: { seat: number; label: string; name?: string }[];
  /** Cartes choisies par siège, au format « Ah Jd ». */
  values: Record<number, string>;
  onChange: (seat: number, text: string) => void;
  hero: string[];
  board: string[];
}

/** Choix des cartes montrées à l'abattage (grille de cartes) + revue de ton équité réelle. */
export const ShowdownPanel = ({ seats, values, onChange, hero, board }: Props) => {
  const [openSeat, setOpenSeat] = useState<number | null>(seats.find(s => !values[s.seat])?.seat ?? null);
  // une ou deux cartes déjà choisies (« Qh » puis « Qh Jd »)
  const cardsOf = (seat: number): string[] => (values[seat] ?? "").split(" ").filter(c => /^[2-9TJQKA][shdc]$/.test(c)).slice(0, 2);
  const usedElsewhere = useMemo(() => {
    const u = new Set([...hero, ...board]);
    return u;
  }, [hero, board]);

  if (!seats.length) return null;

  const toggle = (seat: number, card: string) => {
    const cur = cardsOf(seat);
    let next: string[];
    if (cur.includes(card)) next = cur.filter(c => c !== card);
    else if (cur.length < 2) next = [...cur, card];
    else next = [cur[0], card];
    onChange(seat, next.join(" "));
    if (next.length === 2) {
      // passe au joueur suivant sans cartes, sinon referme
      const nextSeat = seats.find(s => s.seat !== seat && cardsOf(s.seat).length < 2);
      setOpenSeat(nextSeat ? nextSeat.seat : null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="w-4 h-4 text-primary" /> Abattage : cartes montrées
      </div>
      <p className="text-[11px] text-muted-foreground">
        Clique les 2 cartes de l'adversaire. Elles seront enregistrées dans sa fiche avec toute sa ligne quand tu cliques sur Reset.
      </p>

      {seats.map(s => {
        const cards = cardsOf(s.seat);
        const others = new Set(seats.filter(o => o.seat !== s.seat).flatMap(o => cardsOf(o.seat)));
        const done = cards.length === 2;
        const review = done && hero.length === 2 && board.length >= 3 ? equityByStreet(hero, cards, board) : null;
        const open = openSeat === s.seat;
        return (
          <div key={s.seat} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpenSeat(open ? null : s.seat)}
                className={`text-xs px-2 py-1 rounded-md border ${open ? "border-primary text-primary" : "border-border hover:border-primary/60"}`}>
                {s.name ?? `Siège ${s.seat + 1}`} · {s.label}
              </button>
              {[0, 1].map(i => (
                <span key={i} className={`w-9 h-11 rounded-md border flex items-center justify-center font-mono text-sm ${
                  cards[i] ? `bg-white ${isRed(cards[i]) ? "text-red-600" : "text-zinc-900"} border-white` : "border-dashed border-border text-muted-foreground"}`}>
                  {cards[i] ? pretty(cards[i]) : "?"}
                </span>
              ))}
              {cards.length > 0 && (
                <button type="button" aria-label="Effacer les cartes" onClick={() => { onChange(s.seat, ""); setOpenSeat(s.seat); }}
                  className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              )}
              {done && !s.name && <span className="text-[11px] text-muted-foreground">(associe ce siège à une fiche pour l'enregistrer)</span>}
            </div>

            {open && (
              <div className="space-y-1">
                {SUITS.map(suit => (
                  <div key={suit} className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                    {RANKS.map(r => {
                      const card = r + suit;
                      const taken = usedElsewhere.has(card) || others.has(card);
                      const picked = cards.includes(card);
                      return (
                        <button key={card} type="button" disabled={taken} onClick={() => toggle(s.seat, card)}
                          aria-label={pretty(card)}
                          className={`h-9 rounded-[4px] border text-[10px] sm:text-xs font-mono leading-none tracking-tighter transition-colors ${
                            picked ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/60"
                            : taken ? "opacity-20 cursor-not-allowed border-border"
                            : `bg-white ${isRed(card) ? "text-red-600" : "text-zinc-900"} border-white/70 hover:ring-2 hover:ring-primary/60`}`}>
                          {r === "T" ? "10" : r}{SUIT_SYM[suit]}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {review && (
              <p className="text-[11px] text-muted-foreground pl-1">
                Ton équité réelle contre sa main : {review.map(r => `${r.street} ${r.equity} %`).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};
