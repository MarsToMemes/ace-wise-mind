// Liste des nœuds vides d'une table de la bibliothèque (problème 2a) → tests/fixtures/empty-nodes.json.
//   npx vite-node --mode production scripts/empty-nodes.ts [cash100]
// La fixture sert de test de non-régression (src/test/emptyNodes.test.ts) : si la bibliothèque change, on régénère.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { emptyNodes } from "@/engines/emptyNodes";

const id = process.argv[2] ?? "cash100";
const g = JSON.parse(readFileSync(resolve("public/solver", `${id}.json`), "utf8"));
const list = emptyNodes(g);
mkdirSync(resolve("tests/fixtures"), { recursive: true });
writeFileSync(resolve("tests/fixtures/empty-nodes.json"), JSON.stringify({ table: id, total: g.spots.length, empty: list.length, nodes: list }, null, 1) + "\n");
console.log(`${id} : ${list.length} nœuds vides sur ${g.spots.length} → tests/fixtures/empty-nodes.json`);
