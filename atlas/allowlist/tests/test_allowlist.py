"""Tests for the Atlas Allowlist Builder prototype (stdlib unittest, no network).

Run:  cd atlas/allowlist && python3 -I -m unittest discover -s tests -v
"""
import json
import os
import re
import sys
import tempfile
import unittest

TESTS = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(TESTS)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "scanner")))
sys.path.insert(0, HERE)

import allowlist_core as core  # noqa: E402
import atlas_allowlist as cli  # noqa: E402
import web  # noqa: E402

FX = os.path.join(TESTS, "fixtures")
INDEX = os.path.join(FX, "index.json")
FAKE_KEY = "AKIAIOSFODNN7EXAMPLE"
BANNED = re.compile(r"malware|malicious", re.I)


def assert_wording(tc, text, where):
    """'malware'/'malicious' may only appear in a line that quotes an OSV MAL-* id."""
    for line in str(text).splitlines():
        if BANNED.search(line):
            tc.assertRegex(line, r"MAL-\d{4}-", f"banned wording in {where}: {line!r}")


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


def ev(name, index=INDEX):
    return core.evaluate(os.path.join(FX, name), index_path=index)


def item(rep, name):
    return next(i for i in rep["items"] if i["name"] == name)


def rules(it):
    return {f["rule"] for f in it["findings"] if not f.get("suppressed")}


class TestEvaluate(unittest.TestCase):
    def test_benign_in_index_is_approved(self):
        rep = ev("benign.mcp.json")
        for it in rep["items"]:
            self.assertEqual(it["scan_status"], "index", it["name"])
            self.assertEqual(it["recommendation"], "approve", it["verdict"])
            self.assertNotIn("ATL-UP-001", rules(it))
        self.assertIn("shell-exec", item(rep, "filesystem")["trust"]["badges"])

    def test_benign_without_index_is_config_only(self):
        rep = ev("benign.mcp.json", index=os.path.join(FX, "does-not-exist.json"))
        self.assertIsNone(rep["index"])
        for it in rep["items"]:
            self.assertEqual(it["scan_status"], "config-only")
            self.assertTrue(it["trust"]["provenance"] > 0)  # pinned launch config

    def test_floating_latest(self):
        it = item(ev("latest.mcp.json"), "foo")
        self.assertIn("ATL-UP-001", rules(it))
        self.assertNotEqual(it["recommendation"], "approve")
        self.assertTrue(any("foo@latest" in e for e in it["evidence"]))

    def test_tunnel_remote_is_not_scanned_and_flagged(self):
        rep = ev("tunnel.vscode.json")
        it = item(rep, "demo-remote")
        self.assertEqual(rep["input"]["key"], "servers")
        self.assertEqual(it["scan_status"], "remote-only")
        self.assertIn("not statically scanned", it["scan_label"])
        self.assertIn("ATL-NW-007", rules(it))
        self.assertNotIn("ATL-NW-002", rules(it))
        ph = item(rep, "plain-http")
        self.assertTrue({"ATL-NW-006", "ATL-NW-008"} <= rules(ph))
        self.assertEqual(ph["recommendation"], "deny")

    def test_inline_secret_is_flagged_and_redacted(self):
        rep = ev("secret.mcp.json")
        it = item(rep, "github")
        self.assertIn("ATL-CR-003", rules(it))
        self.assertNotIn(FAKE_KEY, json.dumps(rep))
        self.assertEqual(it["config"]["env"]["AWS_ACCESS_KEY_ID"], "${AWS_ACCESS_KEY_ID}")
        self.assertTrue(any("[REDACTED]" in e for e in it["evidence"]))
        self.assertIn("env/AWS_ACCESS_KEY_ID", json.dumps(it["evidence"]))

    def test_shell_pipe_to_shell_is_denied(self):
        it = item(ev("shell.mcp.json"), "installer")
        self.assertTrue({"ATL-RF-001", "ATL-CE-005"} <= rules(it))
        self.assertEqual(it["recommendation"], "deny")
        self.assertLessEqual(it["score"], 30)
        self.assertTrue(any(c["cap"] == 30 for c in it["trust"]["caps"]))

    def test_skills_dir(self):
        rep = core.evaluate(os.path.join(FX, "skills"), index_path=INDEX)
        self.assertEqual(rep["input"]["kind"], "skills")
        self.assertEqual({i["name"] for i in rep["items"]}, {"safe-notes", "yolo-runner"})
        yolo = item(rep, "yolo-runner")
        self.assertIn("ATL-SK-001", rules(yolo))
        self.assertTrue(any("SKILL.md:6" in e for e in yolo["evidence"]))
        self.assertEqual(rules(item(rep, "safe-notes")), set())
        self.assertLess(yolo["score"], item(rep, "safe-notes")["score"])

    def test_skill_list_json(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "skills.json")
            with open(p, "w") as fh:
                json.dump([{"name": "yolo", "source": os.path.join(FX, "skills", "yolo-runner")},
                           {"name": "remote", "source": "https://github.com/example/skills"}], fh)
            rep = core.evaluate(p, index_path=INDEX)
        self.assertIn("ATL-SK-001", rules(item(rep, "yolo")))
        self.assertEqual(item(rep, "remote")["scan_status"], "not-scanned")

    def test_package_derivation(self):
        d = core.derive_packages
        self.assertEqual(d(["npx", "-y", "@scope/pkg@1.2.3"])[0]["pinned"], True)
        self.assertEqual(d(["npx", "-y", "@scope/pkg"])[0]["name"], "@scope/pkg")
        self.assertFalse(d(["npx", "@scope/pkg@^1.0.0"])[0]["pinned"])
        self.assertFalse(d(["uvx", "mcp-server-git"])[0]["pinned"])
        self.assertTrue(d(["uvx", "--from", "mcp-server-git==1.0.0", "mcp-server-git"])[0]["pinned"])
        self.assertEqual(d(["uvx", "--from", "git+https://github.com/o/r", "x"])[0]["kind"], "git")
        img = d(["docker", "run", "-i", "--rm", "-e", "A=b", "ghcr.io/o/img:latest"])[0]
        self.assertEqual((img["eco"], img["name"], img["pinned"]), ("oci", "ghcr.io/o/img", False))
        self.assertTrue(d(["docker", "run", "img@sha256:" + "a" * 64])[0]["pinned"])
        self.assertTrue(d(["docker", "run", "localhost:5000/img:1.2"])[0]["pinned"])
        self.assertEqual(d(["cmd", "/c", "npx", "-y", "pkg@1.0.0"])[0]["name"], "pkg")
        self.assertEqual(d(["/usr/local/bin/server"]), [])

    def test_tree_url_split(self):
        self.assertEqual(core.split_tree_url("https://github.com/o/r/tree/main/src/fetch"),
                         ("https://github.com/o/r", "src/fetch"))
        self.assertEqual(core.split_tree_url("https://github.com/o/r"), ("https://github.com/o/r", None))

    def test_unknown_input(self):
        with self.assertRaises(ValueError):
            core.evaluate('{"foo": 1}', index_path=INDEX)

    def test_clone_refuses_non_https(self):
        for bad in ("file:///etc", "ext::sh -c id", "/tmp/repo", "https://github.com/o/r --upload-pack=x"):
            with self.assertRaises(ValueError):
                core.safe_clone(bad, "/nonexistent/x")


class TestBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rep = ev("mixed.mcp.json")

    def all_names(self):
        return {i["name"] for i in self.rep["items"]}

    def check_only(self, files, approved):
        mm = json.loads(files["managed-mcp.json"])
        self.assertEqual(set(mm["mcpServers"]), set(approved))
        cs = json.loads(files["claude-managed-settings.json"])
        self.assertIs(cs["allowManagedMcpServersOnly"], True)
        cp = json.loads(files["copilot-managed-settings.json"])
        expected = [core._matcher(item(self.rep, n)["config"]) for n in self.rep_order(approved)]
        self.assertEqual(cs["allowedMcpServers"], expected)
        self.assertEqual(cp["allowedMcpServers"], expected)
        for m in cs["allowedMcpServers"]:
            self.assertEqual(len(m), 1)
            self.assertIn(next(iter(m)), ("serverCommand", "serverUrl"))
        # nothing from unapproved items leaks into the allowlists
        blob = files["managed-mcp.json"] + files["claude-managed-settings.json"] + files["copilot-managed-settings.json"]
        for n in self.all_names() - set(approved):
            it = item(self.rep, n)
            self.assertNotIn(json.dumps(n), files["managed-mcp.json"])
            for token in core.argv_of(it["config"])[1:] + ([it["config"]["url"]] if it["config"].get("url") else []):
                if token not in ("-y", "-i", "--rm", "run"):
                    self.assertNotIn(token, blob, f"{n}: {token}")

    def rep_order(self, approved):
        return [i["name"] for i in self.rep["items"] if i["name"] in approved]

    def test_approve_recommended(self):
        files = core.build_outputs(self.rep, approve_recommended=True, by="tester")
        rec = {i["name"] for i in self.rep["items"] if i["recommendation"] == "approve"}
        self.assertEqual(rec, {"filesystem"})
        self.check_only(files, rec)
        md = files["decisions.md"]
        self.assertIn("tester", md)
        self.assertIn("installer", md)  # denied items are logged with reasons
        self.assertIn("NOT APPROVED", md)
        self.assertIn("https://code.claude.com/docs/en/managed-mcp", md)

    def test_explicit_approve_and_secret_placeholder(self):
        with self.assertRaises(ValueError):  # 'review' items need a recorded reason
            core.build_outputs(self.rep, approve=["github", "demo-remote"], by="t")
        files = core.build_outputs(self.rep, approve=["github", "demo-remote"], by="t",
                                   reasons={"github": "secret moved to vault", "demo-remote": "internal demo only"})
        self.check_only(files, {"github", "demo-remote"})
        mm = json.loads(files["managed-mcp.json"])
        self.assertEqual(mm["mcpServers"]["demo-remote"], {"type": "http", "url": "https://quiet-river-1234.trycloudflare.com/mcp"})
        self.assertEqual(mm["mcpServers"]["github"]["env"]["AWS_ACCESS_KEY_ID"], "${AWS_ACCESS_KEY_ID}")
        self.assertIn({"serverUrl": "https://quiet-river-1234.trycloudflare.com/mcp"},
                      json.loads(files["claude-managed-settings.json"])["allowedMcpServers"])
        for t in files.values():
            self.assertNotIn(FAKE_KEY, t)
        self.assertIn("override of 'review'", files["decisions.md"])

    def test_deny_needs_override(self):
        with self.assertRaises(ValueError):
            core.build_outputs(self.rep, approve=["installer"])
        with self.assertRaises(ValueError):  # deny override also needs a reason
            core.build_outputs(self.rep, approve=["installer"], allow_deny=True)
        files = core.build_outputs(self.rep, approve=["installer"], allow_deny=True,
                                   reasons={"installer": "vendored installer reviewed by secops"})
        self.assertIn("override of 'deny'", files["decisions.md"])

    def test_unknown_name(self):
        with self.assertRaises(ValueError):
            core.build_outputs(self.rep, approve=["nope"])

    def test_cli_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            rp = os.path.join(d, "report.json")
            import contextlib
            import io
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(cli.main(["evaluate", os.path.join(FX, "mixed.mcp.json"), "--index", INDEX, "--json", rp]), 0)
                self.assertEqual(cli.main(["build", rp, "--approve", "filesystem,foo", "--out-dir", os.path.join(d, "o"), "--by", "cli",
                                           "--reason", "foo=pinned internally via proxy"]), 0)
            out = buf.getvalue()
            self.assertIn("installer", out)
            mm = json.loads(read(os.path.join(d, "o", "managed-mcp.json")))
            self.assertEqual(set(mm["mcpServers"]), {"filesystem", "foo"})
            self.assertTrue(os.path.isfile(os.path.join(d, "o", "decisions.md")))
            assert_wording(self, out, "cli stdout")
            for fn in os.listdir(os.path.join(d, "o")):
                assert_wording(self, read(os.path.join(d, "o", fn)), fn)


class TestWording(unittest.TestCase):
    def test_no_banned_words_anywhere(self):
        reps = [ev(n) for n in ("benign.mcp.json", "latest.mcp.json", "tunnel.vscode.json",
                                "secret.mcp.json", "shell.mcp.json", "mixed.mcp.json")]
        reps.append(core.evaluate(os.path.join(FX, "skills"), index_path=INDEX))
        for r in reps:
            assert_wording(self, json.dumps(r, ensure_ascii=False, indent=1), r["input"]["display"])
            assert_wording(self, core.format_table(r), "table")
            for i in r["items"]:
                self.assertRegex(i["verdict"], r"pattern|パターン")
            files = core.build_outputs(r, approve=[i["name"] for i in r["items"]], allow_deny=True,
                                       reasons={i["name"]: "accepted in test" for i in r["items"]})
            for n, t in files.items():
                assert_wording(self, t, n)
        assert_wording(self, web.PAGE, "web page")

    def test_mal_quote_is_the_only_exception(self):
        t = core._trust([], osv_ids=["MAL-2025-1234"])
        it = core.build_item("x", "mcp", [], None, None, ["MAL-2025-1234"], "config-only", {}, config={"command": "x"})
        self.assertEqual(it["recommendation"], "deny")
        self.assertTrue(t["quarantined"])
        assert_wording(self, "\n".join(it["reasons"]), "MAL reasons")


if __name__ == "__main__":
    unittest.main()
