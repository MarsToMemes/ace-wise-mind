// B3 — Fil de calcul : l'exploiteur joue des donnes en duplicate contre une cible (le site ou un profil simple).
import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { deal, duplicate, BASELINES, initRanges, type Player } from "../b4/match";
import { init, decide, ranges, type View } from "../b4/joueur";
import { makeLBR, newStats, type Policy } from "./lbr";
import { sitePolicy, simplePolicy, pstats, keyOfChoice, type Hole } from "./politique";

const wd = workerData as { cash100: string };
const cash = JSON.parse(readFileSync(wd.cash100, "utf8"));
initRanges(cash); init(cash);

const site: Player = { name: "site", decide: v => decide(v) };
const TARGETS: Record<string, { player: Player; policy: Policy }> = {
  site: { player: site, policy: sitePolicy },
  "toujours call": { player: BASELINES[0], policy: simplePolicy(BASELINES[0].decide) },
  "serré": { player: BASELINES[1], policy: simplePolicy(BASELINES[1].decide) },
};

/** Contrôle de la lecture de la river en un seul calcul : à chaque river jouée par le site, quelques mains comparées à decide. */
function riverCheck(n: { same: number; diff: number; nodes: number; fails: string[] }): Player {
  return {
    name: "site (contrôlé)",
    decide: (v: View) => {
      if (v.street === "River") {
        const inR = ranges(v)[v.me].filter(c => c.w > 0).map(c => c.cards as Hole).filter(h => !h.some(x => v.board.includes(x)));
        const pick = [...inR.filter((_, i) => i % Math.max(1, Math.floor(inR.length / 8)) === 0).slice(0, 8), v.hole];
        const fast = sitePolicy(v, pick);
        n.nodes++;
        pick.forEach((h, i) => {
          const slow = keyOfChoice(decide({ ...v, hole: h }));
          if (slow === fast[i]) n.same++; else { n.diff++; if (n.fails.length < 5) n.fails.push(`${v.board.join("")} ${h.join("")} : ${fast[i]} au lieu de ${slow}`); }
        });
      }
      return decide(v);
    },
  };
}

parentPort!.on("message", (t: { id: number; op: "play" | "check"; target: string; seed: number; ks: number[]; aivat: boolean }) => {
  try {
    if (t.op === "check") {
      const n = { same: 0, diff: 0, nodes: 0, fails: [] as string[] };
      const stats = newStats(), chk = riverCheck(n);
      for (const k of t.ks) duplicate(deal(t.seed, k), makeLBR("exploiteur", sitePolicy, stats), chk, false);
      parentPort!.postMessage({ id: t.id, check: n });
      return;
    }
    const T = TARGETS[t.target];
    const stats = newStats();
    const p0 = { ...pstats };
    const lbr = makeLBR("exploiteur", T.policy, stats);
    const res = t.ks.map(k => ({ k, ...duplicate(deal(t.seed, k), lbr, T.player, t.aivat) }));
    parentPort!.postMessage({ id: t.id, res, stats, policy: { asked: pstats.asked - p0.asked, riverSolves: pstats.riverSolves - p0.riverSolves, riverOne: pstats.riverOne - p0.riverOne } });
  } catch (e) { parentPort!.postMessage({ id: t.id, error: String((e as Error)?.stack ?? e) }); }
});
