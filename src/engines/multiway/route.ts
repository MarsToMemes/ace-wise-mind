// Étape A3 (D29) : quel solveur pour la situation saisie. Tête-à-tête : le solveur de fin de main actuel (turn et
// river). River à 3 joueurs : le solveur multiway exact. Turn à 3 joueurs (B2, D32) : méthode « turn seule ».
// Ailleurs : conseil maison, avec la raison.
import type { RakeRule } from "@/core/rake";
import type { SolverGame } from "@/engines/solverSpots";
import { replayLive, type LiveHand } from "@/lib/liveHand";
import { riverSpotFromHand, turnSpotFromHand, type HandSpot } from "@/engines/multiway/handSpot";

export type MultiwayRoute =
  | { kind: "headsup" }
  | { kind: "multiway"; spot: Extract<HandSpot, { ok: true }> }
  | { kind: "house"; note: string }
  | { kind: "none" };

export function multiwayRoute(o: { street: string; live: LiveHand; positions: string[]; game: SolverGame | null; effStack: number; rake: RakeRule | null }): MultiwayRoute {
  if (o.street !== "Turn" && o.street !== "River") return { kind: "none" };
  const players = replayLive(o.live).state.seats.filter(s => !s.folded).length;
  if (players <= 2) return { kind: "headsup" };
  const later = (here: string) => ({ kind: "house" as const, note: `Solveur multiway : la turn et la river à 3 joueurs seulement pour l'instant (ici, ${here}). Conseil maison.` });
  if (o.street === "Turn") {
    const atTurn = replayLive({ ...o.live, actions: o.live.actions.filter(a => a.street === "Preflop" || a.street === "Flop") }).state.seats.filter(s => !s.folded).length;
    if (atTurn > 3) return later(`${atTurn} joueurs à la turn`);
    if (!o.game) return { kind: "house", note: "Solveur multiway : ranges de la ligne préflop indisponibles (mode cash seulement). Conseil maison." };
    const spot = turnSpotFromHand({ live: o.live, positions: o.positions, game: o.game, effStack: o.effStack, rake: o.rake });
    if (spot.ok) return { kind: "multiway", spot };
    if (spot.reason === "Ce n'est pas à toi de parler à la turn.") return { kind: "none" };
    return { kind: "house", note: `Solveur multiway : ${spot.reason} Conseil maison.` };
  }
  // joueurs au début de la river (un joueur couché à la river reste dans le calcul : son choix fait partie du jeu)
  const atRiver = replayLive({ ...o.live, actions: o.live.actions.filter(a => a.street !== "River") }).state.seats.filter(s => !s.folded).length;
  if (atRiver > 3) return later(`${atRiver} joueurs`);
  if (!o.game) return { kind: "house", note: "Solveur multiway : ranges de la ligne préflop indisponibles (mode cash seulement). Conseil maison." };
  const spot = riverSpotFromHand({ live: o.live, positions: o.positions, game: o.game, effStack: o.effStack, rake: o.rake });
  if (spot.ok) return { kind: "multiway", spot };
  if (spot.reason === "Ce n'est pas à toi de parler à la river.") return { kind: "none" };
  return { kind: "house", note: `Solveur multiway : ${spot.reason} Conseil maison.` };
}
