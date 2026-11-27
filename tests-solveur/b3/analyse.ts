// B3 — Analyse de la faille : on rejoue les donnes de B3 (exploiteur contre site, mêmes graines, mêmes parties) avec
// un journal tenu par l'analyste, qui voit les deux mains (l'exploiteur, lui, ne voit toujours que la sienne).
//  1) d'où vient le gain : chaque partie est rangée par sa fin (le site se couche, l'exploiteur se couche, abattage),
//     la street et la dernière mise de l'exploiteur ; contribution = (gain de l'exploiteur − gain du site) / 2 ;
//  2) les réponses du site aux mises de l'exploiteur : prix (part de pot qu'il faut pour payer), part de pot réelle
//     de la main du site contre la main que l'exploiteur avait vraiment, et ce que payer aurait rapporté de plus que se
//     coucher. Face à un tapis (plus aucune décision ensuite), c'est exact ; en moyenne sur beaucoup de mains, c'est la
//     perte réelle de chaque choix contre la façon de jouer de l'exploiteur ;
//  3) ce que le conseiller croyait : son équité contre la range qu'il prête à l'exploiteur, et la même avec la range
//     resserrée par la taille de la mise, comme le fait la page (filterByBet).
import { rank7, categoryOf } from "@/engines/handEval7";
import { deal, playGame, type Player } from "../b4/match";
import { decide, adviceFor, type View, type Choice } from "../b4/joueur";
import { makeLBR, newStats, sharesVs } from "./lbr";
import { sitePolicy, type Hole } from "./politique";

export const CATS = ["hauteur", "paire", "deux paires", "brelan", "quinte", "couleur", "full", "carré", "quinte flush"];

export interface Reponse {
  street: string; taille: string; act: string; allIn: boolean; prix: number; part: number; gainPayer: number;
  cat: string; modele: number; modelePage: number; actPage: string; pot: number; toCall: number;
}
export interface Partie { contrib: number; fin: string; street: string; derniere: string }

export function analyseDeals(seed: number, ks: number[]) {
  const parties: Partie[] = [], reponses: Reponse[] = [];
  const stats = newStats();
  for (const k of ks) {
    const d = deal(seed, k);
    for (const lbrFirst of [true, false]) {
      const lbr = makeLBR("exploiteur", sitePolicy, stats);
      let lbrHole: Hole = ["", ""], lastLbr: { label: string; street: string; allIn: boolean } | null = null;
      let last = { who: "", kind: "", street: "" }, lastAggr = "aucune";
      const lbrW: Player = {
        name: "exploiteur",
        begin: (role, info) => { lbrHole = info.hole; lastLbr = null; lbr.begin!(role, info); },
        observe: (v, ch) => lbr.observe!(v, ch),
        decide: (v, r, ctx) => {
          const c = lbr.decide(v, r, ctx);
          const aggr = c.kind === "bet" || c.kind === "raise";
          const max = v.legal.raise?.maxTo ?? (v.legal.bet ? v.legal.bet.max + v.myStreet : 0);
          const allIn = aggr && Math.abs((c.to ?? 0) - max) < 1e-9;
          const frac = aggr ? ((c.to ?? 0) - v.myStreet) / Math.max(1e-9, v.pot + v.toCall) : 0;
          lastLbr = aggr ? { label: allIn ? "tapis" : frac > 0.75 ? "pot" : "moitié du pot", street: v.street, allIn } : null;
          if (lastLbr) lastAggr = `${lastLbr.label} (${v.street.toLowerCase()})`;
          last = { who: "exploiteur", kind: c.kind, street: v.street };
          return c;
        },
      };
      const siteW: Player = {
        name: "site",
        decide: (v: View): Choice => {
          const c = decide(v);
          if (lastLbr && v.toCall > 0 && lastLbr.street === v.street) {
            const part = sharesVs(v.hole, v.board, [lbrHole])[0];
            const adv = v.street === "River" ? null : adviceFor(v, false), advP = v.street === "River" ? null : adviceFor(v, true);
            reponses.push({
              street: v.street, taille: lastLbr.label, act: c.kind, allIn: lastLbr.allIn || v.toCall >= v.remaining - 1e-9,
              prix: v.toCall / (v.pot + v.toCall), part, gainPayer: part * (v.pot + v.toCall) - v.toCall,
              cat: CATS[categoryOf(rank7([...v.hole, ...v.board]))],
              modele: adv ? adv.stats.handEquity / 100 : NaN, modelePage: advP ? advP.stats.handEquity / 100 : NaN,
              actPage: advP ? (advP.action as string) : "", pot: v.pot, toCall: v.toCall,
            });
          }
          lastLbr = null;
          last = { who: "site", kind: c.kind, street: v.street };
          return c;
        },
      };
      const g = playGame(d, lbrFirst ? [lbrW, siteW] : [siteW, lbrW], false);
      const [nl, ns] = lbrFirst ? [g.net[0], g.net[1]] : [g.net[1], g.net[0]];
      const fin = last.kind === "fold" ? (last.who === "site" ? "le site se couche" : "l'exploiteur se couche") : "abattage";
      parties.push({ contrib: (nl - ns) / 2, fin, street: last.street, derniere: lastAggr });
    }
  }
  return { parties, reponses };
}
