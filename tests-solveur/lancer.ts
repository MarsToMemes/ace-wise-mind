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

L.push(`# Banc de test du solveur — partie A (moteur de table)`, "", `Rapport du ${now.toLocaleString("fr-FR")}. Graine de A2 : **${SEED}**, ${fr(HANDS)} mains.`, "");
L.push("Ce rapport mesure la justesse du moteur de table et de ce que la page affiche, par comparaison à un arbitre indépendant. Il ne dit rien de la qualité de la stratégie (partie B).", "");

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

// --- classement ---
L.push("## Bugs trouvés, du plus grave au moins grave (corrections proposées, NON appliquées)", "");
L.push("Gravité : 1 = montant ou légalité faux pour le jeu ; 2 = conseil ou saisie impossible ; 3 = conseil hors règle mais sans effet sur les montants ; 4 = règle différente (convention à trancher).", "");
const seen = new Map<string, { fiche: ReturnType<typeof ficheDe>; checks: string[]; n: number; hands: number }>();
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
  "- La qualité de la stratégie (préflop, conseiller postflop, solveurs) : c'est la partie B, pas encore lancée.",
  "- Que l'arbitre est juste : il est écrit à part et contrôlé sur des cas calculés à la main (A1), mais un même malentendu de règle dans l'arbitre et dans le site passerait inaperçu.",
  "- L'ante dans la page : le site ne la gère pas ; les mains avec ante ne comparent que le moteur de règles.",
  "- Ce que tu vois à l'écran : le banc lit les mêmes fonctions que la page (lib/siteView.ts) mais pas le rendu (textes, boutons) ni la saisie vocale.",
  "- Les mains saisies dans le désordre ou à partir du flop (pot tapé à la main) : le générateur saisit toujours toute la main, dans l'ordre.",
  "- Les conseils dans le détail : seule leur légalité est contrôlée (action permise, montant dans le tapis, rien quand la main est finie), pas leur qualité. Les conseillers sont appelés avec des ranges simples (top 40 %), pas celles de la page.",
  "- Les valeurs du héros (à payer, pot jouable, tapis effectif) ne sont comparées qu'à ton tour : entre-temps, la page suppose couchés ceux qui n'ont pas encore parlé.",
  "- Le rake : les comparaisons se font sans rake.",
);
L.push("");

const dir = join(root, "tests-solveur", "rapports");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${stamp}.md`);
writeFileSync(file, L.join("\n"));
writeFileSync(join(dir, `${stamp}-ecarts.json`), JSON.stringify({ seed: SEED, hands: HANDS, divergences: a2.divergences }, null, 1));
console.log(`A1 : ${a1.length - a1ko.length}/${a1.length} | A2 : ${fr(a2.hands)} mains, ${fr(a2.divergences.length)} écarts (${fams.map(f => `${f} ${a2.divergences.filter(d => d.family === f).length}`).join(", ")}) | A3 : ${a3ok}/${a3.length}`);
console.log(`Rapport : tests-solveur/rapports/${stamp}.md`);
process.exitCode = a1ko.length || a3ok < a3.length ? 1 : 0;
