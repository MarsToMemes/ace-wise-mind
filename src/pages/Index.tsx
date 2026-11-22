import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, RotateCcw, Spade, ChevronDown } from "lucide-react";
import { CardPicker } from "@/components/CardPicker";
import { StreetSlots } from "@/components/StreetSlots";
import { EngineReadout, EngineResult } from "@/components/EngineReadout";
import { AIPanel, AIAnalysis } from "@/components/AIPanel";
import { PokerTable, TableSize, SeatMode, labelToPosition, seatLabel } from "@/components/PokerTable";
import { PlayerAction, ActionType } from "@/components/ActionMenu";
import {
  evaluateBest, detectDraws, classifyTexture, rangeAdvantage,
  potOdds, estimateEquity, adjustedScore, decide, recommendSizing,
  classifyHandStrength,
} from "@/lib/pokerEngine";
import { inferRanges, rangeModifiers } from "@/lib/rangeInference";
import { evaluateHandVsRange } from "@/lib/handVsRange";
import { buildExplanation } from "@/lib/explanationEngine";
import { buildConditionalLines } from "@/lib/conditionalLines";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrainingMode } from "@/components/TrainingMode";
import { TournamentPanel } from "@/components/TournamentPanel";
import { analyzePreflop } from "@/engines/cashPreflopEngine";
import { CashHUD } from "@/components/CashHUD";
import { AlphaPanel } from "@/components/AlphaPanel";
import { GeometricSizingPanel } from "@/components/GeometricSizingPanel";
import { EVCalculatorPanel } from "@/components/EVCalculatorPanel";
import { BankrollPanel } from "@/components/BankrollPanel";
import { assessPolarization } from "@/engines/polarizationAssessor";
import { PolarizationPanel } from "@/components/PolarizationPanel";
import { JamFoldPanel } from "@/components/JamFoldPanel";
import { DecisionVerdict } from "@/components/DecisionVerdict";
import { ResizableDock } from "@/components/ResizableDock";
import { HandHistory } from "@/components/HandHistory";
import { saveHand, type SavedHand } from "@/lib/handHistory";
import { gapsOf, recordGaps, heroJustActed, endsOnHeroDecision, type Gap } from "@/lib/gapLog";
import { loadSeat, saveSeat, nextHandSeat, type TableSeat } from "@/lib/tableSeat";
import { RangeExplorer } from "@/components/RangeExplorer";
import { BoardCbetPanel } from "@/components/BoardCbetPanel";
import { BountyKoPanel } from "@/components/BountyKoPanel";
import { MyTablePanel } from "@/components/MyTablePanel";
import { advisePostflop } from "@/engines/postflopAdvisor";
import { filterByLine, filterByBet, removeDead, LineEvent, PostStreet } from "@/engines/postflopRanges";
import { expandRange } from "@/engines/rangeVsRange";
import { getRange, slotsFor } from "@/engines/matchupRanges";
import { topPercentRange } from "@/engines/preflopEquity";
import { estimate as estimateStats, FAMILY_LABEL } from "@/engines/playerStats";
import type { SolverPreflop } from "@/components/DecisionVerdict";
import { SolverSpotsPanel } from "@/components/SolverSpotsPanel";
import { SolverAdviceBox } from "@/components/SolverAdviceBox";
import { ShowdownPanel } from "@/components/ShowdownPanel";
import { parseCards, buildShowdownRecord, showdownSeats, strengthAt } from "@/engines/showdown";
import type { EndgameInput } from "@/engines/endgame/solve";
import { useEndgameSolve } from "@/hooks/use-endgame-solve";
import { bluffGuard } from "@/engines/endgame/guard";
import { useSolverBase } from "@/hooks/use-solver-base";
import { cashCoverage, CASH_DEPTHS, getSolverBaseGame } from "@/engines/solverSpots";
import { lineRanges, type LinePotType } from "@/engines/lineRanges";
import { loadMyRanges } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";
import { runExploits, deriveLine, HeroStrength } from "@/engines/exploitEngine";
import { classify, familyOf, FAMILY_SHORT, Family } from "@/engines/playerStats";
import { analyzeBoard } from "@/engines/boardTexture";
import { actsFirstPostflop } from "@/engines/matchupRanges";
import { usePlayers } from "@/hooks/use-players";
import { useExploitSettings } from "@/lib/exploitSettings";
import { countAnalyzedHand } from "@/engines/playerStats";
import { getSeatPlayers, addStatsMany, loadPlayers, clearTable, addShownRecord } from "@/lib/playersStore";
import { RangeTrackerPanel } from "@/components/RangeTrackerPanel";
import { FooterDisclaimer } from "@/components/FooterDisclaimer";
import { trackPot, type PotOptions } from "@/lib/potTracker";
import { VoiceInput } from "@/components/VoiceInput";
import type { VoiceResult, VoiceTable } from "@/lib/voiceInput";

type PickMode = "hole" | "flop" | "turn" | "river";
type Street = "Preflop" | "Flop" | "Turn" | "River";
type AnalyzerMode = "cash" | "tournament";

const Index = () => {
  const { t, lang } = useI18n();
  const [appMode, setAppMode] = useState<"analyzer" | "training">("analyzer");
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("cash");
  const [tournamentResetKey, setTournamentResetKey] = useState(0);
  const [hole, setHole] = useState<string[]>([]);
  const [flop, setFlop] = useState<string[]>([]);
  const [turn, setTurn] = useState<string | null>(null);
  const [river, setRiver] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("hole");
  // table en cours (bouton et ta place), reprise d'une visite à l'autre jusqu'à « Nouvelle table »
  const [initSeat] = useState(loadSeat);
  const [tableSize, setTableSize] = useState<TableSize>(() => initSeat?.size ?? 6);
  const [dealerIdx, setDealerIdx] = useState<number>(() => initSeat?.dealer ?? -1);
  const [userIdx, setUserIdx] = useState<number>(() => initSeat?.user ?? -1);
  const [seatMode, setSeatMode] = useState<SeatMode>(() => (!initSeat ? "dealer" : initSeat.user < 0 ? "user" : "action"));
  const [folded, setFolded] = useState<boolean[]>(() => Array(initSeat?.size ?? 6).fill(false));
  const [stack, setStack] = useState(100);
  const [pot, setPot] = useState(10);
  const [call, setCall] = useState(0);
  const [actionHistory, setActionHistory] = useState<PlayerAction[]>([]);
  const [shownCards, setShownCards] = useState<Record<number, string>>({});
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [geminiText, setGeminiText] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null); // main rouverte depuis l'historique
  const liveSeat = useRef<TableSeat | null>(null); // table en cours, mise de côté pendant qu'on revoit une main
  const [dockH, setDockH] = useState(0); // hauteur du panneau de décision (réglable), pour la marge en bas de page
  const [decisionOpen, setDecisionOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("ace.decisionOpen") !== "0"; } catch { return true; }
  });
  const [advanced, setAdvanced] = useState<boolean>(() => {
    try { return localStorage.getItem("ace.advanced") === "1"; } catch { return false; }
  });

  const userLabel = userIdx >= 0 && dealerIdx >= 0 ? seatLabel(userIdx, dealerIdx, tableSize) : "";
  const position = userLabel ? labelToPosition(userLabel) : "BTN";
  // Active opponents = seats not folded, excluding the user
  const activeSeats = folded.reduce((n, f) => n + (f ? 0 : 1), 0);
  const opponents = Math.max(
    0,
    activeSeats - (userIdx >= 0 && !folded[userIdx] ? 1 : 0),
  );
  // Heads-up (2 players): BTN posts SB, the other seat is BB
  const sbIdx = dealerIdx >= 0 ? (tableSize === 2 ? dealerIdx : (dealerIdx + 1) % tableSize) : -1;
  const bbIdx = dealerIdx >= 0 ? (tableSize === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % tableSize) : -1;

  const board = useMemo(() => {
    const b = [...flop];
    if (turn) b.push(turn);
    if (river) b.push(river);
    return b;
  }, [flop, turn, river]);

  const selected = [...hole, ...board];

  const currentStreet: Street = useMemo(() => {
    if (board.length === 0) return "Preflop";
    if (board.length === 3) return "Flop";
    if (board.length === 4) return "Turn";
    if (board.length === 5) return "River";
    return "Preflop";
  }, [board.length]);

  // === Action tracking (per current street) ===
  const streetActions = useMemo(
    () => actionHistory.filter(a => a.street === currentStreet),
    [actionHistory, currentStreet],
  );
  // === Pot : suivi action par action (montants « relance à », blindes postées) ===
  // Main saisie dès le préflop → pot calculé ; main saisie à partir du flop → départ = pot tapé à la main.
  const potFromActions = actionHistory.length > 0 ? actionHistory[0].street === "Preflop" : currentStreet === "Preflop";
  const potOpts = useMemo<PotOptions>(() => ({
    blinds: potFromActions && dealerIdx >= 0 ? { sbIdx, bbIdx } : null,
    startPot: potFromActions ? (dealerIdx >= 0 ? 0 : 1.5) : pot,
  }), [potFromActions, dealerIdx, sbIdx, bbIdx, pot]);
  const potState = useMemo(() => trackPot(actionHistory, potOpts, currentStreet), [actionHistory, potOpts, currentStreet]);
  const streetContribs = useMemo(
    () => Array.from({ length: tableSize }, (_, i) => potState.contribs[i] ?? 0),
    [potState, tableSize],
  );
  const lastActions = useMemo(() => {
    const arr: (PlayerAction | null)[] = Array(tableSize).fill(null);
    for (const a of streetActions) arr[a.seatIdx] = a;
    return arr;
  }, [streetActions, tableSize]);
  const currentBet = useMemo(
    () => streetContribs.reduce((m, v) => Math.max(m, v), 0),
    [streetContribs],
  );
  const dynamicPot = potState.pot;
  const userToCall = userIdx >= 0 ? potState.toCall(userIdx) : call;
  // Une vraie mise / relance à payer (et pas seulement la grosse blinde)
  const blindLevel = currentStreet === "Preflop" && potFromActions && dealerIdx >= 0 ? 1 : 0;
  const facingBet = userIdx >= 0 ? userToCall > 0 && currentBet > blindLevel : userToCall > 0;
  const defaultRaise = Math.max(currentBet * 3, currentBet + 2, Math.round(dynamicPot * 0.66));

  const engine = useMemo<EngineResult | null>(() => {
    if (hole.length < 2) return null;
    const all = [...hole, ...board];
    const ev = evaluateBest(all);
    const draws = detectDraws(hole, board);
    const texture = classifyTexture(board);
    const ra = rangeAdvantage(position, board);
    const po = potOdds(userToCall, dynamicPot);
    const equityPct = estimateEquity(draws.outs, board.length);
    const adjScore = adjustedScore({ baseScore: ev.score, outs: draws.outs, texture, position });

    // Range inference from action history
    const liveOpponentSeats: number[] = [];
    if (dealerIdx >= 0) {
      for (let i = 0; i < tableSize; i++) {
        if (i === userIdx) continue;
        if (!folded[i]) liveOpponentSeats.push(i);
      }
    }
    const positionsMap: Record<number, string> = {};
    if (dealerIdx >= 0) {
      for (let i = 0; i < tableSize; i++) positionsMap[i] = seatLabel(i, dealerIdx, tableSize);
    }
    const rangeReadout = inferRanges({
      actions: actionHistory,
      liveOpponentSeats,
      positions: positionsMap,
      pot: potOpts,
    });
    const rangeMods = rangeModifiers(rangeReadout);

    // ===== Hand vs Range — Monte Carlo equity vs opponent distributions =====
    const hvr = board.length >= 3 && hole.length === 2 && rangeReadout.opponents.length > 0
      ? evaluateHandVsRange({ hole, board, opponentRanges: rangeReadout.opponents })
      : null;

    // Apply range strength delta to effective adjScore for decision making
    const effAdjScore = Math.max(0, adjScore + rangeMods.strengthDelta);
    // Prefer the range-relative equity when available — it's contextual, not absolute.
    const effEquityPct = hvr
      ? hvr.equity_percentage
      : Math.max(0, Math.min(100, equityPct + rangeMods.aggressionDelta * 5));

    // Detect "facing a raise": hero has already bet/raised this street AND there is now a higher bet to call
    const heroBetThisStreet = userIdx >= 0 && streetActions.some(
      a => a.seatIdx === userIdx && (a.type === "Bet" || a.type === "Raise"),
    );
    const facingRaise = heroBetThisStreet && userToCall > 0;
    const betSizePct = facingBet && dynamicPot > 0 ? (userToCall / dynamicPot) * 100 : 0;

    let handClass = classifyHandStrength({
      baseScore: ev.score,
      category: ev.category,
      outs: draws.outs,
      drawType: draws.drawType,
      equityPct: effEquityPct,
      texture,
      opponents,
      position,
      street: currentStreet,
      facingAggression: facingBet || facingRaise,
      betSizePct,
    });

    // OVERRIDE absolute classification with range-relative verdict when available.
    // This eliminates false "weak hand" bias when hero crushes opponents' actual ranges.
    if (hvr) {
      const map: Record<string, "Strong" | "Medium" | "Weak"> = {
        "Strong vs Range": "Strong",
        "Medium vs Range": "Medium",
        "Weak vs Range": "Weak",
      };
      const rangeCat = map[hvr.hand_vs_range_strength];
      // Draws keep their Draw label (equity is realized later).
      if (handClass.hand_category !== "Draw") {
        handClass = {
          hand_category: rangeCat,
          confidence_level: hvr.confidence_level,
          reason: `vs opp range: ${hvr.detail}`,
        };
      }
    }

    const decision = decide({
      baseScore: ev.score,
      adjScore: effAdjScore,
      outs: draws.outs,
      equityPct: effEquityPct,
      potOddsPct: po ? po.reqEquity : null,
      boardLen: board.length,
      facingRaise,
      betSizePct,
      street: currentStreet,
      texture,
      opponents,
      position,
      handClass,
    });
    const sizing = recommendSizing({
      street: currentStreet,
      baseScore: ev.score,
      adjScore: effAdjScore,
      outs: draws.outs,
      equityPct: effEquityPct,
      texture,
      position,
      pot: dynamicPot,
      call: userToCall,
      opponents,
      action: decision.action,
      rangeMods,
    });
    return {
      category: ev.category, score: ev.score,
      adjScore,
      drawType: draws.drawType, outs: draws.outs,
      equityPct: hvr ? hvr.equity_percentage : equityPct,
      texture, heroRA: ra.hero, villainRA: ra.villain,
      potOdds: po?.odds ?? null, reqEquity: po?.reqEquity ?? null,
      suggestedAction: decision.action,
      decisionReason: decision.reason + ` ${rangeMods.reason}`,
      sizing,
      rangeReadout,
      handClass,
    } as EngineResult;
  }, [hole, board, position, dynamicPot, userToCall, currentStreet, opponents, actionHistory, dealerIdx, userIdx, tableSize, folded, potOpts, facingBet]);

  // === Moteur d'exploits : adversaire de la main + ligne jouée ===
  useSolverBase();
  const [solverPreflop, setSolverPreflop] = useState<SolverPreflop | null>(null);
  // l'analyse cash n'utilise que les tables cash (le tournoi a son propre espace)
  const solverFormat = "cash" as const;
  const cashCover = cashCoverage(stack);
  const exploitSettings = useExploitSettings();
  const { players: playerFiles, seats: seatPlayers, table: tablePlayers } = usePlayers();
  const exploit = useMemo(() => {
    // adversaire auto : joueur associé au dernier siège qui a misé ou relancé
    let autoSeat = -1;
    for (let i = actionHistory.length - 1; i >= 0; i--) {
      const a = actionHistory[i];
      if (a.seatIdx !== userIdx && (a.type === "Bet" || a.type === "Raise") && seatPlayers[a.seatIdx]) { autoSeat = a.seatIdx; break; }
    }
    if (autoSeat < 0) {
      const s = Object.keys(seatPlayers).map(Number).find(i => i !== userIdx && !folded[i]);
      if (s !== undefined) autoSeat = s;
    }
    const autoId = autoSeat >= 0 ? seatPlayers[autoSeat] : "";
    const villainId = exploitSettings.villainId && playerFiles[exploitSettings.villainId] ? exploitSettings.villainId : autoId;
    const villainFile = villainId ? playerFiles[villainId] : undefined;
    const villainSeat = villainId ? Number(Object.keys(seatPlayers).find(k => seatPlayers[+k] === villainId) ?? -1) : -1;
    const { line, heroIsPfr, checkedToHero } = deriveLine(actionHistory, villainSeat, userIdx, potOpts);
    const heroPos = position;
    const villainPos = villainSeat >= 0 && dealerIdx >= 0 ? labelToPosition(seatLabel(villainSeat, dealerIdx, tableSize)) : "";
    const heroInPosition = villainPos ? !actsFirstPostflop(heroPos, villainPos) : ["BTN", "CO"].includes(heroPos);
    const cat = engine?.handClass?.hand_category;
    const score = engine?.score ?? 0;
    const pairedBoard = new Set(board.map(c => c[0])).size < board.length;
    const heroStrength: HeroStrength = score >= 130 || (score >= 90 && cat === "Strong" && !pairedBoard) ? "nuts"
      : cat === "Strong" ? "strong" : cat === "Draw" ? "draw" : cat === "Medium" ? "medium" : "weak";
    // adversaires réellement dans le coup : ceux qui ont mis de l'argent (ou checké) préflop sans se coucher
    const inHand = new Set(actionHistory.filter(a => a.street === "Preflop" && a.type !== "Fold" && a.seatIdx !== userIdx).map(a => a.seatIdx));
    actionHistory.filter(a => a.type === "Fold").forEach(a => inHand.delete(a.seatIdx));
    const realOpponents = currentStreet !== "Preflop" && inHand.size > 0 ? inHand.size : Math.max(1, opponents);
    const res = runExploits({
      street: currentStreet,
      board,
      heroIsPfr,
      heroInPosition,
      opponentsInHand: realOpponents,
      heroStrength,
      checkedToHero: checkedToHero(currentStreet),
      staticBoard: board.length >= 3 ? !analyzeBoard(board).dynamic : undefined,
      villain: villainFile ? { name: villainFile.name, counters: villainFile.counters, shown: villainFile.shown } : undefined,
      line,
    });
    return { ...res, realOpponents, villainSeat, villainFile, villainId: exploitSettings.villainId, resolvedId: villainId, autoName: autoId ? playerFiles[autoId]?.name : undefined };
  }, [actionHistory, userIdx, seatPlayers, playerFiles, exploitSettings.villainId, folded, potOpts, position, dealerIdx, tableSize, engine, board, currentStreet, opponents]);

  // === Conseiller de mises après le flop + entrée du solveur de fin de main (décision synthétique) ===
  const postflopCtx = useMemo(() => {
    if (currentStreet === "Preflop" || hole.length < 2 || board.length < 3) return null;
    const posOf = (seat: number) => (dealerIdx >= 0 && seat >= 0 ? labelToPosition(seatLabel(seat, dealerIdx, tableSize)) : "");
    const heroPos = posOf(userIdx) || position;
    // adversaire principal : celui de l'exploit, sinon le dernier à avoir misé, sinon le premier encore en jeu
    let vSeat = exploit.villainSeat ?? -1;
    if (vSeat < 0) {
      for (let i = actionHistory.length - 1; i >= 0; i--) {
        const a = actionHistory[i];
        if (a.seatIdx !== userIdx && (a.type === "Bet" || a.type === "Raise")) { vSeat = a.seatIdx; break; }
      }
    }
    if (vSeat < 0) vSeat = actionHistory.find(a => a.seatIdx !== userIdx && !folded[a.seatIdx])?.seatIdx ?? -1;
    const villainPos = vSeat >= 0 ? posOf(vSeat) || "BB" : heroPos === "BB" ? "BTN" : "BB";
    // qui a relancé préflop, et quel type de pot
    const pre = actionHistory.filter(a => a.street === "Preflop");
    const raises = pre.filter(a => a.type === "Raise" || a.type === "Bet");
    const lastRaiser = raises.length ? raises[raises.length - 1].seatIdx : -1;
    const heroIsPfr = lastRaiser >= 0 ? lastRaiser === userIdx : !actsFirstPostflop(heroPos, villainPos);
    const slots = slotsFor(heroIsPfr ? heroPos : villainPos, heroIsPfr ? villainPos : heroPos, raises.length >= 2 ? "3bet" : "srp");
    const combos = (slot: string, fallbackPct: number) => {
      const w = getRange(slot).weights;
      return expandRange(Object.keys(w).length ? w : topPercentRange(fallbackPct), board);
    };
    // ranges d'entrée : celles de la ligne préflop jouée (table du solveur cash), sauf si tu as réglé la tienne
    // dans « Mes ranges » ; à défaut, les situations types (pot simple / 3-betté, tête-à-tête)
    const baseGame = analyzerMode === "cash" ? getSolverBaseGame() : null;
    const lr = baseGame ? lineRanges(baseGame, Array.from({ length: tableSize }, (_, i) => posOf(i)), actionHistory, stack) : null;
    const mine = loadMyRanges();
    const fromLine = (seat: number, slot: string) => {
      if (!lr || seat < 0 || (mine[slot] && Object.keys(mine[slot]).length)) return null;
      const w = lr.bySeat[seat];
      const top = w ? Math.max(0, ...Object.values(w)) : 0;
      // poids relatifs ramenés à 1 pour la main la plus présente (les filtres suivants ont des seuils absolus)
      return top > 0 ? expandRange(Object.fromEntries(Object.entries(w).map(([h, x]) => [h, x / top])), board) : null;
    };
    const heroSlot = heroIsPfr ? slots.pfr : slots.caller, villainSlot = heroIsPfr ? slots.caller : slots.pfr;
    const heroLineRange = fromLine(userIdx, heroSlot), villainLineRange = fromLine(vSeat, villainSlot);
    let heroRange = heroLineRange ?? combos(heroSlot, 30);
    const villainBase = villainLineRange ?? combos(villainSlot, 35);
    const POT_FR: Record<LinePotType, string> = { limp: "pot limpé", srp: "pot simple", "3bet": "pot 3-betté", "4bet": "pot 4-betté" };
    const rangeSource = heroLineRange && villainLineRange && lr
      ? `ligne jouée · ${POT_FR[lr.potType]}${lr.rare ? " · ligne rare" : ""}`
      : "situations types";
    let villainRange = removeDead(villainBase, hole);
    // ligne de chacun aux streets précédentes (le « filtre » sur les ranges)
    const streets: PostStreet[] = ["Flop", "Turn", "River"];
    const cur = streets.indexOf(currentStreet as PostStreet);
    const heroFirst = actsFirstPostflop(heroPos, villainPos);
    const lineOf = (seat: number, first: boolean): LineEvent[] => streets.slice(0, cur).flatMap(st => {
      const acts = actionHistory.filter(a => a.street === st && a.seatIdx === seat);
      const act = acts.some(a => a.type === "Bet" || a.type === "Raise") ? "bet" as const
        : acts.some(a => a.type === "Call") ? "call" as const
        : acts.some(a => a.type === "Check") ? (first ? "checkFirst" as const : "checkBack" as const) : null;
      return act ? [{ street: st, act }] : [];
    });
    const heroLine = lineOf(userIdx, heroFirst);
    const villainLine = vSeat >= 0 ? lineOf(vSeat, !heroFirst) : [];
    heroRange = filterByLine(heroRange, board, heroLine);
    // ce qu'un adversaire a fait sur la street EN COURS : une mise resserre sa range selon sa taille, un call la resserre aussi
    const curStreet = currentStreet as PostStreet;
    const thisStreet = (range: typeof villainRange, seat: number) => {
      const acts = potState.steps.filter(st => st.action.street === curStreet && st.action.seatIdx === seat);
      const aggr = [...acts].reverse().find(st => st.action.type === "Bet" || st.action.type === "Raise");
      if (aggr) return filterByBet(range, board, curStreet, aggr.potBefore > 0 ? (aggr.action.amountBB || 0) / aggr.potBefore : 0.5);
      if (acts.some(st => st.action.type === "Call")) return filterByLine(range, board, [{ street: curStreet, act: "call" }]);
      return range;
    };
    villainRange = filterByLine(villainRange, board, villainLine);
    if (vSeat >= 0) villainRange = thisStreet(villainRange, vSeat);
    // autres adversaires encore dans le coup (pot à 3 ou plus) : chacun avec sa range préflop puis sa ligne
    const raiserPos = lastRaiser >= 0 ? posOf(lastRaiser) || villainPos : heroIsPfr ? heroPos : villainPos;
    const potType = raises.length >= 2 ? "3bet" : "srp";
    const otherSeats = [...new Set(pre.filter(a => a.type !== "Fold").map(a => a.seatIdx))]
      .filter(seat => seat !== userIdx && seat !== vSeat && !folded[seat] && !actionHistory.some(a => a.seatIdx === seat && a.type === "Fold"));
    const otherRanges = otherSeats.map(seat => {
      const p = posOf(seat);
      const slot = seat === lastRaiser || !p ? slotsFor(raiserPos, villainPos, potType).pfr : slotsFor(raiserPos, p, potType).caller;
      const first = actsFirstPostflop(p || villainPos, heroPos);
      return thisStreet(filterByLine(removeDead(fromLine(seat, slot) ?? combos(slot, 35), hole), board, lineOf(seat, first)), seat);
    });
    const prev = cur > 0 ? streets[cur - 1] : null;
    const vf = exploit.villainFile;
    const villainAggressive = vf ? estimateStats(vf.counters).af >= 2 : false;
    const advice = advisePostflop({
      street: currentStreet as PostStreet, board, hole, heroRange, villainRange,
      heroInPosition: !heroFirst, heroIsPfr, potBB: dynamicPot, toCallBB: userToCall, heroStackBB: stack,
      opponents: exploit.realOpponents,
      otherRanges,
      prevVillain: prev ? villainLine.find(e => e.street === prev)?.act : undefined,
      prevHero: prev ? heroLine.find(e => e.street === prev)?.act : undefined,
      villainCheckedThisStreet: vSeat >= 0 && actionHistory.some(a => a.street === currentStreet && a.seatIdx === vSeat && a.type === "Check"),
      villainAggressive,
      adjust: exploitSettings.mode ? exploit.adjust : undefined,
      rake: analyzerMode === "cash" ? CASH_RAKE : null,
    });

    // solveur de fin de main : turn et river, en tête-à-tête ; ranges du DÉBUT de la street (le solveur rejoue la street)
    let endgame: Omit<EndgameInput, "onProgress"> | null = null;
    let endgameNote: string | null = null;
    if ((currentStreet === "Turn" || currentStreet === "River") && board.length >= (currentStreet === "Turn" ? 4 : 5)) {
      const curActs = actionHistory.filter(a => a.street === currentStreet && a.type !== "Fold");
      if (exploit.realOpponents !== 1 || vSeat < 0 || curActs.some(a => a.seatIdx !== userIdx && a.seatIdx !== vSeat)) {
        endgameNote = "Solveur de fin de main : seulement en tête-à-tête (pot à 3 ou plus : conseil maison).";
      } else {
        const order = ["Preflop", "Flop", "Turn", "River"];
        const before = actionHistory.filter(a => order.indexOf(a.street) < order.indexOf(currentStreet));
        const startPot = trackPot(before, potOpts).pot;
        const heroPut = order.slice(0, order.indexOf(currentStreet)).reduce((t, st) => t + (trackPot(before, potOpts, st as PostStreet | "Preflop").contribs[userIdx] ?? 0), 0);
        const effStack = Math.max(0, stack - heroPut);
        const heroPl: 0 | 1 = heroFirst ? 0 : 1;
        const villainEg = filterByLine(villainBase, board, villainLine);
        const kind = { Check: "check", Bet: "bet", Raise: "raise", Call: "call", Fold: "fold" } as const;
        if (effStack > 0 && startPot > 0) endgame = {
          street: currentStreet, board: board.slice(0, currentStreet === "Turn" ? 4 : 5), startPot, stack: effStack,
          ranges: heroFirst ? [heroRange, villainEg] : [villainEg, heroRange],
          hero: heroPl, heroCards: [hole[0], hole[1]],
          path: actionHistory.filter(a => a.street === currentStreet && (a.seatIdx === userIdx || a.seatIdx === vSeat))
            .map(a => ({ player: (a.seatIdx === userIdx ? heroPl : 1 - heroPl) as 0 | 1, kind: kind[a.type], to: a.amountBB })),
          rake: analyzerMode === "cash" ? CASH_RAKE : null,
        };
      }
    }
    return { advice, endgame, endgameNote, rangeSource };
  }, [currentStreet, hole, board, dealerIdx, tableSize, userIdx, position, exploit, actionHistory, folded, dynamicPot, userToCall, stack, opponents, exploitSettings.mode, potState, potOpts, analyzerMode, tableSize]);
  const postflopAdvice = postflopCtx?.advice ?? null;
  const endgameKey = useMemo(() => {
    const e = postflopCtx?.endgame;
    if (!e) return "";
    let h = 0;
    for (const r of e.ranges) for (const c of r) { const str = c.cards[0] + c.cards[1] + c.w.toFixed(3); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; }
    return JSON.stringify([e.street, e.board, e.startPot, e.stack, e.hero, e.heroCards, e.path, e.rake, h]);
  }, [postflopCtx]);
  const endgame = useEndgameSolve(postflopCtx?.endgame ?? null, endgameKey);
  // garde-fou : contre un récréatif (fiche), pas de bluff du solveur → conseil maison
  const endgameGuard = useMemo(() => {
    const vf = exploit.villainFile;
    if (endgame.status !== "done" || !endgame.result || hole.length < 2 || !vf) return null;
    const fam = familyOf(vf.counters);
    if (!bluffGuard(endgame.result, fam, strengthAt(hole, board))) return null;
    return `Garde-fou : le solveur voulait bluffer, mais ${vf.name} est un ${FAMILY_LABEL[fam].toLowerCase()} qui paie trop pour qu'un bluff rapporte. Conseil maison à la place.`;
  }, [endgame, exploit.villainFile, hole, board]);

  // === Lacunes : conseils moins fiables que le solveur, notées par main dans ce navigateur (onglet « À calculer »)
  const [preflopMissing, setPreflopMissing] = useState<string | null>(null);
  const gapsNow = useMemo(() => gapsOf({
    street: currentStreet, hasHand: hole.length === 2 && userIdx >= 0 && dealerIdx >= 0, stackBB: stack, depthOk: cashCover.ok,
    preflop: currentStreet === "Preflop" ? solverPreflop : null,
    preflopMissing: currentStreet === "Preflop" ? preflopMissing : null,
    postflop: currentStreet !== "Preflop" && !!postflopAdvice,
    multiway: !!postflopCtx?.endgameNote, guard: !!endgameGuard,
  }), [currentStreet, hole, userIdx, dealerIdx, stack, cashCover.ok, solverPreflop, preflopMissing, postflopAdvice, postflopCtx, endgameGuard]);
  // lacunes des décisions de la main en cours : le conseil affiché juste avant chaque action du joueur
  const handGaps = useRef(new Map<string, Gap>());
  const gapsSeen = useRef<{ len: number; gaps: Gap[] }>({ len: 0, gaps: [] });
  useEffect(() => {
    const prev = gapsSeen.current;
    if (heroJustActed(prev.len, actionHistory, userIdx)) for (const g of prev.gaps) handGaps.current.set(g.key, g);
    gapsSeen.current = { len: actionHistory.length, gaps: gapsNow };
  }, [actionHistory, gapsNow, userIdx]);

  // Pseudo + profil court affichés au-dessus de chaque siège associé à une fiche
  const seatNames = useMemo(() => {
    const TONE: Record<Family, string> = {
      recPassif: "text-primary border-primary/50", recAgressif: "text-red-400 border-red-500/50",
      regCompetent: "text-emerald-300 border-emerald-500/40", regSerre: "text-sky-300 border-sky-500/40",
      regAgressif: "text-orange-300 border-orange-500/40", inconnu: "text-muted-foreground border-border",
    };
    return Array.from({ length: tableSize }, (_, i) => {
      const p = seatPlayers[i] ? playerFiles[seatPlayers[i]] : undefined;
      if (!p || i === userIdx) return undefined;
      const { provisional } = classify(p.counters);
      const fam = familyOf(p.counters);
      return { name: p.name, profile: `${FAMILY_SHORT[fam]}${provisional && fam !== "inconnu" ? "?" : ""} · ${p.counters.hands}`, tone: TONE[fam] };
    });
  }, [tableSize, seatPlayers, playerFiles, userIdx]);

  const polarization = useMemo(() => {
    if (!engine) return null;
    return assessPolarization({
      position,
      street: currentStreet,
      texture: engine.texture,
      handCategory: engine.handClass?.hand_category ?? "Medium",
      equityPct: engine.equityPct,
      heroRA: Number(engine.heroRA) || 50,
      villainRA: Number(engine.villainRA) || 50,
      opponents,
      heroIsAggressor: userIdx >= 0 && actionHistory.some(
        a => a.seatIdx === userIdx && (a.type === "Bet" || a.type === "Raise"),
      ),
      facingBet,
      betSizePctOfPot: facingBet && dynamicPot > 0 ? (userToCall / dynamicPot) * 100 : undefined,
    });
  }, [engine, position, currentStreet, opponents, userIdx, actionHistory, userToCall, dynamicPot, facingBet]);

  const removeCard = (card: string) => {
    if (hole.includes(card)) return setHole(hole.filter(c => c !== card));
    if (flop.includes(card)) {
      // removing a flop card invalidates turn/river
      setFlop(flop.filter(c => c !== card));
      setTurn(null); setRiver(null);
      return;
    }
    if (turn === card) { setTurn(null); setRiver(null); return; }
    if (river === card) { setRiver(null); return; }
  };

  const pickCard = (card: string) => {
    if (selected.includes(card)) return removeCard(card);

    if (pickMode === "hole") {
      if (hole.length >= 2) { toast.error(t("toast.holeFull")); return; }
      const next = [...hole, card];
      setHole(next);
      if (next.length === 2) setPickMode("flop");
      return;
    }
    if (pickMode === "flop") {
      if (flop.length >= 3) { toast.error(t("toast.flopFull")); return; }
      const next = [...flop, card];
      setFlop(next);
      if (next.length === 3) setPickMode("turn");
      return;
    }
    if (pickMode === "turn") {
      if (flop.length < 3) { toast.error(t("toast.completeFlop")); return; }
      if (turn) { toast.error(t("toast.turnSet")); return; }
      setTurn(card);
      setPickMode("river");
      return;
    }
    if (pickMode === "river") {
      if (!turn) { toast.error(t("toast.setTurn")); return; }
      if (river) { toast.error(t("toast.riverSet")); return; }
      setRiver(card);
    }
  };

  // Compte la main saisie dans les fiches des joueurs associés aux sièges.
  const recordHandForPlayers = () => {
    const seatMap = getSeatPlayers();
    if (!actionHistory.length || !Object.keys(seatMap).length || dealerIdx < 0) return;
    const positions: Record<number, string> = {};
    for (let i = 0; i < tableSize; i++) positions[i] = seatLabel(i, dealerIdx, tableSize);
    const perSeat = countAnalyzedHand({
      actions: actionHistory,
      positions,
      boardCards: flop.length + (turn ? 1 : 0) + (river ? 1 : 0),
    });
    const players = loadPlayers();
    const deltas: Record<string, typeof perSeat[number]> = {};
    for (const [seat, d] of Object.entries(perSeat)) {
      const pid = seatMap[+seat];
      if (pid && players[pid] && +seat !== userIdx) deltas[pid] = d;
    }
    const n = Object.keys(deltas).length;
    if (n) {
      addStatsMany(deltas);
      toast.success(`Main comptée dans ${n} fiche${n > 1 ? "s" : ""} joueur.`);
    }
    // cartes montrées à l'abattage → enregistrées avec toute la ligne
    const board5 = [...flop, ...(turn ? [turn] : []), ...(river ? [river] : [])];
    let shownSaved = 0;
    for (const [seat, text] of Object.entries(shownCards)) {
      const cards = parseCards(text);
      const pid = seatMap[+seat];
      if (!cards || !pid || !players[pid] || cards.some(c => hole.includes(c) || board5.includes(c))) continue;
      addShownRecord(pid, buildShowdownRecord(cards, +seat, positions[+seat], actionHistory, board5, potOpts));
      shownSaved++;
    }
    if (shownSaved) toast.success(`Cartes montrées enregistrées dans ${shownSaved} fiche${shownSaved > 1 ? "s" : ""}.`);
  };

  /** Fin de main : enregistrée dans l'historique (cash, deux cartes entrées) et comptée dans les fiches joueurs.
   *  Une main rouverte depuis l'historique est mise à jour, et n'est pas comptée une seconde fois. */
  const finishHand = () => {
    if (analyzerMode === "cash") {
      const saved = saveHand(
        { tableSize, dealerIdx, userIdx, hole, flop, turn, river, folded, stack, pot, call, actions: actionHistory, shown: shownCards },
        { replaceId: reviewId ?? undefined },
      );
      if (saved) {
        // main laissée au moment où le joueur devait agir : le conseil affiché compte aussi
        if (endsOnHeroDecision(actionHistory, userIdx)) for (const g of gapsNow) handGaps.current.set(g.key, g);
        recordGaps([...handGaps.current.values()], saved.id);
      }
    }
    handGaps.current = new Map();
    if (!reviewId) recordHandForPlayers();
    setReviewId(null);
  };

  /** Remet une main de l'historique dans l'analyseur (la main en cours est d'abord enregistrée). */
  const reviewHand = (h: SavedHand) => {
    if (!reviewId) {
      // la table en cours est mise de côté ; si une main y était entamée, la suivante aura le bouton avancé
      const cur: TableSeat = { size: tableSize, dealer: dealerIdx, user: userIdx };
      const started = hole.length > 0 || flop.length > 0 || actionHistory.length > 0;
      liveSeat.current = started ? nextHandSeat(cur) : cur;
    }
    finishHand();
    setAppMode("analyzer"); setAnalyzerMode("cash");
    setTableSize(h.tableSize);
    setHole(h.hole); setFlop(h.flop); setTurn(h.turn); setRiver(h.river);
    setPickMode(h.river ? "river" : h.turn ? "river" : h.flop.length === 3 ? "turn" : "flop");
    setDealerIdx(h.dealerIdx); setUserIdx(h.userIdx);
    setSeatMode(h.dealerIdx >= 0 && h.userIdx >= 0 ? "action" : h.dealerIdx >= 0 ? "user" : "dealer");
    setFolded(h.folded.length === h.tableSize ? h.folded : Array(h.tableSize).fill(false));
    setStack(h.stack); setPot(h.pot); setCall(h.call);
    setActionHistory(h.actions);
    setShownCards(h.shown ?? {});
    setAiResult(null); setAiError(null);
    setVoiceUndo([]);
    setReviewId(h.id);
    const SYM: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
    toast.success(`Main ${h.hole.map(c => c[0] + (SYM[c[1]] ?? c[1])).join(" ")}${h.hero ? ` (${h.hero})` : ""} rechargée depuis l'historique.`);
  };

  /** Main suivante. À la même table, le bouton passe au siège suivant et tu gardes ta place ;
   *  `leaveTable` (« Nouvelle table ») efface le bouton et ta place. */
  const startHand = (leaveTable: boolean) => {
    finishHand();
    setHole([]); setFlop([]); setTurn(null); setRiver(null);
    setAiResult(null); setAiError(null);
    setPickMode("hole");
    const next: TableSeat = leaveTable
      ? { size: tableSize, dealer: -1, user: -1 }
      : reviewId
        ? liveSeat.current ?? { size: tableSize, dealer: -1, user: -1 }
        : nextHandSeat({ size: tableSize, dealer: dealerIdx, user: userIdx });
    liveSeat.current = null;
    setTableSize(next.size); setDealerIdx(next.dealer); setUserIdx(next.user);
    setSeatMode(next.dealer < 0 ? "dealer" : next.user < 0 ? "user" : "action");
    setFolded(Array(next.size).fill(false));
    setStack(100); setPot(10); setCall(0);
    setActionHistory([]);
    setShownCards({});
    setVoiceUndo([]);
    setTournamentResetKey(k => k + 1);
  };
  const reset = () => startHand(false);
  const newTable = () => startHand(true);

  // garde la table (bouton, ta place) pour la prochaine visite ; pas pendant qu'on revoit une main de l'historique
  useEffect(() => {
    if (!reviewId) saveSeat(dealerIdx >= 0 ? { size: tableSize, dealer: dealerIdx, user: userIdx } : null);
  }, [tableSize, dealerIdx, userIdx, reviewId]);

  const handleSeatClick = (i: number) => {
    if (seatMode === "fold") {
      setFolded(prev => {
        const next = [...prev];
        next[i] = !next[i];
        return next;
      });
      return;
    }
    if (seatMode === "action") return; // handled by ActionMenu inside table
    if (seatMode === "dealer") {
      setDealerIdx(i);
      setSeatMode("user");
    } else {
      setUserIdx(i);
    }
  };

  const handlePlayerAction = (seatIdx: number, type: ActionType, amountBB: number) => {
    setActionHistory(prev => [...prev, { seatIdx, street: currentStreet, type, amountBB }]);
    if (type === "Fold") {
      setFolded(prev => {
        const next = [...prev];
        next[seatIdx] = true;
        return next;
      });
    }
  };

  // === Saisie vocale : ce qui est compris s'ajoute à la main ; « annule » revient à l'état d'avant la dictée ===
  type VoiceSnap = { actionHistory: PlayerAction[]; folded: boolean[]; hole: string[]; flop: string[]; turn: string | null; river: string | null; pickMode: PickMode };
  const [voiceUndo, setVoiceUndo] = useState<VoiceSnap[]>([]);
  const voiceTable: VoiceTable = {
    size: tableSize, dealerIdx, userIdx, actions: actionHistory, board, hole, folded, stack,
    blinds: potFromActions && dealerIdx >= 0, startPot: potOpts.startPot ?? 0,
  };
  const applyVoice = (r: VoiceResult) => {
    setVoiceUndo(u => [...u, { actionHistory, folded, hole, flop, turn, river, pickMode }].slice(-20));
    if (r.actions.length) {
      setActionHistory(prev => [...prev, ...r.actions]);
      setFolded(prev => prev.map((f, i) => f || r.actions.some(a => a.seatIdx === i && a.type === "Fold")));
    }
    const nextHole = r.hole ?? hole;
    const nextBoard = r.board ?? board;
    if (r.hole) setHole(r.hole);
    if (r.board) { setFlop(r.board.slice(0, 3)); setTurn(r.board[3] ?? null); setRiver(r.board[4] ?? null); }
    if (r.hole || r.board) {
      setPickMode(nextHole.length < 2 ? "hole" : nextBoard.length < 3 ? "flop" : nextBoard.length < 4 ? "turn" : "river");
    }
  };
  const undoVoice = () => {
    const snap = voiceUndo[voiceUndo.length - 1];
    if (!snap) return;
    setVoiceUndo(u => u.slice(0, -1));
    setActionHistory(snap.actionHistory); setFolded(snap.folded); setHole(snap.hole);
    setFlop(snap.flop); setTurn(snap.turn); setRiver(snap.river); setPickMode(snap.pickMode);
  };

  const handleSizeChange = (s: TableSize) => {
    setTableSize(s);
    setDealerIdx(-1); setUserIdx(-1); setSeatMode("dealer");
    setFolded(Array(s).fill(false));
    setActionHistory([]);
    setVoiceUndo([]);
  };

  const runAI = async () => {
    if (!engine) { toast.error(t("toast.pickHole")); return; }
    setAiLoading(true); setAiError(null); setAiResult(null);
    try {
      // Local deterministic analysis — no external AI required.
      const action = engine.suggestedAction || "Check";
      const sizing = engine.sizing;
      const rr = engine.rangeReadout;
      const ip = ["BTN", "CO", "HJ"].includes(position);
      const explanation = buildExplanation({
        engine, street: currentStreet, position, opponents,
        userToCall, pot: dynamicPot, lang,
      });
      const reasoning = explanation.fullText;
      const sizingLine = sizing
        ? `${t(`act.${sizing.heroAction}`) || sizing.heroAction} ${sizing.amountBB} BB (${sizing.pctMin}–${sizing.pctMax}% ${t("engine.ofPot")}) — ${sizing.intent}. ${sizing.explanation}`
        : t("local.noBet");
      const rangeLine = rr && rr.opponents.length
        ? t("local.oppRange", { s: rr.aggregateStrength, type: rr.dominantRangeType, bf: Math.round(rr.aggregateBluffFreq * 100) })
        : t("local.noOpp");
      const flushDrawOnBoard = /([shdc]).*\1.*\1/.test(board.join(""));
      const boardVals = board.map(c => "23456789TJQKA".indexOf(c[0]) + 2).sort((a, b) => a - b);
      let straightDrawOnBoard = false;
      for (let i = 0; i + 1 < boardVals.length; i++) {
        if (boardVals[i + 1] - boardVals[i] <= 2) { straightDrawOnBoard = true; break; }
      }
      const conditional = buildConditionalLines({
        engine, street: currentStreet, position, opponents,
        userToCall, pot: dynamicPot, lang,
        flushDrawOnBoard, straightDrawOnBoard,
      });

      const analysis: AIAnalysis = {
        decision_explanation: {
          action: (["Raise", "Call", "Check", "Fold"].includes(action) ? action : "Check") as string,
          reasoning: `${reasoning} ${sizingLine}`.trim(),
          confidence: Math.max(0.5, Math.min(0.95, (engine.adjScore || 50) / 100)),
        },
        street_strategy: {
          current_street_plan: `${currentStreet}: ${sizingLine}`,
          turn_plan: currentStreet === "Preflop" || currentStreet === "Flop"
            ? (engine.adjScore >= 65 ? t("local.turnContinue") : engine.outs >= 8 ? t("local.turnBarrel") : t("local.turnControl"))
            : t("local.recap"),
          river_plan: currentStreet === "River"
            ? t("local.riverFinal")
            : (engine.adjScore >= 70 ? t("local.riverValue") : engine.adjScore <= 35 ? t("local.riverGiveup") : t("local.riverCatch")),
        },
        conditional_lines: conditional,
        range_thinking: {
          what_you_represent: `${ip ? "IP" : "OOP"} ${userLabel || position}: ${Number(engine.heroRA) >= 55 ? t("local.repAdv") : t("local.repCap")}.`,
          what_opponent_represents: rangeLine,
        },
        key_concepts: [
          t("local.kc.equity"),
          t("local.kc.range", { h: engine.heroRA, v: engine.villainRA }),
          t("local.kc.texture", { t: t(`texture.${engine.texture}`) }),
          opponents >= 2 ? t("local.kc.multi") : t("local.kc.hu"),
        ],
        mistakes_to_avoid: [
          engine.adjScore <= 35 ? t("local.av.bluff") : t("local.av.slow"),
          sizing?.facingBet && (engine.potOdds && engine.reqEquity && engine.equityPct < engine.reqEquity)
            ? t("local.av.callPrice")
            : t("local.av.sizeOut"),
          t("local.av.position"),
        ],
      };
      setAiResult(analysis);
    } catch (e: any) {
      const msg = e?.message || "Local analysis failed";
      setAiError(msg);
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const explainWithGemini = async () => {
    if (!engine) { toast.error(t("toast.pickHole")); return; }
    setGeminiLoading(true); setGeminiText(null);
    try {
      const ctx: string[] = [];
      if (engine.equityPct && engine.reqEquity) {
        ctx.push(engine.equityPct >= engine.reqEquity
          ? (lang === "fr" ? "équité supérieure à la cote du pot" : "equity exceeds pot odds")
          : (lang === "fr" ? "équité inférieure à la cote du pot" : "equity below pot odds"));
      }
      if (engine.drawType && engine.drawType !== "None") ctx.push(engine.drawType);
      if (engine.texture) ctx.push(`${engine.texture} board`);
      if (opponents >= 2) ctx.push(lang === "fr" ? "pot multiway" : "multiway pot");
      if (engine.sizing?.facingBet) ctx.push(lang === "fr" ? "face à une mise" : "facing a bet");
      const lastAggressive = [...actionHistory].reverse().find(a => a.type === "Bet" || a.type === "Raise");
      if (lastAggressive) ctx.push(`${lang === "fr" ? "adversaire" : "opponent"} ${lastAggressive.type.toLowerCase()} ${lastAggressive.amountBB}bb`);

      const local = lang === "fr"
        ? `Décision: ${engine.suggestedAction}. Main: ${engine.category ?? "?"} (score ajusté ${engine.adjScore}). Équité ${engine.equityPct}%${engine.reqEquity ? ` vs cote requise ${engine.reqEquity}%` : ""}. Position ${position} en ${currentStreet}, ${opponents + 1} joueurs actifs. ${ctx.length ? `Contexte: ${ctx.join(", ")}.` : ""}`
        : `Decision: ${engine.suggestedAction}. Hand: ${engine.category ?? "?"} (adj. score ${engine.adjScore}). Equity ${engine.equityPct}%${engine.reqEquity ? ` vs required ${engine.reqEquity}%` : ""}. Position ${position} on ${currentStreet}, ${opponents + 1} active players. ${ctx.length ? `Context: ${ctx.join(", ")}.` : ""}`;
      setGeminiText(local);
    } catch (e: any) {
      toast.error(e?.message || "Local explanation error");
    } finally {
      setGeminiLoading(false);
    }
  };

  // décision synthétique : affichée à côté de la table (droite sur ordinateur, sous la table sur mobile)
  const decisionBox = (
    <DecisionVerdict
      street={currentStreet}
      engine={engine}
      polar={polarization}
      pot={dynamicPot}
      toCall={userToCall}
      stack={stack}
      solver={currentStreet === "Preflop" ? solverPreflop : null}
      postflop={postflopAdvice}
      endgame={{ ...endgame, note: postflopCtx?.endgameNote ?? null, guard: endgameGuard }}
      format={solverFormat}
      solverNote={cashCover.note}
      rake={analyzerMode === "cash" ? CASH_RAKE : null}
      rangeSource={postflopCtx?.rangeSource ?? null}
      exploit={{
        mode: exploitSettings.mode,
        items: exploit.items,
        adjust: exploit.adjust,
        familyLabel: exploit.villainFile ? FAMILY_LABEL[familyOf(exploit.villainFile.counters)] : undefined,
        villainName: exploit.villainFile?.name,
        villainId: exploit.villainId,
        villainOptions: (tablePlayers.length ? tablePlayers : Object.keys(playerFiles)).map(id => playerFiles[id]).filter(Boolean),
        autoName: exploit.autoName,
      }}
    />
  );

  return (
    <div className="min-h-screen">
      <RangeExplorer />
      <header className="border-b border-border/40 backdrop-blur-md bg-background/40 sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden sm:flex w-10 h-10 shrink-0 rounded-lg items-center justify-center" style={{ background: "var(--gradient-gold)" }}>
              <Spade className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="display text-lg sm:text-2xl gold-text leading-none whitespace-nowrap">{t("app.title")}</h1>
              <p className="hidden sm:block text-xs text-muted-foreground">{t("app.subtitle")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LanguageSelector />
            <HandHistory onReview={reviewHand} />
            {appMode === "analyzer" && (
              <Button variant="outline" size="sm" onClick={reset} className="gold-border">
                <RotateCcw className="w-4 h-4 sm:mr-2" /><span className="sr-only sm:not-sr-only">{t("btn.reset")}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container pt-6">
        <Tabs value={appMode} onValueChange={(v) => setAppMode(v as "analyzer" | "training")}>
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="analyzer">{t("mode.analyzer")}</TabsTrigger>
            <TabsTrigger value="training">{t("mode.training")}</TabsTrigger>
          </TabsList>

          <TabsContent value="analyzer">
            <div className="flex justify-center gap-2 pt-6">
              <Button
                variant={analyzerMode === "cash" ? "default" : "outline"}
                size="sm"
                onClick={() => setAnalyzerMode("cash")}
              >
                Cash Game
              </Button>
              <Button
                variant={analyzerMode === "tournament" ? "default" : "outline"}
                size="sm"
                onClick={() => setAnalyzerMode("tournament")}
              >
                Tournament
              </Button>
            </div>
            {analyzerMode === "tournament" ? (
              <main className="py-6 space-y-6">
                <TournamentPanel key={tournamentResetKey} />
                <MyTablePanel />
                <BountyKoPanel />
                <SolverSpotsPanel prefer="mtt" />
              </main>
            ) : (
            <main className="py-6 space-y-6">
              <SolverAdviceBox
                headless
                format={solverFormat}
                hole={hole}
                seatPos={Array.from({ length: tableSize }, (_, i) => (dealerIdx >= 0 ? labelToPosition(seatLabel(i, dealerIdx, tableSize)) : ""))}
                heroSeat={userIdx}
                actions={actionHistory}
                stackBB={stack}
                defaultFormat={solverFormat}
                onAdvice={setSolverPreflop}
                onMiss={setPreflopMissing}
              />
              <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div className="space-y-6">
                <Card className="glass-panel p-3 sm:p-5">
                  <StreetSlots
                    hole={hole}
                    flop={flop}
                    turn={turn}
                    river={river}
                    pickMode={pickMode}
                    setPickMode={setPickMode}
                    onRemove={removeCard}
                    currentStreet={currentStreet}
                  />
                  <div className="pt-3 mt-3 lg:pt-5 lg:mt-5 border-t border-border/40">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t("section.deck")}</p>
                    <CardPicker selected={selected} hole={hole} board={board} onPick={pickCard} />
                  </div>
                </Card>
              </div>

              <div className="space-y-6 order-first lg:order-none">
                <Card className="glass-panel p-6">
                  <h2 className="display text-xl mb-4">{t("section.tableAndPosition")}</h2>
                  <PokerTable
                    size={tableSize}
                    dealerIdx={dealerIdx}
                    userIdx={userIdx}
                    mode={seatMode}
                    folded={folded}
                    streetContribs={streetContribs}
                    lastActions={lastActions}
                    currentBet={currentBet}
                    toCallBB={userToCall}
                    defaultRaise={defaultRaise}
                    onSeatClick={handleSeatClick}
                    onPlayerAction={handlePlayerAction}
                    onModeChange={setSeatMode}
                    onSizeChange={handleSizeChange}
                    seatNames={seatNames}
                    street={currentStreet}
                    potBB={dynamicPot}
                    stackBB={stack}
                    board={board}
                    hole={hole}
                    heroHand={hole.length === 2 && board.length >= 3 ? engine?.category : undefined}
                  />
                  <VoiceInput table={voiceTable} onApply={applyVoice} onUndo={undoVoice} canUndo={voiceUndo.length > 0}
                    onNewHand={reset} />
                  {(river || actionHistory.some(a => a.amountBB >= stack * 0.9)) && dealerIdx >= 0 && (
                    <ShowdownPanel
                      seats={showdownSeats(actionHistory, folded, userIdx)
                        .map(i => ({ seat: i, label: seatLabel(i, dealerIdx, tableSize), name: seatPlayers[i] ? playerFiles[seatPlayers[i]]?.name : undefined }))}
                      values={shownCards}
                      onChange={(seat, text) => setShownCards(v => ({ ...v, [seat]: text }))}
                      hero={hole}
                      board={[...flop, ...(turn ? [turn] : []), ...(river ? [river] : [])]}
                    />
                  )}
                  {(dealerIdx >= 0 || seatNames.some(Boolean)) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      {dealerIdx >= 0 && !reviewId ? (
                        <p className="text-xs text-muted-foreground">Le bouton avance d'un siège à chaque nouvelle main.</p>
                      ) : <span />}
                      <div className="flex gap-1">
                        {dealerIdx >= 0 && (
                          <Button size="sm" variant="ghost" type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={newTable}>
                            Nouvelle table
                          </Button>
                        )}
                        {seatNames.some(Boolean) && (
                          <Button size="sm" variant="ghost" type="button" className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              if (window.confirm("Changer de table : effacer les pseudos des sièges et vider « Ma table » ? Les fiches et leurs stats sont gardées.")) { clearTable(); newTable(); }
                            }}>
                            Changer de table · effacer les pseudos
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>

              </div>
              </div>

              {/* décision synthétique toujours visible : fixée en bas de l'écran, repliable */}
              <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
                <div className="container pb-2 sm:pb-3">
                  <section aria-label="Décision synthétique" className="pointer-events-auto relative rounded-2xl border border-primary/35 bg-background/95 backdrop-blur-md shadow-[0_-24px_48px_-24px_#000]">
                    <button
                      type="button"
                      onClick={() => setDecisionOpen(o => { const v = !o; try { localStorage.setItem("ace.decisionOpen", v ? "1" : "0"); } catch { /* stockage indisponible */ } return v; })}
                      aria-expanded={decisionOpen}
                      className={decisionOpen
                        ? "absolute -top-3 right-4 z-10 flex items-center gap-1 rounded-full border border-primary/40 bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                        : "flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold"}
                    >
                      {decisionOpen ? <>Réduire <ChevronDown className="h-3.5 w-3.5" /></> : <><span className="text-xs uppercase tracking-widest text-muted-foreground">Décision synthétique</span><span className="flex items-center gap-1 text-primary">Afficher <ChevronDown className="h-4 w-4 rotate-180" /></span></>}
                    </button>
                    {decisionOpen && <ResizableDock onHeight={setDockH}>{decisionBox}</ResizableDock>}
                  </section>
                </div>
              </div>

              {/* tout le reste, replié par défaut : la page montre l'essentiel (cartes, table, décision) */}
              <div className="flex justify-center pt-2">
                <Button type="button" variant="outline" className="gap-2" aria-expanded={advanced} aria-controls="advanced-tools"
                  onClick={() => setAdvanced(a => { const v = !a; try { localStorage.setItem("ace.advanced", v ? "1" : "0"); } catch { /* stockage indisponible */ } return v; })}>
                  {advanced ? "Masquer les options avancées" : "Options avancées"}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${advanced ? "rotate-180" : ""}`} />
                </Button>
              </div>
              {!advanced && (
                <p className="text-center text-xs text-muted-foreground -mt-3">
                  Ma table et pseudos, mises, calculateurs (EV, stack-off, jam/fold), range du vilain, bankroll, spots du solveur, analyse IA.
                </p>
              )}
              {advanced && (
                <section id="advanced-tools" aria-label="Options avancées" className="space-y-6">
                <MyTablePanel
                  seatLabels={Array.from({ length: tableSize }, (_, i) => (dealerIdx >= 0 ? seatLabel(i, dealerIdx, tableSize) : ""))}
                  heroSeat={userIdx}
                />
                  <div className="gap-6 lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
                    <Card className="glass-panel p-6">
                      <h2 className="display text-xl mb-4">{t("section.stakes")}</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>{t("field.stack")}</Label>
                          <div role="radiogroup" aria-label={t("field.stack")} className="flex rounded-md border border-border overflow-hidden text-sm">
                            {CASH_DEPTHS.map(d => (
                              <button key={d.bb} type="button" role="radio" aria-checked={stack === d.bb} disabled={!d.ready}
                                onClick={() => setStack(d.bb)} title={d.ready ? undefined : "Pas encore calculé"}
                                className={`flex-1 px-2 py-1.5 ${stack === d.bb ? "bg-primary text-primary-foreground" : "hover:bg-secondary"} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}>
                                {d.bb}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">Seul le tapis de 100 bb est calculé en cash pour l'instant. Les autres profondeurs arriveront après validation.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("field.pot")}</Label>
                          {potFromActions ? (
                            <Input type="number" value={dynamicPot} readOnly disabled aria-describedby="pot-hint" />
                          ) : (
                            <Input type="number" min={0} value={pot} onChange={e => setPot(+e.target.value)} aria-describedby="pot-hint" />
                          )}
                          <p id="pot-hint" className="text-xs text-muted-foreground">
                            {t(potFromActions ? (dealerIdx >= 0 ? "field.potAuto" : "field.potAutoNoDealer") : "field.potManual")}
                          </p>
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label>{t("field.call")}</Label>
                          <Input type="number" min={0} value={call} onChange={e => setCall(+e.target.value)} />
                        </div>
                      </div>
                    </Card>
                    <CashHUD
                      preflop={hole.length === 2 ? analyzePreflop({
                        hole,
                        position,
                        stackBB: stack,
                        facingRaise: facingBet,
                        raiseSizeBB: currentBet,
                        opponents,
                      }) : null}
                      street={currentStreet}
                      stackBB={stack}
                      opponents={opponents}
                    />
                    <EngineReadout result={engine} />

                    <AlphaPanel
                      defaultPot={dynamicPot}
                      defaultBet={facingBet ? userToCall : Math.max(1, Math.round(dynamicPot * 0.66))}
                      perspective={facingBet ? "hero-facing" : "hero-betting"}
                    />

                    <BoardCbetPanel flop={flop} heroPosition={position} villainId={exploit.resolvedId} />

                    <GeometricSizingPanel
                      defaultPot={dynamicPot}
                      defaultHeroStack={stack}
                      defaultVillainStack={stack}
                      streetsRemaining={
                        (currentStreet === "Preflop" || currentStreet === "Flop"
                          ? 3
                          : currentStreet === "Turn"
                          ? 2
                          : 1) as 1 | 2 | 3
                      }
                    />

                    <EVCalculatorPanel
                      defaultEquityPct={engine?.equityPct ?? 50}
                      defaultRiskBB={facingBet ? userToCall : Math.max(1, Math.round(dynamicPot * 0.66))}
                      defaultRewardBB={Math.max(1, dynamicPot)}
                    />

                    <BankrollPanel />

                    <PolarizationPanel result={polarization} />

                    <RangeTrackerPanel
                      hole={hole}
                      board={board}
                      potBB={dynamicPot}
                      texture={(engine?.texture as "Dry" | "Semi-wet" | "Wet") ?? "Semi-wet"}
                    />

                    <JamFoldPanel
                      defaultPotBB={dynamicPot}
                      defaultStackBB={stack}
                      defaultEquityPct={Math.round(engine?.equityPct ?? 35)}
                    />

                    <SolverSpotsPanel prefer="cash" />

                    <Button
                      onClick={runAI}
                      disabled={!engine || aiLoading}
                      className="w-full h-12 text-base font-semibold"
                      style={{ background: "var(--gradient-gold)", color: "hsl(var(--primary-foreground))" }}
                    >
                      <Sparkles className="w-5 h-5 mr-2" />
                      {aiLoading ? t("btn.analyzing") : `${t("btn.runAi")} (${currentStreet})`}
                    </Button>

                    <AIPanel analysis={aiResult} loading={aiLoading} error={aiError} />

                    {aiResult && (
                      <Card className="glass-panel p-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="display text-lg gold-text">{lang === "fr" ? "Explication détaillée" : "Detailed explanation"}</h4>
                          <Button size="sm" variant="outline" onClick={explainWithGemini} disabled={geminiLoading}>
                            <Sparkles className="w-4 h-4 mr-2" />
                            {geminiLoading ? (lang === "fr" ? "Analyse..." : "Thinking...") : (lang === "fr" ? "Expliquer la décision" : "Explain decision")}
                          </Button>
                        </div>
                        {geminiText && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{geminiText}</p>}
                      </Card>
                    )}
                  </div>
                </section>
              )}
            </main>
            )}
          </TabsContent>

          <TabsContent value="training">
            <main className="py-6">
              <TrainingMode />
            </main>
          </TabsContent>
        </Tabs>
      </div>

      <FooterDisclaimer />
      {/* place pour la décision fixée en bas, pour qu'elle ne cache jamais le bas de la page */}
      {appMode === "analyzer" && analyzerMode === "cash" && <div aria-hidden className={decisionOpen ? undefined : "h-16"} style={decisionOpen ? { height: dockH + 24 } : undefined} />}
    </div>
  );
};

export default Index;
