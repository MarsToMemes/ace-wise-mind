import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Eye } from "lucide-react";
import { parseCards, equityByStreet } from "@/engines/showdown";

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const pretty = (c: string) => `${c[0]}${SUIT[c[1]]}`;
const red = (c: string) => c[1] === "h" || c[1] === "d";

interface Props {
  /** Sièges encore dans le coup (hors héros), avec leur position et le pseudo associé. */
  seats: { seat: number; label: string; name?: string }[];
  values: Record<number, string>;
  onChange: (seat: number, text: string) => void;
  hero: string[];
  board: string[];
}

/** Saisie des cartes montrées à l'abattage + revue de ton équité réelle street par street. */
export const ShowdownPanel = ({ seats, values, onChange, hero, board }: Props) => {
  const used = useMemo(() => new Set([...hero, ...board]), [hero, board]);
  if (!seats.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Eye className="w-4 h-4 text-primary" /> Abattage : cartes montrées
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tape les cartes de l'adversaire (ex. « Ah Jd »). Elles seront enregistrées dans sa fiche avec toute sa ligne quand tu cliques sur Reset.
      </p>
      {seats.map(s => {
        const text = values[s.seat] ?? "";
        const cards = text ? parseCards(text) : null;
        const clash = cards ? cards.find(c => used.has(c)) : undefined;
        const ok = cards && !clash;
        const review = ok && hero.length === 2 && board.length >= 3 ? equityByStreet(hero, cards!, board) : null;
        return (
          <div key={s.seat} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs w-28 truncate">{s.name ?? `Siège ${s.seat + 1}`} <span className="text-muted-foreground">· {s.label}</span></span>
              <Input value={text} onChange={e => onChange(s.seat, e.target.value)} placeholder="Ah Jd" className="h-8 w-28 font-mono text-sm" />
              {ok && cards!.map(c => <span key={c} className={`font-mono text-sm px-1 rounded bg-secondary/50 ${red(c) ? "text-red-400" : ""}`}>{pretty(c)}</span>)}
              {text && !cards && <span className="text-[11px] text-amber-400">format : « Ah Jd »</span>}
              {clash && <span className="text-[11px] text-amber-400">{pretty(clash)} est déjà ailleurs</span>}
              {ok && !s.name && <span className="text-[11px] text-muted-foreground">(associe ce siège à une fiche pour l'enregistrer)</span>}
            </div>
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
