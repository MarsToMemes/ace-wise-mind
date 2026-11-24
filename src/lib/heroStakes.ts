// Ce qui est vraiment en jeu pour toi au moment de décider, d'après le moteur de règles commun (lib/liveHand.ts) :
// ce qu'il te reste, le tapis effectif restant (pas celui du début de la main), ce que tu dois payer (jamais plus que
// ton tapis), le pot que tu peux gagner (la part d'un adversaire que tu ne peux pas couvrir lui revient), si une
// relance est encore possible (quelqu'un d'autre doit avoir des jetons), et le « tapis » de chaque joueur (tout ce
// qui lui reste en plus de ce qu'il a déjà mis sur la street).
import { replayLive, type LiveHand } from "@/lib/liveHand";

export interface HeroStakes {
  remaining: number;
  /** Ce que tu peux encore perdre ou gagner contre l'adversaire le plus profond encore dans le coup. */
  effective: number;
  toCall: number;
  pot: number;
  canRaise: boolean;
  /** Pot complet (tout ce qui a été mis), dont `pot` retire ce que tu ne peux pas couvrir. */
  fullPot: number;
  /** Montant « relance à » d'un tapis, par siège. */
  allInTo: number[];
}

const EPS = 1e-6;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function heroStakes(h: LiveHand): HeroStakes {
  const st = replayLive(h).state;
  const me = st.seats.find(s => s.idx === h.userIdx);
  const allInTo = st.seats.map(s => r2(s.remainingBB + s.streetBB));
  const fullPot = r2(st.seats.reduce((t, s) => t + s.investedBB, 0));
  if (!me) return { remaining: 0, effective: 0, toCall: 0, pot: fullPot, fullPot, canRaise: false, allInTo };
  const remaining = r2(me.remainingBB);
  const rawToCall = st.toAct === me.idx ? st.toCall : Math.max(0, st.currentBet - me.streetBB);
  const toCall = r2(Math.min(rawToCall, remaining));
  const heroMax = me.investedBB + me.remainingBB;
  const pot = r2(st.seats.reduce((t, s) => t + Math.min(s.investedBB, heroMax), 0));
  const opps = st.seats.filter(s => s.idx !== me.idx && !s.folded);
  const effective = opps.length
    ? r2(Math.min(remaining, Math.max(0, ...opps.map(s => s.remainingBB + s.investedBB - me.investedBB))))
    : remaining;
  const legalOk = st.toAct === me.idx && st.legal ? !!(st.legal.raise || st.legal.bet) : true;
  const canRaise = legalOk && remaining > rawToCall + EPS && opps.some(s => !s.allIn && s.remainingBB > EPS);
  return { remaining, effective, toCall, pot, fullPot, canRaise, allInTo };
}
