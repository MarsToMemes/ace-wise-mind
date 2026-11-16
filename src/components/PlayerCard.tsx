import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { classify, tendencies, PROFILE_LABEL, PROFILE_TIP, Profile } from "@/engines/playerStats";
import { PlayerFile, updatePlayer } from "@/lib/playersStore";

const PROFILE_TONE: Record<Profile, string> = {
  Nit: "text-sky-300 border-sky-500/40",
  TAG: "text-emerald-300 border-emerald-500/40",
  LAG: "text-orange-300 border-orange-500/40",
  Maniac: "text-red-400 border-red-500/50",
  Station: "text-amber-300 border-amber-500/50",
  FishLimper: "text-primary gold-border",
  Unknown: "text-muted-foreground",
};

export function ProfileBadge({ p }: { p: PlayerFile }) {
  const { profile, provisional, confidence } = classify(p.counters);
  return (
    <Badge variant="outline" className={`text-[10px] ${PROFILE_TONE[profile]}`}>
      {PROFILE_LABEL[profile]}{provisional && profile !== "Unknown" ? " · provisoire" : ""} · confiance {confidence}
    </Badge>
  );
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function PlayerCard({ p, compact = false }: { p: PlayerFile; compact?: boolean }) {
  const { profile, est } = classify(p.counters);
  const tips = tendencies(p.counters);
  const [note, setNote] = useState(p.note);
  const c = p.counters;
  const stats: [string, string, number][] = [
    ["VPIP", pct(est.vpip), c.vpipOpp],
    ["PFR", pct(est.pfr), c.vpipOpp],
    ["Limp", pct(est.limp), c.limpOpp],
    ["3-bet", pct(est.threeBet), c.threeBetOpp],
    ["C-bet", pct(est.cbet), c.cbetOpp],
    ["Fold au c-bet", pct(est.foldCbet), c.foldCbetOpp],
    ["Abattage", pct(est.wtsd), c.wtsdOpp],
    ["Agression", est.af.toFixed(1), c.aggBets + c.aggCalls],
    ["Petites mises", pct(est.smallBet), c.postBets],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{p.name}</span>
        <span className="text-[11px] text-muted-foreground">{p.room} · {c.hands} mains</span>
        <ProfileBadge p={p} />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {stats.map(([label, v, n]) => (
          <div key={label} className="rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
            <div className="font-mono text-sm">{v} <span className="text-[10px] text-muted-foreground">/{n}</span></div>
          </div>
        ))}
      </div>

      <p className="text-sm"><span className="text-primary font-medium">Contre lui : </span>{PROFILE_TIP[profile]}</p>

      {tips.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-200/90">
          {tips.map(t => <li key={t}>→ {t}</li>)}
        </ul>
      )}

      {!compact && (
        <>
          {p.shown.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mains montrées</div>
              <ul className="space-y-0.5 text-sm">
                {p.shown.slice(0, 8).map((s, i) => (
                  <li key={i}><span className="font-mono text-primary">{s.cards}</span>{s.line ? ` — ${s.line}` : ""}
                    <span className="text-[10px] text-muted-foreground"> · {new Date(s.date).toLocaleDateString("fr-FR")}</span></li>
                ))}
              </ul>
            </div>
          )}
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => note !== p.note && updatePlayer(p.id, { note: note.slice(0, 2000) })}
            placeholder="Note libre : paie tout à la river, tilt après un bad beat…"
            rows={2}
            className="text-sm"
          />
        </>
      )}
      <p className="text-[10px] text-muted-foreground">
        Chiffre /n = nombre d'occasions. Avec peu de mains, les stats restent proches de la moyenne des joueurs de petite limite.
      </p>
    </div>
  );
}
