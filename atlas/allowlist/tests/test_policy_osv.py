"""Builder tests for OSV (DP-002), --fetch with DP-004, policy and override reasons.
Network-free: pkgfetch, git clone and the OSV HTTP layer are all mocked.

Run:  cd atlas/allowlist && python3 -I -B -m unittest discover -s tests -v
"""
import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

TESTS = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(TESTS)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "scanner")))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import allowlist_core as core  # noqa: E402
import atlas_allowlist as cli  # noqa: E402

BANNED = re.compile(r"malware|malicious", re.I)
NO_INDEX = os.path.join(TESTS, "fixtures", "does-not-exist.json")


def assert_wording(tc, text, where):
    for line in str(text).splitlines():
        if BANNED.search(line):
            tc.assertRegex(line, r"MAL-\d{4}-", f"banned wording in {where}: {line!r}")


def write_tree(root, files):
    for rel, content in files.items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(content if isinstance(content, str) else json.dumps(content))
    return root


def cfg(*servers):
    return json.dumps({"mcpServers": {n: {"command": "npx", "args": ["-y", spec]} for n, spec in servers}})


class FakeOSV:
    def __init__(self, db):
        self.db = db  # {(name, version): [ids]}; name-only queries return all ids for the name

    def __call__(self, url, body, timeout=20):
        out = []
        for q in body["queries"]:
            n, v = q["package"]["name"], q.get("version")
            ids = self.db.get((n, v), []) if v else sorted({i for (k, _), x in self.db.items() if k == n for i in x})
            out.append({"vulns": [{"id": i} for i in ids]} if ids else {})
        return {"results": out}


class Mocked(unittest.TestCase):
    """Patches core._pkgfetch.resolve / fetch_extract, dp004.safe_clone and osv._post_json."""

    PKG = {}
    REPO = {}
    INFO = {}
    OSV = {}

    def setUp(self):
        self.t = tempfile.mkdtemp(prefix="atlas-builder-test-")
        self.saved = (core._pkgfetch.resolve, core._pkgfetch.fetch_extract, core._dp004.safe_clone,
                      core._osv._post_json)
        core._osv.clear_cache()
        pkg_src = write_tree(os.path.join(self.t, "pkg-src"), self.PKG)
        repo_src = write_tree(os.path.join(self.t, "repo-src"), self.REPO) if self.REPO else None
        info = dict({"eco": "npm", "version": "1.0.0", "repo": "https://github.com/o/demo", "attestations": False,
                     "license": "MIT", "scripts": {}}, **self.INFO)

        def resolve(eco, name, version=None, **kw):
            return dict(info, name=name, version=version or info["version"])

        def fetch_extract(i, dest):
            shutil.copytree(pkg_src, dest)
            return dest

        def clone(repo, dest, ref=None, name=None, **kw):
            if not repo_src:
                raise OSError("git clone failed: not found")
            shutil.copytree(repo_src, dest)
            return "b" * 40, "v" + str(ref)

        core._pkgfetch.resolve = resolve
        core._pkgfetch.fetch_extract = fetch_extract
        core._dp004.safe_clone = clone
        core._osv._post_json = FakeOSV(self.OSV)

    def tearDown(self):
        (core._pkgfetch.resolve, core._pkgfetch.fetch_extract, core._dp004.safe_clone,
         core._osv._post_json) = self.saved
        core._osv.clear_cache()
        shutil.rmtree(self.t, ignore_errors=True)

    def evaluate(self, text, **kw):
        kw.setdefault("index_path", NO_INDEX)
        return core.evaluate(text, **kw)


CLEAN_PKG = {"package.json": {"name": "demo", "dependencies": {"left-pad": "^1.3.0"}}, "index.js": "module.exports = 1;\n"}
CLEAN_REPO = {"package.json": {"name": "demo"}, "index.js": "module.exports = 1;\n"}


class TestOSVOnly(Mocked):
    PKG, REPO = CLEAN_PKG, CLEAN_REPO
    OSV = {("postmark-mcp", "1.0.16"): ["MAL-2025-47604"], ("vuln-srv", "2.0.0"): ["GHSA-test-0001"]}

    def test_mal_is_deny_quarantined_trust0(self):
        rep = self.evaluate(cfg(("pm", "postmark-mcp@1.0.16")), osv=True)
        it = rep["items"][0]
        self.assertEqual(it["recommendation"], "deny")
        self.assertTrue(it["trust"]["quarantined"])
        self.assertEqual(it["score"], 0)
        dp = [f for f in it["findings"] if f["rule"] == "ATL-DP-002"]
        self.assertEqual(dp[0]["sev"], "critical")
        self.assertEqual(dp[0]["title"], "Listed as malicious in OSV (MAL-2025-47604)")
        self.assertTrue(any("MAL-2025-47604" in e for e in it["evidence"]))
        assert_wording(self, json.dumps(rep, ensure_ascii=False, indent=1), "report")
        assert_wording(self, core.format_table(rep), "table")
        files = core.build_outputs(rep, approve=["pm"], allow_deny=True, reasons={"pm": "test-only override"})
        for n, t in files.items():
            assert_wording(self, t, n)

    def test_pinned_vuln_is_high(self):
        it = self.evaluate(cfg(("v", "vuln-srv@2.0.0")), osv=True)["items"][0]
        sev = {f["sev"] for f in it["findings"] if f["rule"] == "ATL-DP-002"}
        self.assertEqual(sev, {"high"})
        self.assertEqual(it["scan_detail"]["osv"]["status"], "ok")

    def test_osv_unavailable_never_crashes(self):
        def boom(*a, **k):
            raise OSError("offline")
        core._osv._post_json = boom
        it = self.evaluate(cfg(("pm", "postmark-mcp@1.0.16")), osv=True)["items"][0]
        self.assertEqual(it["scan_detail"]["osv"]["status"], "unavailable")
        self.assertFalse(it["trust"]["quarantined"])

    def test_without_osv_flag_no_query(self):
        it = self.evaluate(cfg(("pm", "postmark-mcp@1.0.16")))["items"][0]
        self.assertNotIn("osv", it["scan_detail"])


class TestDepMal(Mocked):
    PKG = {"package.json": {"name": "demo", "dependencies": {"bad-dep": "^0.0.1", "left-pad": "1.3.0"}},
           "index.js": "module.exports = 1;\n"}
    REPO = CLEAN_REPO
    OSV = {("bad-dep", "0.0.1"): ["MAL-2025-0002"], ("left-pad", "1.3.0"): ["GHSA-lp00-0000"]}

    def test_dep_mal_quarantines_and_dep_vuln_is_info(self):
        it = self.evaluate(cfg(("d", "demo@1.0.0")), fetch=True)["items"][0]
        self.assertTrue(it["trust"]["quarantined"])
        self.assertEqual(it["recommendation"], "deny")
        dp = [f for f in it["findings"] if f["rule"] == "ATL-DP-002"]
        self.assertTrue(any(f["sev"] == "critical" and "bad-dep" in f["snippet"] for f in dp))
        self.assertTrue(any(f["sev"] == "info" and "left-pad" in f["snippet"] for f in dp))


class TestFetchDP004(Mocked):
    PKG = {"package.json": {"name": "demo", "scripts": {"postinstall": "node collect.js"}},
           "index.js": "module.exports = 1;\n", "collect.js": "x()\n"}
    REPO = {"package.json": {"name": "demo"}, "index.js": "module.exports = 1;\n"}

    def test_postinstall_missing_from_repo_is_high(self):
        it = self.evaluate(cfg(("d", "demo@1.0.0")), fetch=True)["items"][0]
        self.assertEqual(it["scan_status"], "fetched")
        hi = [f for f in it["findings"] if f["rule"] == "ATL-DP-004" and f["sev"] == "high"]
        self.assertEqual(len(hi), 1)
        self.assertIn("postinstall", hi[0]["snippet"])
        self.assertFalse(it["provenance_inputs"].get("repo_matches_package"))
        self.assertIn("package", {f.get("source") for f in it["findings"]})  # tarball scanned (IN-001)
        self.assertNotEqual(it["recommendation"], "approve")


class TestFetchBuildOnly(Mocked):
    PKG = {"package.json": {"name": "demo"}, "dist/index.js": "module.exports = 1;\n"}
    REPO = {"package.json": {"name": "demo"}, "src/index.ts": "export default 1;\n"}

    def test_build_only_is_info(self):
        it = self.evaluate(cfg(("d", "demo@1.0.0")), fetch=True)["items"][0]
        dp = [f for f in it["findings"] if f["rule"] == "ATL-DP-004"]
        self.assertEqual([f["sev"] for f in dp], ["info"])
        self.assertIn("not comparable", dp[0]["snippet"])
        self.assertTrue(any("not comparable (build output only" in e for e in it["evidence"]))


class TestFetchClean(Mocked):
    PKG, REPO = CLEAN_PKG, CLEAN_REPO
    INFO = {"attestations": True}

    def test_clean_gives_provenance_and_approve(self):
        it = self.evaluate(cfg(("d", "demo@1.0.0")), fetch=True)["items"][0]
        p = it["provenance_inputs"]
        self.assertTrue(p["repo_matches_package"] and p["provenance_attested"] and p["osi_license"])
        self.assertEqual(it["recommendation"], "approve", it["reasons"])
        self.assertTrue(any(e.startswith("provenance: repo_matches_package=yes (DP-004 clean)") for e in it["evidence"]))


class TestFetchUnreachable(Mocked):
    PKG, REPO = CLEAN_PKG, {}

    def test_unreachable_repo_dp005(self):
        it = self.evaluate(cfg(("d", "demo@1.0.0")), fetch=True)["items"][0]
        self.assertIn(("ATL-DP-005", "low"), {(f["rule"], f["sev"]) for f in it["findings"]})
        self.assertFalse(it["provenance_inputs"].get("repo_matches_package"))


class TestPolicyAndOverrides(unittest.TestCase):
    FX = os.path.join(TESTS, "fixtures")

    def test_high_in_launch_policy_switch(self):
        # github has an inline secret (ATL-CR-003 high in launch config)
        p = os.path.join(self.FX, "secret.mcp.json")
        idx = os.path.join(self.FX, "index.json")
        default = core.evaluate(p, index_path=idx)
        strict = core.evaluate(p, index_path=idx, policy={"high_in_skill_or_launch": "deny"})
        g0 = next(i for i in default["items"] if i["name"] == "github")
        g1 = next(i for i in strict["items"] if i["name"] == "github")
        self.assertEqual(g0["recommendation"], "review")
        self.assertEqual(g1["recommendation"], "deny")
        self.assertTrue(any("org policy" in r for r in g1["reasons"]))
        with tempfile.TemporaryDirectory() as d:
            pp = os.path.join(d, "policy.json")
            with open(pp, "w") as fh:
                json.dump({"high_in_skill_or_launch": "deny"}, fh)
            self.assertEqual(core.load_policy(pp)["high_in_skill_or_launch"], "deny")
        with self.assertRaises(ValueError):
            core.load_policy({"nope": 1})

    def test_require_provenance_switch(self):
        p = os.path.join(self.FX, "benign.mcp.json")
        nidx = os.path.join(self.FX, "does-not-exist.json")
        t = {"trust": 90, "grade": "A", "quarantined": False}
        self.assertEqual(core.recommend(t, [], "mcp", {})[0], "review")
        self.assertEqual(core.recommend(t, [], "mcp", {}, {"require_provenance_for_approve": False})[0], "approve")
        self.assertEqual(core.recommend(t, [], "mcp", {"provenance_attested": True})[0], "approve")
        crit = [{"rule": "ATL-RF-001", "sev": "critical", "ctx": "src"}]
        self.assertEqual(core.recommend(t, crit, "mcp", {"provenance_attested": True})[0], "deny")
        self.assertTrue(core.evaluate(p, index_path=nidx)["policy"]["require_provenance_for_approve"])

    def _report(self, d):
        rp = os.path.join(d, "report.json")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["evaluate", os.path.join(self.FX, "mixed.mcp.json"), "--index",
                                       os.path.join(self.FX, "index.json"), "--json", rp]), 0)
        return rp

    def test_override_without_reason_is_error(self):
        with tempfile.TemporaryDirectory() as d:
            rp = self._report(d)
            err = io.StringIO()
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
                rc = cli.main(["build", rp, "--approve", "filesystem,foo", "--out-dir", os.path.join(d, "o")])
            self.assertEqual(rc, 2)
            self.assertIn("reason", err.getvalue())
            self.assertIn("foo", err.getvalue())
            self.assertFalse(os.path.exists(os.path.join(d, "o")))
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = cli.main(["build", rp, "--approve", "installer", "--reason", "installer=reviewed",
                               "--out-dir", os.path.join(d, "o2")])
            self.assertEqual(rc, 2)  # deny still needs --allow-deny

    def test_override_with_reason_recorded(self):
        with tempfile.TemporaryDirectory() as d:
            rp = self._report(d)
            out = os.path.join(d, "o")
            with contextlib.redirect_stdout(io.StringIO()):
                rc = cli.main(["build", rp, "--approve", "filesystem,foo,installer", "--allow-deny", "--by", "山田",
                               "--reason", "foo=pinned via internal proxy",
                               "--reason", "installer=vendored script reviewed by secops (TICKET-42)",
                               "--out-dir", out])
            self.assertEqual(rc, 0)
            with open(os.path.join(out, "decisions.md"), encoding="utf-8") as fh:
                md = fh.read()
            with open(os.path.join(out, "decisions.json"), encoding="utf-8") as fh:
                dj = json.load(fh)
        self.assertIn("## Overrides / 上書き承認", md)
        self.assertIn("vendored script reviewed by secops (TICKET-42)", md)
        self.assertIn("Approver / 承認者: 山田", md)
        ov = {o["item"]: o for o in dj["overrides"]}
        self.assertEqual(set(ov), {"foo", "installer"})
        self.assertEqual(ov["installer"]["recommendation"], "deny")
        self.assertEqual(ov["foo"]["reason"], "pinned via internal proxy")
        for k in ("approver", "time", "grade", "score", "top_findings"):
            self.assertIn(k, ov["installer"])
        self.assertTrue(ov["installer"]["top_findings"])
        items = {i["name"]: i for i in dj["items"]}
        self.assertEqual(items["filesystem"]["decision"], "approved")
        self.assertFalse(items["filesystem"]["override"])
        self.assertEqual(items["github"]["decision"], "not_approved")
        assert_wording(self, md, "decisions.md")


if __name__ == "__main__":
    unittest.main()
