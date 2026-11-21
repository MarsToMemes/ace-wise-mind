import { fullDeck, SUITS, RANKS } from "@/lib/pokerEngine";
import { PlayingCard } from "./PlayingCard";

interface Props {
  selected: string[];
  hole: string[];
  board: string[];
  onPick: (card: string) => void;
}

export const CardPicker = ({ selected, onPick }: Props) => {
  const deck = fullDeck();
  const grouped: Record<string, string[]> = { s: [], h: [], d: [], c: [] };
  deck.forEach(c => grouped[c[1]].push(c));
  // sort by rank desc within suit
  Object.keys(grouped).forEach(s => {
    grouped[s].sort((a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]));
  });

  return (
    <div className="space-y-1 lg:space-y-2">
      {SUITS.map(s => (
        <div key={s} className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px] lg:flex lg:flex-wrap lg:gap-1.5">
          {grouped[s].map(card => (
            <PlayingCard
              key={card}
              card={card}
              size="deck"
              selected={selected.includes(card)}
              onClick={() => onPick(card)}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
