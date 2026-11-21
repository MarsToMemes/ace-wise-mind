import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUIT_SYMBOLS } from "@/lib/pokerEngine";
import { interpretVoice, fmtBB, type VoiceEntry, type VoiceResult, type VoiceTable } from "@/lib/voiceInput";
import { seatLabel } from "@/components/PokerTable";

/* Reconnaissance vocale du navigateur (Chrome, Edge, Safari) : pas de type officiel dans TypeScript. */
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const getRecognition = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const TONE: Record<string, string> = {
  Fold: "text-[hsl(0_75%_62%)]", Check: "text-[hsl(150_68%_55%)]", Call: "text-[hsl(150_68%_55%)]",
  Bet: "text-[hsl(38_88%_60%)]", Raise: "text-[hsl(38_88%_60%)]", Tapis: "text-[hsl(38_88%_60%)]",
};
const NAME: Record<string, string> = { Fold: "Fold", Check: "Parole", Call: "Call", Bet: "Mise", Raise: "Relance", Tapis: "Tapis" };
const cardText = (c: string) => (c.endsWith("?") ? `${c[0]} ?` : `${c[0] === "T" ? "10" : c[0]}${SUIT_SYMBOLS[c[1]] ?? c[1]}`);

const Chip = ({ e, heroSeat }: { e: VoiceEntry; heroSeat: number }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold",
      "border-white/10 bg-white/5",
      e.deduced && "border-dashed opacity-75",
      e.level === "warn" && "border-[hsl(38_88%_60%/0.6)]",
      e.level === "err" && "border-[hsl(0_75%_62%/0.7)] bg-[hsl(0_75%_62%/0.08)]",
      e.cards && e.level !== "err" && "border-primary/40",
    )}
  >
    <span className="text-muted-foreground">{e.seatIdx === heroSeat ? "Toi" : e.label}</span>
    {e.cards ? (
      <span className="text-primary">{e.cards.map(cardText).join(" ")}</span>
    ) : e.type ? (
      <span className={TONE[e.type]}>{NAME[e.type]}{e.amount ? ` ${fmtBB(e.amount)}` : ""}</span>
    ) : null}
    {e.deduced && <span className="text-[10px] font-medium text-muted-foreground">déduit</span>}
    {e.note && <span className={cn("font-medium", e.level === "err" ? "text-[hsl(0_80%_78%)]" : "text-muted-foreground")}>{e.note}</span>}
  </span>
);

interface Props {
  table: VoiceTable;
  /** Applique ce qui a été compris (actions, cartes). */
  onApply: (r: VoiceResult) => void;
  onUndo: () => void;
  canUndo: boolean;
  onNewHand: () => void;
}

/**
 * Saisie vocale des actions : maintenir le micro (ou la barre espace), parler, relâcher.
 * Les actions comprises s'affichent pendant qu'on parle, puis s'inscrivent sur la table au relâchement.
 */
export const VoiceInput = ({ table, onApply, onUndo, canUndo, onNewHand }: Props) => {
  const Rec = useMemo(getRecognition, []);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState({ final: "", interim: "" });
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const holding = useRef(false);
  const tableRef = useRef(table);
  tableRef.current = table;
  const ready = table.dealerIdx >= 0 && table.userIdx >= 0;

  const nextSeat = useMemo(() => (ready ? interpretVoice(table, "").next : null), [table, ready]);
  const street = { Preflop: "préflop", Flop: "flop", Turn: "turn", River: "river" }[
    table.board.length >= 5 ? "River" : table.board.length === 4 ? "Turn" : table.board.length === 3 ? "Flop" : "Preflop"
  ];

  const commit = (text: string) => {
    if (!text.trim()) return;
    const r = interpretVoice(tableRef.current, text);
    if (r.undo) { onUndo(); setEntries([{ level: "info", label: "Annulé", note: "dernière dictée effacée" }]); return; }
    if (r.newHand) { onNewHand(); setEntries([{ level: "info", label: "Nouvelle main" }]); return; }
    setEntries(r.entries);
    if (r.actions.length || r.board || r.hole) onApply(r);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const start = () => {
    if (holding.current || !ready) return;
    if (!Rec) { setMicError("La reconnaissance vocale marche dans Chrome, Edge ou Safari. Ici, écris la phrase dans la case."); return; }
    holding.current = true; finalRef.current = "";
    setHeard({ final: "", interim: "" }); setMicError("");
    const rec = new Rec();
    rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = true;
    rec.onresult = ev => {
      let fin = "", interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) fin += r[0].transcript + " "; else interim += r[0].transcript;
      }
      finalRef.current = fin;
      setHeard({ final: fin, interim });
      setEntries(interpretVoice(tableRef.current, fin + interim).entries);
    };
    rec.onerror = ev => {
      setMicError(ev.error === "not-allowed" ? "Le micro est bloqué : autorise-le dans le navigateur (icône à gauche de l'adresse)."
        : ev.error === "network" ? "La reconnaissance vocale n'est pas disponible dans cette fenêtre : essaie Chrome ou Safari."
        : ev.error === "no-speech" ? "Je n'ai rien entendu." : `Micro : ${ev.error}`);
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      if (text) { setHeard({ final: text, interim: "" }); commitRef.current(text); }
    };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { holding.current = false; }
  };
  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    // un court délai pour ne pas couper le dernier mot
    setTimeout(() => recRef.current?.stop(), 250);
  };
  const startRef = useRef(start); startRef.current = start;
  const stopRef = useRef(stop); stopRef.current = stop;

  // barre espace maintenue = micro (sauf quand on écrit dans un champ)
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName) || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !typing()) { e.preventDefault(); startRef.current(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && holding.current) { e.preventDefault(); stopRef.current(); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  useEffect(() => () => recRef.current?.stop(), []);

  const nextText = !ready ? "Place d'abord le bouton et ton siège sur la table."
    : nextSeat === null ? "Tour d'enchères fini : dis la carte suivante (« flop … », « turn … »)."
    : null;

  return (
    <section className="mt-5 rounded-2xl border border-primary/25 bg-background/40 p-4" aria-labelledby="voice-title" data-testid="voice-input">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="voice-title" className="display text-lg">Dicter la main</h3>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">maintiens le micro ou la barre espace</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Maintenir pour parler"
          aria-pressed={listening}
          disabled={!ready}
          onPointerDown={e => { e.preventDefault(); start(); }}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          className={cn(
            "voice-mic relative grid h-16 w-16 shrink-0 select-none place-items-center rounded-full border-2 transition-[transform,background-color,border-color] duration-150 active:scale-[0.96] touch-none",
            "disabled:cursor-not-allowed disabled:opacity-40",
            listening
              ? "voice-mic-on border-[#9ff5c8] bg-[radial-gradient(circle_at_50%_35%,#4ff0a0,#1f9d62)] text-[#04170d]"
              : "border-primary bg-[radial-gradient(circle_at_50%_35%,#1b2140,#0c0f1c)] text-primary",
          )}
        >
          <Mic className="h-7 w-7" />
        </button>
        <div className="min-h-16 flex-1 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2" aria-live="polite">
          <div className={cn("text-[11px] font-semibold", listening ? "text-[hsl(150_68%_55%)]" : "text-muted-foreground")}>
            {listening ? "J'écoute…" : "Micro prêt"}
          </div>
          <div className="text-sm">
            {heard.final || heard.interim
              ? <>« {heard.final}<span className="text-muted-foreground">{heard.interim}</span> »</>
              : <span className="text-muted-foreground">« UTG fold, MP fold, cutoff relance à 2,5, moi je suis »</span>}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {nextText ?? <>Au {street}, c'est à <b className="text-[hsl(150_68%_55%)]">{nextSeat === table.userIdx ? "toi" : seatLabel(nextSeat!, table.dealerIdx, table.size)}</b> de parler.</>}
      </p>

      {entries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
          {entries.map((e, i) => <Chip key={i} e={e} heroSeat={table.userIdx} />)}
        </div>
      )}
      {micError && <p className="mt-2 text-xs text-[hsl(0_80%_78%)]">{micError}</p>}

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={e => { e.preventDefault(); setHeard({ final: typed, interim: "" }); commit(typed); setTyped(""); }}
      >
        <Input
          value={typed}
          disabled={!ready}
          onChange={e => { setTyped(e.target.value); if (ready) setEntries(e.target.value.trim() ? interpretVoice(table, e.target.value).entries : []); }}
          placeholder="Ou écris-la : « co relance 2,5, moi je suis »"
          aria-label="Écrire les actions"
          className="h-9 min-w-[13rem] flex-1"
        />
        <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!ready || !typed.trim()}>Envoyer</Button>
        <Button type="button" size="sm" variant="ghost" className="h-9 px-2" disabled={!canUndo} onClick={() => { onUndo(); setEntries([{ level: "info", label: "Annulé", note: "dernière dictée effacée" }]); }} aria-label="Annuler la dernière dictée" title="Annuler la dernière dictée">
          <Undo2 className="h-4 w-4" />
        </Button>
      </form>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Ce que tu peux dire</summary>
        <ul className="mt-2 space-y-1 leading-relaxed">
          <li><b className="text-foreground">Joueurs</b> : UTG, MP (hijack), cutoff, bouton, small, big, « moi » ou « je » pour toi. Sans nom, c'est le suivant qui parle.</li>
          <li><b className="text-foreground">Actions</b> : fold / se couche, check / parole, call / je suis / paye, relance à 2,5, 3-bet à 8, relance 3 fois, mise 4, mise deux tiers (demi-pot, pot…), tapis.</li>
          <li><b className="text-foreground">Raccourci</b> : « tout le monde se couche jusqu'au cutoff ».</li>
          <li><b className="text-foreground">Cartes</b> : « j'ai dame de pique dame de carreau », « flop roi de cœur, 7 de trèfle, 2 de pique », « turn as de pique ».</li>
          <li><b className="text-foreground">Corriger</b> : « annule » efface la dernière dictée, « nouvelle main ».</li>
        </ul>
      </details>
    </section>
  );
};
