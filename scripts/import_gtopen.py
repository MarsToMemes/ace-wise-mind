#!/usr/bin/env python3
"""Convertit les résultats GTOpen en données compactes pour le site, avec une fiche d'origine par table.

Usage :
  python3 scripts/import_gtopen.py SRC [--only cash100,bvb40] [--meta meta.json] [--dst public/solver]

  SRC     dossier des sorties brutes (un <id>.json par table, format de run.extract de gtopen-batch)
  --only  n'importe que ces tables
  --meta  informations hors de la sortie brute, par table : {"cash100": {"generator": {...}, "run": {...}, "notes": [...]}}
  --dst   dossier de sortie (par défaut public/solver du dépôt)

Pour chaque table acceptée, écrit :
  <id>.json           la table : { "id", "kind", "stack", "ante", "positions", "iterations", "gap", "spots" }
                      spot : { "k": "UTG:F,MP:R2.5", "a": "CO", "acts": ["F","C","R7.5"], "f": [77,0,23], "h": { "AA": [0,0,100] } }
                      (pourcentages : f à 0,1 point, h entiers ; mains atteintes à plus de 0,1 % seulement)
  <id>.manifest.json  la fiche d'origine : config brute du calcul, jeu (rake, blindes), arbre, modèle, résultat
                      du calcul, conventions d'export, empreinte sha256 de la table, générateur et machine.
et met à jour index.json en gardant les autres tables.

Une table qui échoue aux contrôles (lignes uniques, codes d'action, fréquences à 100 %, mains, joueurs,
filiation des lignes) ou dont la fiche contiendrait un chemin personnel n'est pas écrite ; le script
rend alors le code 1. Rien ne se passe à l'import du module : seulement quand on le lance.
"""
import argparse, glob, hashlib, json, os, re, sys

DST_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "solver")
SCHEMA = 1
LABELS = {"mtt": "MTT", "bvb": "Blinde contre blinde", "cash": "Cash"}
ORDER = {"mtt": 0, "bvb": 1, "cash": 2}

ACTION = re.compile(r"^(F|X|C|L|[RA]\d+(\.\d+)?)$")
RANKS = "23456789TJQKA"
HANDS = {RANKS[i] + RANKS[j] + ("" if i == j else s)
         for i in range(13) for j in range(i + 1) for s in (("",) if i == j else ("s", "o"))}
PERSONAL = re.compile(r"(/Users/|/home/|[A-Za-z]:\\\\Users\\\\)")

GAP_DEFINITION = ("Somme, sur tous les sièges, du gain d'une meilleure réponse, en bb par main, mesurée dans le jeu "
                  "décrit par cette fiche (arbre, rake, modèle d'après-flop). Elle ne mesure pas l'erreur du modèle "
                  "d'après-flop lui-même.")
BRANCH_MIN_DEFAULT = 0.002  # seuil de run.extract quand la sortie brute ne le précise pas


def export_for(raw):
    """Conventions d'export ; le seuil d'élagage vient de la sortie brute (« branch_min »)."""
    m = raw.get("branch_min", BRANCH_MIN_DEFAULT)
    pct = f"{m * 100:g}".replace(".", ",")
    first = ("toutes les actions sont développées, même celles que la stratégie ne joue jamais" if m <= 0
             else f"une action n'est développée que si sa fréquence globale atteint {pct} %")
    return {
        "freqRoundingPts": 0.1,
        "handRoundingPts": 1,
        "handsListed": "mains atteintes à plus de 0,1 % dans ce nœud",
        "branchMinFreq": m,
        "branches": first + " ; au plus 4 relances ; rien n'est développé après le call d'un 3-bet ou plus",
        "importer": "scripts/import_gtopen.py",
    }


def short(label, kind):
    if kind == "fold": return "F"
    if kind == "check": return "X"
    if kind in ("call", "limp"):
        return "L" if kind == "limp" or label.lower().startswith("limp") else "C"
    # montant final en bb = DERNIER nombre du libellé ("3-bet 7.5" → 7.5, pas le 3 de « 3-bet »)
    nums = re.findall(r"\d+(?:\.\d+)?", label)
    amt = nums[-1] if nums else ""
    if kind == "jam" or "all-in" in label.lower(): return "A" + amt
    return "R" + amt


def kind_of(label):
    """Type d'action d'après son libellé GTOpen ("Fold", "Call 2.5", "Limp", "Raise 2.5", "3-bet 7.5", "All-in 100"…)."""
    l = label.lower()
    if l == "fold": return "fold"
    if l == "check": return "check"
    if l.startswith("limp") or l.startswith("complete"): return "limp"
    if l.startswith("call"): return "call"
    if "all-in" in l: return "jam"
    return "raise"


def convert(d):
    """Sortie brute → table compacte du site (format inchangé)."""
    gid = d["id"]
    spots = []
    for s in d["spots"]:
        acts = [short(l, k) for l, k in zip(s["actions"], s["kinds"])]
        # clé de ligne : actions déjà jouées, au même format court
        key = ",".join(f"{p}:{short(lbl, kind_of(lbl))}" for p, lbl in s["line"])
        h = {hand: [round(x * 100) for x in probs] for hand, probs in s["hands"].items()}
        spots.append({"k": key, "a": s["actor"], "acts": acts, "f": [round(x * 100, 1) for x in s["freqs"]], "h": h})
    cfg = d["config"]
    kind = re.match(r"[a-z]+", gid).group(0)
    return {"id": gid, "kind": kind, "stack": cfg["stack"], "ante": cfg.get("ante", 0), "positions": cfg["positions"],
            "iterations": d.get("iterations"), "gap": d.get("gap"), "spots": spots}


def check_row(row, tol):
    out = []
    if any(not isinstance(x, (int, float)) or x < -tol or x > 100 + tol for x in row):
        out.append(f"FREQ_RANGE {row}")
    if abs(sum(row) - 100) > tol:
        out.append(f"FREQ_SUM {round(sum(row), 2)}")
    return out


def check_table(t):
    """Mêmes contrôles que src/core/solverTableCheck.ts. Rend la liste des problèmes (vide si la table est saine)."""
    problems, by_key, positions = [], {}, set(t["positions"])
    for s in t["spots"]:
        if s["k"] in by_key: problems.append(f"DUP_KEY [{s['k']}]")
        by_key[s["k"]] = s
    for s in t["spots"]:
        where = f"[{s['k'] or 'début'}]"
        if s["a"] not in positions: problems.append(f"BAD_ACTOR {where} {s['a']}")
        bad = [a for a in s["acts"] if not ACTION.match(a)]
        if bad: problems.append(f"BAD_ACTION {where} {bad}")
        if len(s["f"]) != len(s["acts"]): problems.append(f"ROW_LENGTH {where} fréquences globales")
        problems += [f"{p} {where} fréquences globales" for p in check_row(s["f"], 1)]
        for hand, row in s["h"].items():
            if hand not in HANDS: problems.append(f"BAD_HAND {where} {hand}"); continue
            if len(row) != len(s["acts"]): problems.append(f"ROW_LENGTH {where} {hand}"); continue
            problems += [f"{p} {where} {hand}" for p in check_row(row, max(1, len(row) / 2))]
        if s["k"]:
            parent_key, _, last = s["k"].rpartition(",")
            pos, _, act = last.partition(":")
            parent = by_key.get(parent_key)
            if not parent or parent["a"] != pos or act not in parent["acts"]:
                problems.append(f"ORPHAN {where}")
    return problems


def manifest_for(raw, table, table_bytes, meta):
    cfg = raw["config"]
    return {
        "schema": SCHEMA,
        "id": table["id"],
        "table": {"file": f"{table['id']}.json", "sha256": hashlib.sha256(table_bytes).hexdigest(), "spots": len(table["spots"])},
        "game": {
            "variant": "NLHE", "format": table["kind"], "players": len(cfg["positions"]), "positions": cfg["positions"],
            "stackBB": cfg["stack"], "posts": cfg.get("posts"), "anteBB": cfg.get("ante", 0),
            # GTOpen : pas de rake sur un pot gagné avant le flop, sauf no_flop_no_drop = false
            "rake": {"pct": cfg.get("rake_pct", 0), "capBB": cfg.get("rake_cap"), "noFlopNoDrop": cfg.get("no_flop_no_drop", True)},
        },
        "tree": {
            "limp": cfg.get("limp"), "openBB": cfg.get("open_raises"), "raiseMults": cfg.get("raise_mults"),
            "fourbetMults": cfg.get("fourbet_mults"), "maxRaises": cfg.get("max_raises"),
            "addAllin": cfg.get("add_allin"), "allinThreshold": cfg.get("allin_threshold"),
        },
        "model": {"realization": cfg.get("realization"), "leafNet": cfg.get("leaf_net")},
        "solve": {
            "iterations": raw.get("iterations"), "gap": raw.get("gap"), "gaps": raw.get("gaps"),
            "gapIteration": raw.get("gap_iteration"), "stopReason": raw.get("stop_reason"),
            "gapDefinition": GAP_DEFINITION,
        },
        "export": export_for(raw),
        "config": cfg,
        "generator": (meta or {}).get("generator"),
        "run": (meta or {}).get("run"),
        "notes": (meta or {}).get("notes", []),
    }


def dumps_table(table):
    return json.dumps(table, separators=(",", ":")).encode()


def import_tables(src, dst, only=None, meta=None, log=print):
    """Importe les tables de src vers dst. Rend (tables écrites, {table refusée: problèmes})."""
    written, refused, entries = [], {}, {}
    for path in sorted(glob.glob(os.path.join(src, "*.json"))):
        with open(path) as f:
            raw = json.load(f)
        gid = raw["id"]
        if only and gid not in only:
            continue
        table = convert(raw)
        problems = check_table(table)
        body = dumps_table(table)
        manifest = manifest_for(raw, table, body, (meta or {}).get(gid))
        manifest_text = json.dumps(manifest, ensure_ascii=False, indent=1)
        if PERSONAL.search(manifest_text):
            problems.append("PERSONAL_PATH : la fiche contiendrait un chemin de dossier personnel")
        if problems:
            refused[gid] = problems
            log(gid, "REFUSÉE :", len(problems), "problème(s) ;", "; ".join(problems[:5]))
            continue
        with open(os.path.join(dst, f"{gid}.json"), "wb") as f:
            f.write(body)
        with open(os.path.join(dst, f"{gid}.manifest.json"), "w") as f:
            f.write(manifest_text + "\n")
        entries[gid] = {"id": gid, "kind": table["kind"], "label": f"{LABELS.get(table['kind'], table['kind'])} · {table['stack']:g} bb",
                        "stack": table["stack"], "spots": len(table["spots"])}
        written.append(gid)
        log(gid, len(table["spots"]), "spots", len(body) // 1024, "Ko")
    if entries:
        index_path = os.path.join(dst, "index.json")
        index = []
        if os.path.exists(index_path):
            with open(index_path) as f:
                index = json.load(f)
        index = [e for e in index if e["id"] not in entries] + list(entries.values())
        index.sort(key=lambda x: (ORDER.get(x["kind"], 9), x["stack"]))
        with open(index_path, "w") as f:
            json.dump(index, f, ensure_ascii=False, indent=1)
    return written, refused


def main(argv=None):
    p = argparse.ArgumentParser(description="Importe les tables GTOpen dans le site, avec leur fiche d'origine.")
    p.add_argument("src", help="dossier des sorties brutes GTOpen")
    p.add_argument("--only", help="ids des tables à importer, séparés par des virgules")
    p.add_argument("--meta", help="fichier JSON d'informations par table (générateur, calcul, notes)")
    p.add_argument("--dst", default=DST_DEFAULT, help="dossier de sortie (par défaut public/solver)")
    a = p.parse_args(argv)
    meta = None
    if a.meta:
        with open(a.meta) as f:
            meta = json.load(f)
    only = set(a.only.split(",")) if a.only else None
    os.makedirs(a.dst, exist_ok=True)
    _, refused = import_tables(os.path.expanduser(a.src), a.dst, only=only, meta=meta)
    return 1 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
