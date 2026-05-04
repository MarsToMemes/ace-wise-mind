import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RotateCcw, Spade } from "lucide-react";
import { CardPicker } from "@/components/CardPicker";
import { PlayingCard } from "@/components/PlayingCard";
import { EngineReadout, EngineResult } from "@/components/EngineReadout";
import { AIPanel, AIAnalysis } from "@/components/AIPanel";
import {
  evaluateBest, detectDraws, classifyTexture, rangeAdvantage,
  potOdds, suggestAction,
} from "@/lib/pokerEngine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";
type PickMode = "hole" | "board";

const Index = () => {
  const [hole, setHole] = useState<string[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState<PickMode>("hole");
  const [opponents, setOpponents] = useState(2);
  const [position, setPosition] = useState<Position>("BTN");
  const [stack, setStack] = useState(100);
  const [pot, setPot] = useState(10);
  const [call, setCall] = useState(0);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const selected = [...hole, ...board];

  const engine = useMemo<EngineResult | null>(() => {
    if (hole.length < 2) return null;
    const all = [...hole, ...board];
    const ev = evaluateBest(all);
    const draws = detectDraws(hole, board);
    const texture = classifyTexture(board);
    const ra = rangeAdvantage(position, board);
    const po = potOdds(call, pot);
    const action = suggestAction({ score: ev.score, outs: draws.outs, potOdds: po?.odds ?? null });
    return {
      category: ev.category,
      score: ev.score,
      drawType: draws.drawType,
      outs: draws.outs,
      texture,
      heroRA: ra.hero,
      villainRA: ra.villain,
      potOdds: po?.odds ?? null,
      reqEquity: po?.reqEquity ?? null,
      suggestedAction: action,
    };
  }, [hole, board, position, pot, call]);

  const handlePick = (card: string) => {
    if (hole.includes(card)) { setHole(hole.filter(c => c !== card)); return; }
    if (board.includes(card)) { setBoard(board.filter(c => c !== card)); return; }
    if (pickMode === "hole") {
      if (hole.length >= 2) { toast.error("Hole cards already chosen"); return; }
      setHole([...hole, card]);
      if (hole.length + 1 === 2) setPickMode("board");
    } else {
      if (board.length >= 5) { toast.error("Board is full"); return; }
      setBoard([...board, card]);
    }
  };

  const reset = () => {
    setHole([]); setBoard([]); setAiResult(null); setAiError(null);
    setPickMode("hole"); setOpponents(2); setPosition("BTN");
    setStack(100); setPot(10); setCall(0);
  };

  const runAI = async () => {
    if (!engine) { toast.error("Pick your hole cards first"); return; }
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("poker-coach", {
        body: {
          hole, board, position, opponents, stack, pot, call,
          handCategory: engine.category,
          handScore: engine.score,
          drawType: engine.drawType,
          outs: engine.outs,
          texture: engine.texture,
          potOdds: engine.potOdds ? (engine.potOdds * 100).toFixed(1) + "%" : null,
          reqEquity: engine.reqEquity ? engine.reqEquity.toFixed(1) + "%" : null,
          heroRA: engine.heroRA,
          villainRA: engine.villainRA,
          suggestedAction: engine.suggestedAction,
        },
      });
      if (error) throw error;
      if (data?.error) { setAiError(data.error); toast.error(data.error); return; }
      setAiResult(data.analysis);
    } catch (e: any) {
      const msg = e?.message || "Failed to get AI analysis";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const positions: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/40 sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-gold)" }}>
              <Spade className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="display text-2xl gold-text leading-none">Ace Analyst</h1>
              <p className="text-xs text-muted-foreground">AI poker hand analyzer</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="gold-border">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </div>
      </header>

      <main className="container py-8 grid lg:grid-cols-2 gap-8">
        {/* LEFT */}
        <div className="space-y-6">
          <Card className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="display text-xl">Your Hand</h2>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => setPickMode("hole")}
                  className={`px-3 py-1.5 rounded-md transition ${pickMode === "hole" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >Hole</button>
                <button
                  onClick={() => setPickMode("board")}
                  className={`px-3 py-1.5 rounded-md transition ${pickMode === "board" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >Board</button>
              </div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Hole cards</p>
                <div className="flex gap-2 min-h-[64px]">
                  {hole.length === 0 && <p className="text-sm text-muted-foreground/60 self-center">Select 2 cards</p>}
                  {hole.map(c => (
                    <PlayingCard key={c} card={c} animated onClick={() => setHole(hole.filter(x => x !== c))} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Board</p>
                <div className="flex gap-2 min-h-[64px]">
                  {board.length === 0 && <p className="text-sm text-muted-foreground/60 self-center">Up to 5 community cards</p>}
                  {board.map(c => (
                    <PlayingCard key={c} card={c} animated onClick={() => setBoard(board.filter(x => x !== c))} />
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border/40">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Deck</p>
              <CardPicker selected={selected} hole={hole} board={board} onPick={handlePick} />
            </div>
          </Card>

          <Card className="glass-panel p-6">
            <h2 className="display text-xl mb-4">Context</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Select value={position} onValueChange={v => setPosition(v as Position)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Opponents</Label>
                <Input type="number" min={1} max={9} value={opponents} onChange={e => setOpponents(+e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Stack (BB)</Label>
                <Input type="number" min={0} value={stack} onChange={e => setStack(+e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pot (BB)</Label>
                <Input type="number" min={0} value={pot} onChange={e => setPot(+e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Call amount (BB) — optional</Label>
                <Input type="number" min={0} value={call} onChange={e => setCall(+e.target.value)} />
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          <EngineReadout result={engine} />

          <Button
            onClick={runAI}
            disabled={!engine || aiLoading}
            className="w-full h-12 text-base font-semibold"
            style={{ background: "var(--gradient-gold)", color: "hsl(var(--primary-foreground))" }}
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {aiLoading ? "Analyzing…" : "Run Pro Coach Analysis"}
          </Button>

          <AIPanel analysis={aiResult} loading={aiLoading} error={aiError} />
        </div>
      </main>

      <footer className="container py-8 text-center text-xs text-muted-foreground">
        Deterministic engine + AI strategic explanation. For educational use.
      </footer>
    </div>
  );
};

export default Index;
