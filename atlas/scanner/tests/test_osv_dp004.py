"""OSV (DP-002) and DP-004/DP-005 tests -- network-free (HTTP and git are mocked).
Run: python3 -I -B -m unittest discover -s atlas/scanner/tests -v"""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.dont_write_bytecode = True
import dp004  # noqa: E402
import osv  # noqa: E402
import trust  # noqa: E402

BANNED = re.compile(r"malware|malicious", re.I)


def write_tree(root, files):
    for rel, content in files.items():
        p = os.path.join(root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(content if isinstance(content, str) else json.dumps(content))
    return root


class FakeOSV:
    """Stands in for osv._post_json. db: {(name, version or None): [ids]}; version None = name-only answer."""

    def __init__(self, db, page_size=None, fail=False):
        self.db, self.page_size, self.fail, self.calls = db, page_size, fail, []

    def __call__(self, url, body, timeout=20):
        self.calls.append(body)
        if self.fail:
            raise OSError("network down")
        assert url.endswith("/querybatch")
        out = []
        for q in body["queries"]:
            ids = self.db.get((q["package"]["name"], q.get("version")), [])
            if q.get("version") is None:
                # name-only: every id known for the package
                ids = sorted({i for (n, _), v in self.db.items() if n == q["package"]["name"] for i in v})
            start = int(q.get("page_token") or 0)
            page = ids[start:start + self.page_size] if self.page_size else ids
            r = {"vulns": [{"id": i, "modified": "2025-01-01T00:00:00Z"} for i in page]} if page else {}
            if self.page_size and start + self.page_size < len(ids):
                r["next_page_token"] = str(start + self.page_size)
            out.append(r)
        return {"results": out}


class OSVTests(unittest.TestCase):
    def setUp(self):
        osv.clear_cache()
        self._orig = osv._post_json

    def tearDown(self):
        osv._post_json = self._orig
        osv.clear_cache()

    def test_split_and_pagination_and_cache(self):
        fake = FakeOSV({("big", None): [f"GHSA-{i:04d}" for i in range(5)] + ["MAL-2025-0001"]}, page_size=2)
        osv._post_json = fake
        r = osv.query_batch([{"ecosystem": "npm", "name": "big"}])[0]
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["mal"], ["MAL-2025-0001"])
        self.assertEqual(len(r["vulns"]), 5)
        n = len(fake.calls)
        self.assertGreater(n, 1)  # followed next_page_token
        osv.query_batch([{"ecosystem": "npm", "name": "big"}])
        self.assertEqual(len(fake.calls), n)  # cached

    def test_network_failure_is_unavailable_not_crash(self):
        osv._post_json = FakeOSV({}, fail=True)
        r = osv.check("npm", "x", "1.0.0", pinned=True)
        self.assertEqual(r["status"], "unavailable")
        self.assertEqual(r["mal_ids"], [])
        self.assertEqual([f["sev"] for f in r["findings"]], ["info"])

    def test_mal_pinned_package_is_critical_and_quarantines(self):
        osv._post_json = FakeOSV({("postmark-mcp", "1.0.16"): ["MAL-2025-47604"]})
        r = osv.check("npm", "postmark-mcp", "1.0.16", pinned=True)
        crit = [f for f in r["findings"] if f["sev"] == "critical"]
        self.assertEqual(len(crit), 1)
        self.assertEqual(crit[0]["rule"], "ATL-DP-002")
        self.assertEqual(crit[0]["title"], "Listed as malicious in OSV (MAL-2025-47604)")
        t = trust.trust(crit, osv_ids=r["osv_ids"])
        self.assertEqual((t["trust"], t["quarantined"]), (0, True))

    def test_unpinned_name_only_mal_applies(self):
        fake = FakeOSV({("evil", "0.9.0"): ["MAL-2025-9999"], ("evil", "0.1.0"): ["GHSA-aaaa"]})
        osv._post_json = fake
        r = osv.check("npm", "evil", None, pinned=False)
        self.assertEqual(r["mal_ids"], ["MAL-2025-9999"])
        self.assertNotIn("version", fake.calls[0]["queries"][0])
        sev = {f["sev"] for f in r["findings"]}
        self.assertIn("critical", sev)
        self.assertIn("info", sev)  # other advisories: not version-checked
        self.assertNotIn("high", sev)

    def test_pinned_vuln_high_dep_vuln_info_dep_mal_critical(self):
        osv._post_json = FakeOSV({("srv", "2.0.0"): ["GHSA-srv1"], ("left-pad", "1.3.0"): ["GHSA-lp01"],
                                  ("bad-dep", "0.0.1"): ["MAL-2025-0002"]})
        deps = osv.npm_deps({"dependencies": {"left-pad": "^1.3.0", "bad-dep": "*", "local": "file:../x"}})
        self.assertEqual([d["name"] for d in deps], ["left-pad", "bad-dep"])
        r = osv.check("npm", "srv", "2.0.0", pinned=True, deps=deps)
        by = {(f["sev"], f["title"].split(" (")[0]) for f in r["findings"]}
        self.assertIn(("high", "Known vulnerability affecting the pinned version"), by)
        self.assertIn(("info", "Known vulnerability in a direct dependency"), by)
        self.assertIn(("critical", "Listed as malicious in OSV"), by)
        self.assertEqual(r["mal_ids"], ["MAL-2025-0002"])
        self.assertTrue(trust.trust([], osv_ids=r["osv_ids"])["quarantined"])

    def test_wording_only_on_mal_lines(self):
        osv._post_json = FakeOSV({("a", "1.0.0"): ["MAL-2025-0003", "GHSA-x"]})
        r = osv.check("npm", "a", "1.0.0", pinned=True)
        for f in r["findings"]:
            for s in (f["title"], f["snippet"]):
                if BANNED.search(s):
                    self.assertRegex(s, r"MAL-\d{4}-")
        self.assertNotRegex(osv.summary_line(r).replace("MAL ids", ""), BANNED)

    def test_pypi_requirements(self):
        d = osv.pypi_deps(["httpx>=0.27", "mcp==1.2.0", "pytest; extra == 'dev'", "readabilipy (>=0.2.0)"])
        self.assertEqual([(x["name"], x["version"], x["estimated"]) for x in d],
                         [("httpx", "0.27", True), ("mcp", "1.2.0", False), ("readabilipy", "0.2.0", True)])
        with tempfile.TemporaryDirectory() as t:
            write_tree(t, {"PKG-INFO": "Metadata-Version: 2.1\nName: x\nRequires-Dist: mcp>=1.0\n\nbody"})
            self.assertEqual([x["name"] for x in osv.deps_from_package(t, "pypi")], ["mcp"])


def fake_clone(src):
    def clone(repo, dest, ref=None, name=None, **kw):
        shutil.copytree(src, dest)
        return "a" * 40, "v" + str(ref)
    return clone


def broken_clone(repo, dest, ref=None, name=None, **kw):
    raise OSError("git clone failed: repository not found")


class DP004Tests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.mkdtemp(prefix="atlas-dp004-test-")

    def tearDown(self):
        shutil.rmtree(self.t, ignore_errors=True)

    def trees(self, pkg, repo):
        return (write_tree(os.path.join(self.t, "pkg"), pkg), write_tree(os.path.join(self.t, "src"), repo))

    def run_check(self, pkg, repo, info=None, clone=None):
        p, r = self.trees(pkg, repo)
        info = info or {"eco": "npm", "name": "demo", "version": "1.0.0", "repo": "https://github.com/o/demo"}
        work = os.path.join(self.t, "work")
        os.makedirs(work)
        return dp004.check(info, p, work, clone=clone or fake_clone(r))

    def test_postinstall_only_in_package_is_high(self):
        res = self.run_check({"package.json": {"name": "demo", "scripts": {"postinstall": "node setup.js"}},
                              "index.js": "x()\n", "setup.js": "y()\n"},
                             {"package.json": {"name": "demo", "scripts": {"test": "node t"}},
                              "index.js": "x()\n", "setup.js": "y()\n"})
        high = [f for f in res["findings"] if f["sev"] == "high"]
        self.assertEqual(len(high), 1)
        self.assertEqual(high[0]["rule"], "ATL-DP-004")
        self.assertEqual(high[0]["title"], "Published install script not in source repo")
        self.assertEqual(res["status"], "mismatch")

    def test_extra_and_changed_files_medium(self):
        res = self.run_check({"package.json": {"name": "demo"}, "index.js": "a()\n", "util.js": "CHANGED\n",
                              "extra.js": "z()\n", "index.js.map": "{}", "types.d.ts": "x"},
                             {"package.json": {"name": "demo"}, "index.js": "a()\r\n", "util.js": "orig\n"})
        med = [f for f in res["findings"] if f["sev"] == "medium"]
        self.assertEqual(len(med), 1)
        self.assertEqual(res["stats"]["identical"], 1)  # CRLF-normalised
        self.assertEqual(res["stats"]["differ"], 1)
        self.assertEqual(res["stats"]["only_in_package"], 1)
        self.assertEqual(set(med[0]["examples"]), {"util.js", "extra.js"})

    def test_build_output_only_is_info_not_comparable(self):
        res = self.run_check({"package.json": {"name": "demo"}, "dist/index.js": "a()\n", "dist/index.js.map": "{}"},
                             {"package.json": {"name": "demo"}, "src/index.ts": "a()\n"})
        self.assertEqual(res["status"], "not-comparable")
        self.assertEqual([f["sev"] for f in res["findings"]], ["info"])
        self.assertIn("build output only", res["findings"][0]["title"])

    def test_clean_and_src_layout(self):
        res = self.run_check({"PKG-INFO": "x", "mcp_x/server.py": "print(1)\n", "mcp_x.egg-info/SOURCES.txt": ""},
                             {"pyproject.toml": "[project]\nname='mcp-x'\n", "src/mcp_x/server.py": "print(1)\n"},
                             info={"eco": "pypi", "name": "mcp-x", "version": "1.0", "repo": "https://github.com/o/x"})
        self.assertEqual(res["status"], "clean")
        self.assertEqual(res["findings"], [])

    def test_lib_counts_as_build_only_when_repo_lacks_it(self):
        res = self.run_check({"package.json": {"name": "demo"}, "lib/index.js": "a()\n"},
                             {"package.json": {"name": "demo"}, "src/index.ts": "a()\n"})
        self.assertEqual(res["status"], "not-comparable")

    def test_unreachable_repo_is_dp005_low(self):
        res = self.run_check({"package.json": {"name": "demo"}, "index.js": "a()\n"}, {}, clone=broken_clone)
        self.assertEqual(res["status"], "no-repo")
        self.assertEqual([(f["rule"], f["sev"]) for f in res["findings"]], [("ATL-DP-005", "low")])
        p, _ = os.path.join(self.t, "pkg"), None
        res2 = dp004.check({"eco": "npm", "name": "demo", "version": "1", "repo": None}, p, self.t)
        self.assertEqual(res2["findings"][0]["rule"], "ATL-DP-005")

    def test_package_scan_catches_tarball_only_code(self):
        res = self.run_check({"package.json": {"name": "demo"},
                              "dist/index.js": "const s = require('child_process'); eval(atob('ZWNobyBoaQ=='));\n"},
                             {"package.json": {"name": "demo"}, "src/index.ts": "export const a = 1;\n"})
        got = {(f["rule"], f["source"]) for f in res["pkg_scan"] if not f.get("suppressed")}
        self.assertIn(("ATL-OB-003", "package"), got)
        self.assertTrue(all(f["file"].startswith("dist/") for f in res["pkg_scan"] if f["rule"] == "ATL-OB-003"))

    def test_tag_candidates(self):
        c = dp004.tag_candidates("1.2.3", "@scope/pkg")
        for want in ("v1.2.3", "1.2.3", "@scope/pkg@1.2.3", "pkg@1.2.3", "pkg-v1.2.3"):
            self.assertIn(want, c)

    def test_safe_clone_refuses_non_https(self):
        for bad in ("file:///etc", "ext::sh -c id", "https://github.com/o/r --upload-pack=x"):
            with self.assertRaises(ValueError):
                dp004.safe_clone(bad, os.path.join(self.t, "x"))


if __name__ == "__main__":
    unittest.main()
