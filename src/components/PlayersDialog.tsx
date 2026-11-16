import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlayerCard } from "@/components/PlayerCard";
import { usePlayers } from "@/hooks/use-players";
import { deletePlayer, exportPlayers, importPlayers } from "@/lib/playersStore";

export function PlayersDialog({ children }: { children: React.ReactNode }) {
  const { players } = usePlayers();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () => Object.values(players)
      .filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => b.counters.hands - a.counters.hands),
    [players, q],
  );

  const doExport = () => {
    const blob = new Blob([exportPlayers()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "joueurs-ace-analyst.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    const n = importPlayers(await f.text());
    setMsg(n ? `${n} joueur(s) importé(s) ou fusionné(s).` : "Fichier non reconnu.");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="display gold-text">Joueurs</DialogTitle>
          <DialogDescription>
            Tes fiches restent dans ce navigateur. Exporte-les de temps en temps pour les garder ou les passer sur un autre appareil.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un pseudo…" className="flex-1 min-w-0" />
          <Button size="sm" variant="ghost" onClick={doExport}>Exporter</Button>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Importer</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={e => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {msg && <p className="text-xs text-primary">{msg}</p>}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Aucun joueur pour l'instant. Ajoute-les depuis « Ma table ».</p>}
        <div className="space-y-4">
          {list.map(p => (
            <div key={p.id} className="rounded-lg border border-border/50 p-3 space-y-2">
              <PlayerCard p={p} />
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive"
                  onClick={() => { if (window.confirm(`Supprimer définitivement la fiche de ${p.name} ?`)) deletePlayer(p.id); }}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
