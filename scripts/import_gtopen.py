#!/usr/bin/env python3
"""Convertit les résultats GTOpen (~/Developer/gtopen-batch/out/*.json) en données compactes
pour le site : public/solver/<id>.json + public/solver/index.json (chargés à la demande).

Format d'un spot : { "k": "UTG:F,MP:R2", "a": "CO", "acts": ["F","R2","A10"], "f": [77,0,23],
                     "h": { "AA": [0,0,100], ... } }   (pourcentages entiers)
Les mains hors de la range du joueur sont absentes.
"""
import json, os, re, sys, glob

SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Developer/gtopen-batch/out")
DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "solver")

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

LABELS = {"mtt": "MTT", "bvb": "Blinde contre blinde", "cash": "Cash"}

index = []
os.makedirs(DST, exist_ok=True)
for path in sorted(glob.glob(os.path.join(SRC, "*.json"))):
    d = json.load(open(path))
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
    out = {"id": gid, "kind": kind, "stack": cfg["stack"], "ante": cfg.get("ante", 0), "positions": cfg["positions"],
           "iterations": d.get("iterations"), "gap": d.get("gap"), "spots": spots}
    json.dump(out, open(os.path.join(DST, f"{gid}.json"), "w"), separators=(",", ":"))
    index.append({"id": gid, "kind": kind, "label": f"{LABELS.get(kind, kind)} · {cfg['stack']:g} bb", "stack": cfg["stack"], "spots": len(spots)})
    print(gid, len(spots), "spots", os.path.getsize(os.path.join(DST, f"{gid}.json")) // 1024, "Ko")
order = {"mtt": 0, "bvb": 1, "cash": 2}
index.sort(key=lambda x: (order.get(x["kind"], 9), x["stack"]))
json.dump(index, open(os.path.join(DST, "index.json"), "w"), ensure_ascii=False, indent=1)
