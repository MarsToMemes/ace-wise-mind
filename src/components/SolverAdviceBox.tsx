import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Network } from "lucide-react";
import { handLabel } from "@/engines/cashPreflopEngine";
import {
  SolverGame, SolverIndexEntry, loadSolverIndex, loadSolverGame, pickGame, matchSpot, adviceForHand, actLabel,
  isJam, isRaise, TableAction, cashCoverage, coverageOf, Coverage, RARE_NOTE,
} from "@/engines/solverSpots";

type Format = "mtt" | "cash";
const FORMAT_KEY = "ace:solverFormat";

const ACT_COLOR = (a: string) =>
  a === "F" ? "#3f4652" : a === "X" ? "#64748b" : a === "C" ? "#3b82f6" : a === "L" ? "#22c55e"
  : isJam(a) ? "#e3b341" : isRaise(a) ? "#ef4444" : "#a855f7";

const VERB = (a: string) =>
  a === "F" ? "FOLD" : a === "X" ? "CHECK" : a === "C" ? "CALL" : a === "L" ? "LIMP" : isJam(a) ? "TAPIS" : isRaise(a) ? `RELANCE ${a.slice(1)} BB` : a;

interface Props {
  hole: string[];
  /** Position 6-max de chaque siège ("" si le bouton n'est pas placé). */
  seatPos: string[];
  heroSeat: number;
  actions: TableAction[];
  stackBB: number;
  defaultFormat: Format;
  /** Remonte le conseil complet (pour la décision synthétique). */
  onAdvice?: (a: { act: string; pct: number; label: string; title?: string; hand?: string; mix?: { label: string; pct: number }[]; coverage?: Coverage } | null) => void;
  /** Format contrôlé par le parent (sinon mémorisé localement). */
  format?: Format;
  /** Calcule sans rien afficher (le conseil est montré dans la décision synthétique). */
  headless?: boolean;
  /** Ligne préflop jouée mais absente des calculs (texte), ou null. */
  onMiss?: (line: string | null) => void;
}

export const SolverAdviceBox = ({ hole, seatPos, heroSeat, actions, stackBB, defaultFormat, onAdvice, format: formatProp, headless, onMiss }: Props) => {
  const [index, setIndex] = useState<SolverIndexEntry[]>([]);
  const [formatState, setFormat] = useState<Format>(() => {
    try { return (localStorage.getItem(FORMAT_KEY) as Format) || defaultFormat; } catch { return defaultFormat; }
  });
  const [game, setGame] = useState<SolverGame | null>(null);

  const format = formatProp ?? formatState;
  useEffect(() => { loadSolverIndex().then(setIndex).catch(() => setIndex([])); }, []);
  const setFmt = (f: Format) => { setFormat(f); try { localStorage.setItem(FORMAT_KEY, f); } catch { /* ignoré */ } };

  // Blinde contre blinde : partie dédiée (avec limps) quand tout le monde s'est couché jusqu'à la SB
  const heroPos = seatPos[heroSeat] ?? "";
  const preflop = actions.filter(a => a.street === "Preflop");
  const blindBattle = format === "mtt" && (heroPos === "SB" || heroPos === "BB")
    && preflop.every(a => a.type === "Fold" || seatPos[a.seatIdx] === "SB" || seatPos[a.seatIdx] === "BB");

  const entry = useMemo(() => {
    if (format === "cash") return cashCoverage(stackBB).ok ? index.find(e => e.id === "cash100") : undefined;
    const bvb = blindBattle ? pickGame(index, "bvb", stackBB) : undefined;
    if (bvb && Math.abs(bvb.stack - stackBB) <= 10) return bvb;
    return pickGame(index, "mtt", stackBB);
  }, [index, format, stackBB, blindBattle]);

  useEffect(() => {
    setGame(null);
    if (entry) loadSolverGame(entry.id).then(setGame).catch(() => setGame(null));
  }, [entry]);

  const result = useMemo(() => {
    if (!game) return null;
    const pos = game.kind === "bvb" ? seatPos.map(p => (p === "SB" || p === "BB" ? p : "")) : seatPos;
    const acts = game.kind === "bvb" ? actions.filter(a => pos[a.seatIdx]) : actions;
    return matchSpot(game, pos, heroSeat, acts, stackBB);
  }, [game, seatPos, heroSeat, actions, stackBB]);

  const hand = hole.length === 2 ? handLabel(hole) : "";
  const advice = result?.spot && hand ? adviceForHand(result.spot, hand) : null;
  const top = advice?.[0];
  // fiabilité du conseil (cash seulement) : ligne exacte, rapprochée ou rare
  const coverage = result && format === "cash" ? coverageOf(result, cashCoverage(stackBB).note) : undefined;
  const topKey = top ? `${top.act}:${top.pct}:${entry?.label}:${result?.title}:${hand}:${coverage?.level}:${coverage?.details.join("|")}` : "";
  useEffect(() => {
    onAdvice?.(top ? {
      act: top.act, pct: top.pct, label: entry?.label ?? "", title: result?.title, hand,
      mix: advice!.map(x => ({ label: actLabel(x.act), pct: x.pct })),
      coverage,
    } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKey]);

  const missLine = result?.missing ? result.line ?? "" : "";
  useEffect(() => {
    onMiss?.(missLine || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missLine]);
  if (headless) return null;
  return (
    <Card className="glass-panel p-5 space-y-3 border-emerald-500/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-emerald-300" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Solveur préflop</span>
          {entry && <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40">{entry.label}{format === "mtt" ? ` · ton tapis ${Math.round(stackBB)} bb` : ""}</Badge>}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(["mtt", "cash"] as Format[]).map(f => (
            <button key={f} type="button" onClick={() => setFmt(f)}
              className={`px-2.5 py-1 ${format === f ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
              {f === "mtt" ? "Tournoi" : "Cash"}
            </button>
          ))}
        </div>
      </div>

      {!index.length && <p className="text-sm text-muted-foreground">Aucun calcul du solveur disponible pour l'instant.</p>}
      {index.length > 0 && !entry && <p className="text-sm text-muted-foreground">Pas encore de calcul pour ce format.</p>}
      {result?.reason && <p className="text-sm text-muted-foreground">{result.reason}</p>}

      {result?.spot && (
        <>
          <p className="text-sm">{result.title}</p>
          {!hand && <p className="text-sm text-muted-foreground">Choisis tes 2 cartes pour voir le conseil.</p>}
          {hand && !advice && <p className="text-sm text-amber-300">{hand} n'arrive presque jamais ici dans la stratégie du solveur (main déjà jetée plus tôt).</p>}
          {hand && advice && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-xl">{hand}</span>
                <span className="display text-3xl" style={{ color: ACT_COLOR(advice[0].act) === "#3f4652" ? "hsl(var(--destructive))" : ACT_COLOR(advice[0].act) }}>
                  → {VERB(advice[0].act)} {advice[0].pct} %
                </span>
              </div>
              {advice.length > 1 && (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden">
                    {advice.map(x => <div key={x.act} style={{ width: `${x.pct}%`, background: ACT_COLOR(x.act) }} />)}
                  </div>
                  <p className="text-xs text-muted-foreground">Stratégie mixte : {advice.map(x => `${actLabel(x.act)} ${x.pct} %`).join(" · ")}</p>
                </>
              )}
            </>
          )}
          {result.spot.r && <p className="text-[11px] text-amber-300">{RARE_NOTE}</p>}
          {result.notes.map(n => <p key={n} className="text-[11px] text-muted-foreground">{n}</p>)}
          <p className="text-[11px] text-muted-foreground">
            Joueurs sans action saisie avant toi = couchés. Calcul GTOpen sans ICM ; les exploits et le bounty ajustent ce conseil plus bas.
          </p>
        </>
      )}
    </Card>
  );
};
