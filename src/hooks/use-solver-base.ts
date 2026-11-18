import { useEffect } from "react";
import { loadSolverIndex, loadSolverGame, setSolverBaseGame } from "@/engines/solverSpots";

/**
 * Charge la partie solveur « cash 100 bb » (si elle existe) et la rend disponible aux
 * ranges du site (c-bet, Mes ranges…). Les blocs se recalculent via l'événement "ace:myRanges".
 */
export function useSolverBase() {
  useEffect(() => {
    let alive = true;
    loadSolverIndex()
      .then(ix => (ix.some(e => e.id === "cash100") ? loadSolverGame("cash100") : null))
      .then(g => {
        if (!alive || !g) return;
        setSolverBaseGame(g);
        window.dispatchEvent(new Event("ace:myRanges"));
      })
      .catch(() => { /* pas de données solveur : ranges de base */ });
    return () => { alive = false; };
  }, []);
}
