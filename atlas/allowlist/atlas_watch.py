#!/usr/bin/env python3
"""Atlas Watch -- version-diff alerts (ATL-UP-002) for approved MCP servers. Stdlib only.

    python3 -I atlas_watch.py diff npm:<pkg> <old> <new> [--json out.json] [--md out.md]
    python3 -I atlas_watch.py diff pypi:<pkg> <old> <new> [--json out.json]
    python3 -I atlas_watch.py diff-dirs <old_dir> <new_dir> [--json out.json]        # offline
    python3 -I atlas_watch.py registry-diff <server-name> [old] [new] [--deep] [--json out.json] [--md out.md]
    python3 -I atlas_watch.py check <decisions.json | report.json> [--out-dir .] [--json report.json]
                                    [--state atlas-watch-state.json] [--only a,b]
                                    [--registry-map name=io.github.owner/server ...]

`check` finds, for each approved MCP server with an npm/PyPI package, the approved
version (pinned in its config; else the version in the state file; else the
registry's latest on the first run, which is then recorded as the baseline) and
the registry's current latest. If a newer version exists it downloads both
published archives (as data only), diffs them and records a notification.

Items that carry an official MCP Registry name (`registry_name` / `x-registry-name` on
the item or in its config, a `"//"`/`_comment` string "registry-name: <name>" in the
config, or `--registry-map name=<registryName>`) are also watched through the registry's
version history (registry_diff.py) -- this is how **remote-only servers** (no package)
are covered. The approved registry version is `registry_version` on the item, else the
state file (`registry` section), else the latest on the first run (baseline).

"Notification" = local files only: atlas-watch-report.json + atlas-watch-report.md,
plus the exit code:  0 no new version | 10 new version(s), no UP-002 | 20 UP-002 triggered
(2 = only errors, e.g. registry unreachable). Nothing is posted anywhere.

Nothing is installed, imported, built or executed. Wording: "behaviour changed: new
pattern(s) detected" / 「挙動の変化：新しいパターンを検出」 -- never "malware"/"malicious".
"""
import argparse
import datetime as _dt
import json
import os
import re
import shlex
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCANNER_DIR = os.path.normpath(os.path.join(HERE, "..", "scanner"))
for _p in (SCANNER_DIR, HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import pkgfetch  # noqa: E402
import registry_diff  # noqa: E402
import updiff  # noqa: E402

EXIT_OK, EXIT_NEW, EXIT_UP002, EXIT_ERR = 0, 10, 20, 2
APPROVED_WORDS = {"approve", "approved", "allow", "allowed", "accept", "accepted", "yes"}
EXACT_VER = re.compile(r"^v?\d+(\.\d+)*([.-]?(a|b|rc|alpha|beta|pre|post|dev)[.\d]*)?(\+[\w.]+)?$", re.I)


def _now():
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def _write_json(path, data):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


def _write_text(path, text):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def ver_key(v):
    """Rough ordering for semver / PEP 440: numeric release, then pre-release < final."""
    v = str(v or "").lstrip("vV")
    m = re.match(r"^(\d+(?:\.\d+)*)(.*)$", v)
    if not m:
        return ((), 0, v)
    nums = tuple(int(x) for x in m.group(1).split("."))
    nums = nums + (0,) * (4 - len(nums)) if len(nums) < 4 else nums
    rest = m.group(2)
    pre = 0 if re.match(r"^[-.]?(a|b|rc|alpha|beta|pre|dev|canary|next)", rest, re.I) else 1
    return (nums, pre, rest)


def is_newer(latest, approved):
    if not latest or not approved or latest == approved:
        return False
    return ver_key(latest) > ver_key(approved)


# ---------------------------------------------------------------------------
# Input: decisions.json (machine-readable approvals) or the evaluate report.json
# ---------------------------------------------------------------------------
def _parse_pkg_string(s):
    """'npm:@s/p@1.2.3' / 'pypi:name==1.0' -> {eco, name, version}."""
    if ":" not in s:
        return None
    eco, rest = s.split(":", 1)
    eco = eco.lower()
    if eco == "npm":
        at = rest.rfind("@")
        name, ver = (rest[:at], rest[at + 1:]) if at > 0 else (rest, None)
    elif eco == "pypi":
        parts = re.split(r"==|@", rest, maxsplit=1)
        name, ver = parts[0], (parts[1] if len(parts) > 1 else None)
    else:
        return None
    return {"eco": eco, "name": name, "version": ver or None}


def _packages_from_config(cfg):
    """Fallback when an item has no `packages`: npx/uvx/pipx argv -> packages."""
    if not isinstance(cfg, dict):
        return []
    argv = [str(cfg.get("command") or "")] + [str(a) for a in (cfg.get("args") or [])]
    if len(argv) == 1 and " " in argv[0]:
        try:
            argv = shlex.split(argv[0])
        except ValueError:
            pass
    try:
        import allowlist_core as core  # same parser the Builder uses (read-only use)
        return [p for p in core.derive_packages(argv) if p.get("eco") in ("npm", "pypi")]
    except Exception:  # Builder unavailable or mid-edit: simple fallback
        pass
    base = os.path.basename(argv[0]).lower()
    eco = "npm" if base in ("npx", "bunx", "pnpx") else "pypi" if base in ("uvx", "pipx") else None
    if not eco:
        return []
    for a in argv[1:]:
        if a.startswith("-") or a in ("run", "dlx", "exec"):
            continue
        if eco == "npm":
            at = a.rfind("@")
            name, ver = (a[:at], a[at + 1:]) if at > 0 else (a, None)
        else:
            name, ver = (a.split("==") + [None])[:2]
        return [{"eco": eco, "name": name, "version": ver}]
    return []


def _norm_pkg(p):
    if isinstance(p, str):
        p = _parse_pkg_string(p)
    if not isinstance(p, dict) or str(p.get("eco", "")).lower() not in ("npm", "pypi") or not p.get("name"):
        return None
    ver = p.get("version")
    ver = str(ver).strip() if ver not in (None, "") else None
    pinned = p.get("pinned")
    if pinned is None:
        pinned = bool(ver and EXACT_VER.match(ver))
    if ver and not EXACT_VER.match(ver):
        pinned = False  # ranges, "latest", tags
    return {"eco": str(p["eco"]).lower(), "name": p["name"], "version": ver if pinned else None, "pinned": bool(pinned)}


def _is_approved(it):
    if it.get("approved") is True:
        return True
    for k in ("decision", "status", "verdict_human", "approval"):
        v = it.get(k)
        if isinstance(v, str) and v.strip().lower() in APPROVED_WORDS:
            return True
        if isinstance(v, dict) and str(v.get("decision") or v.get("status") or "").lower() in APPROVED_WORDS:
            return True
    return False


def _has_decision_field(it):
    return any(k in it for k in ("approved", "decision", "status", "approval"))


RE_REG_COMMENT = re.compile(r"registry[-_ ]?name\s*[:=]\s*([\w.-]+/[\w./-]+)", re.I)


def _registry_name(it, cfg, registry_map=None):
    """Official MCP Registry name for an item, if it declares one."""
    if registry_map and registry_map.get(str(it.get("name"))):
        return registry_map[str(it.get("name"))]
    for src in (it, cfg if isinstance(cfg, dict) else {}):
        for k in ("registry_name", "registryName", "x-registry-name", "x_registry_name"):
            v = src.get(k)
            if isinstance(v, str) and "/" in v:
                return v.strip()
        for k in ("//", "_comment", "comment", "x-comment"):
            v = src.get(k)
            m = RE_REG_COMMENT.search(v) if isinstance(v, str) else None
            if m:
                return m.group(1)
    return None


def load_approved(path, only=None, registry_map=None):
    """Return (servers, source_note).

    servers: [{name, packages:[{eco,name,version,pinned}], config, registry_name, registry_version}]
    """
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    note = ""
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = None
        for k in ("approved", "decisions", "items", "servers"):
            v = data.get(k)
            if isinstance(v, list):
                items = v
                if k == "approved":
                    items = [dict(i, approved=True) if isinstance(i, dict) else i for i in v]
                break
            if isinstance(v, dict) and k == "servers":
                items = [{"name": n, "config": c} for n, c in v.items()]
                break
        if items is None and isinstance(data.get("mcpServers"), dict):
            items = [{"name": n, "config": c} for n, c in data["mcpServers"].items()]
            note = "plain MCP config: all servers watched"
        items = items or []
    else:
        items = []
    items = [i for i in items if isinstance(i, dict)]
    if any(_has_decision_field(i) for i in items):
        items = [i for i in items if _is_approved(i)]
        note = note or "approved items from decisions"
    elif not note:
        note = "no approval decisions in file (evaluate report?): all MCP items watched"
    out = []
    for it in items:
        if it.get("kind") not in (None, "mcp", "server"):
            continue
        name = str(it.get("name") or "?")
        if only and name not in only:
            continue
        cfg = it.get("config") or it.get("cfg") or {}
        pk = it.get("packages")
        pkgs = [x for x in (_norm_pkg(p) for p in pk) if x] if isinstance(pk, list) and pk else \
            [x for x in (_norm_pkg(p) for p in _packages_from_config(cfg)) if x]
        rname = _registry_name(it, cfg, registry_map)
        if pkgs or rname:
            rver = it.get("registry_version") or (cfg.get("x-registry-version") if isinstance(cfg, dict) else None)
            out.append({"name": name, "packages": pkgs, "config": cfg, "registry_name": rname,
                        "registry_version": str(rver) if rver else None})
    return out, note


# ---------------------------------------------------------------------------
def load_state(path):
    try:
        with open(path, encoding="utf-8") as fh:
            st = json.load(fh)
        if isinstance(st, dict):
            st.setdefault("packages", {})
            st.setdefault("registry", {})
            return st
    except (OSError, ValueError):
        pass
    return {"tool": "atlas-watch", "packages": {}, "registry": {}}


def _trim_diff(res):
    keep = dict(res)
    td = dict(res.get("tool_descriptions") or {})
    td["added"] = td.get("added", [])[:10]
    td["removed"] = td.get("removed", [])[:10]
    keep["tool_descriptions"] = td
    return keep


def _check_registry(srv, state, now):
    """One record for a server watched through the official registry's version history."""
    rname = srv["registry_name"]
    rec = {"server": srv["name"], "package": f"registry:{rname}", "checked": now, "source": "mcp-registry"}
    st = state["registry"].setdefault(rname, {})
    try:
        vs = registry_diff.versions(rname)
        latest = registry_diff.latest_version(vs)
    except Exception as e:  # registry unreachable / unknown name
        rec.update(status="error", error=f"{type(e).__name__}: {e}"[:300])
        return rec
    st["last_seen_latest"] = latest
    st["last_checked"] = now
    if srv.get("registry_version"):
        approved, src = srv["registry_version"], "pinned in config"
    elif st.get("approved"):
        approved, src = st["approved"], "state file"
    else:
        st["approved"] = latest
        st["approved_recorded"] = now
        rec.update(status="baseline-recorded", approved=latest, approved_source="first run (latest recorded)",
                   latest=latest, up002=False)
        return rec
    rec.update(approved=approved, approved_source=src, latest=latest)
    if latest == approved:
        rec.update(status="up-to-date", up002=False)
        return rec
    pub = {v["version"]: v.get("publishedAt") or "" for v in vs}
    if approved in pub and pub[latest] <= pub[approved]:
        rec.update(status="no-newer-version", up002=False)
        return rec
    try:
        res = registry_diff.diff_server_json(registry_diff.get(rname, approved), registry_diff.get(rname, latest))
    except Exception as e:
        rec.update(status="error", error=f"registry diff failed: {type(e).__name__}: {e}"[:300], up002=False)
        return rec
    rec.update(status="up002" if res["up002"] else "new-version", up002=res["up002"],
               trust_cap=res["trust_cap"], banner=res["banner"], triggers=res["triggers"],
               summary=registry_diff.summary_line(res), diff=res, remote_only=res.get("remote_only"))
    st["notified"] = {"version": latest, "up002": res["up002"], "at": now}
    return rec


def check(path, state_path, only=None, now=None, use_ast=True, registry_map=None):
    servers, note = load_approved(path, only, registry_map)
    state = load_state(state_path)
    now = now or _now()
    records = []
    for srv in servers:
        if srv.get("registry_name"):
            records.append(_check_registry(srv, state, now))
        for p in srv["packages"]:
            key = f'{p["eco"]}:{p["name"]}'
            rec = {"server": srv["name"], "package": key, "checked": now}
            st = state["packages"].setdefault(key, {})
            try:
                latest = pkgfetch.resolve(p["eco"], p["name"], None).get("version")
            except Exception as e:  # registry unreachable / package gone
                rec.update(status="error", error=f"{type(e).__name__}: {e}"[:300])
                records.append(rec)
                continue
            st["last_seen_latest"] = latest
            st["last_checked"] = now
            if p["pinned"] and p["version"]:
                approved, src = p["version"], "pinned in config"
            elif st.get("approved"):
                approved, src = st["approved"], "state file"
            else:
                st["approved"] = latest
                st["approved_recorded"] = now
                rec.update(status="baseline-recorded", approved=latest, approved_source="first run (latest recorded)",
                           latest=latest, up002=False)
                records.append(rec)
                continue
            rec.update(approved=approved, approved_source=src, latest=latest)
            if not is_newer(latest, approved):
                rec.update(status="up-to-date" if latest == approved else "no-newer-version", up002=False)
                records.append(rec)
                continue
            try:
                res = updiff.diff_package_versions(p["eco"], p["name"], approved, latest, use_ast=use_ast)
            except Exception as e:
                rec.update(status="error", error=f"diff failed: {type(e).__name__}: {e}"[:300], up002=False)
                records.append(rec)
                continue
            rec.update(status="up002" if res["up002"] else "new-version", up002=res["up002"],
                       trust_cap=res["trust_cap"], banner=res["banner"], triggers=res["triggers"],
                       summary=updiff.summary_line(res), diff=_trim_diff(res))
            st["notified"] = {"version": latest, "up002": res["up002"], "at": now}
            records.append(rec)
    state["updated"] = now
    n_up = sum(1 for r in records if r["status"] == "up002")
    n_new = sum(1 for r in records if r["status"] in ("up002", "new-version"))
    n_err = sum(1 for r in records if r["status"] == "error")
    code = EXIT_UP002 if n_up else EXIT_NEW if n_new else EXIT_ERR if n_err and n_err == len(records) else EXIT_OK
    report = {"tool": "atlas-watch", "rule": updiff.RULE, "generated": now, "input": os.path.basename(path),
              "approval_source": note, "state": os.path.basename(state_path),
              "wording": "behaviour changed: new pattern(s) detected / 挙動の変化：新しいパターンを検出",
              "counts": {"packages": len(records), "new_versions": n_new, "up002": n_up, "errors": n_err},
              "exit_code": code, "records": records}
    return report, state, code


def report_markdown(report):
    c = report["counts"]
    L = ["# Atlas Watch — version-diff report / バージョン差分レポート", "",
         f'- Generated: {report["generated"]}  ', f'- Input: `{report["input"]}` ({report["approval_source"]})',
         f'- Packages: {c["packages"]}, new versions: {c["new_versions"]}, UP-002: {c["up002"]}, errors: {c["errors"]}',
         f'- Exit code: {report["exit_code"]}', ""]
    if c["up002"]:
        L += [f"> **{updiff.BANNER_EN} — {c['up002']} package(s). Trust capped at {updiff.TRUST_CAP} until re-reviewed.**",
              f"> **{updiff.BANNER_JA}：{c['up002']}件。再レビューまで信頼スコアの上限は{updiff.TRUST_CAP}。**", ""]
    L += ["| Server | Package | Approved | Latest | Status |", "|---|---|---|---|---|"]
    for r in report["records"]:
        L.append(f'| {r["server"]} | `{r["package"]}` | {r.get("approved", "-")} ({r.get("approved_source", "-")}) '
                 f'| {r.get("latest", "-")} | {r["status"]}{" — " + r["error"] if r.get("error") else ""} |')
    for r in report["records"]:
        if r.get("diff"):
            md = registry_diff.to_markdown if r.get("source") == "mcp-registry" else updiff.to_markdown
            L += ["", md(r["diff"], level=2)]
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------------------
def _emit_diff(res, args):
    if args.json_out:
        _write_json(args.json_out, res)
    md = updiff.to_markdown(res)
    if args.md_out:
        _write_text(args.md_out, md)
    print(md)
    print(updiff.summary_line(res))
    return EXIT_UP002 if res["up002"] else EXIT_OK


def main(argv=None):
    ap = argparse.ArgumentParser(prog="atlas_watch", description="Atlas UP-002 version-diff alerts (read-only)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("diff", help="diff two published versions: npm:<pkg> | pypi:<pkg>")
    d.add_argument("pkg")
    d.add_argument("old")
    d.add_argument("new")
    dd = sub.add_parser("diff-dirs", help="diff two local directories (offline)")
    dd.add_argument("old")
    dd.add_argument("new")
    dd.add_argument("--package", action="store_true", help="treat as extracted package archives (scan dist/, build/)")
    for p in (d, dd):
        p.add_argument("--json", dest="json_out")
        p.add_argument("--md", dest="md_out")
        p.add_argument("--no-ast", action="store_true")
    rd = sub.add_parser("registry-diff", help="diff two versions of a server in the official MCP Registry")
    rd.add_argument("server", help="registry name, e.g. io.github.owner/server")
    rd.add_argument("old", nargs="?", help="default: the version published before `new`")
    rd.add_argument("new", nargs="?", help="default: the latest version")
    rd.add_argument("--deep", action="store_true", help="also diff npm/PyPI package archives (as data)")
    rd.add_argument("--json", dest="json_out")
    rd.add_argument("--md", dest="md_out")
    rd.add_argument("--no-ast", action="store_true")
    c = sub.add_parser("check", help="check approved servers for new versions")
    c.add_argument("input", help="decisions.json or evaluate report.json")
    c.add_argument("--out-dir", default=".")
    c.add_argument("--json", dest="json_out", help="default: <out-dir>/atlas-watch-report.json")
    c.add_argument("--state", help="default: <out-dir>/atlas-watch-state.json")
    c.add_argument("--only", help="comma-separated server names")
    c.add_argument("--no-ast", action="store_true")
    c.add_argument("--registry-map", action="append", default=[], metavar="NAME=REGISTRY_NAME",
                   help="watch server NAME via the official MCP Registry (repeatable, or comma-separated)")
    a = ap.parse_args(argv)

    if a.cmd == "diff":
        if ":" not in a.pkg or a.pkg.split(":", 1)[0].lower() not in ("npm", "pypi"):
            ap.error("package must be npm:<name> or pypi:<name>")
        eco, name = a.pkg.split(":", 1)
        res = updiff.diff_package_versions(eco.lower(), name, a.old, a.new, use_ast=not a.no_ast)
        return _emit_diff(res, a)
    if a.cmd == "diff-dirs":
        res = updiff.diff_trees(a.old, a.new, package_mode=a.package, use_ast=not a.no_ast)
        return _emit_diff(res, a)
    if a.cmd == "registry-diff":
        try:
            res = registry_diff.diff_registry_versions(a.server, a.old, a.new, deep=a.deep, use_ast=not a.no_ast)
        except Exception as e:  # registry unreachable / unknown name or version
            print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
            return EXIT_ERR
        if a.json_out:
            _write_json(a.json_out, res)
        md = registry_diff.to_markdown(res)
        if a.md_out:
            _write_text(a.md_out, md)
        print(md)
        print(registry_diff.summary_line(res))
        return EXIT_UP002 if res["up002"] else EXIT_OK

    json_out = a.json_out or os.path.join(a.out_dir, "atlas-watch-report.json")
    md_out = os.path.splitext(json_out)[0] + ".md"
    state_path = a.state or os.path.join(a.out_dir, "atlas-watch-state.json")
    only = {s.strip() for s in a.only.split(",")} if a.only else None
    rmap = {}
    for spec in a.registry_map:
        for kv in spec.split(","):
            if "=" not in kv:
                ap.error(f"--registry-map expects NAME=REGISTRY_NAME, got {kv!r}")
            k, v = kv.split("=", 1)
            rmap[k.strip()] = v.strip()
    report, state, code = check(a.input, state_path, only=only, use_ast=not a.no_ast, registry_map=rmap)
    _write_json(json_out, report)
    _write_text(md_out, report_markdown(report))
    _write_json(state_path, state)
    for r in report["records"]:
        print(f'{r["status"]:<18} {r["server"]:<20} {r["package"]}  {r.get("approved", "-")} -> {r.get("latest", "-")}'
              + (f'  [{r["error"]}]' if r.get("error") else ""))
    print(f"wrote {json_out}, {md_out}, {state_path}; exit {code}")
    return code


if __name__ == "__main__":
    sys.exit(main())
