import { seatNumber } from "@/lib/tableSeat";
import { cn } from "@/lib/utils";
import { Crown, User, Coins } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ActionMenu, PlayerAction, ActionType } from "@/components/ActionMenu";
import { menuToCall } from "@/lib/siteView";
import { useState } from "react";
import { stackHealth, icmThreat, stageLabel, type TournamentState } from "@/lib/tournamentEngine";
import { SUIT_SYMBOLS } from "@/lib/pokerEngine";

const HAND_FR: Record<string, string> = {
  "High Card": "Hauteur", "Pair": "Paire", "Two Pair": "Double paire", "Three of a Kind": "Brelan",
  "Straight": "Quinte", "Flush": "Couleur", "Full House": "Full", "Four of a Kind": "Carré", "Straight Flush": "Quinte flush",
};
const fmtBB = (x: number) => (Math.round(x * 10) / 10).toString();

/** Carte blanche de la table Orbite (rang + couleur), avec un léger reflet dessous. */
const TableCard = ({ card, big, testId }: { card: string; big?: boolean; testId: string }) => {
  const red = card[1] === "h" || card[1] === "d";
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg font-extrabold leading-none shadow-[0_8px_18px_-8px_#000]",
        big ? "w-9 h-[52px] sm:w-10 sm:h-14 text-lg" : "w-8 h-11 sm:w-9 sm:h-[50px] text-base",
        red ? "text-[#d63c3c]" : "text-[#11131c]",
      )}
      style={{ background: "linear-gradient(170deg, #ffffff, #e9e4d4)", WebkitBoxReflect: "below 3px linear-gradient(transparent 60%, rgb(255 255 255 / 0.14))" }}
    >
      {card[0] === "T" ? "10" : card[0]}
      <span className="text-sm mt-0.5">{SUIT_SYMBOLS[card[1]] ?? card[1]}</span>
    </div>
  );
};

const ACT_TONE: Record<string, string> = {
  Fold: "hsl(0 75% 62%)", Check: "hsl(230 15% 78%)", Call: "hsl(150 68% 55%)", Bet: "hsl(38 88% 60%)", Raise: "hsl(38 88% 60%)",
};

export type TableSize = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type SeatMode = "dealer" | "user" | "fold" | "action";
export type SimplePosition = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

const LABELS_BY_SIZE: Record<TableSize, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO"],
};

export const getLabels = (size: TableSize) => LABELS_BY_SIZE[size];
export const TABLE_SIZES: TableSize[] = [2, 3, 4, 5, 6, 7, 8, 9];

export const labelToPosition = (label: string): SimplePosition => {
  if (label === "BTN" || label === "SB" || label === "BB" || label === "CO") return label;
  if (label.startsWith("UTG")) return "UTG";
  if (label === "LJ" || label === "HJ" || label === "MP") return "MP";
  return "MP";
};

export const seatLabel = (seatIdx: number, dealerIdx: number, size: TableSize) => {
  if (dealerIdx < 0) return "";
  const labels = getLabels(size);
  const offset = (seatIdx - dealerIdx + size) % size;
  return labels[offset];
};

interface Props {
  size: TableSize;
  dealerIdx: number;
  userIdx: number;
  mode: SeatMode;
  folded: boolean[];
  streetContribs: number[];
  lastActions: (PlayerAction | null)[];
  currentBet: number;
  /** Ce qu'il te reste à payer (mise adverse moins ce que tu as déjà mis). */
  toCallBB?: number;
  defaultRaise: number;
  onSeatClick: (i: number) => void;
  onPlayerAction: (seatIdx: number, type: ActionType, amountBB: number) => void;
  onModeChange: (m: SeatMode) => void;
  onSizeChange: (s: TableSize) => void;
  // Tournament overlay
  tournamentState?: TournamentState;
  seatStacksBB?: number[];
  /** Montant « relance à » d'un tapis pour chaque siège (ce qui lui reste + ce qu'il a déjà mis sur la street). */
  seatAllInTo?: number[];
  /** Relance minimale d'après le moteur de règles (menu d'action). */
  minRaiseTo?: number | null;
  levelTimerSec?: number;
  flashMRatio?: boolean;
  /** Pseudo et profil du joueur associé à chaque siège (fiches joueurs). */
  seatNames?: ({ name: string; profile: string; tone: string } | undefined)[];
  /** Contexte des tailles rapides du menu d'action. */
  street?: "Preflop" | "Flop" | "Turn" | "River";
  potBB?: number;
  stackBB?: number;
  /** Cartes du board et de ton jeu, affichées au centre de la table. */
  board?: string[];
  hole?: string[];
  /** Catégorie de ta main (« Pair », « Two Pair »…). */
  heroHand?: string;
}

export const PokerTable = ({
  size, dealerIdx, userIdx, mode, folded, streetContribs, lastActions,
  currentBet, toCallBB, defaultRaise, onSeatClick, onPlayerAction, onModeChange, onSizeChange,
  tournamentState, seatStacksBB, seatAllInTo, minRaiseTo, levelTimerSec, flashMRatio, seatNames, street, potBB, stackBB,
  board = [], hole = [], heroHand,
}: Props) => {
  const { t, lang } = useI18n();
  const [actionSeat, setActionSeat] = useState<number | null>(null);

  // ovale vertical ; dès que ton siège est choisi, la table tourne pour le mettre en bas
  const seats = Array.from({ length: size }, (_, i) => {
    const step = (2 * Math.PI) / size;
    const angle = userIdx >= 0 ? Math.PI / 2 + (i - userIdx) * step : -Math.PI / 2 + i * step;
    const x = 50 + 46 * Math.cos(angle);
    const y = 50 + 45 * Math.sin(angle);
    return { i, x, y };
  });
  const showPot = dealerIdx >= 0 && userIdx >= 0;
  const prompt = dealerIdx < 0 ? t("table.clickDealer") : userIdx < 0 ? t("table.clickUser") : mode === "action" ? t("table.clickAction") : t("table.ready");

  const handleClick = (i: number) => {
    if (mode === "action") {
      if (folded[i]) return;
      setActionSeat(i);
      return;
    }
    onSeatClick(i);
  };

  const anchor = actionSeat != null ? { x: seats[actionSeat].x, y: seats[actionSeat].y } : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-md bg-muted p-1 text-xs">
          <label htmlFor="table-size" className="px-2 text-muted-foreground">{t("table.seats")}</label>
          <select
            id="table-size"
            value={size}
            onChange={(e) => onSizeChange(Number(e.target.value) as TableSize)}
            className="bg-card text-foreground rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {TABLE_SIZES.map((n) => (<option key={n} value={n}>{n}-max</option>))}
          </select>
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-1 text-xs flex-wrap">
          <button onClick={() => onModeChange("dealer")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "dealer" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><Crown className="w-3 h-3" /> {t("table.dealer")}</button>
          <button onClick={() => onModeChange("user")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "user" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><User className="w-3 h-3" /> {t("table.you")}</button>
          <button onClick={() => onModeChange("fold")} className={cn("px-2.5 py-1 rounded transition", mode === "fold" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground")}>{t("table.fold")}</button>
          <button onClick={() => onModeChange("action")} className={cn("px-2.5 py-1 rounded transition flex items-center gap-1", mode === "action" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} title={t("table.clickAction")}><Coins className="w-3 h-3" /> {t("table.action")}</button>
        </div>
      </div>

      <div className="px-7 sm:px-12 pt-4 pb-12">
      <div className="relative mx-auto w-full max-w-[400px] aspect-[3/4]">
        {/* anneau de lumière or et vert : le seul élément coloré de la table */}
        <div
          aria-hidden
          className="absolute inset-[4%] rounded-[50%] p-[6px]"
          style={{
            background: "conic-gradient(from 210deg, hsl(45 65% 53%), hsl(150 65% 55%) 25%, hsl(45 65% 53%) 50%, hsl(150 60% 30%) 75%, hsl(45 65% 53%))",
            boxShadow: "0 0 30px -4px hsl(150 65% 55% / 0.4), 0 0 60px -10px hsl(45 65% 53% / 0.45)",
          }}
        >
          <div className="w-full h-full rounded-[50%]" style={{ background: "radial-gradient(ellipse at 50% 50%, hsl(155 45% 10%) 0%, hsl(240 30% 4%) 70%)" }} />
        </div>
        <div aria-hidden className="absolute inset-[16%] rounded-[50%] border border-primary/15" />
        <div aria-hidden className="absolute inset-[28%] rounded-[50%] border border-primary/10" />

        {tournamentState && (() => {
          const m = tournamentState.mRatio;
          const mClass = m > 20 ? "text-emerald-400" : m >= 10 ? "text-yellow-400" : m >= 5 ? "text-orange-400" : "text-red-500";
          const mins = levelTimerSec != null ? Math.max(0, Math.floor(levelTimerSec / 60)) : null;
          const secs = levelTimerSec != null ? Math.max(0, levelTimerSec % 60) : null;
          return (
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 top-[25%] z-10 pointer-events-none",
                "px-3 py-1.5 rounded-md bg-card/85 border border-primary/40 backdrop-blur-sm shadow",
                "flex items-center gap-3 text-[10px]",
                flashMRatio && "animate-pulse ring-2 ring-red-500/70",
              )}
            >
              <div className="flex flex-col items-center leading-tight">
                <span className="uppercase text-[8px] text-muted-foreground">M</span>
                <span className={cn("text-lg font-bold leading-none", mClass)}>{m.toFixed(1)}</span>
              </div>
              <div className="flex flex-col items-center leading-tight">
                <span className="uppercase text-[8px] text-muted-foreground">Stage</span>
                <span className="font-semibold text-foreground">{stageLabel(tournamentState.stage)}</span>
              </div>
              {mins != null && (
                <div className="flex flex-col items-center leading-tight">
                  <span className="uppercase text-[8px] text-muted-foreground">Next</span>
                  <span className="font-mono font-semibold text-foreground">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* centre : pot, board, ou consigne tant que la table n'est pas prête */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-[5]">
          {showPot ? (
            <>
              <div data-testid="table-pot" className="text-center leading-none">
                <div className="text-[11px] text-muted-foreground mb-1">Pot</div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white tabular-nums">
                  {fmtBB(potBB ?? 0)}<span className="text-sm text-primary ml-1 tracking-normal">bb</span>
                </div>
              </div>
              {board.length > 0 && (
                <div className="flex gap-1.5">{board.map(c => <TableCard key={c} card={c} testId="board-card" />)}</div>
              )}
            </>
          ) : (
            <div data-testid="table-prompt" className="text-center">
              <p className="display gold-text text-lg leading-none">Ace Analyst</p>
              <p className="text-[10px] uppercase tracking-widest text-[hsl(45_30%_70%/0.6)] mt-1">{prompt}</p>
            </div>
          )}
        </div>

        {/* tes cartes, à droite de ton siège (en bas de la table) */}
        {userIdx >= 0 && hole.length > 0 && !folded[userIdx] && (
          <div
            className="absolute -translate-x-1/2 z-[6] flex pointer-events-none"
            style={{ left: `calc(${seats[userIdx].x}% + 86px)`, top: `calc(${seats[userIdx].y}% - 34px)` }}
          >
            {hole.map((c, k) => (
              <div key={c} className={k === 1 ? "-ml-2.5 rotate-[7deg] translate-y-0.5" : "-rotate-[4deg]"}><TableCard card={c} big testId="hero-card" /></div>
            ))}
          </div>
        )}

        {seats.map(({ i, x, y }) => {
          const label = seatLabel(i, dealerIdx, size);
          const isDealer = i === dealerIdx;
          const isUser = i === userIdx;
          const isFolded = folded[i];
          const contrib = streetContribs[i] || 0;
          const last = lastActions[i];
          const stack = seatStacksBB?.[i] ?? (isUser ? stackBB : undefined);
          const who = isUser ? t("table.you2") : seatNames?.[i]?.name;
          // tournoi : la couleur du tapis dit sa santé (vert → rouge)
          const healthTone = tournamentState && seatStacksBB?.[i] != null
            ? { green: "text-emerald-300", yellow: "text-yellow-300", orange: "text-orange-300", red: "text-red-400" }[stackHealth(seatStacksBB[i])]
            : undefined;

          // jetons : décalés vers le centre
          const cx = 50 + (x - 50) * 0.62;
          const cy = 50 + (y - 50) * 0.62;

          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => handleClick(i)}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 rounded-full whitespace-nowrap border",
                  "px-3 py-1.5 text-xs motion-safe:transition-all motion-safe:duration-300 hover:scale-105 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isFolded
                    ? "bg-card/60 border-border text-muted-foreground opacity-40 grayscale"
                    : isUser
                      ? "border-[hsl(45_80%_78%)] text-[hsl(40_70%_8%)] shadow-[0_0_24px_hsl(var(--primary)/0.45)] px-3.5 py-2"
                      : "bg-[hsl(235_35%_8%/0.92)] border-primary/50 text-foreground shadow-[0_6px_18px_-6px_#000] hover:border-primary",
                )}
                style={{
                  left: `${x}%`, top: `${y}%`,
                  background: isUser && !isFolded ? "linear-gradient(135deg, hsl(45 75% 72%), hsl(42 62% 44%))" : undefined,
                }}
                aria-label={`Siège ${seatNumber(i, userIdx, size)} ${label}`.trim()}
              >
                {/* numéro de siège fixe, comme sur Betclic (1 en haut, toi en bas) : il ne bouge pas quand le bouton avance */}
                <span aria-hidden className={cn("tabular-nums text-[10px] font-bold opacity-60", isUser ? "text-[hsl(40_60%_18%)]" : "text-muted-foreground")}>{seatNumber(i, userIdx, size)}</span>
                <span className={cn("font-extrabold tracking-wide", isUser ? "text-[15px]" : "text-[13px]")}>{label || `S${seatNumber(i, userIdx, size)}`}</span>
                {stack != null && !isFolded && (
                  <span className={cn("font-bold tabular-nums", isUser ? "text-[hsl(40_60%_18%)]" : healthTone ?? "text-[hsl(45_80%_70%)]")}>{fmtBB(stack)}</span>
                )}
                {isFolded && <span className="text-[10px]">{t("table.foldedBadge")}</span>}
              </button>

              {/* sous la capsule : pseudo (ou « toi » et ta main), profil, dernière action */}
              {(who || last || (isUser && heroHand)) && (
                <div
                  className="absolute -translate-x-1/2 z-[9] pointer-events-none flex items-center gap-2 whitespace-nowrap text-[11px]"
                  style={{ left: `${x}%`, top: `calc(${y}% + ${isUser ? 22 : 18}px)` }}
                >
                  {who && <span className="text-muted-foreground max-w-[84px] truncate">{who}</span>}
                  {isUser && heroHand && <span className="font-bold text-[hsl(150_68%_55%)]">{lang === "fr" ? HAND_FR[heroHand] ?? heroHand : heroHand}</span>}
                  {!isUser && seatNames?.[i] && (
                    <span className={cn("px-1 rounded text-[10px] font-semibold border bg-card/90 leading-tight", seatNames[i]!.tone)}>{seatNames[i]!.profile}</span>
                  )}
                  {last && (
                    <span className="flex items-center gap-1 font-bold" style={{ color: ACT_TONE[last.type] }}>
                      <i className="block w-[7px] h-[7px] rounded-full" style={{ background: ACT_TONE[last.type], boxShadow: `0 0 6px ${ACT_TONE[last.type]}` }} />
                      {t(`act.${last.type}`)}{last.amountBB > 0 ? ` ${fmtBB(last.amountBB)}` : ""}
                    </span>
                  )}
                </div>
              )}

              {/* bouton dealer */}
              {isDealer && (
                <div
                  data-testid="dealer-button"
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-[8] pointer-events-none w-[22px] h-[22px] rounded-full bg-[#f4efe1] text-[#11131c] text-[11px] font-extrabold flex items-center justify-center shadow-[0_4px_10px_-2px_#000]"
                  style={{ left: `calc(${x}% + ${x > 52 ? -36 : x < 48 ? 36 : 44}px)`, top: `calc(${y}% - 22px)` }}
                >D</div>
              )}

              {/* jetons posés sur cette street (blindes…) ; masqués quand l'action affichée donne déjà le montant */}
              {contrib > 0 && !isFolded && !last && (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-[7] pointer-events-none flex items-center gap-1 text-[11px] font-bold text-[hsl(45_80%_70%)] tabular-nums"
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                >
                  <i className="block w-3 h-3 rounded-full" style={{ background: "radial-gradient(circle, #f6dd8c, #b8912a)", boxShadow: "0 0 8px hsl(45 65% 53% / 0.7)" }} />
                  {fmtBB(contrib)}
                </div>
              )}

              {/* Tournament: stack badge + ICM threat */}
              {tournamentState && seatStacksBB && seatStacksBB[i] != null && !isFolded && (() => {
                const sBB = seatStacksBB[i];
                const heroBB = userIdx >= 0 && seatStacksBB[userIdx] != null ? seatStacksBB[userIdx] : tournamentState.stackBB;
                const threat = isUser ? "neutral" : icmThreat(sBB, heroBB);
                const threatColor =
                  threat === "danger" ? "bg-red-500/20 text-red-300 border-red-500/50" :
                  threat === "target" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50" :
                  "bg-muted text-muted-foreground border-border";
                return (
                  <div
                    className="absolute -translate-x-1/2 pointer-events-none flex flex-col items-center gap-0.5"
                    style={{ left: `${x}%`, top: `calc(${y}% + 38px)` }}
                  >
                    <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-semibold border capitalize", threatColor)}>
                      {threat}
                    </span>
                  </div>
                );
              })()}
            </div>
          );
        })}

        {mode === "action" && (
          <ActionMenu
            open={actionSeat != null}
            onOpenChange={(o) => { if (!o) setActionSeat(null); }}
            anchor={anchor}
            currentBet={actionSeat != null ? menuToCall(currentBet, streetContribs[actionSeat] || 0, seatAllInTo?.[actionSeat]) : currentBet}
            defaultRaise={defaultRaise}
            street={street}
            potBB={potBB}
            stackBB={actionSeat != null && seatAllInTo?.[actionSeat] != null ? seatAllInTo[actionSeat] : actionSeat != null && seatStacksBB?.[actionSeat] ? seatStacksBB[actionSeat] : stackBB}
            betLevel={currentBet}
            minRaiseTo={minRaiseTo}
            onAction={({ type, amountBB }) => {
              if (actionSeat != null) onPlayerAction(actionSeat, type, amountBB);
            }}
          />
        )}
      </div>
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground px-1 flex-wrap gap-2">
        <span>{dealerIdx >= 0 ? "✓ Dealer set" : "Set dealer (BTN)"}</span>
        <span>{`Active: ${folded.filter(f => !f).length}/${size}`}</span>
        <span data-testid="table-to-call">{`${t("table.toCall")} : ${toCallBB ?? currentBet} BB`}</span>
        {userIdx >= 0 && (
          <span className="text-primary font-semibold">{seatLabel(userIdx, dealerIdx, size)}</span>
        )}
      </div>
    </div>
  );
};
