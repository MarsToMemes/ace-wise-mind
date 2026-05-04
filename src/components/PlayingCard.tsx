import { SUIT_SYMBOLS, parseCard } from "@/lib/pokerEngine";
import { cn } from "@/lib/utils";

interface Props {
  card: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  animated?: boolean;
}

export const PlayingCard = ({ card, size = "md", selected, disabled, onClick, animated }: Props) => {
  const { rank, suit } = parseCard(card);
  const red = suit === "h" || suit === "d";
  const sizes = {
    sm: "w-9 h-12 text-xs",
    md: "w-12 h-16 text-sm",
    lg: "w-16 h-24 text-lg",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "card-face",
        sizes[size],
        red && "red",
        selected && "selected",
        disabled && "disabled",
        animated && "flip-in",
      )}
      aria-label={`${rank}${SUIT_SYMBOLS[suit]}`}
    >
      <span className="leading-none">{rank}</span>
      <span className="leading-none text-xl">{SUIT_SYMBOLS[suit]}</span>
    </button>
  );
};
