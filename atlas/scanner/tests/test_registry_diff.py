"""Registry (server.json) UP-002 diff tests -- network-free (registry HTTP is mocked).

Run: python3 -I -B -m unittest discover -s atlas/scanner/tests -v
"""
import contextlib
import copy
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.parse
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SCANNER = os.path.dirname(HERE)
ALLOWLIST = os.path.normpath(os.path.join(SCANNER, "..", "allowlist"))
sys.path.insert(0, SCANNER)
sys.dont_write_bytecode = True
import registry_diff as rd  # noqa: E402
import updiff  # noqa: E402

FX = os.path.join(HERE, "fixtures", "registry")
BANNED = ("malware", "malicious")


def load(name):
    with open(os.path.join(FX, name + ".json"), encoding="utf-8") as fh:
        return json.load(fh)


def bump(entry, version, pub, **server_changes):
    e = copy.deepcopy(entry)
    e["server"]["version"] = version
    for p in e["server"].get("packages") or []:
        if p.get("registryType") in ("npm", "pypi"):
            p["version"] = version
    e["server"].update(server_changes)
    m = e["_meta"]["io.modelcontextprotocol.registry/official"]
    m.update(publishedAt=pub, updatedAt=pub, statusChangedAt=pub, isLatest=True)
    return e


def fake_registry(*entries):
    """A _get_json replacement serving the given version entries (the last one is latest)."""
    by_name = {}
    for i, e in enumerate(entries):
        e = copy.deepcopy(e)
        e["_meta"]["io.modelcontextprotocol.registry/official"]["isLatest"] = (i == len(entries) - 1)
        by_name.setdefault(e["server"]["name"], []).append(e)
    calls = []

    def get_json(url, timeout=60):
        calls.append(url)
        path = urllib.parse.urlparse(url).path
        assert path.startswith("/v0/servers/"), url
        rest = path[len("/v0/servers/"):]
        enc_name, _, tail = rest.partition("/")
        name = urllib.parse.unquote(enc_name)
        assert "/" not in enc_name and "%2F" in enc_name, "server name must be URL-encoded"
        es = by_name.get(name)
        if es is None:
            raise rd.RegistryError("HTTP 404 for " + url)
        if tail == "versions":
            return {"servers": list(reversed(es)), "metadata": {"count": len(es)}}
        ver = urllib.parse.unquote(tail[len("versions/"):])
        for e in es:
            if e["server"]["version"] == ver:
                return e
        raise rd.RegistryError("HTTP 404 for " + url)
    get_json.calls = calls
    return get_json


class ServerJsonDiff(unittest.TestCase):
    def setUp(self):
        self.p1 = load("pkg_v1")
        self.r1 = load("remote_v1")

    def reasons(self, res):
        return " | ".join(t["reason"] for t in res["triggers"])

    def test_benign_version_bump_no_trigger(self):
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z",
                   description="Weather forecasts for any city, now with hourly data.")
        res = rd.diff_server_json(self.p1, new)
        self.assertFalse(res["up002"], res["triggers"])
        self.assertIsNone(res["banner"])
        self.assertIn("version: 1.0.0 -> 1.0.1", res["evidence"])
        self.assertIn("package npm:@acme/weather-mcp version: 1.0.0 -> 1.0.1", res["evidence"])
        self.assertIn("+Weather forecasts for any city, now with hourly data.", res["description_diff"])

    def test_repository_url_change_triggers(self):
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z",
                   repository={"url": "https://github.com/someone-else/weather", "source": "github"})
        res = rd.diff_server_json(self.p1, new)
        self.assertTrue(res["up002"])
        self.assertIn("repository URL changed", self.reasons(res))
        self.assertEqual(res["trust_cap"], 50)
        self.assertEqual(res["finding"]["rule"], "ATL-UP-002")
        # cosmetic difference (.git suffix / case) is not a change
        same = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z",
                    repository={"url": "https://github.com/Acme/weather.git", "source": "github"})
        self.assertFalse(rd.diff_server_json(self.p1, same)["up002"])

    def test_remote_host_moved_to_trycloudflare(self):
        res = rd.diff_server_json(self.r1, load("remote_v2_tunnel"))
        self.assertTrue(res["up002"])
        self.assertTrue(res["remote_only"])
        r = self.reasons(res)
        self.assertIn("remote host changed", r)
        self.assertIn("ephemeral tunnel host", r)
        self.assertIn("挙動の変化：新しいパターンを検出", res["banner"]["ja"])
        self.assertTrue(res["banner"]["en"].startswith("Behaviour changed: new pattern(s) detected"))

    def test_remote_raw_ip_plain_http_and_same_host_path(self):
        new = copy.deepcopy(self.r1)
        new["server"]["remotes"].append({"type": "sse", "url": "http://203.0.113.7:8080/sse"})
        r = self.reasons(rd.diff_server_json(self.r1, new))
        self.assertIn("raw IP address", r)
        self.assertIn("plain http", r)
        moved = copy.deepcopy(self.r1)
        moved["server"]["remotes"][0]["url"] = "https://mcp.acme-weather.example/v2/mcp"
        res = rd.diff_server_json(self.r1, moved)
        self.assertFalse(res["up002"], res["triggers"])
        self.assertTrue(any("same host" in e for e in res["evidence"]))
        downgraded = copy.deepcopy(self.r1)
        downgraded["server"]["remotes"][0]["url"] = "http://mcp.acme-weather.example/mcp"
        self.assertIn("plain http", self.reasons(rd.diff_server_json(self.r1, downgraded)))

    def test_description_gains_tool_poisoning(self):
        res = rd.diff_server_json(self.p1, load("pkg_v2_poisoned_desc"))
        self.assertTrue(res["up002"])
        rules = {t["rule"] for t in res["triggers"]}
        self.assertIn("ATL-TP-001", rules)
        self.assertIn("ATL-TP-002", rules)
        self.assertIn("ATL-TP-004", rules)
        self.assertIn("<IMPORTANT>", res["description_diff"])
        # unchanged poisoned description in both versions: nothing new
        self.assertFalse(rd.diff_server_json(load("pkg_v2_poisoned_desc"), load("pkg_v2_poisoned_desc"))["up002"])

    def test_floating_package_version(self):
        for spec in ("latest", "^1.0.0", "1.x", "*"):
            new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z")
            new["server"]["packages"][0]["version"] = spec
            res = rd.diff_server_json(self.p1, new)
            self.assertTrue(res["up002"], spec)
            self.assertIn("floating", self.reasons(res))
        oci_old = copy.deepcopy(self.p1)
        oci_old["server"]["packages"] = [{"registryType": "oci", "identifier": "ghcr.io/acme/weather:1.0.0",
                                          "transport": {"type": "stdio"}}]
        oci_new = copy.deepcopy(oci_old)
        oci_new["server"]["packages"][0]["identifier"] = "ghcr.io/acme/weather:1.0.1"
        self.assertFalse(rd.diff_server_json(oci_old, oci_new)["up002"])           # tag bump: fine
        oci_new["server"]["packages"][0]["identifier"] = "ghcr.io/acme/weather:latest"
        self.assertIn("floating", self.reasons(rd.diff_server_json(oci_old, oci_new)))

    def test_package_identifier_transport_and_secret_env(self):
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z")
        new["server"]["packages"][0]["identifier"] = "@acme/weather-mcp-pro"
        self.assertIn("package identifier added/changed", self.reasons(rd.diff_server_json(self.p1, new)))
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z")
        new["server"]["packages"][0]["registryType"] = "pypi"
        self.assertIn("registryType changed", self.reasons(rd.diff_server_json(self.p1, new)))
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z")
        new["server"]["packages"][0]["transport"] = {"type": "streamable-http", "url": "http://localhost:3000/mcp"}
        self.assertIn("transport changed", self.reasons(rd.diff_server_json(self.p1, new)))
        new = bump(self.p1, "1.0.1", "2026-02-01T00:00:00Z")
        new["server"]["packages"][0]["environmentVariables"].append(
            {"name": "AWS_SECRET_ACCESS_KEY", "isRequired": True, "isSecret": True, "description": "for caching"})
        self.assertIn("new required secret environment variable: AWS_SECRET_ACCESS_KEY",
                      self.reasons(rd.diff_server_json(self.p1, new)))
        new["server"]["packages"][0]["environmentVariables"][-1]["isRequired"] = False
        self.assertFalse(rd.diff_server_json(self.p1, new)["up002"])

    def test_status_deprecated_is_info(self):
        new = copy.deepcopy(self.p1)
        new["_meta"]["io.modelcontextprotocol.registry/official"]["status"] = "deprecated"
        res = rd.diff_server_json(self.p1, new)
        self.assertFalse(res["up002"])
        self.assertEqual(res["info"], ["status: active -> deprecated"])

    def test_wording(self):
        for o, n in ((self.r1, load("remote_v2_tunnel")), (self.p1, load("pkg_v2_poisoned_desc"))):
            res = rd.diff_server_json(o, n)
            text = json.dumps([res["banner"], [t["reason"] for t in res["triggers"]], res["finding"],
                               rd.to_markdown(res)], ensure_ascii=False).lower()
            for w in BANNED:
                self.assertNotIn(w, text)


class RegistryFetch(unittest.TestCase):
    def test_versions_default_old_new_and_url_encoding(self):
        p1 = load("pkg_v1")
        p2 = bump(p1, "1.0.1", "2026-02-01T00:00:00Z")
        p3 = bump(p1, "1.1.0", "2026-03-01T00:00:00Z",
                  repository={"url": "https://github.com/other/weather", "source": "github"})
        fake = fake_registry(p1, p2, p3)
        with mock.patch.object(rd, "_get_json", fake):
            vs = rd.versions("io.github.acme/weather")
            self.assertEqual([v["version"] for v in vs], ["1.0.0", "1.0.1", "1.1.0"])
            self.assertEqual([v["isLatest"] for v in vs], [False, False, True])
            res = rd.diff_registry_versions("io.github.acme/weather")
            self.assertEqual((res["old"]["version"], res["new"]["version"]), ("1.0.1", "1.1.0"))
            self.assertTrue(res["up002"])
            res = rd.diff_registry_versions("io.github.acme/weather", "1.0.0", "1.0.1")
            self.assertFalse(res["up002"])
        self.assertTrue(all("io.github.acme%2Fweather" in u for u in fake.calls))

    def test_deep_merges_package_diff(self):
        p1 = load("pkg_v1")
        p2 = bump(p1, "1.0.1", "2026-02-01T00:00:00Z")
        pkg_res = updiff.finalize({"old": {"label": "npm:@acme/weather-mcp@1.0.0", "trust": 90, "grade": "A"},
                                   "new": {"label": "npm:@acme/weather-mcp@1.0.1", "trust": 90, "grade": "A"},
                                   "triggers": [{"kind": "finding", "rule": "ATL-CR-001", "reason": "new bulk env dump",
                                                 "evidence": "src/x.js:1"}]})
        with mock.patch.object(rd, "_get_json", fake_registry(p1, p2)), \
                mock.patch.object(updiff, "diff_package_versions", return_value=pkg_res) as dpv:
            shallow = rd.diff_registry_versions("io.github.acme/weather")
            deep = rd.diff_registry_versions("io.github.acme/weather", deep=True)
        self.assertFalse(shallow["up002"])
        self.assertTrue(deep["up002"])
        dpv.assert_called_once()
        self.assertEqual(dpv.call_args[0][:4], ("npm", "@acme/weather-mcp", "1.0.0", "1.0.1"))
        self.assertIn("ATL-CR-001", {t["rule"] for t in deep["triggers"]})


class WatchRegistry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if ALLOWLIST not in sys.path:
            sys.path.insert(0, ALLOWLIST)
        import atlas_watch
        cls.w = atlas_watch

    def _check(self, doc, fake, state=None, extra=()):
        with tempfile.TemporaryDirectory() as t:
            inp = os.path.join(t, "decisions.json")
            with open(inp, "w") as fh:
                json.dump(doc, fh)
            sp = os.path.join(t, "state.json")
            if state:
                with open(sp, "w") as fh:
                    json.dump(state, fh)
            with mock.patch.object(rd, "_get_json", fake), contextlib.redirect_stdout(io.StringIO()):
                code = self.w.main(["check", inp, "--out-dir", t, "--state", sp, *extra])
            with open(os.path.join(t, "atlas-watch-report.json")) as fh:
                rep = json.load(fh)
            with open(os.path.join(t, "atlas-watch-report.md")) as fh:
                md = fh.read()
            with open(sp) as fh:
                st = json.load(fh)
        return code, rep, md, st

    def test_remote_only_item_exit_20(self):
        doc = {"items": [{"name": "weather-remote", "kind": "mcp", "decision": "approved",
                          "registry_name": "io.github.acme/weather-remote",
                          "config": {"type": "http", "url": "https://mcp.acme-weather.example/mcp"}}]}
        fake = fake_registry(load("remote_v1"), load("remote_v2_tunnel"))
        # first run: baseline = latest
        code, rep, _, st = self._check(doc, fake_registry(load("remote_v1")))
        self.assertEqual(code, 0)
        self.assertEqual(rep["records"][0]["status"], "baseline-recorded")
        self.assertEqual(st["registry"]["io.github.acme/weather-remote"]["approved"], "2.0.0")
        # registry moved the remote to a tunnel host
        code, rep, md, st2 = self._check(doc, fake, state=st)
        self.assertEqual(code, 20)
        r = rep["records"][0]
        self.assertEqual((r["status"], r["package"], r["approved"], r["latest"]),
                         ("up002", "registry:io.github.acme/weather-remote", "2.0.0", "2.0.1"))
        self.assertTrue(r["remote_only"])
        self.assertIn("挙動の変化：新しいパターンを検出", md)
        self.assertIn("trycloudflare.com", md)
        for w in BANNED:
            self.assertNotIn(w, md.lower())
        self.assertEqual(st2["registry"]["io.github.acme/weather-remote"]["approved"], "2.0.0")  # until re-approved

    def test_registry_map_and_config_key(self):
        fake = fake_registry(load("remote_v1"), load("remote_v2_tunnel"))
        doc = {"mcpServers": {"wx": {"type": "http", "url": "https://mcp.acme-weather.example/mcp"}}}
        code, rep, _, _ = self._check(doc, fake, state={"registry": {"io.github.acme/weather-remote": {"approved": "2.0.0"}}},
                                      extra=["--registry-map", "wx=io.github.acme/weather-remote"])
        self.assertEqual(code, 20)
        doc = {"mcpServers": {"wx": {"type": "http", "url": "https://mcp.acme-weather.example/mcp",
                                     "x-registry-name": "io.github.acme/weather-remote", "x-registry-version": "2.0.1"}}}
        code, rep, _, _ = self._check(doc, fake)
        self.assertEqual((code, rep["records"][0]["status"], rep["records"][0]["approved_source"]),
                         (0, "up-to-date", "pinned in config"))

    def test_registry_diff_cli(self):
        fake = fake_registry(load("pkg_v1"), load("pkg_v2_poisoned_desc"))
        with tempfile.TemporaryDirectory() as t, mock.patch.object(rd, "_get_json", fake), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            jp = os.path.join(t, "r.json")
            self.assertEqual(self.w.main(["registry-diff", "io.github.acme/weather", "--json", jp, "--md",
                                          os.path.join(t, "r.md")]), 20)
            with open(jp) as fh:
                self.assertTrue(json.load(fh)["up002"])
            self.assertEqual(self.w.main(["registry-diff", "io.github.acme/weather", "1.0.0", "1.0.0"]), 0)
        self.assertIn("UP-002=YES", out.getvalue())
        with contextlib.redirect_stderr(io.StringIO()), mock.patch.object(rd, "_get_json", fake):
            self.assertEqual(self.w.main(["registry-diff", "io.github.nobody/none"]), 2)


if __name__ == "__main__":
    unittest.main()
