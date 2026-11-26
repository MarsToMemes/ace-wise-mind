// Banc de test du solveur : une seule commande lance A1 (arbitre), A2 (mains aléatoires), A3 (cas figés) et écrit un
// rapport daté dans tests-solveur/rapports/.
//   npm run test:solveur                         tout (MAINS=20000 par défaut, GRAINE=20261125)
//   npm run test:solveur -- rejouer GRAINE MAIN  rejoue une main de A2 pas à pas
// Lecture seule sur le site : le banc importe le moteur, ne modifie aucun fichier de src/, n'écrit que dans rapports/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { controlesArbitre } from "./a1/controles";
import { runFuzz, type Divergence } from "./a2/fuzz";
import { ficheDe } from "./a2/bugs";
import { runCas } from "./a3/cas";
import { runA4 } from "./a4/equite";
import { runB1 } from "./b1/petitsJeux";
import { runB2 } from "./b2/spots";
import { runB4 } from "./b4/run";
import { runB3 } from "./b3/run";
import { petitsJeux, rivers } from "./b3/petits";

const root = resolve(process.cwd());
const args = process.argv.slice(2);

if (args[0] === "rejouer") {
  const seed = Number(args[1]), main = Number(args[2]);
  const r = runFuzz({ seed, hands: 1, onlyHand: main, advisors: true, trace: l => console.log(l) });
  for (const d of r.divergences) console.log(`   ✗ [${d.family}] étape ${d.step} : ${d.check} ${d.detail} — attendu ${d.expected}, obtenu ${d.got}`);
  if (!r.divergences.length) console.log("   aucun écart");
  process.exit(0);
}

const SEED = Number(process.env.GRAINE ?? 20261125);
const HANDS = Number(process.env.MAINS ?? 20000);
const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const L: string[] = [];
const fr = (x: number) => x.toLocaleString("fr-FR");

L.push(`# Banc de test du solveur — partie A (moteur de table, équité), B1 (petits jeux), B2 (tête-à-tête réel), B4 (matchs) et B3 (exploiteur, borne basse)`, "", `Rapport du ${now.toLocaleString("fr-FR")}. Graine de A2 : **${SEED}**, ${fr(HANDS)} mains.`, "");
L.push("Partie A : justesse du moteur de table, de ce que la page affiche et de l'équité, par comparaison à un arbitre indépendant. Partie B1 : convergence des solveurs sur des petits jeux à solution connue. Rien ici ne prouve qu'une stratégie du site est un équilibre sur les vrais spots (parties B2 à B5).", "");

// --- A1 ---
const a1 = controlesArbitre(root);
const a1ko = a1.filter(x => !x.ok);
L.push(`## A1 — Arbitre indépendant : ${a1.length - a1ko.length} / ${a1.length} contrôles réussis`, "");
for (const x of a1) L.push(`- ${x.ok ? "OK" : "**ÉCHEC**"} — ${x.quoi}${!x.ok && x.detail ? ` (${x.detail})` : ""}`);
L.push("");

// --- A2 ---
const a2 = runFuzz({ seed: SEED, hands: HANDS, advisors: true });
const groups = new Map<string, Divergence[]>();
for (const d of a2.divergences) { const k = d.check; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(d); }
const handsWith = (ds: Divergence[]) => new Set(ds.map(d => d.hand)).size;
L.push(`## A2 — Mains aléatoires : ${fr(a2.hands)} mains, ${fr(a2.actions)} actions, ${fr(a2.divergences.length)} écarts`, "");
L.push(`Durée ${(a2.ms / 1000).toFixed(1)} s. Abattages : ${fr(a2.showdowns)}. Actions interdites essayées sur le moteur : ${fr(a2.probes)}. Conseils contrôlés : ${fr(a2.advisorCalls)}.`, "");
L.push("**Couverture** (nombre de fois où le cas s'est présenté) :", "");
for (const [k, v] of Object.entries(a2.coverage).sort((a, b) => b[1] - a[1])) L.push(`- ${k} : ${fr(v)}`);
L.push("");
const fams: Divergence["family"][] = ["moteur", "abattage", "page", "conseil", "convention"];
L.push("| Famille | Écarts | Mains touchées |", "|---|---|---|");
for (const fam of fams) { const ds = a2.divergences.filter(d => d.family === fam); L.push(`| ${fam} | ${fr(ds.length)} | ${fr(handsWith(ds))} (${(100 * handsWith(ds) / a2.hands).toFixed(2).replace(".", ",")} %) |`); }
L.push("", "### Écarts par contrôle", "");
L.push("Chaque ligne : nombre d'écarts, mains touchées, premier exemple et commande pour le rejouer.", "");
for (const [k, ds] of [...groups].sort((a, b) => ficheDe(a[0]).gravite - ficheDe(b[0]).gravite || b[1].length - a[1].length)) {
  const d = ds[0];
  L.push(`- **[${d.family}] ${k}** — ${fr(ds.length)} écarts, ${fr(handsWith(ds))} mains. Exemple : main ${d.hand}, étape ${d.step}${d.detail ? `, ${d.detail}` : ""} : attendu ${d.expected}, obtenu ${d.got}. Rejouer : \`npm run test:solveur -- rejouer ${SEED} ${d.hand}\``);
}
L.push("");

// --- A3 ---
const a3 = runCas();
const a3ok = a3.filter(x => !x.erreur && x.verifs.every(v => v.ok)).length;
L.push(`## A3 — Cas figés : ${a3ok} / ${a3.length} réussis`, "");
for (const { cas, verifs, erreur } of a3) {
  const ok = !erreur && verifs.every(v => v.ok);
  L.push(`### ${cas.id} — ${ok ? "OK" : "ÉCHEC"} — ${cas.titre}`, "", `Origine : ${cas.origine}.`, "");
  if (erreur) L.push(`Erreur : ${erreur}`, "");
  L.push("| Vérification | Attendu | Obtenu | |", "|---|---|---|---|");
  for (const v of verifs) L.push(`| ${v.quoi} | ${v.attendu} | ${v.obtenu} | ${v.ok ? "OK" : "**ÉCHEC**"} |`);
  L.push("");
}

// --- A4 ---
const a4 = runA4();
const pc = (x: number) => (100 * x).toFixed(2).replace(".", ",");
const a4ok = a4.cas.filter(c => c.ok).length;
L.push(`## A4 — Équité multiway sans biais : ${a4ok} / ${a4.cas.length} cas sans biais détectable`, "");
L.push(`Fonction mesurée : \`handEquityMulti\` (équité de ta main contre tous les adversaires, utilisée par le conseiller postflop). Référence : énumération complète de toutes les combinaisons de mains adverses compatibles (pondérées) et de tous les boards restants. Site : ${a4.graines} graines × ${fr(a4.tirages)} tirages par ordre d'adversaires ; ± = erreur d'échantillonnage (écart-type des graines / √${a4.graines}) ; z = écart à l'exacte en erreurs types. Critère : |z| < 4 pour chaque ordre et écart entre ordres < 4 erreurs types.`, "");
L.push("| Cas | Joueurs | Exacte | Site, par ordre d'adversaires | Écart entre ordres | |", "|---|---|---|---|---|---|");
for (const c of a4.cas) {
  L.push(`| ${c.id} — ${c.titre} | ${c.joueurs} | ${pc(c.exacte)} % (${fr(c.tuples)} combinaisons, ${c.boards} boards) | ${c.mesures.map(m => `${m.ordre} : ${pc(m.moyenne)} ± ${pc(m.se)} (z ${m.z.toFixed(1).replace(".", ",")})`).join(" ; ")} | ${pc(c.ecartOrdres)} pts | ${c.ok ? "OK" : "**BIAIS**"} |`);
}
L.push("", "**Ordre des mains à l'abattage** (20 000 abattages tirés au hasard, comparés à l'évaluateur de l'arbitre) :", "");
for (const e of a4.evaluateurs) L.push(`- ${e.nom} : ${fr(e.desaccords)} désaccords sur ${fr(e.mains)} (${pc(e.desaccords / e.mains)} %)${e.exemples.length ? `. Exemples : ${e.exemples.join(" ; ")}` : ""}`);
const a4bOk = a4.casBase.filter(c => c.ok).length;
L.push("", `**Moteur de base (\`evaluateHandVsRange\`) : ${a4bOk} / ${a4.casBase.length} cas sans biais détectable.** Mêmes cas, mains adverses données directement (à poids égal, comme dans ce moteur) ; ${a4.graines} appels de ${fr(a4.tirages)} simulations par ordre ; résultat arrondi à 0,1 point par le site.`, "");
L.push("| Cas | Exacte (poids égaux) | Moteur de base, par ordre | Écart entre ordres | |", "|---|---|---|---|---|");
for (const c of a4.casBase) L.push(`| ${c.id} | ${pc(c.exacte)} % | ${c.mesures.map(m => `${m.ordre} : ${pc(m.moyenne)} ± ${pc(m.se)} (z ${m.z.toFixed(1).replace(".", ",")})`).join(" ; ")} | ${pc(c.ecartOrdres)} pts | ${c.ok ? "OK" : "**BIAIS**"} |`);
L.push("");

// --- B1 ---
const b1 = runB1();
const b1ok = b1.filter(c => c.ok).length;
const f5 = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(5).replace(".", ","));
L.push(`## B1 — Petits jeux à solution connue : ${b1ok} / ${b1.length} convergent`, "");
L.push("Exploitabilité exacte par meilleure réponse, calculée à part (tests-solveur/oracle/meilleureReponse.ts), comparée à celle que mesure le site ; valeur du jeu pour le premier joueur comparée à la théorie. Itérations cumulées.", "");
for (const c of b1) {
  L.push(`### ${c.id} — ${c.ok ? "OK" : "**ÉCHEC**"} — ${c.titre}`, "", `Unité : ${c.unite}. ${c.theorie ? `Théorie : ${c.theorie}. ` : ""}Critère : ${c.critere}.`, "");
  L.push("| Itérations | Exploitabilité (indépendante) | Exploitabilité (site) | Valeur 1er joueur | Écart à la théorie | Détail |", "|---|---|---|---|---|---|");
  for (const p of c.points) L.push(`| ${fr(p.iterations)} | ${f5(p.exploit)} | ${f5(p.site)} | ${p.valeur !== undefined ? p.valeur.toFixed(4).replace(".", ",") : "—"} | ${p.ecartValeur !== undefined ? p.ecartValeur.toFixed(4).replace(".", ",") : "—"} | ${p.extra ?? ""} |`);
  L.push("");
}

// --- B2 ---
const b2 = process.env.B2 === "0" ? [] : await runB2({ only: process.env.B2_SPOTS?.split(",") });
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3).replace(".", ",") : "—");
const b2tient = b2.filter(r => r.site.exploitIndep <= 0.3 + 1e-9).length;
if (b2.length) {
  L.push(`## B2 — Tête-à-tête réel (turn, river) : ${b2tient} / ${b2.length} spots sous 0,3 % du pot`, "");
  L.push("Stratégie affichée par le site : solveur de fin de main avec les réglages de la décision synthétique (précision visée 0,3 % du pot ; au plus 1 500 itérations et 3 s à la river ; à la turn, 1 000 itérations et 30 s, premier conseil affiché à 15 s, rivers réparties sur un ouvrier par cœur moins un (8 au plus), D41 ; rake cash). On mesure le conseil final. Exploitabilité exacte calculée à part (tests-solveur/oracle/hu.ts) sur le même arbre de mises, et comparée à celle que mesure le site ; solveur de référence écrit à part (CFR+) sur le même arbre. Les temps dépendent de la machine : à la turn, la limite de temps peut arrêter le calcul avant la précision visée.", "");
  L.push("| Spot | Mains (OOP / IP) | Site : itérations, temps | Exploitabilité du site (indépendante / site), % du pot | Perte en bb | solveEndgame (contrôle) | Référence : itérations, exploitabilité | Valeur OOP site / référence (bb) | 0,3 % tenu ? |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of b2) {
    L.push(`| ${r.spot.id} — ${r.spot.titre} (${r.spot.board.join("")}, pot ${r.spot.startPot}, tapis ${r.spot.stack}) | ${r.combos.join(" / ")} | ${fr(r.site.iterations)} it., ${(r.site.ms / 1000).toFixed(1).replace(".", ",")} s${r.site.atteint ? "" : " (arrêt : limite)"} | ${f3(r.site.exploitIndep)} / ${f3(r.site.exploitSite)} | ${f3((r.site.exploitIndep * r.spot.startPot) / 100)} | ${fr(r.solveEndgame.iterations)} it., ${f3(r.solveEndgame.exploitPct)} % | ${fr(r.ref.iterations)} it., ${f3(r.ref.exploit)} % | ${f3(r.site.ev0)} / ${f3(r.ref.ev0)} | ${r.site.exploitIndep <= 0.3 + 1e-9 ? "oui" : "**non**"} |`);
  }
  L.push("", "**Première décision (OOP), par action** : fréquence pour la range entière, site / référence, et EV moyenne (bb) des mains qui la jouent (affichée seulement si l'action est jouée au moins 2 % du temps des deux côtés).", "");
  for (const r of b2) {
    L.push(`- ${r.spot.id} : ${r.actions.map(a => `${a.action} ${(100 * a.freqSite).toFixed(1).replace(".", ",")} % / ${(100 * a.freqRef).toFixed(1).replace(".", ",")} %${a.freqSite >= 0.02 && a.freqRef >= 0.02 ? ` (EV ${f3(a.evSite)} / ${f3(a.evRef)})` : ""}`).join(" ; ")}`);
  }
  L.push("");
}

// --- B4 ---
const B4_DEALS = Number(process.env.B4_DEALS ?? 3000), B4_OLD = process.env.B4_ANCIENNE ?? "f85a236";
const b4 = process.env.B4 === "0" ? null : await runB4({ seed: SEED, deals: B4_DEALS, old: B4_OLD, selfDeals: 200,
  matches: [["actuelle", "ancienne"], ["actuelle", "toujours call"], ["actuelle", "serré"], ["actuelle", "agressif"]] });
if (b4) {
  const f1 = (x: number) => x.toFixed(1).replace(".", ",");
  const need = (sd: number) => fr(Math.ceil(((1.96 * sd * 100) / 5) ** 2));
  L.push(`## B4 — Matchs en duplicate : ${b4.lignes.length} matchs, ${fr(B4_DEALS)} donnes chacun`, "");
  L.push(`Joueur « site » : à partir du flop en tête-à-tête, conseiller maison au flop et à la turn, solveur de fin de main à la river (réglages du site, action la plus jouée par ta main), ranges de la ligne jouée (pot simple, ${"6"} paires de positions), rake cash dans les calculs. Écart avec le site : à la turn, le site utilise le solveur (jusqu'à 30 s), ici le conseiller maison. Version précédente : ${B4_OLD} (24 nov. 2026), extraite de git. Chaque donne est jouée deux fois, places échangées ; score = (gain de A − gain de B) / 2, sans rake, en bb pour 100 mains ; ± = intervalle de confiance à 95 %. Correction de la chance façon AIVAT, partielle (cartes du board seulement). ${b4.workers} fils de calcul.`, "");
  L.push(`Contrôle : la version actuelle contre elle-même sur ${b4.self.deals} donnes donne ${b4.self.maxAbs === 0 ? "exactement 0 (OK)" : `jusqu'à ${b4.self.maxAbs} bb (**ÉCHEC**)`}.`, "");
  L.push("| A contre B | Mains | Brut (bb/100) | Corrigé de la chance (bb/100) | Verdict (corrigé) | σ par main brut / corrigé | Variance restante | Mains pour ±5 bb/100 (brut / corrigé) | Refus de l'arbitre | Replis |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const l of b4.lignes) {
    const verdict = Math.abs(l.adj.bb100) <= l.adj.ci ? "pas de différence démontrée" : l.adj.bb100 > 0 ? "A gagne" : "B gagne";
    L.push(`| ${l.A} contre ${l.B} | ${fr(l.hands)} | ${f1(l.raw.bb100)} ± ${f1(l.raw.ci)} | ${f1(l.adj.bb100)} ± ${f1(l.adj.ci)} | ${verdict} | ${f1(l.raw.sdPerHand)} / ${f1(l.adj.sdPerHand)} bb | ${Math.round(l.reduction * 100)} % | ${need(l.raw.sdPerHand)} / ${need(l.adj.sdPerHand)} | ${fr(l.illegal)} sur ${fr(l.decisions)} | ${fr(l.fallbacks)} |`);
  }
  L.push("");
}

// --- B3 ---
const B3_DEALS = Number(process.env.B3_DEALS ?? 400), B3_PROFILS = Number(process.env.B3_PROFILS ?? 200), B3_CONTROLE = Number(process.env.B3_CONTROLE ?? 18);
const b3j = petitsJeux(), b3r = rivers();
const b3 = process.env.B3 === "0" ? null : await runB3({ seed: SEED, deals: B3_DEALS, baselineDeals: B3_PROFILS, checkDeals: B3_CONTROLE, onProgress: m => console.log(`B3 · ${m}`) });
{
  const f1 = (x: number) => x.toFixed(1).replace(".", ","), f4 = (x: number) => x.toFixed(4).replace(".", ",");
  L.push(`## B3 — Gros arbres : exploiteur (Local Best Response), borne basse`, "");
  L.push("**Ce chiffre est une borne basse, jamais un score de qualité.** L'exploiteur connaît la stratégie de l'adversaire (pas ses cartes), suit sa range en gardant les mains qui auraient fait les actions vues, et joue à chaque décision l'action la plus rentable en supposant que la main se finit ensuite en check (un coup d'avance ; tailles essayées : moitié du pot, pot, tapis). Ce qu'il gagne, un adversaire parfait le gagne au moins ; s'il gagne peu, ça ne prouve pas que la stratégie est solide (Lisý et Bowling, arXiv 1612.07547).", "");
  const jko = b3j.filter(l => !l.ok), rko = b3r.filter(l => !l.ok);
  L.push(`### Contrôles de l'exploiteur (meilleure réponse exacte connue)`, "");
  L.push(`Petits jeux (Kuhn, Leduc ; valeurs exactes, sans tirage) : **${b3j.length - jko.length} / ${b3j.length}** lignes où l'exploiteur ne dépasse pas la meilleure réponse${jko.length ? " — **ÉCHEC** : " + jko.map(l => `${l.jeu} ${l.strategie} J${l.joueur}`).join(", ") : ""}.`, "");
  L.push("| Jeu | Stratégie de l'adversaire | Joueur exploiteur | Valeur de la stratégie | Exploiteur | Meilleure réponse |", "|---|---|---|---|---|---|");
  for (const l of b3j) L.push(`| ${l.jeu} | ${l.strategie} | ${l.joueur + 1} | ${f4(l.ev)} | ${f4(l.lbr)} | ${f4(l.br)} |`);
  L.push("", `Rivers de B2 (stratégie du solveur du site, et « toujours check / payer » ; jetons par main, sans rake) : **${b3r.length - rko.length} / ${b3r.length}** sous la meilleure réponse${rko.length ? " — **ÉCHEC** : " + rko.map(l => `${l.spot} ${l.strategie} J${l.joueur}`).join(", ") : ""}. « Part trouvée » = (exploiteur − stratégie) / (meilleure réponse − stratégie) : la part du gain maximal que l'exploiteur trouve (négative s'il joue moins bien que la stratégie elle-même).`, "");
  L.push("| Spot | Stratégie | Joueur | Stratégie | Exploiteur | Meilleure réponse | Part trouvée |", "|---|---|---|---|---|---|---|");
  for (const l of b3r) L.push(`| ${l.spot} | ${l.strategie} | ${l.joueur === 0 ? "hors position" : "en position"} | ${f4(l.ev)} | ${f4(l.lbr)} | ${f4(l.br)} | ${Math.round(100 * l.part)} % |`);
  L.push("");
  if (b3) {
    const ck = b3.check;
    L.push(`### Contre le site et deux profils simples`, "");
    L.push(`Le site joue comme en B4 : conseiller maison au flop et à la turn, solveur de fin de main à la river (action la plus jouée par la main). Donnes de B4 (graine ${SEED}), jouées deux fois, places échangées ; score de l'exploiteur = (son gain − celui de la cible) / 2 par donne, sans rake, en bb pour 100 mains ; ± = intervalle de confiance à 95 %. ${b3.workers} fils de calcul.`, "");
    L.push(`Contrôle de la river lue en un seul calcul : ${fr(ck.same)} mains identiques à decide, ${fr(ck.diff)} différentes, sur ${fr(ck.nodes)} rivers (${fr(ck.deals)} donnes à part)${ck.diff ? ` — **ÉCHEC** : ${ck.fails.join(" ; ")}` : " (OK)"}.`, "");
    L.push("| Cible | Mains | Brut (bb/100) | Corrigé de la chance (bb/100) | Lecture | Vraie main hors de la range suivie | Range vide | Refus de l'arbitre | Durée |", "|---|---|---|---|---|---|---|---|---|");
    for (const l of b3.lignes) {
      const lo = l.adj.bb100 - l.adj.ci;
      const lecture = lo > 0 ? `faille démontrée : au moins ${f1(lo)} bb/100` : "aucune faille démontrée (ce qui ne prouve rien)";
      L.push(`| ${l.cible} | ${fr(l.hands)} | ${f1(l.raw.bb100)} ± ${f1(l.raw.ci)} | ${f1(l.adj.bb100)} ± ${f1(l.adj.ci)} | ${lecture} | ${fr(l.stats.horsRange)} sur ${fr(l.stats.observed)} | ${fr(l.stats.vide)} | ${fr(l.illegal)} sur ${fr(l.decisions)} | ${Math.round(l.ms / 60000)} min |`);
    }
    L.push("");
    for (const l of b3.lignes) {
      const acts = Object.entries(l.stats.actions).sort((a, b) => b[1] - a[1]).map(([a, x]) => `${a} ${fr(x)}`).join(", ");
      const rep = Object.entries(l.stats.reponses).map(([a, m]) => { const t = Object.values(m).reduce((x, y) => x + y, 0); return `${a} : ${Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, x]) => `${k} ${Math.round((100 * x) / t)} %`).join(", ")} (${fr(t)})`; }).join(" ; ");
      L.push(`- **${l.cible}** — actions de l'exploiteur : ${acts}. Réponses de la cible : ${rep || "—"}.`);
    }
    L.push("");
  }
}

// --- classement ---
L.push("## Bugs trouvés, du plus grave au moins grave (corrections proposées, NON appliquées)", "");
L.push("Gravité : 1 = montant ou légalité faux pour le jeu ; 2 = conseil ou saisie impossible ; 3 = conseil hors règle ou exploitable, sans effet sur les montants ; 4 = règle différente (convention à trancher).", "");
const seen = new Map<string, { fiche: ReturnType<typeof ficheDe>; checks: string[]; n: number; hands: number }>();
const biais = a4.cas.filter(c => !c.ok);
if (biais.length) {
  const pire = biais.reduce((a, b) => (b.ecartOrdres > a.ecartOrdres ? b : a));
  seen.set("A4-tirage", { fiche: { gravite: 1, cas: biais.map(c => c.id).join(", "),
    cause: `Équité multiway (handEquityMulti, conseiller postflop) : les mains adverses sont tirées l'une après l'autre (jusqu'à 20 essais chacune pour éviter les cartes déjà prises), ce qui ne respecte pas la distribution jointe des mains (D9) : le résultat dépend de l'ordre des adversaires. Pire cas mesuré : ${pc(pire.mesures[0].moyenne)} % ou ${pc(pire.mesures[1]?.moyenne ?? 0)} % selon l'ordre pour ${pc(pire.exacte)} % exacts (${pire.id}). Sur des ranges réalistes, l'écart reste sous 1 point mais il est mesurable.`,
    correction: "Tirer toutes les mains adverses d'un coup, chacune selon son poids, et recommencer tout le tirage dès que deux mains partagent une carte (tirage par rejet de la combinaison entière) : distribution jointe exacte, sans dépendance à l'ordre." }, checks: ["A4 équité multiway"], n: biais.length, hands: 0 });
}
const b2ko = b2.filter(r => r.site.exploitIndep > 0.3 + 1e-9);
if (b2ko.length) seen.set("B2-turn", { fiche: { gravite: 3,
  cause: `Solveur de fin de main : la stratégie affichée dépasse la précision annoncée (0,3 % du pot) sur ${b2ko.map(r => `${r.spot.id} (${f3(r.site.exploitIndep)} %${r.site.atteint ? "" : ", arrêt sur la limite de temps"})`).join(", ")}. La limite de temps a arrêté le calcul avant la précision visée.`,
  correction: "Au choix : prolonger le calcul à la turn (temps ou itérations), le répartir sur les cœurs (comme le multiway), réduire les ranges aux mains qui comptent, ou afficher la précision atteinte au lieu de « 0,3 % »." }, checks: [`B2, spots ${b2ko.map(r => r.spot.id).join(", ")}`], n: b2ko.length, hands: 0 });
const b3site = b3?.lignes.find(l => l.cible === "site");
if (b3site && b3site.adj.bb100 - b3site.adj.ci > 0) {
  const sh = b3site.stats.reponses["mise tapis"], tot = sh ? Object.values(sh).reduce((a, b) => a + b, 0) : 0;
  seen.set("B3-exploit", { fiche: { gravite: 3,
    cause: `Joueur « site » (conseiller maison au flop et à la turn, solveur à la river) exploitable : un exploiteur à un coup d'avance gagne au moins ${(b3site.adj.bb100 - b3site.adj.ci).toFixed(0)} bb/100 (${b3site.adj.bb100.toFixed(0)} ± ${b3site.adj.ci.toFixed(0)}, borne basse). Il fait souvent tapis${tot ? ` ; la cible se couche alors ${Math.round((100 * (sh.fold ?? 0)) / tot)} % du temps (${tot} fois)` : ""}. Sur les rivers de B2, contre le solveur seul, l'exploiteur ne trouve presque rien : la faille est au flop et à la turn.`,
    correction: "À examiner avant de corriger : découper le gain de l'exploiteur par street et par taille de mise. Pistes : faire répondre le conseiller aux grosses mises et aux tapis d'après la cote et une range adverse élargie (une mise inhabituelle ne vient pas seulement des mains fortes), ou passer la main au solveur de fin de main face à un tapis ; puis relancer B3." }, checks: ["B3 exploiteur contre le site"], n: 1, hands: 0 });
}
const biaisBase = a4.casBase.filter(c => !c.ok);
const evKo = a4.evaluateurs.filter(e => e.desaccords > 0);
if (biaisBase.length || evKo.length) seen.set("A4-base", { fiche: { gravite: 1, cas: biaisBase.map(c => c.id).join(", "),
  cause: `Moteur de base (evaluateHandVsRange) : biais d'équité mesuré (${biaisBase.map(c => c.id).join(", ") || "évaluateur"}).`,
  correction: "À examiner : rejouer les cas listés en A4." }, checks: ["A4 moteur de base"], n: biaisBase.length, hands: 0 });
for (const [k, ds] of groups) {
  const f = ficheDe(k);
  const key = f.cause;
  const e = seen.get(key) ?? { fiche: f, checks: [], n: 0, hands: 0 };
  e.checks.push(k); e.n += ds.length; e.hands += handsWith(ds);
  seen.set(key, e);
}
[...seen.values()].sort((a, b) => a.fiche.gravite - b.fiche.gravite || b.n - a.n).forEach((e, i) => {
  L.push(`${i + 1}. **Gravité ${e.fiche.gravite}** — ${e.fiche.cause}`, `   - Vu par : ${e.checks.join(" ; ")} (${fr(e.n)} écarts)${e.fiche.cas ? ` ; cas figés ${e.fiche.cas}` : ""}.`, `   - Correction proposée : ${e.fiche.correction}`);
});
L.push("");

L.push("## Ce que ces tests ne montrent pas", "");
L.push(
  "- B3 : une borne basse, pas une note. L'exploiteur ne voit qu'un coup d'avance et trois tailles de mise : un adversaire plus malin trouverait peut-être plus. Le préflop n'est pas joué ; à la turn, le site est joué par le conseiller maison et non par le solveur de 30 s (trop lent pour des centaines de mains) ; une relance de la cible est comptée comme un call dans ses calculs. Un intervalle qui touche zéro ne veut pas dire « inexploitable ».",
  "- B4 : le préflop n'est pas joué (ranges de départ fixées par la ligne : pot simple), la turn est jouée par le conseiller maison et non par le solveur, le joueur « site » prend l'action la plus jouée (pas la stratégie mixte) ; les profils simples sont des caricatures : les battre ne dit rien contre de bons joueurs. La correction de la chance ne porte que sur les cartes du board (pas sur les décisions, faute de stratégies complètes) : elle réduit peu la variance. Un intervalle qui contient zéro veut dire « pas de différence démontrée ».",
  "- B2 : 12 spots choisis à la main (ranges plausibles, pas celles que la page déduit d'une vraie main) ; la référence est un CFR+ écrit à part, poussé plus loin mais pas à zéro (son exploitabilité est donnée) ; le flop n'est pas résolu par le site (conseiller maison) et n'est pas mesuré ici ; les temps dépendent de la machine et de sa charge.",
  "- B1 montre que les solveurs convergent sur de petits jeux ; il ne dit rien des vrais spots (arbres plus gros, ranges réelles), ni du préflop (GTOpen), ni du conseiller maison, ni du multiway (aucun équilibre garanti au-delà de 2 joueurs) : parties B2 à B5. Leduc est joué par le CFR générique du site, qui n'est pas celui de la décision synthétique ; le solveur de la décision synthétique en tête-à-tête est mesuré sur Kuhn et deux rivers.",
  "- A4 : le moteur de base est mesuré avec des mains adverses données directement ; les ranges qu'il construit lui-même (profils « fort », « polarisé »…) ne sont pas jugées ici. L'équité du préflop (equityVsRange, tête-à-tête) et le solveur multiway exact ne sont pas mesurés ici. Les cas tirés au hasard sont volontairement extrêmes (adversaires qui se gênent beaucoup) : ils montrent le défaut, pas sa taille en jeu, que donnent les cas à ranges réalistes.",
  "- Que l'arbitre est juste : il est écrit à part et contrôlé sur des cas calculés à la main (A1), mais un même malentendu de règle dans l'arbitre et dans le site passerait inaperçu.",
  "- L'ante dans la page : le site ne la gère pas ; les mains avec ante ne comparent que le moteur de règles.",
  "- Ce que tu vois à l'écran : le banc lit les mêmes fonctions que la page (lib/siteView.ts) mais pas le rendu (textes, boutons) ni la saisie vocale.",
  "- Les mains saisies dans le désordre ou à partir du flop (pot tapé à la main) : le générateur saisit toujours toute la main, dans l'ordre.",
  "- Les conseils dans le détail : seule leur légalité est contrôlée (action permise, montant dans le tapis, rien quand la main est finie), pas leur qualité. Les conseillers sont appelés avec des ranges simples (top 40 %), pas celles de la page.",
  "- Les valeurs du héros (à payer, pot jouable, tapis effectif) ne sont comparées qu'à ton tour : entre-temps, la page suppose couchés ceux qui n'ont pas encore parlé.",
  "- Le rake : les comparaisons se font sans rake.",
  "- La dictée (voix ou texte) : elle enregistre « Tapis 100 » et des calls à 100 sans regarder les tapis saisis ; le pot et les conseils restent justes (moteur de règles), mais les étiquettes des sièges affichent ces montants.",
  "- Les mains revues depuis l'historique : l'historique ne garde qu'un tapis pour tous les sièges, une main revue peut donc différer de la main jouée.",
);
L.push("");

const dir = join(root, "tests-solveur", "rapports");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${stamp}.md`);
writeFileSync(file, L.join("\n"));
writeFileSync(join(dir, `${stamp}-ecarts.json`), JSON.stringify({ seed: SEED, hands: HANDS, divergences: a2.divergences }, null, 1));
console.log(`B3 : ${b3 ? b3.lignes.map(l => `${l.cible} ${l.adj.bb100.toFixed(1)}±${l.adj.ci.toFixed(1)}`).join(", ") : "sauté"}, contrôles ${b3j.filter(l => l.ok).length}/${b3j.length} + ${b3r.filter(l => l.ok).length}/${b3r.length} | B4 : ${b4 ? b4.lignes.map(l => `${l.B} ${l.adj.bb100.toFixed(1)}±${l.adj.ci.toFixed(1)}`).join(", ") : "sauté"} | B2 : ${b2tient}/${b2.length} sous 0,3 % | B1 : ${b1.filter(c => c.ok).length}/${b1.length} | A1 : ${a1.length - a1ko.length}/${a1.length} | A4 : ${a4ok}/${a4.cas.length} + ${a4.casBase.filter(c => c.ok).length}/${a4.casBase.length} sans biais | A2 : ${fr(a2.hands)} mains, ${fr(a2.divergences.length)} écarts (${fams.map(f => `${f} ${a2.divergences.filter(d => d.family === f).length}`).join(", ")}) | A3 : ${a3ok}/${a3.length}`);
console.log(`Rapport : tests-solveur/rapports/${stamp}.md`);
process.exitCode = a1ko.length || a3ok < a3.length || b1.some(c => !c.ok) || (b4 && b4.self.maxAbs !== 0) ? 1 : 0;
