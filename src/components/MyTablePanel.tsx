import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, ChevronDown, ChevronUp, X } from "lucide-react";
import { usePlayers } from "@/hooks/use-players";
import { upsertPlayer, setMyTable, addStats, addShownHand, setSeatPlayers, removeFromTable, clearTable } from "@/lib/playersStore";
import { applyQuickEvent, HandFlags, QuickEvent, QUICK_LABEL, PREFLOP_EVENTS, POSTFLOP_EVENTS } from "@/engines/playerStats";
import { PlayerCard, ProfileBadge } from "@/components/PlayerCard";
import { PlayersDialog } from "@/components/PlayersDialog";
import { analyzeTable, TableGrade, SeatInfo } from "@/engines/tableAnalyzer";

const GRADE_STYLE: Record<TableGrade, { icon: string; cls: string }> = {
  excellente: { icon: "⭐", cls: "border-primary/60 bg-primary/10" },
  bonne: { icon: "✅", cls: "border-emerald-500/50 bg-emerald-500/10" },
  moyenne: { icon: "⚠️", cls: "border-amber-500/50 bg-amber-500/10" },
  quitter: { icon: "❌", cls: "border-red-500/50 bg-red-500/10" },
  inconnue: { icon: "🔍", cls: "border-border/60 bg-secondary/20" },
};

interface Props {
  /** Libellé de position de chaque siège de l'analyseur ("" si le bouton n'est pas placé). */
  seatLabels?: string[];
  heroSeat?: number;
}

export const MyTablePanel = ({ seatLabels = [], heroSeat = -1 }: Props) => {
  const { players, table, seats } = usePlayers();
  const [name, setName] = useState("");
  const [flags, setFlags] = useState<Record<string, HandFlags>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<{ id: string; cards: string; line: string } | null>(null);
  const [handNo, setHandNo] = useState(1);

  const add = () => {
    if (!name.trim()) return;
    const p = upsertPlayer(name);
    if (!table.includes(p.id)) setMyTable([...table, p.id]);
    setName("");
  };

  const click = (id: string, ev: QuickEvent) => {
    const r = applyQuickEvent(flags[id] ?? {}, ev);
    if (!r) return;
    addStats(id, r.delta);
    setFlags(f => ({ ...f, [id]: r.flags }));
  };

  const nextHand = () => { setFlags({}); setHandNo(n => n + 1); };

  const seatCount = seatLabels.length;
  const hasSeats = seatLabels.some(Boolean);
  const seatInfos: Record<number, SeatInfo | undefined> = {};
  for (const [k, pid] of Object.entries(seats)) if (players[pid]) seatInfos[+k] = { name: players[pid].name, counters: players[pid].counters };
  const tableNote = seatCount > 0 && table.length > 0 ? analyzeTable(seatCount, heroSeat, seatInfos) : null;

  return (
    <Card className="glass-panel p-6 space-y-4 border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Ma table</h3>
        </div>
        <PlayersDialog>
          <Button size="sm" variant="outline" className="gold-border text-primary">Tous les joueurs</Button>
        </PlayersDialog>
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); add(); }}>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Pseudo d'un adversaire" list="ace-players" className="min-w-0" />
        <datalist id="ace-players">{Object.values(players).map(p => <option key={p.id} value={p.name} />)}</datalist>
        <Button type="submit" size="sm">Ajouter</Button>
      </form>

      {tableNote && (
        <div className={`rounded-lg border p-3 space-y-1 ${GRADE_STYLE[tableNote.grade].cls}`}>
          <div className="font-semibold text-sm">{GRADE_STYLE[tableNote.grade].icon} {tableNote.title}</div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {tableNote.reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {table.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ajoute les pseudos de ta table. À chaque main, clique ce que chacun fait : ses stats et son profil se calculent tout seuls.
        </p>
      )}

      {table.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Main n° {handNo}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" type="button"
              onClick={() => {
                if (window.confirm("Changer de table : retirer tous les joueurs de « Ma table » et effacer les pseudos des sièges ? Leurs fiches et leurs stats sont gardées.")) {
                  clearTable(); setFlags({}); setHandNo(1); setOpen(null); setShown(null);
                }
              }}>Changer de table</Button>
            <Button size="sm" variant="secondary" onClick={nextHand}>Main suivante</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {table.map(id => {
          const p = players[id];
          if (!p) return null;
          const f = flags[id] ?? {};
          return (
            <div key={id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="font-semibold hover:text-primary flex items-center gap-1"
                  onClick={() => setOpen(open === id ? null : id)}>
                  {p.name} {open === id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <ProfileBadge p={p} />
                <span className="text-[11px] text-muted-foreground">{p.counters.hands} mains</span>
                <button type="button" aria-label={`Retirer ${p.name} de la table`} className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => removeFromTable(id)}><X className="w-4 h-4" /></button>
              </div>

              <div className="flex flex-wrap gap-1">
                {PREFLOP_EVENTS.map(ev => (
                  <Button key={ev} size="sm" type="button"
                    variant={f.pre === ev ? "default" : "outline"}
                    disabled={!!f.pre && f.pre !== ev}
                    className="h-7 px-2 text-xs"
                    onClick={() => click(id, ev)}>{QUICK_LABEL[ev]}</Button>
                ))}
              </div>
              {f.pre && f.pre !== "foldPre" && (
                <div className="flex flex-wrap gap-1">
                  {POSTFLOP_EVENTS.map(ev => {
                    const done = (ev === "cbet" || ev === "checkPfr") ? f.cbetDone : (ev === "foldToCbet" || ev === "callCbet") ? f.facedCbet : ev === "showdown" ? f.showdown : false;
                    return (
                      <Button key={ev} size="sm" type="button" variant="ghost" disabled={!!done}
                        className="h-7 px-2 text-xs border border-border/40" onClick={() => click(id, ev)}>{QUICK_LABEL[ev]}</Button>
                    );
                  })}
                  <Button size="sm" type="button" variant="ghost" className="h-7 px-2 text-xs border border-primary/40 text-primary"
                    onClick={() => setShown({ id, cards: "", line: "" })}>Il a montré…</Button>
                </div>
              )}

              {shown?.id === id && (
                <form className="flex flex-wrap gap-2" onSubmit={e => {
                  e.preventDefault();
                  if (shown.cards.trim()) addShownHand(id, shown.cards, shown.line);
                  setShown(null);
                }}>
                  <Input value={shown.cards} onChange={e => setShown({ ...shown, cards: e.target.value })} placeholder="AJo" className="w-20" autoFocus />
                  <Input value={shown.line} onChange={e => setShown({ ...shown, line: e.target.value })} placeholder="Ligne : mise 80 % turn, paie la relance…" className="flex-1 min-w-0" />
                  <Button type="submit" size="sm">OK</Button>
                </form>
              )}

              {open === id && <div className="pt-2 border-t border-border/40"><PlayerCard p={p} compact /></div>}
            </div>
          );
        })}
      </div>

      {seatCount > 0 && table.length > 0 && (
        <details className="rounded-lg border border-border/40 p-3">
          <summary className="cursor-pointer text-sm">Associer les sièges de l'analyseur</summary>
          <p className="text-xs text-muted-foreground mt-2">
            Les mains que tu saisis sur la table de l'analyseur seront comptées dans la fiche de chaque joueur quand tu cliques sur « Reset ».
            {!hasSeats && " Place d'abord le bouton (dealer) sur la table."}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {Array.from({ length: seatCount }, (_, i) => i).filter(i => i !== heroSeat).map(i => (
              <label key={i} className="text-xs space-y-1 block min-w-0">
                <span className="text-muted-foreground">Siège {i + 1}{seatLabels[i] ? ` · ${seatLabels[i]}` : ""}</span>
                <select value={seats[i] ?? ""} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                  onChange={e => {
                    const next = { ...seats };
                    if (e.target.value) next[i] = e.target.value; else delete next[i];
                    setSeatPlayers(next);
                  }}>
                  <option value="">—</option>
                  {table.map(pid => players[pid] && <option key={pid} value={pid}>{players[pid].name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
};
