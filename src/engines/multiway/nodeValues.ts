// Étape A3 (D29) : ce que rapporte chaque action avec chaque main du joueur qui doit parler, au nœud atteint par la
// ligne jouée, quand tout le monde suit la stratégie calculée (se coucher = 0 : l'argent déjà mis est perdu de toute
// façon). Calcul exact (vriverN) : probabilités d'arrivée des adversaires le long de la ligne, valeur de chaque action
// dans son sous-arbre, divisée par la masse des mains adverses compatibles avec la main.
import { VRiverN } from "@/engines/multiway/vriverN";
import { VTurnN, type TurnSpec } from "@/engines/multiway/vturn";
import type { TAct, TNode } from "@/engines/multiway/betTree";
import type { VSpec, VProfile } from "@/engines/multiway/vriver3";
import { category, type EndgameResult, type EndgameAction, type EndgameRangeLine } from "@/engines/endgame/solve";
import type { ActKind } from "@/engines/endgame/tree";

/** Pour chaque main du joueur (dans l'ordre du moteur), la valeur de chaque action du nœud, en bb. */
export function actionValues(spec: VSpec, prof: VProfile, nodeId: number, player: number, v = new VRiverN(spec)): number[][] {
  const path: { node: TAct; a: number }[] = [];
  const find = (nd: TNode): boolean => {
    if (nd.t === "end") return false;
    if (nd.id === nodeId) return true;
    for (let a = 0; a < nd.children.length; a++) {
      path.push({ node: nd, a });
      if (find(nd.children[a])) return true;
      path.pop();
    }
    return false;
  };
  if (!find(v.root)) throw new Error("nœud introuvable");
  const reach = v.rootReach();
  for (const { node, a } of path) {
    if (node.player === player) continue;                 // valeurs « contrefactuelles » : sans tes propres choix
    const p = node.player, N = v.handCount(p), s = prof.get(node.id)!, w = new Float64Array(N);
    for (let x = 0; x < N; x++) w[x] = reach[p][x] * s[a * N + x];
    reach[p] = w;
  }
  const target = v.tree.acts[nodeId], mass = v.massAt(player, reach);
  const vals = target.children.map(c => v.evalKey(v.keyOf(c), player, reach, prof, false));
  return Array.from({ length: v.handCount(player) }, (_, x) => vals.map(va => (mass[x] > 0 ? va[x] / mass[x] + target.put[player] : 0)));
}

const fmt = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");
const KIND: Record<string, ActKind> = { p: "check", f: "fold", c: "call", r: "raise", a: "allin" };

/** Nom d'une action du nœud, comme le solveur tête-à-tête (« Mise 33 % = 7,6 bb », « Call 12 bb »…). */
export function multiwayLabel(n: TAct, k: number): { kind: ActKind; to: number; label: string } {
  const tok = n.actions[k], to = n.tos[k], put = to - n.street[n.player];
  const facing = n.actions.includes("c");
  const kind: ActKind = KIND[tok] ?? (facing ? "raise" : "bet");
  const label = kind === "check" ? "Check" : kind === "fold" ? "Fold" : kind === "call" ? `Call ${fmt(put)} bb`
    : kind === "allin" ? `Tapis ${fmt(put)} bb` : kind === "raise" ? `Relance à ${fmt(to)} bb` : `Mise ${Math.round((put / n.pot) * 100)} % = ${fmt(put)} bb`;
  return { kind, to, label };
}

/** Ce qu'il faut d'un moteur (river exacte ou turn) pour présenter un résultat. */
export interface NodeEngine {
  n: number;
  tree: { root: TNode; acts: TAct[] };
  hands: { cards: [string, string]; w: number }[][];
  handCount(p: number): number;
  rootReach(): Float64Array[];
}

/**
 * Résultat du solveur multiway sous la forme qu'affiche la Décision synthétique (même forme que le solveur tête-à-tête) :
 * actions de ta main (fréquence, ce qu'elles rapportent), toute ta range ici par catégorie, précision globale et
 * précision à ta décision.
 */
export function multiwayResult(spec: VSpec, prof: VProfile, nodeId: number, player: number, hand: number,
  meta: { nashConv: number; iterations: number; ms: number }, v = new VRiverN(spec)): EndgameResult {
  return nodeResult(v, actionValues(spec, prof, nodeId, player, v), spec, prof, nodeId, player, hand, meta, "River");
}

export function nodeResult(v: NodeEngine, allValues: number[][], spec: VSpec, prof: VProfile, nodeId: number, player: number, hand: number,
  meta: { nashConv: number; iterations: number; ms: number }, street: "Turn" | "River"): EndgameResult {
  const node = v.tree.acts[nodeId], N = v.handCount(player), A = node.actions.length, s = prof.get(nodeId)!;
  const values = allValues[hand];
  const actions: EndgameAction[] = node.actions.map((_, k) => ({ ...multiwayLabel(node, k), freq: s[k * N + hand], ev: values[k] }));
  // ta range en arrivant ici : tes poids de départ et tes propres choix le long de la ligne
  const hr = Float64Array.from(v.rootReach()[player]);
  const walk = (nd: TNode): boolean => {
    if (nd.t === "end") return false;
    if (nd.id === nodeId) return true;
    for (let a = 0; a < nd.children.length; a++) {
      const keep = Float64Array.from(hr);
      if (nd.player === player) { const sg = prof.get(nd.id)!; for (let x = 0; x < N; x++) hr[x] *= sg[a * N + x]; }
      if (walk(nd.children[a])) return true;
      hr.set(keep);
    }
    return false;
  };
  walk(v.tree.root);
  const cats = v.hands[player].map(c => category(c.cards, spec.board, street));
  const total = hr.reduce((t, x) => t + x, 0);
  const range: EndgameRangeLine[] = Array.from({ length: A }, (_, k) => {
    const byCat = new Map<string, number>(); let tot = 0;
    for (let x = 0; x < N; x++) { const w = hr[x] * s[k * N + x]; tot += w; byCat.set(cats[x], (byCat.get(cats[x]) ?? 0) + w); }
    const withCats = [...byCat.entries()].filter(([, w]) => tot > 0 && w / tot >= 0.2).sort((p, q) => q[1] - p[1]).slice(0, 2).map(([c]) => c);
    return { label: actions[k].label, freq: total > 0 ? tot / total : 0, with: withCats };
  });
  // précision à ta décision : ce que perd ta range ici en suivant la stratégie (D32)
  let loss = 0;
  for (let x = 0; x < N; x++) {
    const e = allValues[x], mix = e.reduce((t, val, a) => t + s[a * N + x] * val, 0);
    loss += hr[x] * (Math.max(...e) - mix);
  }
  const maxW = Math.max(...v.hands[player].map(c => c.w));
  return {
    street, actions, range, exploitPct: (100 * meta.nashConv) / spec.potBB, iterations: meta.iterations, ms: meta.ms,
    combos: v.hands.map(r => r.length), heroInRange: v.hands[player][hand].w > 0.02 * maxW, players: v.n,
    localPct: total > 0 ? (100 * loss / total) / spec.potBB : 0,
  };
}

/** Turn (D32) : même présentation, valeurs du modèle « turn seule » (abattage moyen sur les rivers au bout de la turn). */
export function turnResult(spec: TurnSpec, prof: VProfile, nodeId: number, player: number, hand: number,
  meta: { nashConv: number; iterations: number; ms: number }, values?: number[][]): EndgameResult {
  const v = new VTurnN(spec, { leaves: "showdown" });
  return nodeResult(v, values ?? v.actionValues(prof, nodeId, player), spec, prof, nodeId, player, hand, meta, "Turn");
}
