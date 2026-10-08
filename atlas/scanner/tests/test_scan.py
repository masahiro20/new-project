"""Scanner v1 regression tests. Run: python3 -I -B -m unittest discover -s atlas/scanner/tests -v"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.dont_write_bytecode = True
import scan  # noqa: E402
import trust  # noqa: E402

FX = os.path.join(HERE, "fixtures")


def live(findings, file=None):
    return {(f["file"], f["rule"]) for f in findings if not f.get("suppressed") and (file is None or f["file"] == file)}


class PositiveControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.f, _, _ = scan.scan_repo(os.path.join(FX, "pos"))

    def test_python_poisoned_tool(self):
        got = {r for _, r in live(self.f, "poison_tool.py")}
        for rid in ("ATL-TP-001", "ATL-TP-002", "ATL-TP-004", "ATL-TP-005", "ATL-CE-001", "ATL-OB-003",
                    "ATL-CR-001", "ATL-NW-001"):
            self.assertIn(rid, got)

    def test_multiline_shell_true_found_by_ast(self):
        hits = [f for f in self.f if f["rule"] == "ATL-CE-001" and f["file"] == "poison_tool.py" and f.get("method") == "ast"]
        self.assertTrue(hits)

    def test_tag_plus_concealment_escalates_to_critical(self):
        sev = {f["sev"] for f in self.f if f["rule"] == "ATL-TP-001" and f["file"] == "poison_tool.py"}
        self.assertEqual(sev, {"critical"})

    def test_ts_tool_description(self):
        got = {r for _, r in live(self.f, "server.ts")}
        if not scan._node_ok:
            self.skipTest("node/typescript helper not installed")
        for rid in ("ATL-TP-001", "ATL-TP-003", "ATL-TP-004", "ATL-CE-001", "ATL-OB-003", "ATL-CR-001", "ATL-NW-001"):
            self.assertIn(rid, got)

    def test_skill_instructions(self):
        got = {r for _, r in live(self.f, os.path.join("skill", "SKILL.md"))}
        self.assertIn("ATL-RF-001", got)
        self.assertIn("ATL-SK-001", got)

    def test_trust_capped(self):
        t = trust.trust(self.f)
        self.assertLessEqual(t["trust"], 30)
        self.assertEqual(t["grade"], "F")


class NegativeControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.f, _, _ = scan.scan_repo(os.path.join(FX, "neg"))

    def test_no_high_or_critical_survive(self):
        bad = [f for f in self.f if not f.get("suppressed") and f["sev"] in ("high", "critical")]
        self.assertEqual(bad, [], bad)

    def test_installer_is_low(self):
        rf = [f for f in self.f if f["rule"] == "ATL-RF-001" and not f.get("suppressed")]
        self.assertTrue(all(f["sev"] == "low" for f in rf))

    def test_every_suppression_has_reason(self):
        self.assertTrue(all(f.get("why") for f in self.f if f.get("suppressed")))

    def test_regex_mode_still_reports_them(self):
        f, _, _ = scan.scan_repo(os.path.join(FX, "neg"), use_ast=False)
        self.assertGreater(len([x for x in f if x["sev"] in ("high", "critical")]), 5)


class Wording(unittest.TestCase):
    def test_titles_never_say_malware(self):
        for r in scan.R:
            self.assertNotRegex(r["title"].lower(), r"malware|malicious")

    def test_mal_only_from_osv(self):
        t = trust.trust([], osv_ids=["MAL-2025-1"])
        self.assertEqual(t["trust"], 0)
        self.assertTrue(t["quarantined"])


if __name__ == "__main__":
    unittest.main()
