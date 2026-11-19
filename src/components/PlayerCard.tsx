import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { classify, tendencies, PROFILE_LABEL, PROFILE_TIP, Profile, familyOf, FAMILY_LABEL, FAMILY_TIP, Family, referenceGaps } from "@/engines/playerStats";
import { PlayerFile, updatePlayer } from "@/lib/playersStore";
import { showdownInsights } from "@/engines/showdown";


const FAMILY_TONE: Record<Family, string> = {
  recPassif: "text-primary gold-border",
  recAgressif: "text-red-400 border-red-500/50",
  regCompetent: "text-emerald-300 border-emerald-500/40",
  regSerre: "text-sky-300 border-sky-500/40",
  regAgressif: "text-orange-300 border-orange-500/40",
  inconnu: "text-muted-foreground",
};

export function ProfileBadge({ p }: { p: PlayerFile }) {
  const { provisional, confidence } = classify(p.counters);
  const fam = familyOf(p.counters);
  return (
    <Badge variant="outline" className={`text-[10px] ${FAMILY_TONE[fam]}`}>
      {FAMILY_LABEL[fam]}{provisional && fam !== "inconnu" ? " · provisoire" : ""} · confiance {confidence}
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
      {!compact && <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{p.name}</span>
        <span className="text-[11px] text-muted-foreground">{p.room} · {c.hands} mains</span>
        <ProfileBadge p={p} />
      </div>}

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {stats.map(([label, v, n]) => (
          <div key={label} className="rounded-md border border-border/40 bg-secondary/20 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
            <div className="font-mono text-sm">{v} <span className="text-[10px] text-muted-foreground">/{n}</span></div>
          </div>
        ))}
      </div>

      <p className="text-sm"><span className="text-primary font-medium">Contre lui : </span>{FAMILY_TIP[familyOf(p.counters)]}</p>
      {profile !== "Unknown" && (
        <p className="text-xs text-muted-foreground">Style détaillé : {PROFILE_LABEL[profile]} — {PROFILE_TIP[profile]}</p>
      )}
      {referenceGaps(p.counters).length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Écarts à un joueur correct</div>
          <ul className="space-y-0.5 text-sm">
            {referenceGaps(p.counters).map(g => (
              <li key={g.stat}>
                <span className={g.dir === "low" ? "text-sky-300" : "text-amber-300"}>{g.label} {pct(g.value)}</span>
                <span className="text-muted-foreground"> (réf. ~{pct(g.ref)}) → </span>{g.advice}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tips.length > 0 && (
        <ul className="space-y-1 text-sm text-amber-200/90">
          {tips.map(t => <li key={t}>→ {t}</li>)}
        </ul>
      )}

      {showdownInsights(p.shown).lines.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ce qu'il a montré à l'abattage</div>
          <ul className="space-y-0.5 text-sm text-emerald-200/90">
            {showdownInsights(p.shown).lines.map(l => <li key={l}>→ {l}</li>)}
          </ul>
        </div>
      )}

      {!compact && (
        <>
          {p.shown.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mains montrées</div>
              <ul className="space-y-0.5 text-sm">
                {p.shown.slice(0, 8).map((s, i) => (
                  <li key={i}><span className="font-mono text-primary">{s.cards}</span>
                    {s.position && <span className="text-muted-foreground"> ({s.position})</span>}
                    {s.board?.length ? <span className="text-muted-foreground"> · board {s.board.join(" ")}</span> : null}
                    {s.line ? ` — ${s.line}` : ""}
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
