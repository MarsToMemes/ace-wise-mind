import { useEffect } from "react";
import { loadSolverIndex, loadSolverGame, setSolverBaseGame, cashBaseId } from "@/engines/solverSpots";

/**
 * Charge la table solveur cash la plus proche du tapis joué (D33 ; à défaut, cash 100 bb) et la rend disponible
 * aux ranges du site (lignes préflop, c-bet, Mes ranges, multiway…). Les blocs se recalculent via l'événement
 * "ace:myRanges".
 */
export function useSolverBase(stackBB = 100) {
  const id = cashBaseId(stackBB);
  useEffect(() => {
    let alive = true;
    loadSolverIndex()
      .then(ix => (ix.some(e => e.id === id) ? id : ix.some(e => e.id === "cash100") ? "cash100" : null))
      .then(pick => (pick ? loadSolverGame(pick) : null))
      .then(g => {
        if (!alive || !g) return;
        setSolverBaseGame(g);
        window.dispatchEvent(new Event("ace:myRanges"));
      })
      .catch(() => { /* pas de données solveur : ranges de base */ });
    return () => { alive = false; };
  }, [id]);
}
