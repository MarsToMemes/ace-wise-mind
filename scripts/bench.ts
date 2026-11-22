// Bulletin de l'évaluateur (lot 7) : npm run bench          → affiche le bulletin
//                                  npm run bench -- --update → enregistre les décisions actuelles comme référence
// Lit seulement les fichiers du dépôt ; n'envoie rien, n'installe rien.
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { knownGames, type CheckResult } from "@/bench/knownGames";
import { sanityChecks } from "@/bench/sanity";
import { computeDecisions, diffDecisions, type Reference } from "@/bench/driftCases";
import { checkSolverTable } from "@/core/solverTableCheck";
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
say("1. Jeux à solution connue (solveur de fin de main)");
const known: CheckResult[] = knownGames();
for (const k of known) say(`   ${mark(k.ok)} ${k.name} : attendu ${f2(k.expected)}, obtenu ${f2(k.got)} (tolérance ${f2(k.tolerance)})`);
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
say("Non couvert ici : l'écart conseiller maison / solveur (brique 2) n'est pas encore mesuré.");
console.log(lines.join("\n"));
const failed = known.some(k => !k.ok) || bad.length > 0 || tab.length > 0;
process.exitCode = failed ? 1 : 0;
