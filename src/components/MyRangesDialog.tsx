import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ALL_HANDS, RangeWeights, countCombos, parseRangeText, rangeToText,
  loadMyRanges, saveMyRange, clearMyRange, exportMyRanges, importMyRanges } from "@/engines/myRanges";
import { allSlots, slotLabel, getRange } from "@/engines/matchupRanges";

interface Props {
  /** Situation ouverte par défaut (ex. "open:BTN"). */
  initialSlot?: string;
  children: React.ReactNode;
}

const KIND_GROUPS: { kind: string; label: string }[] = [
  { kind: "open", label: "Ouvertures" },
  { kind: "call", label: "Payer un open" },
  { kind: "3bet", label: "3-bet" },
  { kind: "call3bet", label: "Payer un 3-bet" },
];

export function MyRangesDialog({ initialSlot = "open:UTG", children }: Props) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(initialSlot);
  const [draft, setDraft] = useState<RangeWeights>({});
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [userSlots, setUserSlots] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const slots = useMemo(() => allSlots(), []);

  const reload = (s: string) => {
    setDraft({ ...getRange(s).weights });
    setUserSlots(Object.keys(loadMyRanges()));
    setText("");
    setMsg(null);
  };

  useEffect(() => { if (open) { setSlot(initialSlot); reload(initialSlot); } }, [open, initialSlot]);

  const source = userSlots.includes(slot) ? "user" : getRange(slot).source;
  const combos = countCombos(draft);

  const cycle = (h: string) => {
    setDraft(d => {
      const cur = d[h] ?? 0;
      const next = cur === 0 ? 1 : cur >= 1 ? 0.5 : 0;
      const out = { ...d };
      if (next > 0) out[h] = next; else delete out[h];
      return out;
    });
  };

  const save = () => {
    saveMyRange(slot, draft);
    setUserSlots(Object.keys(loadMyRanges()));
    setMsg("Range enregistrée dans ce navigateur.");
  };
  const reset = () => { clearMyRange(slot); reload(slot); setMsg("Range de base rétablie."); };
  const applyText = () => {
    const parsed = parseRangeText(text);
    if (!Object.keys(parsed).length) { setMsg("Aucune main reconnue dans le texte."); return; }
    setDraft(parsed);
    setMsg(`${Object.keys(parsed).length} mains lues. Clique sur « Enregistrer » pour garder.`);
  };
  const doExport = () => {
    const blob = new Blob([exportMyRanges()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mes-ranges-ace-analyst.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    const n = importMyRanges(await f.text());
    reload(slot);
    setMsg(n ? `${n} situation(s) importée(s).` : "Fichier non reconnu.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="display gold-text">Mes ranges</DialogTitle>
          <DialogDescription>
            Tes ranges restent dans ce navigateur (elles ne vont ni dans le code ni sur GitHub).
            Elles remplacent les ranges du site dans le bloc Board &amp; C-bet et le Range Explorer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={slot}
              onChange={e => { setSlot(e.target.value); reload(e.target.value); }}
              className="flex-1 min-w-0 h-10 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Situation"
            >
              {KIND_GROUPS.map(g => (
                <optgroup key={g.kind} label={g.label}>
                  {slots.filter(s => s.startsWith(g.kind + ":")).map(s => (
                    <option key={s} value={s}>{slotLabel(s)}{userSlots.includes(s) ? " ★" : ""}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Badge variant="outline" className={source === "user" ? "text-primary gold-border" : source === "base" ? "" : "text-amber-400 border-amber-500/40"}>
              {source === "user" ? "Ma range" : source === "solver" ? "Solveur GTOpen" : source === "base" ? "Range de base" : "Range estimée"}
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground">
            {Object.keys(draft).length} mains · {combos} combos · {((combos / 1326) * 100).toFixed(1)} % des mains.
            Clic : 100 % → 50 % → retirée.
          </div>

          <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {ALL_HANDS.map(h => {
              const w = draft[h] ?? 0;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => cycle(h)}
                  className={`aspect-square rounded-[3px] text-[9px] sm:text-[11px] font-mono leading-none border transition-colors ${
                    w >= 1 ? "bg-primary text-primary-foreground border-primary"
                    : w > 0 ? "bg-primary/40 text-foreground border-primary/50"
                    : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/60"
                  }`}
                  aria-label={`${h} ${Math.round(w * 100)} %`}
                >
                  {h}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Colle une range : 22+, A2s+, KTs+, QJs, AJo+, KQo, AKo:50"
              className="font-mono text-xs"
              rows={2}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={applyText}>Lire le texte</Button>
              <Button size="sm" variant="ghost" onClick={() => setText(rangeToText(draft))}>Copier la grille en texte</Button>
            </div>
          </div>

          {msg && <p className="text-xs text-primary">{msg}</p>}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
            <Button size="sm" onClick={save}>Enregistrer</Button>
            <Button size="sm" variant="outline" onClick={reset} disabled={source !== "user"}>Revenir à la range de base</Button>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={doExport}>Exporter</Button>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Importer</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={e => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
