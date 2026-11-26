// B5 — Fil de calcul : charge les versions du site (un paquet par version) et joue les donnes qu'on lui confie.
import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dealN, duplicateN, initRanges, type MPlayer } from "./match";
import { BASELINES } from "../b4/match";

const req = createRequire(__filename);
const wd = workerData as { cash100: string; versions: Record<string, { bundle: string; cash100: string }> };
initRanges(JSON.parse(readFileSync(wd.cash100, "utf8")));
const players: Record<string, MPlayer> = {};
for (const [name, v] of Object.entries(wd.versions)) {
  const m = req(v.bundle);
  m.init(JSON.parse(readFileSync(v.cash100, "utf8")));
  players[name] = { name, decide: (view, r) => m.decide(view, r) };
}
// profils simples de B4 : ils ne lisent que des champs communs (à payer, coups permis, pot, cartes, board)
for (const b of BASELINES) players[b.name] = { name: b.name, decide: (v, r) => b.decide(v as never, r) };

parentPort!.on("message", (t: { id: number; A: string; B: string; n: number; seed: number; ks: number[] }) => {
  try {
    const res = t.ks.map(k => ({ k, ...duplicateN(dealN(t.seed, k, t.n), players[t.A], players[t.B]) }));
    parentPort!.postMessage({ id: t.id, res });
  } catch (e) { parentPort!.postMessage({ id: t.id, error: String((e as Error)?.stack ?? e) }); }
});
