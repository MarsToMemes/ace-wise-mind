import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";
import { ALL_HANDS } from "@/engines/myRanges";
import {
  SolverGame, SolverIndexEntry, loadSolverGame, loadSolverIndex, findSpot, childKey, actLabel, isJam, isRaise,
} from "@/engines/solverSpots";

const ACT_COLOR = (a: string) =>
  a === "F" ? "#3f4652" : a === "X" ? "#64748b" : a === "C" ? "#3b82f6" : a === "L" ? "#22c55e"
  : isJam(a) ? "#e3b341" : isRaise(a) ? "#ef4444" : "#a855f7";

export const SolverSpotsPanel = ({ prefer = "mtt" }: { prefer?: string }) => {
  const [index, setIndex] = useState<SolverIndexEntry[]>([]);
  const [gameId, setGameId] = useState("");
  const [game, setGame] = useState<SolverGame | null>(null);
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [endNote, setEndNote] = useState<string | null>(null);

  useEffect(() => {
    loadSolverIndex().then(ix => {
      setIndex(ix);
      const first = ix.find(e => e.kind === prefer) ?? ix[0];
      if (first) setGameId(first.id);
    }).catch(() => setErr("Données du solveur indisponibles."));
  }, [prefer]);

  useEffect(() => {
    if (!gameId) return;
    setGame(null); setKey("");
    loadSolverGame(gameId).then(setGame).catch(e => setErr(String(e.message || e)));
  }, [gameId]);

  const spot = game ? findSpot(game, key) : undefined;
  const line = useMemo(() => (key ? key.split(",").map(s => s.split(":") as [string, string]) : []), [key]);

  return (
    <Card className="glass-panel p-6 space-y-4 border-primary/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Spots du solveur</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">GTOpen · calculé sur ton Mac</Badge>
      </div>

      {err && <p className="text-sm text-amber-400">{err}</p>}

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</span>
        <select value={gameId} onChange={e => setGameId(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
          {index.map(e => <option key={e.id} value={e.id}>{e.label} · {e.spots} spots</option>)}
        </select>
      </label>

      {game && (
        <>
          {/* Ligne jouée */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <button type="button" className="px-2 py-1 rounded border border-border hover:border-primary" onClick={() => { setKey(""); setEndNote(null); }}>Début</button>
            {line.map(([pos, act], i) => (
              <button key={i} type="button"
                className="px-2 py-1 rounded border border-border hover:border-primary"
                onClick={() => setKey(line.slice(0, i + 1).map(([p, a]) => `${p}:${a}`).join(","))}>
                {pos} {actLabel(act)}
              </button>
            ))}
          </div>

          {!spot && <p className="text-sm text-muted-foreground">Fin de la ligne (main terminée ou ligne trop rare pour être calculée).</p>}

          {spot && (
            <>
              <div className="text-sm"><span className="font-semibold text-primary">{spot.a}</span> doit agir. Clique une action pour avancer :</div>
              <div className="flex flex-wrap gap-2">
                {spot.acts.map((a, i) => {
                  const next = childKey(spot, a);
                  const exists = !!findSpot(game, next);
                  const closes = !exists && (a === "C" || a === "X" || a === "L");
                  return (
                    <Button key={a} size="sm" type="button" variant="outline" disabled={!exists && !closes && a !== "F"}
                      onClick={() => {
                        if (exists) { setKey(next); setEndNote(null); }
                        else if (closes) setEndNote(`${spot.a} ${actLabel(a).toLowerCase()} : le préflop est terminé, la main part au flop.`);
                        else if (a === "F") setEndNote(`${spot.a} se couche : la main est terminée.`);
                      }}
                      className="h-8 gap-2" style={{ borderColor: ACT_COLOR(a) }}>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: ACT_COLOR(a) }} />
                      {actLabel(a)} · {spot.f[i]?.toFixed(1)} %
                    </Button>
                  );
                })}
              </div>

              {endNote && <p className="text-sm text-emerald-300">{endNote}</p>}
              <div className="max-w-md mx-auto w-full">
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                  {ALL_HANDS.map(h => {
                    const probs = spot.h[h];
                    const tip = probs ? `${h} : ${spot.acts.map((a, i) => `${actLabel(a)} ${probs[i]} %`).join(" · ")}` : `${h} : hors de sa range`;
                    return (
                      <div key={h} title={tip}
                        className={`relative aspect-square rounded-[3px] overflow-hidden border ${probs ? "border-border/50" : "border-transparent opacity-25"}`}>
                        {probs && (
                          <div className="absolute inset-0 flex">
                            {probs.map((p, i) => p > 0 && <div key={i} style={{ width: `${p}%`, background: ACT_COLOR(spot.acts[i]) }} />)}
                          </div>
                        )}
                        <span className="relative z-10 flex h-full items-center justify-center text-[8px] sm:text-[10px] font-mono leading-none text-white [text-shadow:0_0_2px_#000]">{h}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <p className="text-[11px] text-muted-foreground">
            Partie à {game.positions.length} joueurs, {game.stack} bb{game.ante ? `, ante ${game.ante} bb par joueur` : ""}.
            Résolu par GTOpen ({game.iterations ?? "?"} itérations, écart {game.gap != null ? `${game.gap.toFixed(4).replace(".", ",")} bb par main, soit ≈ ${(game.gap * 100).toFixed(1).replace(".", ",")} bb pour 100 mains` : "inconnu"}).
            Survole une case pour le détail ; les cases grisées sont hors de la range du joueur.
          </p>
        </>
      )}
    </Card>
  );
};
