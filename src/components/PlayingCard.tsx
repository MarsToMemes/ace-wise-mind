import { SUIT_SYMBOLS, parseCard } from "@/lib/pokerEngine";
import { cn } from "@/lib/utils";

interface Props {
  card: string;
  /** « slot » et « deck » : compactes sur téléphone, tailles habituelles sur ordinateur. */
  size?: "sm" | "md" | "lg" | "slot" | "deck";
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
    slot: "w-9 h-12 text-xs lg:w-12 lg:h-16 lg:text-sm",
    deck: "w-full h-auto aspect-[5/7] text-[10px] rounded-[4px] lg:w-9 lg:h-12 lg:aspect-auto lg:text-xs lg:rounded-md",
  };
  const suitSize = size === "deck" ? "text-[11px] lg:text-xl" : size === "slot" ? "text-base lg:text-xl" : "text-xl";
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
      <span className={cn("leading-none", suitSize)}>{SUIT_SYMBOLS[suit]}</span>
    </button>
  );
};
