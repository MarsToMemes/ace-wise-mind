import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TOURNAMENT_TYPES, TournamentType, buildTournamentState,
  pushFoldDecision, icmAdjustedScore, stageLabel,
} from "@/lib/tournamentEngine";
import { CardPicker } from "@/components/CardPicker";
import { StreetSlots } from "@/components/StreetSlots";
import { Trophy } from "lucide-react";

type PickMode = "hole" | "flop" | "turn" | "river";

const POSITIONS = ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

export function TournamentPanel() {
  const [type, setType] = useState<TournamentType>("standard");
  const [BB, setBB] = useState(200);
  const [ante, setAnte] = useState(0);
  const [stackChips, setStackChips] = useState(10000);
  const [stackUnit, setStackUnit] = useState<"chips" | "bb">("chips");
  const [playersAtTable, setPlayersAtTable] = useState(9);
  const [playersRemaining, setPlayersRemaining] = useState(120);
  const [payoutSpots, setPayoutSpots] = useState(15);
  const [position, setPosition] = useState("BTN");
  const [hole, setHole] = useState<string[]>([]);
  const [flop, setFlop] = useState<string[]>([]);
  const [turn, setTurn] = useState<string | null>(null);
  const [river, setRiver] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("hole");

  const cfg = TOURNAMENT_TYPES[type];

  const board = useMemo(() => {
    const b = [...flop];
    if (turn) b.push(turn);
    if (river) b.push(river);
    return b;
  }, [flop, turn, river]);
  const selected = [...hole, ...board];
  const currentStreet = board.length === 0 ? "Preflop" : board.length === 3 ? "Flop" : board.length === 4 ? "Turn" : "River";

  const stackChipsResolved = stackUnit === "chips" ? stackChips : stackChips * BB;

  const state = useMemo(() => buildTournamentState({
    type, stackChips: stackChipsResolved, BB, ante,
    playersAtTable, playersRemaining, payoutSpots,
  }), [type, stackChipsResolved, BB, ante, playersAtTable, playersRemaining, payoutSpots]);

  const mColor = state.mRatio > 20 ? "text-emerald-400"
    : state.mRatio >= 10 ? "text-yellow-400"
    : state.mRatio >= 5 ? "text-orange-400"
    : "text-red-500";

  const icmColor = state.icmPressure === "critical" ? "bg-red-500/20 text-red-400 border-red-500/40"
    : state.icmPressure === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
    : state.icmPressure === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";

  const pf = useMemo(() => {
    if (hole.length < 2) return null;
    if (state.mRatio >= cfg.pushFoldThresholdM) return null;
    return pushFoldDecision(hole, position, state.mRatio, state.icmPressure, Math.max(1, playersAtTable - 1));
  }, [hole, position, state.mRatio, state.icmPressure, playersAtTable, cfg.pushFoldThresholdM]);

  const removeCard = (c: string) => {
    if (hole.includes(c)) return setHole(hole.filter(x => x !== c));
    if (flop.includes(c)) { setFlop(flop.filter(x => x !== c)); setTurn(null); setRiver(null); return; }
    if (turn === c) { setTurn(null); setRiver(null); return; }
    if (river === c) { setRiver(null); }
  };
  const pickCard = (c: string) => {
    if (selected.includes(c)) return removeCard(c);
    if (pickMode === "hole") {
      if (hole.length >= 2) return;
      const next = [...hole, c]; setHole(next);
      if (next.length === 2) setPickMode("flop"); return;
    }
    if (pickMode === "flop") {
      if (flop.length >= 3) return;
      const next = [...flop, c]; setFlop(next);
      if (next.length === 3) setPickMode("turn"); return;
    }
    if (pickMode === "turn") { if (!turn) { setTurn(c); setPickMode("river"); } return; }
    if (pickMode === "river") { if (!river && turn) setRiver(c); }
  };

  const selectType = (t: TournamentType) => {
    setType(t);
    const c = TOURNAMENT_TYPES[t];
    // auto-fill defaults
    setPayoutSpots(c.payoutSpotsDefault);
    setAnte(c.anteFromLevel ? Math.round(BB * 0.125) : 0);
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="display text-xl">Tournament Type</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {(Object.values(TOURNAMENT_TYPES)).map(c => (
            <button
              key={c.id}
              onClick={() => selectType(c.id)}
              className={`text-left p-3 rounded-lg border transition ${
                type === c.id
                  ? "border-primary bg-primary/10"
                  : "border-border/40 hover:border-primary/50"
              }`}
            >
              <div className="font-semibold text-sm">{c.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {c.startingStackBB}BB · {c.blindIntervalMin}min
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {c.description}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="glass-panel p-6">
        <h2 className="display text-xl mb-4">Tournament State</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>BB value (chips)</Label>
            <Input type="number" min={1} value={BB} onChange={e => setBB(+e.target.value || 1)} />
          </div>
          <div className="space-y-1.5">
            <Label>Ante (chips)</Label>
            <Input type="number" min={0} value={ante} onChange={e => setAnte(+e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hero stack ({stackUnit})</Label>
            <div className="flex gap-2">
              <Input type="number" min={0} value={stackChips} onChange={e => setStackChips(+e.target.value)} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStackUnit(u => u === "chips" ? "bb" : "chips")}
              >
                {stackUnit === "chips" ? "→ BB" : "→ Chips"}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Players at table</Label>
            <Input type="number" min={2} max={10} value={playersAtTable} onChange={e => setPlayersAtTable(+e.target.value || 2)} />
          </div>
          <div className="space-y-1.5">
            <Label>Players remaining</Label>
            <Input type="number" min={1} value={playersRemaining} onChange={e => setPlayersRemaining(+e.target.value || 1)} />
          </div>
          <div className="space-y-1.5">
            <Label>Players paid</Label>
            <Input type="number" min={0} value={payoutSpots} onChange={e => setPayoutSpots(+e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label>Position</Label>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map(p => (
                <button
                  key={p}
                  onClick={() => setPosition(p)}
                  className={`px-3 py-1 rounded-md text-xs border transition ${
                    position === p ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:border-primary/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="glass-panel p-6">
        <h2 className="display text-xl mb-4">Live Read</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase text-muted-foreground">M-Ratio</div>
            <div className={`text-3xl font-bold ${mColor}`}>{state.mRatio.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Stack (BB)</div>
            <div className="text-3xl font-bold">{state.stackBB.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Stage</div>
            <Badge variant="outline" className="text-sm mt-1">{stageLabel(state.stage)}</Badge>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">ICM Pressure</div>
            <Badge className={`text-sm mt-1 ${icmColor}`} variant="outline">
              {state.icmPressure.toUpperCase()}
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="glass-panel p-5">
        <StreetSlots
          hole={hole}
          flop={flop}
          turn={turn}
          river={river}
          pickMode={pickMode}
          setPickMode={setPickMode}
          onRemove={removeCard}
          currentStreet={currentStreet as any}
        />
        <div className="pt-5 mt-5 border-t border-border/40">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Deck</p>
          <CardPicker selected={selected} hole={hole} board={board} onPick={pickCard} />
        </div>
      </Card>

      {pf && (
        <Card className="glass-panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="display text-lg gold-text">Push / Fold Decision</h3>
            <Badge variant="outline" className="text-sm">{pf.handTier}</Badge>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Badge
              className={`text-base px-3 py-1 ${
                pf.action === "Shove" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : pf.action === "Call-Shove" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                  : "bg-red-500/20 text-red-400 border-red-500/40"
              }`}
              variant="outline"
            >
              {pf.action}
            </Badge>
            <span className="text-xs text-muted-foreground">M={state.mRatio.toFixed(1)} · {position}</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{pf.reasoning}</p>
          <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
            ICM-adjusted aggression factor: <span className="text-foreground font-medium">
              {(icmAdjustedScore(100, state.icmPressure, state.stage) / 100).toFixed(2)}x
            </span>
          </div>
        </Card>
      )}

      {hole.length === 2 && state.mRatio >= cfg.pushFoldThresholdM && (
        <Card className="glass-panel p-6">
          <h3 className="display text-lg gold-text mb-2">Postflop Territory</h3>
          <p className="text-sm text-muted-foreground">
            M={state.mRatio.toFixed(1)} is above the {cfg.label} push/fold threshold (M&lt;{cfg.pushFoldThresholdM}).
            Standard postflop strategy applies — switch to <span className="text-foreground font-medium">Cash Game</span> mode for full street-by-street analysis with this hand, or shorten up as blinds rise.
          </p>
        </Card>
      )}
    </div>
  );
}
