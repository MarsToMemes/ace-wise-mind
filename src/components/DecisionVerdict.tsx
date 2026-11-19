import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Gavel, ArrowRight, Swords, Target } from "lucide-react";
import type { EngineResult } from "@/components/EngineReadout";
import type { PolarizationResult } from "@/engines/polarizationAssessor";
import type { PostflopAdvice } from "@/engines/postflopAdvisor";
import { ROLE_LABEL } from "@/engines/postflopAdvisor";
import type { ExploitItem, Adjust } from "@/engines/exploitEngine";
import type { PlayerFile } from "@/lib/playersStore";
import { saveExploit } from "@/lib/exploitSettings";

export interface SolverPreflop {
  act: string;
  pct: number;
  label: string;          // partie solveur, ex. « MTT · 20 bb »
  title?: string;         // « BB face à : tapis CO »
  hand?: string;          // « A8o »
  mix?: { label: string; pct: number }[];
}

export interface ExploitView {
  mode: boolean;
  items: ExploitItem[];
  adjust: Adjust;
  familyLabel?: string;
  villainName?: string;
  villainId: string;
  villainOptions: PlayerFile[];
  autoName?: string;
}

interface Props {
  street: "Preflop" | "Flop" | "Turn" | "River";
  engine: EngineResult | null;
  polar: PolarizationResult | null;
  pot: number;
  toCall: number;
  stack: number;
  solver?: SolverPreflop | null;
  postflop?: PostflopAdvice | null;
  exploit?: ExploitView;
  format?: "mtt" | "cash";
  onFormat?: (f: "mtt" | "cash") => void;
}

const VERB_STYLE = (verb: string) =>
  /FOLD/.test(verb) ? "bg-destructive/15 text-destructive border-destructive/40"
  : /CHECK/.test(verb) && !/RAISE/.test(verb) ? "bg-muted text-muted-foreground border-border"
  : /CALL|LIMP/.test(verb) ? "bg-primary/15 text-primary border-primary/40"
  : /TAPIS|JAM/.test(verb) ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

const MIX_COLOR = (label: string) =>
  /fold/i.test(label) ? "#5b6472" : /check/i.test(label) && !/raise/i.test(label) ? "#64748b" : /call|limp/i.test(label) ? "#3b82f6" : /tapis|all-in/i.test(label) ? "#e3b341" : "#10b981";

const SOLVER_VERB = (a: string) =>
  a === "F" ? "FOLD" : a === "X" ? "CHECK" : a === "C" ? "CALL" : a === "L" ? "LIMP" : a.startsWith("A") ? "TAPIS" : a.startsWith("R") ? "RELANCE" : a;

export const DecisionVerdict = ({ street, engine, polar, pot, toCall, stack, solver, postflop, exploit, format, onFormat }: Props) => {
  if (!engine) {
    return (
      <Card className="glass-panel p-5 border-primary/30 text-center text-muted-foreground text-sm">
        Sélectionne tes cartes et ta position pour obtenir la décision synthétique.
      </Card>
    );
  }

  const spr = pot > 0 ? stack / pot : 99;

  // ---------- la décision principale : solveur (préflop), conseiller (postflop) ou moteur de base
  let source = "Moteur de base";
  let verb: string;
  let sizeLine = "";
  let mix: { label: string; pct: number }[] = [];
  let reasons: string[] = [];
  let plan: string[] = [];
  let handLine = "";
  let context = "";

  if (street === "Preflop" && solver) {
    source = `Solveur GTOpen · ${solver.label}`;
    verb = SOLVER_VERB(solver.act);
    sizeLine = solver.act.startsWith("R") ? `Relance à ${solver.act.slice(1)} BB` : solver.act.startsWith("A") ? `Tapis ${stack} BB` : solver.act === "C" ? `Suivre ${toCall} BB` : verb === "FOLD" ? "Coucher" : verb === "CHECK" ? "Checker" : "";
    mix = solver.mix ?? [{ label: verb, pct: solver.pct }];
    context = solver.title ?? "";
    handLine = solver.hand ? `${solver.hand} : ${solver.pct} % ${verb.toLowerCase()}` : "";
    reasons = [solver.pct < 100 ? "Stratégie mixte : le solveur alterne entre ces actions avec cette main." : "Le solveur joue cette main toujours de la même façon ici."];
  } else if (street !== "Preflop" && postflop) {
    source = "Conseiller postflop";
    verb = postflop.verb;
    sizeLine = postflop.label;
    mix = postflop.mix;
    reasons = postflop.reasons.slice(0, 3);
    plan = postflop.plan;
    handLine = `Ta main : ${ROLE_LABEL[postflop.role]}`;
  } else {
    // repli : moteur de base (sans position ou sans cartes adverses connues)
    let action: string = engine.suggestedAction;
    if (action === "Raise" && toCall <= 0) action = "Bet";
    if ((action === "Bet" || action === "Raise") && stack <= 15 && spr < 2.5) action = "Jam";
    verb = action === "Jam" ? "TAPIS" : action === "Bet" ? "MISE" : action === "Raise" ? "RELANCE" : action.toUpperCase();
    const sz = engine.sizing;
    sizeLine = action === "Jam" ? `All-in ${stack} BB`
      : action === "Call" ? `Suivre ${toCall} BB`
      : action === "Fold" ? "Coucher" : action === "Check" ? "Checker"
      : sz && (sz.heroAction === "Bet" || sz.heroAction === "Raise") ? `${sz.heroAction === "Raise" ? "Relancer" : "Miser"} ${sz.amountBB} BB (${sz.pctMin}–${sz.pctMax} % du pot)`
      : polar && polar.sizing.action === "BET" ? `${polar.sizing.label}` : "—";
    mix = [{ label: verb, pct: 100 }];
    reasons = [`Équité ${Math.round(engine.equityPct)} %${engine.reqEquity ? ` vs cote ${engine.reqEquity} %` : ""} · board ${engine.texture}.`];
    if (street !== "Preflop") reasons.push("Place le bouton et ton siège sur la table pour un conseil plus précis (ranges et position).");
  }

  const ex = exploit?.mode ? exploit : undefined;
  const exAction = ex?.adjust.action ?? (street === "Preflop" && ex?.adjust.isoSizeBB ? `Iso-raise ~${ex.adjust.isoSizeBB} bb` : undefined);

  return (
    <Card className="glass-panel p-5 border-primary/40 space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Gavel className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Décision synthétique</span>
          <Badge variant="outline" className="text-[10px] uppercase">{street}</Badge>
          <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40">{source}</Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
          <span>pot {pot} BB · tapis {stack} BB · SPR {spr === 99 ? "∞" : spr.toFixed(1)}</span>
          {street === "Preflop" && onFormat && (
            <span className="flex rounded-md border border-border overflow-hidden font-sans">
              {(["mtt", "cash"] as const).map(f => (
                <button key={f} type="button" onClick={() => onFormat(f)}
                  className={`px-2 py-0.5 ${format === f ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                  {f === "mtt" ? "Tournoi" : "Cash"}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {context && <p className="text-sm text-muted-foreground">{context}</p>}

      {/* Action + taille */}
      <div className="grid sm:grid-cols-[auto,1fr] gap-4 items-center">
        <div className={`rounded-xl border px-5 py-4 text-center min-w-[150px] ${VERB_STYLE(verb)}`}>
          <div className="text-[10px] uppercase tracking-widest opacity-70">Action</div>
          <div className="display text-2xl sm:text-3xl leading-tight mt-1">{verb}</div>
        </div>
        <div className="space-y-2">
          <div className="text-base font-semibold">{sizeLine}</div>
          {handLine && <div className="text-sm text-primary">{handLine}</div>}
          {mix.length > 1 && (
            <>
              <div className="flex h-2.5 rounded-full overflow-hidden">
                {mix.filter(m => m.pct > 0).map(m => <div key={m.label} style={{ width: `${m.pct}%`, background: MIX_COLOR(m.label) }} />)}
              </div>
              <p className="text-[11px] text-muted-foreground">{mix.filter(m => m.pct > 0).map(m => `${m.label} ${m.pct} %`).join(" · ")}</p>
            </>
          )}
        </div>
      </div>

      {/* Pourquoi */}
      {reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-foreground/85">
          {reasons.map(r => <li key={r} className="flex gap-1.5"><ArrowRight className="w-3.5 h-3.5 mt-1 text-primary flex-shrink-0" />{r}</li>)}
        </ul>
      )}

      {/* Exploits contre l'adversaire */}
      {exploit && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Swords className="w-4 h-4 text-primary" />
            <span className="font-semibold">Contre</span>
            <select value={exploit.villainId} onChange={e => saveExploit({ villainId: e.target.value })}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs max-w-[220px]">
              <option value="">{exploit.autoName ? `Auto : ${exploit.autoName}` : "Auto (dernier à miser)"}</option>
              {exploit.villainOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {exploit.familyLabel && <Badge variant="outline" className="text-[10px]">{exploit.familyLabel}</Badge>}
            <label className="ml-auto flex items-center gap-1.5">
              <Switch checked={exploit.mode} onCheckedChange={v => saveExploit({ mode: v })} />
              <span className="text-muted-foreground">{exploit.mode ? "exploit" : "GTO pur"}</span>
            </label>
          </div>
          {ex && exAction && <p className="text-sm font-semibold text-primary">→ Exploit : {exAction}</p>}
          {ex && ex.items.length > 0 && (
            <ul className="space-y-1 text-xs">
              {ex.items.slice(0, 4).map(it => (
                <li key={it.id}><span className="font-semibold">{it.title}</span> — <span className="text-primary">{it.advice}</span>
                  <span className="text-muted-foreground"> ({it.source}{it.weight < 1 ? `, poids ${Math.round(it.weight * 100)} %` : ""})</span></li>
              ))}
            </ul>
          )}
          {ex && ex.items.length === 0 && <p className="text-xs text-muted-foreground">Aucun exploit ici. Associe les sièges à tes fiches (Ma table) pour des ajustements contre ce joueur.</p>}
          {!exploit.mode && <p className="text-xs text-muted-foreground">Mode exploit coupé : conseil GTO pur.</p>}
        </div>
      )}

      {/* Plan */}
      {plan.length > 0 && (
        <div className="text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Target className="w-3.5 h-3.5" />Ensuite</span>
          <ul className="mt-1 space-y-0.5">{plan.map(p => <li key={p}>• {p}</li>)}</ul>
        </div>
      )}

      {/* Détails */}
      <details className="rounded-md border border-border/50 px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Détails du calcul</summary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {postflop && street !== "Preflop" ? (
            <>
              <Detail label="Équité de ta range" value={`${postflop.stats.rangeEquity} %`} />
              <Detail label="Équité de ta main" value={`${postflop.stats.handEquity} %`} />
              <Detail label="Avantage mains fortes" value={`${postflop.stats.nutEdge > 0 ? "+" : ""}${postflop.stats.nutEdge} pts`} />
              <Detail label="Place dans ta range" value={`top ${100 - postflop.stats.percentile} %`} />
              {postflop.stats.required != null && <Detail label="Équité requise" value={`${postflop.stats.required} %`} />}
              <Detail label="SPR" value={`${postflop.stats.spr}`} />
            </>
          ) : (
            <>
              <Detail label="Équité (moteur)" value={`${Math.round(engine.equityPct)} %`} />
              <Detail label="Cote" value={engine.reqEquity ? `${engine.reqEquity} %` : "—"} />
              <Detail label="Range H" value={`${engine.heroRA}`} />
              <Detail label="Range V" value={`${engine.villainRA}`} />
            </>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">
          {street === "Preflop" ? "Préflop : stratégie calculée par GTOpen (sans ICM)." : "Après le flop : principes GTO calculés à la volée (ranges filtrées selon les actions), pas un solveur postflop."}
        </p>
      </details>
    </Card>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-secondary/30 border border-border/40 px-2 py-1.5">
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="font-mono text-sm">{value}</div>
  </div>
);
