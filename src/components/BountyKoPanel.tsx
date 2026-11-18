import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Crosshair } from "lucide-react";
import { bountyValue, callChart, CallChart, KoType } from "@/engines/bountyKo";
import { estimatedJamPct, topPercentRange } from "@/engines/preflopEquity";
import { ALL_HANDS } from "@/engines/myRanges";
import { loadBounty, saveBounty, BountySettings } from "@/lib/bountySettings";
import { TeachAccordion } from "@/components/TeachAccordion";
import { TEACH_BOUNTY } from "@/lib/teachContent";
import { RangeWeights } from "@/engines/myRanges";
import { loadSolverIndex, loadSolverGame, firstInSpot, rangeOf, isJam, SolverIndexEntry } from "@/engines/solverSpots";

function Num({ label, value, onChange, step = 1, min = 0, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string;
}) {
  return (
    <label className="space-y-1 block min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}{suffix ? ` (${suffix})` : ""}</span>
      <Input type="number" min={min} step={step} value={value}
        onChange={e => onChange(Math.max(min, +e.target.value || 0))} />
    </label>
  );
}

const KO_LABEL: Record<KoType, string> = { classic: "KO classique", progressive: "KO progressif", mystery: "KO mystère" };

export const BountyKoPanel = () => {
  const [s, setS] = useState<BountySettings>(() => loadBounty());
  const set = <K extends keyof BountySettings>(k: K, v: BountySettings[K]) => setS(prev => ({ ...prev, [k]: v }));

  // situation : l'adversaire pousse, tu décides de payer
  const [jamBB, setJamBB] = useState(12);
  const [deadBB, setDeadBB] = useState(1.5);
  const [postedBB, setPostedBB] = useState(1);
  const [jamPct, setJamPct] = useState(estimatedJamPct(12));
  const [jamPctTouched, setJamPctTouched] = useState(false);
  // Range de tapis calculée par le solveur (MTT de profondeur la plus proche), selon la position adverse
  const [villainPos, setVillainPos] = useState("");
  const [mttIndex, setMttIndex] = useState<SolverIndexEntry[]>([]);
  const [solverJam, setSolverJam] = useState<{ range: RangeWeights; label: string } | null>(null);
  useEffect(() => { loadSolverIndex().then(ix => setMttIndex(ix.filter(e => e.kind === "mtt"))).catch(() => {}); }, []);
  useEffect(() => {
    setSolverJam(null);
    if (!villainPos || !mttIndex.length) return;
    const near = [...mttIndex].sort((a, b) => Math.abs(a.stack - jamBB) - Math.abs(b.stack - jamBB))[0];
    let alive = true;
    loadSolverGame(near.id).then(g => {
      const spot = firstInSpot(g, villainPos);
      const r = spot ? rangeOf(spot, isJam) : {};
      if (alive && Object.keys(r).length) setSolverJam({ range: r, label: `${near.label}, ${villainPos} pousse en premier` });
    }).catch(() => {});
    return () => { alive = false; };
  }, [villainPos, jamBB, mttIndex]);
  useEffect(() => { if (!jamPctTouched) setJamPct(estimatedJamPct(jamBB)); }, [jamBB, jamPctTouched]);

  const value = useMemo(() => bountyValue(s), [s]);

  useEffect(() => {
    saveBounty({ ...s, lastBountyBB: Math.round(value.bountyBB * 10) / 10 });
  }, [s, value.bountyBB]);

  const callBB = Math.max(0, jamBB - postedBB);
  const potBB = deadBB + jamBB; // pot avant ton call, tapis adverse inclus

  const [chart, setChart] = useState<CallChart | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(true);
    const id = setTimeout(() => {
      setChart(callChart({ callBB, potBB, bountyBB: value.bountyBB, jamRange: solverJam?.range ?? topPercentRange(jamPct) }));
      setBusy(false);
    }, 30);
    return () => clearTimeout(id);
  }, [callBB, potBB, value.bountyBB, jamPct, solverJam]);

  const counts = useMemo(() => {
    const c = { call: 0, bounty: 0 };
    if (chart) for (const h of ALL_HANDS) {
      const n = h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12;
      if (chart.status[h] === "call") c.call += n;
      if (chart.status[h] === "bounty") c.bounty += n;
    }
    return c;
  }, [chart]);

  return (
    <Card className="glass-panel p-6 space-y-5 border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crosshair className="w-5 h-5 text-primary" />
          <h3 className="display text-lg gold-text">Bounty KO</h3>
        </div>
        <Badge variant="outline" className="gold-border text-primary text-[10px] uppercase tracking-widest">
          à payer / (pot + à payer + bounty)
        </Badge>
      </div>

      {/* Tournoi */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Num label="Buy-in" suffix="€" value={s.buyIn} step={0.5} onChange={v => set("buyIn", v)} />
        <Num label="Part bounty" suffix="€" value={s.bountyPart} step={0.5} onChange={v => set("bountyPart", Math.min(v, s.buyIn))} />
        <Num label="Tapis de départ" suffix="jetons" value={s.startingStack} step={500} min={1} onChange={v => set("startingStack", v)} />
        <Num label="Big blind" suffix="jetons" value={s.bigBlind} step={10} min={1} onChange={v => set("bigBlind", v)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
        <label className="space-y-1 block min-w-0">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Type</span>
          <select value={s.type} onChange={e => set("type", e.target.value as KoType)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            {(Object.keys(KO_LABEL) as KoType[]).map(k => <option key={k} value={k}>{KO_LABEL[k]}</option>)}
          </select>
        </label>
        <Num label={s.type === "mystery" ? "Valeur moyenne tête" : "Tête de l'adversaire"} suffix="€" value={s.villainBounty} step={0.5} onChange={v => set("villainBounty", v)} />
        <label className="flex items-center gap-2 h-10 col-span-2 sm:col-span-1">
          <Switch checked={s.covers} onCheckedChange={v => set("covers", v)} />
          <span className="text-sm">Je le couvre</span>
        </label>
      </div>

      {/* Valeur */}
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sa tête vaut</div>
          <span className="display text-3xl gold-text">{value.bountyBB.toFixed(1)} BB</span>
        </div>
        <div className="text-sm text-muted-foreground">
          {s.covers
            ? <>{value.effectiveEur.toFixed(2)} € comptés{s.type === "progressive" ? ` (dont ${value.cashNowEur.toFixed(2)} € en cash tout de suite)` : ""} · {Math.round(value.bountyChips).toLocaleString("fr-FR")} jetons</>
            : <>Tu ne le couvres pas : tu ne peux pas gagner sa tête.</>}
        </div>
      </div>

      {/* Situation */}
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Il pousse, tu paies ?</div>
        <div className="grid grid-cols-3 gap-3">
          <Num label="Son tapis" suffix="BB" value={jamBB} step={0.5} onChange={setJamBB} />
          <Num label="Pot avant" suffix="BB" value={deadBB} step={0.25} onChange={setDeadBB} />
          <Num label="Déjà mis" suffix="BB" value={postedBB} step={0.5} onChange={v => setPostedBB(Math.min(v, jamBB))} />
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Sa position (range de tapis du solveur)</span>
          <select value={villainPos} onChange={e => setVillainPos(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Estimation selon son tapis (curseur)</option>
            {["UTG", "MP", "CO", "BTN", "SB"].map(p => <option key={p} value={p}>{p} pousse en premier</option>)}
          </select>
        </label>
        {solverJam && <p className="text-xs text-emerald-300">Range de tapis calculée par GTOpen : {solverJam.label}.</p>}
        {!solverJam && <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Sa range de tapis : top {jamPct} % des mains</span>
            <button type="button" className="text-primary underline-offset-2 hover:underline"
              onClick={() => { setJamPctTouched(false); setJamPct(estimatedJamPct(jamBB)); }}>
              estimation selon son tapis
            </button>
          </div>
          <Slider min={3} max={100} step={1} value={[jamPct]}
            onValueChange={v => { setJamPct(v[0]); setJamPctTouched(true); }} />
        </div>}
      </div>

      {chart && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Équité requise sans bounty</div>
            <div className="font-mono text-xl">{(chart.reqNoBounty * 100).toFixed(1)} %</div>
          </div>
          <div className="rounded-lg border border-primary/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Avec bounty</div>
            <div className="font-mono text-xl text-primary">{(chart.reqWithBounty * 100).toFixed(1)} %</div>
          </div>
        </div>
      )}

      {/* Grille */}
      <div className={`max-w-md mx-auto w-full transition-opacity ${busy ? "opacity-50" : ""}`}>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
          {ALL_HANDS.map(h => {
            const st = chart?.status[h];
            const eq = chart?.equity[h];
            return (
              <div key={h}
                title={eq != null ? `${h} : ${(eq * 100).toFixed(1)} % d'équité` : h}
                className={`aspect-square rounded-[3px] flex items-center justify-center text-[8px] sm:text-[10px] font-mono leading-none border ${
                  st === "call" ? "bg-emerald-500/80 text-black border-emerald-400"
                  : st === "bounty" ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/30 text-muted-foreground border-border/40"
                }`}>
                {h}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/80 mr-1 align-middle" />Call même sans bounty ({((counts.call / 1326) * 100).toFixed(0)} %)</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary mr-1 align-middle" />Call grâce au bounty (+{((counts.bounty / 1326) * 100).toFixed(0)} %)</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-secondary mr-1 align-middle" />Fold</span>
          {busy && <span className="text-primary">calcul…</span>}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {solverJam ? "Équités calculées contre la range de tapis du solveur." : `Équités calculées contre le top ${jamPct} % des mains (classées par le site).`} Ne tient pas compte de l'ICM.
      </p>

      <TeachAccordion content={TEACH_BOUNTY} id="teach-bounty" />
    </Card>
  );
};
