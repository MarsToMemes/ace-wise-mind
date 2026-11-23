// Bulletin de l'évaluateur (lot 7) : npm run bench             → affiche le bulletin (quelques secondes)
//                                  npm run bench -- --update    → enregistre les décisions actuelles comme référence
//                                  npm run bench -- --advisor   → ajoute la comparaison maison / solveur (quelques minutes)
// Lit seulement les fichiers du dépôt ; n'envoie rien, n'installe rien.
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { knownGames, kuhnChecks, river3Checks, type CheckResult } from "@/bench/knownGames";
import { sanityChecks } from "@/bench/sanity";
import { computeDecisions, diffDecisions, type Reference } from "@/bench/driftCases";
import { checkSolverTable } from "@/core/solverTableCheck";
import { compareAdvisorSolver, summarize, type Summary } from "@/bench/advisorVsSolver";
import type { SolverGame } from "@/engines/solverSpots";

const root = process.cwd();
const REF = resolve(root, "src/bench/reference.json");
const g: SolverGame = JSON.parse(readFileSync(resolve(root, "public/solver/cash100.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "public/solver/cash100.manifest.json"), "utf8"));
const f2 = (x: number) => (Math.round(x * 1000) / 10).toFixed(1).replace(".", ",") + " %";
const mark = (ok: boolean) => (ok ? "OK " : "KO ");
const lines: string[] = [];
const say = (s = "") => lines.push(s);

say("Bulletin Ace Analyst");
say("====================");
say();
say("1. Jeux à solution connue (solveur de fin de main, solveur multiway)");
const known: CheckResult[] = [...knownGames(), ...kuhnChecks(), ...river3Checks()];
const fmt = (k: CheckResult, x: number) => (k.unit === "jetons" ? `${x.toFixed(5).replace(".", ",")}${k.name.includes("(bb)") ? " bb" : " jeton"}` : f2(x));
for (const k of known) say(`   ${mark(k.ok)} ${k.name} : attendu ${fmt(k, k.expected)}, obtenu ${fmt(k, k.got)} (tolérance ${fmt(k, k.tolerance)})`);
say();
say("   Mains évidentes (table préflop cash 100 bb)");
const sane = sanityChecks(g);
const bad = sane.filter(s => !s.ok);
say(`   ${mark(!bad.length)} ${sane.length - bad.length} / ${sane.length} contrôles passent`);
for (const s of bad) say(`      KO ${s.name} (obtenu ${f2(s.got)})`);
say();
say("2. Table préflop cash 100 bb");
const tab = checkSolverTable(g as never);
const rare = g.spots.filter(s => (s as { r?: number }).r).length;
say(`   ${mark(!tab.length)} contrôle d'intégrité : ${tab.length ? `${tab.length} problème(s)` : "aucun problème"}`);
say(`   ${g.spots.length} lignes, dont ${rare} rares (${Math.round((rare / g.spots.length) * 100)} %)`);
say(`   ${manifest.solve?.iterations} itérations, écart ${String(Math.round((manifest.solve?.gap ?? 0) * 10000) / 10000).replace(".", ",")} bb par main (mesuré par GTOpen)`);
say();
say("3. Dérive des décisions (jeu fixe de mains types)");
const cur = computeDecisions(g);
if (process.argv.includes("--update")) {
  writeFileSync(REF, JSON.stringify({ version: 1, decisions: cur } satisfies Reference, null, 1) + "\n");
  say(`   Référence enregistrée : ${cur.length} décisions (src/bench/reference.json).`);
} else {
  let ref: Reference | null = null;
  try { ref = JSON.parse(readFileSync(REF, "utf8")); } catch { /* pas encore de référence */ }
  if (!ref) say("   Pas encore de référence : lancer « npm run bench -- --update ».");
  else {
    const d = diffDecisions(cur, ref.decisions);
    const n = d.changed.length + d.added.length + d.removed.length;
    say(`   ${mark(!n)} ${cur.length} décisions, ${d.changed.length} changée(s), ${d.added.length} nouvelle(s), ${d.removed.length} retirée(s)`);
    for (const c of d.changed) say(`      ${c.what}\n         avant : ${c.before}\n         après : ${c.after}`);
    for (const c of d.added) say(`      nouvelle : ${c.what} → ${c.result}`);
    for (const c of d.removed) say(`      retirée : ${c.what}`);
  }
}
say();
if (process.argv.includes("--advisor")) {
  say("4. Conseiller maison contre solveur de fin de main (turn et river, tête-à-tête, rake cash)");
  const t0 = Date.now();
  const rows = [
    ...compareAdvisorSolver(g, { river: 200, turn: 0, seed: 1, iterations: 250 }),
    ...compareAdvisorSolver(g, { river: 0, turn: 12, seed: 2, iterations: 80 }),
  ];
  const bb = (x: number) => (Math.round(x * 100) / 100).toFixed(2).replace(".", ",");
  const pc = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");
  const line = (s: Summary) => `   ${s.category.padEnd(42)} ${String(s.n).padStart(4)} situations · accord ${String(s.agreePct).padStart(3)} % · perte ${bb(s.lossBB)} bb (${pc(s.lossPctPot)} % du pot)`;
  say(line({ ...summarize(rows, () => "Ensemble")[0] }));
  say();
  say("   Par situation :");
  for (const s of summarize(rows).sort((a, b) => b.lossPctPot - a.lossPctPot)) say(line(s));
  say();
  say("   Par force de ta main (selon le conseiller) :");
  for (const s of summarize(rows, r => r.role).sort((a, b) => b.lossPctPot - a.lossPctPot)) say(line(s));
  say();
  say("   Les 6 plus grosses pertes :");
  for (const r of [...rows].sort((a, b) => b.loss / b.pot - a.loss / a.pot).slice(0, 6)) {
    say(`   - ${r.category}, ${r.describe} (main ${r.role}, pot ${bb(r.pot)} bb)`);
    say(`       maison : ${r.house} · solveur : ${r.solver} · perte ${bb(r.loss)} bb`);
  }
  say();
  say(`   ${rows.length} situations en ${Math.round((Date.now() - t0) / 1000)} s. Accord = le solveur joue le conseil maison au moins 20 % du temps.`);
  say("   Perte = ce que le conseil maison rapporte de moins que la meilleure action du solveur, pour ta main.");
  say("   Turn : calcul plus court (80 itérations), résultats moins précis.");
} else {
  say("Comparaison maison / solveur : « npm run bench -- --advisor » (quelques minutes).");
}
console.log(lines.join("\n"));
const failed = known.some(k => !k.ok) || bad.length > 0 || tab.length > 0;
process.exitCode = failed ? 1 : 0;
