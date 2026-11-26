// B4 — Fil de calcul : charge les joueurs (une version du site par paquet), joue les donnes qu'on lui confie.
import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deal, duplicate, BASELINES, initRanges, type Player } from "./match";

const req = createRequire(__filename);
const wd = workerData as { cash100: string; versions: Record<string, { bundle: string; cash100: string }> };
initRanges(JSON.parse(readFileSync(wd.cash100, "utf8")));
const players: Record<string, Player> = {};
for (const [name, v] of Object.entries(wd.versions)) {
  const m = req(v.bundle);
  m.init(JSON.parse(readFileSync(v.cash100, "utf8")));
  players[name] = { name, decide: (view, r) => m.decide(view, r) };
}
for (const b of BASELINES) players[b.name] = b;

parentPort!.on("message", (t: { id: number; A: string; B: string; seed: number; ks: number[]; aivat: boolean }) => {
  try {
    const res = t.ks.map(k => ({ k, ...duplicate(deal(t.seed, k), players[t.A], players[t.B], t.aivat) }));
    parentPort!.postMessage({ id: t.id, res });
  } catch (e) { parentPort!.postMessage({ id: t.id, error: String(e) }); }
});
