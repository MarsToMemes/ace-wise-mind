// Découpage en pots (principal, annexes, mise rendue), sorti de handState.ts pour être chargé seul : le calcul multiway
// tourne dans des Web Workers, qui ne doivent charger aucun composant d'interface (handState importe PokerTable.tsx).
const EPS = 1e-6;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Ce que le découpage lit d'un siège (SeatState de handState.ts convient). */
export interface PotSeat { idx: number; investedBB: number; folded: boolean; allIn: boolean }

export interface Pot { amount: number; eligible: number[]; kind: "main" | "side" | "refund" }

/** Découpe ce que chacun a mis en pots, par niveaux de mise ; argent des joueurs couchés compris. */
export function computePots(seats: PotSeat[], bettingOpen: boolean): Pot[] {
  const levels = [...new Set(seats.map(s => s.investedBB).filter(x => x > EPS))].sort((x, y) => x - y);
  const out: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    const amount = r2(seats.reduce((t, s) => t + Math.min(s.investedBB, L) - Math.min(s.investedBB, prev), 0));
    const contributors = seats.filter(s => s.investedBB > prev + EPS).map(s => s.idx);
    const eligible = seats.filter(s => !s.folded && (s.investedBB >= L - EPS || (bettingOpen && !s.allIn))).map(s => s.idx);
    prev = L;
    if (amount <= EPS) continue;
    if (!eligible.length) { if (out.length) out[out.length - 1].amount = r2(out[out.length - 1].amount + amount); continue; }
    const kind: Pot["kind"] = eligible.length === 1 && contributors.length === 1 && contributors[0] === eligible[0] ? "refund" : "side";
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.eligible.join() === eligible.join()) last.amount = r2(last.amount + amount);
    else out.push({ amount, eligible, kind });
  }
  const first = out.find(p => p.kind !== "refund");
  if (first) first.kind = "main";
  return out;
}
