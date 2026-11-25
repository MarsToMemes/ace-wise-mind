// A1 — Contrôles de l'arbitre lui-même : situations dont le résultat se calcule à la main, et vérification qu'il
// n'importe rien du site. Si l'arbitre échoue ici, aucune comparaison avec le site ne vaut.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Table, c, bbOf } from "../oracle/regles";
import { best, score5, categoryOfScore } from "../oracle/evaluateur";

export interface Controle { quoi: string; ok: boolean; detail: string }
const K = (quoi: string, ok: boolean, detail = ""): Controle => ({ quoi, ok, detail });

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? filesUnder(p) : [p]; });
}

export function controlesArbitre(root: string): Controle[] {
  const out: Controle[] = [];
  // --- indépendance : l'arbitre et ses outils n'importent rien du site ; le site n'importe pas le banc ---
  for (const dir of ["tests-solveur/oracle", "tests-solveur/outils"]) {
    const bad = filesUnder(join(root, dir)).filter(f => /from\s+["'](@\/|.*\/src\/)/.test(readFileSync(f, "utf8")));
    out.push(K(`${dir} n'importe aucun fichier du site`, bad.length === 0, bad.join(", ")));
  }
  const leak = filesUnder(join(root, "src")).filter(f => /(from\s+|import\(\s*)["'][^"']*tests-solveur/.test(readFileSync(f, "utf8")));
  out.push(K("aucun fichier de src/ n'importe le banc de test", leak.length === 0, leak.join(", ")));

  // --- évaluateur : ordres connus ---
  const h = (s: string) => best(s.split(" "));
  const order: [string, string][] = [
    ["As Ks Qs Js Ts 2c 3d", "9h 9d 9c 9s Ah 2c 3d"],      // quinte flush royale > carré
    ["9h 9d 9c 9s 2h 2c 3d", "Ah Ad Ac Kh Kd 2c 3d"],      // carré > full
    ["Ah Ad Ac Kh Kd 2c 3d", "Ah Qh 9h 5h 2h Kc Kd"],      // full > couleur
    ["Ah Qh 9h 5h 2h Kc Kd", "6c 5d 4h 3s 2c Kh Kd"],      // couleur > quinte
    ["6c 5d 4h 3s 2c Kh Qd", "5c 4d 3h 2s Ac Kh Qd"],      // quinte au 6 > roue
    ["5c 4d 3h 2s Ac Kh Qd", "Qc Qd Qh 9s 2c 3h 4d"],      // roue > brelan
    ["Ah Ad Kh Kd 3c 2s 7h", "Ah Ad Qh Qd Kc 2s 7h"],      // AA KK > AA QQ (kicker K)
    ["Ah Kd 9c 7s 5h 3d 2c", "Ah Qd 9c 7s 5h 3d 2c"],      // hauteur as, kicker roi
  ];
  order.forEach(([a, b]) => out.push(K(`évaluateur : ${a} bat ${b}`, h(a) > h(b))));
  out.push(K("évaluateur : égalité quand le board joue", h("2c 3d As Ks Qs Js Ts") === h("4h 5d As Ks Qs Js Ts")));
  out.push(K("évaluateur : catégories", categoryOfScore(score5(["As", "Ks", "Qs", "Js", "Ts"])) === 8 && categoryOfScore(score5(["5c", "4d", "3h", "2s", "Ac"])) === 4));

  // --- règles : situations calculées à la main ---
  {
    const t = new Table({ n: 6, dealer: 3, stacks: Array(6).fill(100) });
    out.push(K("préflop 6-max : UTG parle en premier", t.toAct === 0, `parle : ${t.toAct}`));
    t.apply({ seat: 0, kind: "raise", to: c(2.5) });
    out.push(K("après 2,5 : relance minimale 4 bb", t.legal()!.raise!.minTo === c(4), `${bbOf(t.legal()!.raise!.minTo)}`));
    out.push(K("relance à 3 refusée", t.apply({ seat: 1, kind: "raise", to: c(3) }) !== null));
  }
  {
    const t = new Table({ n: 2, dealer: 0, stacks: [100, 100] });
    out.push(K("tête-à-tête : le bouton (SB) parle en premier au préflop", t.toAct === 0));
    t.apply({ seat: 0, kind: "call" }); t.apply({ seat: 1, kind: "check" });
    t.nextStreet();
    out.push(K("tête-à-tête : la BB parle en premier après le flop", t.toAct === 1));
    out.push(K("mise minimale après le flop : 1 bb", t.legal()!.bet!.min === c(1)));
  }
  {
    // tapis incomplet : UTG 3, MP tapis 4 (+1 < relance de 2) : UTG ne peut que payer ; CO peut relancer à 6
    const t = new Table({ n: 6, dealer: 3, stacks: [100, 4, 100, 100, 100, 100] });
    t.apply({ seat: 0, kind: "raise", to: c(3) });
    t.apply({ seat: 1, kind: "raise", to: c(4) });
    out.push(K("après un tapis incomplet, le suivant peut relancer (minimum 6)", t.legal()!.raise?.minTo === c(6), JSON.stringify(t.legal())));
    t.apply({ seat: 2, kind: "fold" }); t.apply({ seat: 3, kind: "fold" }); t.apply({ seat: 4, kind: "fold" }); t.apply({ seat: 5, kind: "fold" });
    out.push(K("tapis incomplet : UTG, qui avait déjà parlé, peut seulement payer ou se coucher", t.toAct === 0 && !t.legal()!.raise, JSON.stringify(t.legal())));
  }
  {
    // pots annexes : UTG tapis 80, MP paie (150), BTN paie à tapis (30), blindes couchées
    const t = new Table({ n: 6, dealer: 3, stacks: [80, 150, 100, 30, 100, 100] });
    t.apply({ seat: 0, kind: "raise", to: c(80) }); t.apply({ seat: 1, kind: "call" }); t.apply({ seat: 2, kind: "fold" });
    t.apply({ seat: 3, kind: "call" }); t.apply({ seat: 4, kind: "fold" }); t.apply({ seat: 5, kind: "fold" });
    const p = t.pots();
    out.push(K("pot total 191,5", t.pot === c(191.5), `${bbOf(t.pot)}`));
    out.push(K("pot principal 91,5 (30 × 3 + 1,5 de blindes) pour UTG, MP, BTN ; pot annexe 100 pour UTG et MP",
      p.length === 2 && p[0].amount === c(91.5) && p[0].eligible.join() === "0,1,3" && p[1].amount === c(100) && p[1].eligible.join() === "0,1", JSON.stringify(p)));
    out.push(K("main finie (plus personne ne peut miser)", t.handOver()));
  }
  {
    // mise rendue : BTN mise 50 au flop, BB n'a plus que 20
    const t = new Table({ n: 2, dealer: 0, stacks: [100, 21] });
    t.apply({ seat: 0, kind: "call" }); t.apply({ seat: 1, kind: "check" }); t.nextStreet();
    t.apply({ seat: 1, kind: "check" }); t.apply({ seat: 0, kind: "bet", to: c(50) }); t.apply({ seat: 1, kind: "call" });
    const p = t.pots();
    out.push(K("mise rendue : 30 bb reviennent au bouton", p.some(x => x.refund && x.amount === c(30) && x.eligible[0] === 0), JSON.stringify(p)));
    const pay = t.payouts(i => (i === 1 ? 2 : 1));
    out.push(K("répartition : la BB gagne 42, le bouton récupère 30", pay[1] === c(42) && pay[0] === c(30), JSON.stringify(pay)));
  }
  {
    // partage exact
    const t = new Table({ n: 3, dealer: 0, stacks: [10, 10, 10] });
    t.apply({ seat: 0, kind: "raise", to: c(10) }); t.apply({ seat: 1, kind: "call" }); t.apply({ seat: 2, kind: "call" });
    const pay = t.payouts(() => 1);
    out.push(K("égalité à trois : chacun récupère 10", pay.every(x => x === c(10)), JSON.stringify(pay)));
  }
  {
    // pas de relance quand tous les autres sont à tapis
    const t = new Table({ n: 2, dealer: 0, stacks: [100, 40] });
    t.apply({ seat: 0, kind: "raise", to: c(3) }); t.apply({ seat: 1, kind: "raise", to: c(40) });
    out.push(K("face au tapis du seul adversaire : payer ou se coucher", t.toAct === 0 && !t.legal()!.raise && t.legal()!.call === c(37)));
  }
  return out;
}
