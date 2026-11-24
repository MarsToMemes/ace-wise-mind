// Page d'aperçu de l'étape A2 (hors du site) : une main type, le calcul multiway dans le navigateur, la progression.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PlayerAction } from "@/components/ActionMenu";
import type { SolverGame } from "@/engines/solverSpots";
import { CASH_RAKE } from "@/core/rake";
import { riverSpotFromHand } from "@/engines/multiway/handSpot";
import { startLive, type LiveDone, type LiveRun } from "@/engines/multiway/liveClient";
import type { LiveProgress } from "@/engines/multiway/liveSolve";

const A = (seatIdx: number, street: PlayerAction["street"], type: PlayerAction["type"], amountBB = 0): PlayerAction => ({ seatIdx, street, type, amountBB });
const SIX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const BOARD = ["Kh", "9d", "4c", "7s", "2h"];
type Preset = { label: string; user: number; hole: string; river: (x: number) => PlayerAction[]; base: PlayerAction[]; bet?: number };
const PRESETS: Preset[] = [
  { label: "2 joueurs · CO ouvre, BTN paie ; river : CO mise", user: 3, hole: "Kc Qc", bet: 6,
    base: [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Fold"),
      A(2, "Flop", "Bet", 2), A(3, "Flop", "Call", 2), A(2, "Turn", "Check"), A(3, "Turn", "Check")],
    river: x => [A(2, "River", "Bet", x)] },
  { label: "3 joueurs · CO ouvre, BTN et BB paient ; river : BB checke, CO mise", user: 3, hole: "Ah Kd", bet: 12,
    base: [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Fold"), A(5, "Preflop", "Call", 1.5),
      A(5, "Flop", "Check"), A(2, "Flop", "Check"), A(3, "Flop", "Check"), A(5, "Turn", "Check"), A(2, "Turn", "Bet", 5), A(3, "Turn", "Call", 5), A(5, "Turn", "Call", 5)],
    river: x => [A(5, "River", "Check"), A(2, "River", "Bet", x)] },
  { label: "4 joueurs · CO ouvre, BTN, SB, BB paient ; checks jusqu'à la river, la SB parle", user: 4, hole: "Qs Qc",
    base: [A(0, "Preflop", "Fold"), A(1, "Preflop", "Fold"), A(2, "Preflop", "Raise", 2.5), A(3, "Preflop", "Call", 2.5), A(4, "Preflop", "Call", 2), A(5, "Preflop", "Call", 1.5),
      ...[4, 5, 2, 3].map(s => A(s, "Flop", "Check")), ...[4, 5, 2, 3].map(s => A(s, "Turn", "Check"))],
    river: () => [] },
];
const SUIT: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };
const pretty = (c: string) => c[0].replace("T", "10") + SUIT[c[1]];
const C = { bg: "#0b1424", panel: "#121e33", line: "#22324f", text: "#e8ecf4", dim: "#8b97ad", gold: "#d4af37", green: "#2f9e6a", red: "#c4554d" };

function label(tok: string, bets: number[]) {
  if (tok === "p") return "Check";
  if (tok === "f") return "Se coucher";
  if (tok === "c") return "Payer";
  if (tok === "r") return "Relance au pot";
  if (tok === "a") return "Tapis";
  if (tok === "b") return `Miser ${Math.round(bets[0] * 100)} % du pot`;
  if (tok[0] === "b") return `Miser ${Math.round(bets[+tok.slice(1)] * 100)} % du pot`;
  if (tok[0] === "k") return `Miser ${tok.slice(1)} bb`;
  return tok;
}

function Lab() {
  const [game, setGame] = useState<SolverGame | null>(null);
  const [pi, setPi] = useState(1);
  const [hole, setHole] = useState(PRESETS[1].hole);
  const [bet, setBet] = useState(PRESETS[1].bet ?? 0);
  const [cut, setCut] = useState(0);
  const [prog, setProg] = useState<LiveProgress | null>(null);
  const [done, setDone] = useState<LiveDone | null>(null);
  const [err, setErr] = useState("");
  const run = useRef<LiveRun | null>(null);
  useEffect(() => { fetch("/solver/cash100.json").then(r => r.json()).then(setGame); }, []);
  const p = PRESETS[pi];
  const spot = useMemo(() => {
    if (!game) return null;
    const cards = hole.trim().split(/\s+/);
    return riverSpotFromHand({
      live: { tableSize: 6, dealerIdx: 3, userIdx: p.user, stacks: Array(6).fill(100), hole: cards, board: BOARD, actions: [...p.base, ...p.river(bet)], folded: Array(6).fill(false), shown: {} },
      positions: SIX, game, effStack: 100, rake: CASH_RAKE, minWeight: cut || undefined,
    });
  }, [game, p, hole, bet, cut]);

  const start = () => {
    if (!spot?.ok) return;
    run.current?.cancel();
    setProg(null); setDone(null); setErr("");
    const r = startLive(spot.spec, { target: 0.001, maxMs: 60000, maxIterations: 5000, watch: { node: spot.pathNode.id, player: spot.heroPlayer, hand: spot.heroHand } }, setProg);
    run.current = r;
    r.done.then(setDone, e => setErr(String(e)));
  };
  const reasonFr: Record<string, string> = { target: "précision visée atteinte", max: "nombre maximal d'itérations", time: "temps maximum atteint (60 s)", stopped: "arrêté à ta demande (état gardé)", cache: "déjà calculé : rendu par la mémoire" };

  const box = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14 } as const;
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", color: C.text, maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontFamily: "'Playfair Display', serif", color: C.gold, fontSize: 28, margin: "0 0 4px" }}>Labo multiway · river</h1>
      <p style={{ color: C.dim, margin: "0 0 18px", fontSize: 14 }}>Aperçu de l'étape A2, hors du site. Board {BOARD.map(pretty).join(" ")} · tapis 100 bb · rake cash.</p>

      <div style={box}>
        <label style={{ display: "block", fontSize: 13, color: C.dim, marginBottom: 6 }}>Main type</label>
        <select value={pi} onChange={e => { const k = +e.target.value; setPi(k); setHole(PRESETS[k].hole); setBet(PRESETS[k].bet ?? 0); }}
          style={{ width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: 8 }}>
          {PRESETS.map((x, k) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: C.dim }}>Tes cartes<br />
            <input value={hole} onChange={e => setHole(e.target.value)} style={{ width: 90, background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: 6 }} /></label>
          {p.bet != null && <label style={{ fontSize: 13, color: C.dim }}>Mise adverse à la river (bb)<br />
            <input type="number" step="0.5" value={bet} onChange={e => setBet(+e.target.value)} style={{ width: 90, background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: 6 }} /></label>}
          <label style={{ fontSize: 13, color: C.dim }}>Mains rares retirées<br />
            <select value={cut} onChange={e => setCut(+e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: 6 }}>
              {[0, 0.02, 0.05, 0.1].map(x => <option key={x} value={x}>{x ? `sous ${x * 100} %` : "aucune"}</option>)}
            </select></label>
        </div>
      </div>

      <div style={box}>
        {!game && <p>Chargement des ranges préflop…</p>}
        {spot && !spot.ok && <p style={{ color: C.red }}>{spot.reason}</p>}
        {spot?.ok && <>
          <p style={{ margin: "0 0 6px" }}>{spot.seats.length} joueurs ({spot.seats.map(s => SIX[s]).join(", ")}) · pot {spot.spec.potBB} bb · tapis {spot.spec.stacks.join(" / ")} bb</p>
          <p style={{ margin: "0 0 6px", color: C.dim, fontSize: 13 }}>Mains calculées par joueur : {spot.spec.ranges.map(r => r.length).join(" / ")}</p>
          {spot.notes.map((n, k) => <p key={k} style={{ margin: "0 0 4px", color: C.dim, fontSize: 13 }}>· {n}</p>)}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={start} style={{ background: C.gold, color: "#1a1406", border: 0, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>Calculer</button>
            {prog && !done && <button onClick={() => run.current?.stop()} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}>Arrêter</button>}
          </div>
        </>}
      </div>

      {(prog || err) && spot?.ok && (
        <div style={box}>
          {err && <p style={{ color: C.red }}>{err}</p>}
          {prog && <>
            <p style={{ margin: "0 0 4px" }}>Précision : <b style={{ color: prog.nashConvPct <= 0.1 ? C.green : C.gold }}>{prog.nashConvPct.toFixed(2)} % du pot</b> <span style={{ color: C.dim }}>(objectif 0,10 %)</span></p>
            <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 13 }}>{prog.iterations} itérations · {(prog.ms / 1000).toFixed(1)} s · {run.current?.workers ?? 0} ouvriers{prog.done && prog.reason ? ` · ${reasonFr[prog.reason]}` : " · calcul en cours"}</p>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Avec {hole.trim().split(/\s+/).map(pretty).join(" ")} :</p>
            {spot.pathNode.actions.map((tok, k) => {
              const f = prog.strategy?.[k] ?? 0;
              return (
                <div key={tok} style={{ display: "grid", gridTemplateColumns: "150px 1fr 48px", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>{label(tok, spot.spec.bets)}</span>
                  <div style={{ background: C.bg, borderRadius: 4, height: 12, overflow: "hidden" }}>
                    <div style={{ width: `${100 * f}%`, height: "100%", background: tok === "f" ? C.red : tok === "p" || tok === "c" ? C.green : C.gold, transition: "width 200ms cubic-bezier(0.23, 1, 0.32, 1)" }} />
                  </div>
                  <span style={{ fontSize: 14, textAlign: "right" }}>{Math.round(100 * f)} %</span>
                </div>
              );
            })}
          </>}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Lab />);
