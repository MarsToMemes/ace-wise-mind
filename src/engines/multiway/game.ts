// Jeu à n joueurs sous forme d'arbre explicite (étape 1 du solveur multiway) : nœuds de hasard, nœuds de décision
// regroupés en ensembles d'information (`info` : ce que le joueur sait — ses cartes et l'historique public),
// nœuds terminaux avec le gain net de chaque joueur. Sans interface ; utilisé par cfr.ts et bestResponse.ts.

export type Node =
  | { t: "chance"; outcomes: { p: number; child: Node }[] }
  | { t: "decision"; player: number; info: string; actions: string[]; children: Node[] }
  | { t: "terminal"; payoffs: number[] };

export interface Game { name: string; players: number; root: Node }

/** Stratégie de chaque ensemble d'information (probabilités des actions) ; undefined : uniforme. */
export type Profile = (info: string) => number[] | undefined;

export const uniform = (k: number) => Array(k).fill(1 / k);
export const probs = (prof: Profile, n: Extract<Node, { t: "decision" }>) => prof(n.info) ?? uniform(n.actions.length);
