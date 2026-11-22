#!/usr/bin/env python3
"""Tests du script d'import des tables GTOpen, sur de petites tables synthétiques dans un dossier temporaire.

Lancer : python3 -m unittest scripts/test_import_gtopen.py   (depuis la racine du dépôt)
Ne lit ni n'écrit public/solver.
"""
import hashlib, json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_gtopen as imp  # noqa: E402

CONFIG = {
    "positions": ["UTG", "MP", "CO", "BTN", "SB", "BB"], "stack": 100, "posts": [0, 0, 0, 0, 0.5, 1], "ante": 0,
    "limp": False, "open_raises": [2.5], "raise_mults": [3.0], "fourbet_mults": [2.3], "max_raises": 4,
    "add_allin": True, "allin_threshold": 0.35, "rake_pct": 5, "rake_cap": 3, "realization": "leafnet", "leaf_net": "v2",
}


def raw_table(gid="cash100", freqs=(0.8, 0.2), extra_spot=None):
    """Sortie brute de GTOpen (format de run.extract) : UTG ouvre ou se couche, MP répond."""
    spots = [
        {"line": [], "actor": "UTG", "actions": ["Fold", "Raise 2.5"], "kinds": ["fold", "raise"],
         "freqs": list(freqs), "hands": {"AA": [0.0, 1.0], "72o": [1.0, 0.0]}},
        {"line": [["UTG", "Raise 2.5"]], "actor": "MP", "actions": ["Fold", "Call 2.5", "3-bet 7.5"],
         "kinds": ["fold", "call", "raise"], "freqs": [0.85, 0.05, 0.10], "hands": {"KK": [0.0, 0.01, 0.99]}},
    ]
    if extra_spot:
        spots.append(extra_spot)
    return {"id": gid, "config": CONFIG, "iterations": 2250, "gap": 0.0029, "gaps": [0.0009, 0.0004, 0.0004, 0.0004, 0.0003, 0.0005],
            "gap_iteration": 2250, "stop_reason": "target_reached", "spots": spots}


META = {"cash100": {
    "generator": {"name": "GTOpen", "url": "https://github.com/MatthewPDingle/GTOpen", "commit": "370e1a19b"},
    "run": {"dates": "2026-11-22", "durationMin": 229, "machine": "Apple M5, 10 cœurs, 16 Go"},
    "notes": ["Table de test."],
}}


class ImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src = os.path.join(self.tmp.name, "out")
        self.dst = os.path.join(self.tmp.name, "solver")
        os.makedirs(self.src)
        os.makedirs(self.dst)

    def tearDown(self):
        self.tmp.cleanup()

    def write_raw(self, d):
        with open(os.path.join(self.src, f"{d['id']}.json"), "w") as f:
            json.dump(d, f)

    def read(self, name):
        with open(os.path.join(self.dst, name)) as f:
            return json.load(f)

    def test_ecrit_la_table_et_sa_fiche_d_origine(self):
        self.write_raw(raw_table())
        written, problems = imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        self.assertEqual(written, ["cash100"])
        self.assertEqual(problems, {})
        table = self.read("cash100.json")
        self.assertEqual(table["spots"][0], {"k": "", "a": "UTG", "acts": ["F", "R2.5"], "f": [80.0, 20.0], "h": {"AA": [0, 100], "72o": [100, 0]}})
        m = self.read("cash100.manifest.json")
        with open(os.path.join(self.dst, "cash100.json"), "rb") as f:
            self.assertEqual(m["table"]["sha256"], hashlib.sha256(f.read()).hexdigest())
        self.assertEqual(m["table"]["spots"], 2)
        self.assertEqual(m["game"]["rake"], {"pct": 5, "capBB": 3, "noFlopNoDrop": True})
        self.assertEqual(m["game"]["stackBB"], 100)
        self.assertEqual(m["tree"]["allinThreshold"], 0.35)
        self.assertEqual(m["model"], {"realization": "leafnet", "leafNet": "v2"})
        self.assertEqual(m["solve"]["iterations"], 2250)
        self.assertEqual(m["solve"]["stopReason"], "target_reached")
        self.assertIn("meilleure réponse", m["solve"]["gapDefinition"])
        self.assertEqual(m["config"], CONFIG)  # config brute gardée telle quelle
        self.assertEqual(m["generator"]["commit"], "370e1a19b")

    def test_la_fiche_dit_le_seuil_d_elagage_par_defaut(self):
        self.write_raw(raw_table())
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        e = self.read("cash100.manifest.json")["export"]
        self.assertEqual(e["branchMinFreq"], 0.002)
        self.assertIn("0,2 %", e["branches"])

    def test_la_fiche_dit_le_seuil_d_elagage_de_l_extraction(self):
        self.write_raw({**raw_table(), "branch_min": 0})
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        e = self.read("cash100.manifest.json")["export"]
        self.assertEqual(e["branchMinFreq"], 0)
        self.assertIn("toutes les actions", e["branches"])
        self.assertNotIn("0,2 %", e["branches"])

    def test_marque_les_lignes_rares_et_leurs_suites(self):
        child = {"line": [["UTG", "Raise 2.5"], ["MP", "3-bet 7.5"]], "actor": "UTG", "actions": ["Fold", "Call 7.5"],
                 "kinds": ["fold", "call"], "freqs": [0.6, 0.4], "hands": {"AA": [0.0, 1.0]}}
        self.write_raw(raw_table(freqs=(0.999, 0.001), extra_spot=child))
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        spots = {s["k"]: s for s in self.read("cash100.json")["spots"]}
        self.assertNotIn("r", spots[""])                       # premier à parler : jamais rare
        self.assertEqual(spots["UTG:R2.5"]["r"], 1)             # UTG n'ouvre qu'à 0,1 % : ligne rare
        self.assertEqual(spots["UTG:R2.5,MP:R7.5"]["r"], 1)     # la suite d'une ligne rare reste rare
        e = self.read("cash100.manifest.json")["export"]
        self.assertEqual(e["rareFreq"], 0.002)
        self.assertIn("0,2 %", e["rareLines"])

    def test_une_ligne_jouee_n_est_pas_rare(self):
        self.write_raw(raw_table(freqs=(0.8, 0.2)))
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        self.assertTrue(all("r" not in s for s in self.read("cash100.json")["spots"]))

    def test_aucun_chemin_personnel_dans_la_fiche(self):
        self.write_raw(raw_table())
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        with open(os.path.join(self.dst, "cash100.manifest.json")) as f:
            text = f.read()
        self.assertNotIn(self.tmp.name, text)
        self.assertNotIn("/Users/", text)

    def test_refuse_une_fiche_qui_contiendrait_un_chemin_personnel(self):
        self.write_raw(raw_table())
        meta = {"cash100": {**META["cash100"], "run": {"dossier": "/Users/quelqu-un/Developer/out"}}}
        written, problems = imp.import_tables(self.src, self.dst, meta=meta, log=lambda *a: None)
        self.assertEqual(written, [])
        self.assertIn("PERSONAL_PATH", " ".join(problems["cash100"]))
        self.assertFalse(os.path.exists(os.path.join(self.dst, "cash100.json")))

    def test_refuse_une_table_abimee_et_n_ecrit_rien(self):
        self.write_raw(raw_table(freqs=(0.5, 0.2)))  # 70 % au lieu de 100 %
        with open(os.path.join(self.dst, "index.json"), "w") as f:
            json.dump([{"id": "mtt10", "kind": "mtt", "label": "MTT · 10 bb", "stack": 10, "spots": 5}], f)
        written, problems = imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        self.assertEqual(written, [])
        self.assertIn("FREQ_SUM", " ".join(problems["cash100"]))
        self.assertFalse(os.path.exists(os.path.join(self.dst, "cash100.json")))
        self.assertEqual([e["id"] for e in self.read("index.json")], ["mtt10"])

    def test_refuse_une_ligne_orpheline(self):
        orphan = {"line": [["UTG", "Raise 3"]], "actor": "MP", "actions": ["Fold", "Call 3"], "kinds": ["fold", "call"],
                  "freqs": [0.5, 0.5], "hands": {"QQ": [0.0, 1.0]}}
        self.write_raw(raw_table(extra_spot=orphan))
        _, problems = imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        self.assertIn("ORPHAN", " ".join(problems["cash100"]))

    def test_l_index_garde_les_autres_tables(self):
        with open(os.path.join(self.dst, "index.json"), "w") as f:
            json.dump([{"id": "mtt10", "kind": "mtt", "label": "MTT · 10 bb", "stack": 10, "spots": 5},
                       {"id": "cash100", "kind": "cash", "label": "Cash · 100 bb", "stack": 100, "spots": 999}], f)
        self.write_raw(raw_table())
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        index = self.read("index.json")
        self.assertEqual([e["id"] for e in index], ["mtt10", "cash100"])
        self.assertEqual(index[1]["spots"], 2)

    def test_only_n_importe_que_les_tables_demandees(self):
        self.write_raw(raw_table())
        self.write_raw(raw_table(gid="cash200"))
        written, _ = imp.import_tables(self.src, self.dst, only={"cash200"}, meta=None, log=lambda *a: None)
        self.assertEqual(written, ["cash200"])
        self.assertFalse(os.path.exists(os.path.join(self.dst, "cash100.json")))

    def test_deux_imports_donnent_les_memes_octets(self):
        self.write_raw(raw_table())
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        with open(os.path.join(self.dst, "cash100.json"), "rb") as f:
            first = f.read()
        imp.import_tables(self.src, self.dst, meta=META, log=lambda *a: None)
        with open(os.path.join(self.dst, "cash100.json"), "rb") as f:
            self.assertEqual(f.read(), first)

    def test_main_rend_un_code_d_erreur_si_une_table_est_refusee(self):
        self.write_raw(raw_table(freqs=(0.5, 0.2)))
        self.assertEqual(imp.main([self.src, "--dst", self.dst]), 1)


if __name__ == "__main__":
    unittest.main()
