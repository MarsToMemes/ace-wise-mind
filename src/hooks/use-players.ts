import { useEffect, useState } from "react";
import { loadPlayers, getMyTable, getSeatPlayers, PLAYERS_EVENT, PlayerFile } from "@/lib/playersStore";

/** Fiches joueurs, « Ma table » et sièges associés, rafraîchis à chaque modification. */
export function usePlayers() {
  const read = () => ({ players: loadPlayers(), table: getMyTable(), seats: getSeatPlayers() });
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener(PLAYERS_EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(PLAYERS_EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  return state as { players: Record<string, PlayerFile>; table: string[]; seats: Record<number, string> };
}
