// Promotion contrôlée des tables du solveur (lot 8).
//   npm run promote -- list            tables en service, candidates et archives
//   npm run promote -- check cash100   contrôle et rapport de la candidate solver-candidates/cash100.json
//   npm run promote -- apply cash100   met la candidate en service (si le contrôle passe), archive l'ancienne ;
//                                      avec des points d'attention, il faut ajouter --accepte-les-avertissements
//   npm run promote -- rollback cash100  remet en service la dernière table archivée
// Une candidate s'importe avec : python3 scripts/import_gtopen.py SORTIE --only cash100 --meta fiche.json --dst solver-candidates
// Rien n'est envoyé : l'envoi sur GitHub reste une étape à part.
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { checkCandidate, applyCandidate, rollback, LIVE, CANDIDATES, ARCHIVE } from "@/bench/promotion";

const root = process.cwd();
const [cmd, id] = process.argv.slice(2);
const pad = (n: number) => String(n).padStart(2, "0");
const d = new Date();
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const ls = (dir: string, f: (x: string) => boolean) => (existsSync(resolve(root, dir)) ? readdirSync(resolve(root, dir)).filter(f).sort() : []);

try {
  if (cmd === "list" || !cmd) {
    console.log("En service :", ls(LIVE, x => x.endsWith(".json") && !x.includes("manifest") && x !== "index.json").join(", ") || "aucune");
    console.log("Candidates :", ls(CANDIDATES, x => x.endsWith(".json") && !x.includes("manifest") && x !== "index.json").join(", ") || "aucune");
    console.log("Archives   :", ls(ARCHIVE, () => true).join(", ") || "aucune");
  } else if (!id) {
    throw new Error("Précise la table, par exemple : npm run promote -- check cash100");
  } else if (cmd === "check") {
    const c = checkCandidate(root, id);
    console.log(c.report || c.blocking.join("\n"));
    console.log(!c.ok ? "\nVerdict : refusée." : c.warnings.length
      ? `\nVerdict : contrôles OK, mais ${c.warnings.length} point(s) d'attention à lire avant de décider.`
      : `\nVerdict : la candidate peut être mise en service (npm run promote -- apply ${id}).`);
    process.exitCode = c.ok ? 0 : 1;
  } else if (cmd === "apply") {
    const r = applyCandidate(root, id, stamp, { acceptWarnings: process.argv.includes("--accepte-les-avertissements") });
    console.log(r.report);
    console.log(`\nMise en service faite. Ancienne table archivée dans ${r.archivedTo.replace(root + "/", "")}.`);
  } else if (cmd === "rollback") {
    const r = rollback(root, id, stamp);
    console.log(`Table remise en service depuis ${r.restoredFrom.replace(root + "/", "")}.`);
  } else throw new Error(`Commande inconnue : ${cmd} (list, check, apply, rollback)`);
} catch (e) {
  console.error(String((e as Error).message ?? e));
  process.exitCode = 1;
}
