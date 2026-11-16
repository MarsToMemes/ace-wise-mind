import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Grid3x3 } from "lucide-react";
import { analyzeBoard } from "@/engines/boardTexture";
import { boardAdvantage } from "@/engines/rangeVsRange";
import { adviseCbet } from "@/engines/cbetAdvisor";
import { POSITIONS, Pos, PotType, actsFirstPostflop, getRange, slotsFor, RangeSource } from "@/engines/matchupRanges";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_CBET } from "@/lib/teachContent";
import { MyRangesDialog } from "@/components/MyRangesDialog";
import { runExploits } from "@/engines/exploitEngine";
import { SIZE_TIERS } from "@/engines/cbetAdvisor";
import { useExploitSettings } from "@/lib/exploitSettings";
import { usePlayers } from "@/hooks/use-players";

interface Props {
  flop: string[];
  heroPosition: string;
  /** Adversaire de la main (fiche joueur) pour le mode exploit. */
  villainId?: string;
}

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const red = (c: string) => c[1] === "h" || c[1] === "d";

const SOURCE_LABEL: Record<RangeSource, string> = { user: "Ma range", base: "Range de base", estimated: "Estimée" };

function SourceBadge({ source }: { source: RangeSource }) {
  const cls = source === "user" ? "text-primary gold-border" : source === "estimated" ? "text-amber-400 border-amber-500/40" : "";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{SOURCE_LABEL[source]}</Badge>;
}

function PosSelect({ label, value, onChange }: { label: string; value: Pos; onChange: (p: Pos) => void }) {
  return (
    <label className="space-y-1 block min-w-0">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as Pos)}
        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
  );
}

function Bar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const tot = left + right || 1;
  const pct = (left / tot) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-primary">{leftLabel}</span>
        <span className="text-sky-300">{rightLabel}</span>
      </div>
      <div className="h-2.5 rounded-full bg-sky-500/40 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const BoardCbetPanel = ({ flop, heroPosition, villainId }: Props) => {
  const hero = (POSITIONS.includes(heroPosition as Pos) ? heroPosition : "BTN") as Pos;
  const [pfr, setPfr] = useState<Pos>(hero === "BB" ? "BTN" : hero);
  const [caller, setCaller] = useState<Pos>("BB");
  const [potType, setPotType] = useState<PotType>("srp");
  const [version, setVersion] = useState(0);
  const exploitSettings = useExploitSettings();
  const { players } = usePlayers();

  useEffect(() => {
    const on = () => setVersion(v => v + 1);
    window.addEventListener("ace:myRanges", on);
    return () => window.removeEventListener("ace:myRanges", on);
  }, []);

  // Validité : en pot simple le payeur parle après l'ouvreur préflop ; en pot 3-betté le 3-bettor parle après l'ouvreur.
  const order = (p: Pos) => POSITIONS.indexOf(p);
  const invalid =
    pfr === caller ? "Choisis deux positions différentes."
    : potType === "srp" && pfr === "BB" ? "La BB ne peut pas ouvrir : choisis un autre relanceur."
    : potType === "srp" && order(caller) < order(pfr) ? `${caller} parle avant ${pfr} préflop : il ne peut pas payer son open.`
    : potType === "3bet" && order(pfr) < order(caller) ? `${pfr} parle avant ${caller} préflop : il ne peut pas 3-bet son open.`
    : null;

  const ready = flop.length >= 3 && !invalid;

  const data = useMemo(() => {
    if (!ready) return null;
    const slots = slotsFor(pfr, caller, potType);
    const rp = getRange(slots.pfr), rc = getRange(slots.caller);
    const texture = analyzeBoard(flop);
    const adv = boardAdvantage(rp.weights, rc.weights, flop, { samples: 4000, seed: 11 });
    const pfrIP = !actsFirstPostflop(pfr, caller);
    const advice = adviseCbet({ texture, adv, pfrInPosition: pfrIP, potType });
    // Mode exploit : ajustement selon la fiche de l'adversaire de la main
    const vid = villainId || exploitSettings.villainId;
    const vf = exploitSettings.mode && vid ? players[vid] : undefined;
    let exploit: { freq: number; size: string; titles: string[]; name: string } | null = null;
    if (vf) {
      const ex = runExploits({
        street: "Flop", board: flop, heroIsPfr: true, heroInPosition: pfrIP, opponentsInHand: 1,
        heroStrength: "medium", checkedToHero: false, staticBoard: !texture.dynamic, nutEdgePts: advice.nutEdgePts,
        villain: { name: vf.name, counters: vf.counters },
        line: { isPfr: false, limped: false, limpers: 0, checkedFlopAsPfr: false, bets: {}, cbetFlop: false, calledHeroCbet: false },
      });
      const items = ex.items.filter(i => (i.adjust.cbetFreqDelta ?? 0) !== 0 || (i.adjust.cbetSizeTierDelta ?? 0) !== 0);
      if (items.length) {
        const idx = SIZE_TIERS.indexOf(advice.size);
        exploit = {
          freq: Math.max(0, Math.min(100, Math.round((advice.frequencyPct + ex.adjust.cbetFreqDelta) / 5) * 5)),
          size: SIZE_TIERS[Math.max(0, Math.min(SIZE_TIERS.length - 1, idx + ex.adjust.cbetSizeTierDelta))],
          titles: items.map(i => `${i.title} (${i.source})`),
          name: vf.name,
        };
      }
    }
    return { slots, rp, rc, texture, adv, advice, pfrIP, exploit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pfr, caller, potType, flop.join(""), version, exploitSettings.mode, exploitSettings.villainId, villainId, players]);

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Board &amp; C-bet</h3>
        </div>
        <MyRangesDialog initialSlot={data?.slots.pfr ?? `open:${pfr === "BB" ? "BTN" : pfr}`}>
          <Button size="sm" variant="outline" className="gold-border text-primary">
            <Grid3x3 className="w-4 h-4 mr-1" /> Mes ranges
          </Button>
        </MyRangesDialog>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <PosSelect label={potType === "srp" ? "Relanceur" : "3-bettor"} value={pfr} onChange={setPfr} />
        <PosSelect label={potType === "srp" ? "Payeur" : "Ouvreur"} value={caller} onChange={setCaller} />
        <label className="space-y-1 block min-w-0">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Pot</span>
          <select
            value={potType}
            onChange={e => setPotType(e.target.value as PotType)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="srp">Simple</option>
            <option value="3bet">3-betté</option>
          </select>
        </label>
      </div>

      {flop.length < 3 && (
        <p className="text-sm text-muted-foreground">Choisis les 3 cartes du flop pour lancer l'analyse.</p>
      )}
      {flop.length >= 3 && invalid && <p className="text-sm text-amber-400">{invalid}</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 mr-1">
              {flop.slice(0, 3).map(c => (
                <span key={c} className={`font-mono text-base px-1.5 py-0.5 rounded bg-secondary/40 ${red(c) ? "text-red-400" : "text-foreground"}`}>
                  {c[0]}{SUIT[c[1]]}
                </span>
              ))}
            </div>
            {data.texture.tags.map(t => (
              <Badge key={t} variant="secondary" className={`text-[11px] ${t === "Dynamique" ? "text-amber-300" : ""}`}>{t}</Badge>
            ))}
          </div>

          <div className="space-y-3">
            <Bar
              left={data.adv.pfrEquity}
              right={1 - data.adv.pfrEquity}
              leftLabel={`Équité ${pfr} ${(data.adv.pfrEquity * 100).toFixed(1)} %`}
              rightLabel={`${caller} ${((1 - data.adv.pfrEquity) * 100).toFixed(1)} %`}
            />
            <Bar
              left={data.adv.pfrStrongPct}
              right={data.adv.callerStrongPct}
              leftLabel={`Mains fortes ${pfr} ${data.adv.pfrStrongPct} %`}
              rightLabel={`${caller} ${data.adv.callerStrongPct} %`}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">{data.rp.label} <SourceBadge source={data.rp.source} /></span>
              <span className="flex items-center gap-1">{data.rc.label} <SourceBadge source={data.rc.source} /></span>
            </div>
          </div>

          <div className={`rounded-lg border p-4 space-y-2 ${data.advice.checkMostly ? "border-sky-500/40 bg-sky-500/5" : "border-primary/40 bg-primary/5"}`}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {pfr} {data.pfrIP ? "en position (IP)" : "hors position (OOP)"} · {potType === "srp" ? "pot simple" : "pot 3-betté"}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {data.exploit && <span className="text-sm text-muted-foreground line-through">{data.advice.frequencyPct} % · {data.advice.size}</span>}
              <span className="display text-3xl gold-text">{data.exploit ? data.exploit.freq : data.advice.frequencyPct} %</span>
              <span className="text-sm">de c-bet</span>
              <span className="text-sm">taille <strong className="text-primary">{data.exploit ? data.exploit.size : data.advice.size}</strong> du pot</span>
            </div>
            {data.advice.checkMostly && <p className="text-sm text-sky-300">Check majoritaire sur ce board.</p>}
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.advice.reasons.map(r => <li key={r}>→ {r}</li>)}
              {data.exploit && data.exploit.titles.map(t => <li key={t} className="text-primary">→ Exploit contre {data.exploit!.name} : {t}</li>)}
            </ul>
          </div>

          <p className={`text-sm ${data.advice.donk.suggested ? "text-amber-300" : "text-muted-foreground"}`}>
            <span className="font-medium">Donk bet : </span>{data.advice.donk.text}
          </p>

          <p className="text-[11px] text-muted-foreground">
            Calculé sur {data.adv.samples} mains simulées · {data.adv.pfrCombos} vs {data.adv.callerCombos} combos.
            Estimation par principes GTO, pas un solveur.
          </p>
        </>
      )}

      <TeachAccordion content={TEACH_CBET} id="teach-cbet" />
    </Card>
  );
};
