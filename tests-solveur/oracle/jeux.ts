// B1 — Petits jeux à solution connue, écrits à part (aucun import du site), sous forme d'arbre explicite.
// Kuhn : 3 cartes (V, D, R), ante 1, une mise de 1, valeur −1/18 pour le premier joueur (Kuhn 1950).
// Leduc : 6 cartes (V, D, R en deux exemplaires), ante 1, deux tours d'enchères (mise de 2 puis 4, au plus 2 mises par
// tour), une carte commune entre les deux ; une paire avec la carte commune gagne, sinon la plus haute ; valeur
// d'environ −0,0856 pour le premier joueur (Southey et al. 2005 ; jeu « leduc_poker » d'OpenSpiel).
import type { JNode } from "./meilleureReponse";

export function kuhn(): JNode {
  const cards = [0, 1, 2], deals: [number, number][] = [];
  for (const a of cards) for (const b of cards) if (a !== b) deals.push([a, b]);
  const show = (d: [number, number], pot: number): JNode => {
    const w = d[0] > d[1] ? 0 : 1;
    return { t: "terminal", payoffs: [w === 0 ? pot / 2 : -pot / 2, w === 1 ? pot / 2 : -pot / 2] };
  };
  const node = (d: [number, number], h: string): JNode => {
    const p = h.length % 2;
    const info = `${p}|${d[p]}|${h}`;
    if (h === "") return { t: "decision", player: 0, info, actions: ["check", "mise"], children: [node(d, "x"), node(d, "b")] };
    if (h === "x") return { t: "decision", player: 1, info, actions: ["check", "mise"], children: [show(d, 2), node(d, "xb")] };
    if (h === "b") return { t: "decision", player: 1, info, actions: ["couché", "payer"], children: [{ t: "terminal", payoffs: [1, -1] }, show(d, 4)] };
    // xb : le premier joueur répond à la mise
    return { t: "decision", player: 0, info, actions: ["couché", "payer"], children: [{ t: "terminal", payoffs: [-1, 1] }, show(d, 4)] };
  };
  return { t: "chance", outcomes: deals.map(d => ({ p: 1 / deals.length, child: node(d, "") })) };
}

export function leduc(): JNode {
  const deck = [0, 0, 1, 1, 2, 2];   // rangs ; deux exemplaires de chaque
  const out: { p: number; child: JNode }[] = [];
  const n = deck.length;
  // tour d'enchères : renvoie le sous-arbre ; `next` construit la suite quand le tour se ferme (mises égales)
  const round = (h: string, size: number, put: [number, number], raises: number, toAct: 0 | 1, priv: [number, number], pub: number | null,
    last: boolean, closeWith: (put: [number, number], h: string) => JNode, acted: boolean): JNode => {
    const info = `${toAct}|${priv[toAct]}|${pub ?? "-"}|${h}`;
    const opp = (1 - toAct) as 0 | 1;
    const facing = put[opp] > put[toAct];
    const actions: string[] = [], children: JNode[] = [];
    if (facing) {
      actions.push("couché");
      children.push({ t: "terminal", payoffs: toAct === 0 ? [-put[0], put[0]] : [put[1], -put[1]] });
      actions.push("payer");
      const p2: [number, number] = [...put] as [number, number]; p2[toAct] = put[opp];
      children.push(closeWith(p2, h + "c"));
      if (raises < 2) {
        actions.push("relance");
        const p3: [number, number] = [...put] as [number, number]; p3[toAct] = put[opp] + size;
        children.push(round(h + "r", size, p3, raises + 1, opp, priv, pub, last, closeWith, true));
      }
    } else {
      actions.push("check");
      children.push(acted ? closeWith(put, h + "k") : round(h + "k", size, put, raises, opp, priv, pub, last, closeWith, true));
      actions.push("mise");
      const p3: [number, number] = [...put] as [number, number]; p3[toAct] = put[opp] + size;
      children.push(round(h + "b", size, p3, raises + 1, opp, priv, pub, last, closeWith, true));
    }
    void last;
    return { t: "decision", player: toAct, info, actions, children };
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const priv: [number, number] = [deck[i], deck[j]];
    const rest = deck.filter((_, k) => k !== i && k !== j);
    const showdown = (put: [number, number], pub: number): JNode => {
      const pair = (c: number) => (c === pub ? 10 + c : c);
      const s0 = pair(priv[0]), s1 = pair(priv[1]);
      if (s0 === s1) return { t: "terminal", payoffs: [0, 0] };
      const w = s0 > s1 ? 0 : 1, l = 1 - w;
      const pay: [number, number] = [0, 0]; pay[w] = put[l]; pay[l] = -put[l];
      return { t: "terminal", payoffs: pay };
    };
    const second = (put: [number, number], h: string): JNode => ({
      t: "chance",
      outcomes: rest.map(pub => ({ p: 1 / rest.length, child: round(h + "/", 4, put, 0, 0, priv, pub, true, (p2) => showdown(p2, pub), false) })),
    });
    out.push({ p: 1 / (n * (n - 1)), child: round("", 2, [1, 1], 0, 0, priv, null, false, second, false) });
  }
  return { t: "chance", outcomes: out };
}
