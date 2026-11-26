// B5 — Le solveur multiway exact (river, 3 et 4 joueurs) compte-t-il juste ? Sans rake, la somme des gains de tous les
// joueurs (valeurs attendues du solveur) doit valoir exactement l'argent mort laissé par les joueurs couchés avant la
// river (0 s'il n'y en a pas) ; avec rake, elle doit rester entre −plafond et cet argent mort (le rake sort du pot).
// Mesuré pour la stratégie uniforme (avant tout calcul) et pour la stratégie calculée.
import { VRiverN } from "@/engines/multiway/vriverN";
import { expandRange } from "@/engines/rangeVsRange";
import { parseRangeText } from "@/engines/myRanges";
import { CASH_RAKE } from "@/core/rake";

export interface LigneSomme { cas: string; joueurs: number; strategie: string; somme: number; attendu: string; ok: boolean }

const SPOTS = [
  { cas: "river à 3, pot simple", board: ["Kh", "8d", "4c", "2s", "Jh"], ranges: ["AK,KQ,KJ,88,44,QJs,T9s,65s", "KQ,KJ,JJ,TT,AJs,QTs,98s", "K8s,K4s,A8s,22,33,77,JT,T9s"], pot: 24, stacks: [88, 88, 88], dead: 0 },
  { cas: "river à 3, argent mort 6 bb", board: ["9h", "8h", "7c", "2d", "5h"], ranges: ["AhKh,QhJh,T6s,99,88,A9", "JTs,66,77,98s,Ah5h", "K9s,T9s,87s,55,A7s,KhQh"], pot: 30, stacks: [80, 80, 80], dead: 6 },
  { cas: "river à 4, pot simple", board: ["As", "9s", "5d", "2c", "Ks"], ranges: ["AK,AQ,KQs,99", "A9s,KJs,55,QsJs", "Ts8s,22,K9s,A5s", "JJ,TT,QQ,KTs"], pot: 32, stacks: [84, 84, 84, 84], dead: 0 },
];

export function sommeNulle(): LigneSomme[] {
  const out: LigneSomme[] = [];
  for (const sp of SPOTS) for (const rake of [null, CASH_RAKE]) {
    const n = sp.ranges.length;
    const live = sp.pot - sp.dead;
    const s = new VRiverN({
      board: sp.board, ranges: sp.ranges.map(r => expandRange(parseRangeText(r), sp.board)), potBB: sp.pot, stacks: sp.stacks,
      bets: [0.5, 1], raise: true, allin: true, maxAggr: 2, rake,
      invested0: Array(n).fill(live / n), dead: sp.dead ? [sp.dead] : undefined,
    } as never);
    const check = (strategie: string) => {
      const somme = s.expectedValues(s.averageProfile()).reduce((a, b) => a + b, 0);
      const ok = rake ? somme <= sp.dead + 1e-9 && somme >= sp.dead - rake.capBB - 1e-9 : Math.abs(somme - sp.dead) < 1e-9;
      out.push({ cas: sp.cas + (rake ? ", rake cash" : ", sans rake"), joueurs: n, strategie, somme, attendu: rake ? `entre ${sp.dead - rake.capBB} et ${sp.dead}` : `${sp.dead}`, ok });
    };
    check("uniforme");
    s.run(n === 3 ? 200 : 60);
    check(`calculée (${s.iterations} itérations)`);
  }
  return out;
}
