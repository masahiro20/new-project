#!/usr/bin/env python3
"""Atlas UP-002 -- version-diff alerts ("changed behaviour"). READ-ONLY, stdlib only.

Compares two versions of an MCP server / package and raises ATL-UP-002 when the
new version adds behaviour that the approved version did not have:

    diff_trees(old_root, new_root)                     # two local directories (offline)
    diff_package_versions("npm", "pkg", "1.0.0", "1.0.1")   # downloads both published archives

UP-002 triggers (scan-rules-v0.md: "only new high/critical"):
  * an added live finding of severity high/critical in src/skill context;
  * an added ATL-TP-* finding (any severity) in src/skill context or in a tool-description string;
  * an added ATL-NW-002 / CR-001 / RF-001 / OB-* finding in src/skill context, or an added IN-001;
  * a new or changed install-time lifecycle script (preinstall / install / postinstall);
  * registry metadata: repository URL changed, or provenance attestation lost.
When triggered: `trust_cap: 50` and a "behaviour changed" banner (EN/JA).

Wording rule: say "behaviour changed: new pattern(s) detected" / 「挙動の変化：新しいパターンを検出」.
Never call a package malicious -- this is a diff of detected patterns, not a verdict on intent.

Nothing from either version is installed, imported, built or executed: archives are
extracted as data by pkgfetch, files are read as text, Python is parsed with `ast.parse`.
"""
import ast
import difflib
import hashlib
import json
import os
import re
import sys
import tempfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import pkgfetch  # noqa: E402
import scan  # noqa: E402
import trust as trust_mod  # noqa: E402

RULE = "ATL-UP-002"
TRUST_CAP = 50
BANNER_EN = "Behaviour changed: new pattern(s) detected"
BANNER_JA = "挙動の変化：新しいパターンを検出"
TRIGGER_RULES = ("ATL-NW-002", "ATL-CR-001", "ATL-RF-001", "ATL-IN-001")
INSTALL_SCRIPTS = ("preinstall", "install", "postinstall")
OTHER_LIFECYCLE = ("prepare", "prepublish", "prepack", "postpack", "preprepare", "postprepare")
SOURCE_EXT = scan.CODE_EXT | {".json", ".toml", ".cfg", ".yaml", ".yml"}
SOURCE_NAMES = {"package.json", "setup.py", "setup.cfg", "pyproject.toml", "SKILL.md", "binding.gyp"}
# Published archives ship compiled code in dist/ or build/: scan it there.
MAX_EXAMPLES = 10
MAX_DIFF_LINES = 40


# ---------------------------------------------------------------------------
def _norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def _key(f):
    return (f["rule"], f["file"].replace("\\", "/"), _norm(f.get("snippet")))


def _walk(root, skip=None):
    skip = scan.SKIP_DIRS if skip is None else skip
    out = {}
    for dp, dns, fns in os.walk(root):
        dns[:] = sorted(d for d in dns if d not in skip)
        for fn in fns:
            full = os.path.join(dp, fn)
            if os.path.islink(full):
                continue
            out[os.path.relpath(full, root).replace("\\", "/")] = full
    return out


def _sha(path):
    h = hashlib.sha256()
    try:
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
    except OSError:
        return None
    return h.hexdigest()


def _read(path, limit=scan.MAX_BYTES):
    try:
        if os.path.getsize(path) > limit:
            return None
        with open(path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return None
    if b"\x00" in raw[:4096]:
        return None
    return raw.decode("utf-8", "replace")


def _is_source(rel):
    base = rel.rsplit("/", 1)[-1]
    return base in SOURCE_NAMES or os.path.splitext(base)[1].lower() in SOURCE_EXT


# ---------------------------------------------------------------------------
# Tool-description extraction (cheap, no execution)
# ---------------------------------------------------------------------------
_STR = r"(?:\"(?:[^\"\\\n]|\\.)*\"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)"
_STRCAT = _STR + r"(?:\s*\+\s*" + _STR + r")*"
RE_JS_TOOL = re.compile(r"\.(?:tool|registerTool)\(\s*(" + _STR + r")\s*,\s*(" + _STRCAT + r"|\{)", re.S)
RE_JS_DESC = re.compile(r"\bdescription\s*:\s*(" + _STRCAT + r")", re.S)
RE_JS_NAME = re.compile(r"\bname\s*:\s*(" + _STR + r")\s*,")


def _js_str(lit):
    parts = re.findall(_STR, lit, re.S)
    out = []
    for p in parts:
        q, body = p[0], p[1:-1]
        if q == "`":
            out.append(body)
            continue
        try:
            out.append(ast.literal_eval(p))  # literal parsing only, never evaluation of code
        except (ValueError, SyntaxError):
            out.append(body)
    return "".join(out)


def _dotted(node):
    if isinstance(node, ast.Call):
        node = node.func
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _kw_str(call, name):
    for kw in call.keywords:
        if kw.arg == name and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
            return kw.value.value
    return None


def py_tool_descriptions(text):
    """{tool_name: description} from @*.tool(...) docstrings and Tool(name=, description=) calls."""
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError):
        return {}
    out = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dec in node.decorator_list:
                name = _dotted(dec)
                if not re.search(r"(^|\.)\w*tool$", name, re.I):
                    continue
                desc = _kw_str(dec, "description") if isinstance(dec, ast.Call) else None
                tname = (_kw_str(dec, "name") if isinstance(dec, ast.Call) else None) or node.name
                desc = desc or ast.get_docstring(node, clean=True)
                if desc:
                    out[tname] = desc
                break
        elif isinstance(node, ast.Call) and re.search(r"(^|\.)Tool$", _dotted(node)):
            tname, desc = _kw_str(node, "name"), _kw_str(node, "description")
            if tname and desc:
                out.setdefault(tname, desc)
    return out


def js_tool_descriptions(text):
    """{tool_name: description} from .tool("n", "desc") / registerTool("n", {description}) / {name, description}."""
    out = {}
    for m in RE_JS_TOOL.finditer(text):
        name = _js_str(m.group(1))
        if m.group(2) != "{":
            out[name] = _js_str(m.group(2))
            continue
        dm = RE_JS_DESC.search(text, m.end(), m.end() + 3000)
        if dm:
            between = text[m.end():dm.start()]
            if between.count("{") == between.count("}"):  # a property of this object, not a nested one
                out[name] = _js_str(dm.group(1))
    for m in RE_JS_NAME.finditer(text):
        name = _js_str(m.group(1))
        if name in out:
            continue
        window = text[m.end():m.end() + 400]
        dm = RE_JS_DESC.search(window)
        if dm and not re.search(r"[{}]", window[:dm.start()]):
            out[name] = _js_str(dm.group(1))
    return out


def tool_descriptions(root, files=None):
    """{(file, tool): description} over a tree."""
    files = files or _walk(root)
    out = {}
    for rel, full in files.items():
        ext = os.path.splitext(rel)[1].lower()
        if ext == ".py":
            fn = py_tool_descriptions
        elif ext in scan.JS_EXT and not rel.endswith(".d.ts"):
            fn = js_tool_descriptions
        else:
            continue
        text = _read(full)
        if not text:
            continue
        if ext in scan.JS_EXT and max((len(l) for l in text.splitlines()), default=0) > 5000:
            continue  # minified, as in scan.py
        for name, desc in fn(text).items():
            out[(rel, name)] = desc
    return out


def text_diff(a, b, max_lines=MAX_DIFF_LINES):
    lines = list(difflib.unified_diff(a.splitlines(), b.splitlines(), "old", "new", n=1, lineterm=""))[2:]
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"... ({len(lines) - max_lines} more diff lines)"]
    return "\n".join(l[:300] for l in lines)


# ---------------------------------------------------------------------------
def _lifecycle(files):
    """{rel_package_json: {script: cmd}} for lifecycle scripts."""
    out = {}
    for rel, full in files.items():
        if rel.rsplit("/", 1)[-1] != "package.json":
            continue
        text = _read(full) or ""
        try:
            pj = json.loads(text)
        except ValueError:
            continue
        scripts = pj.get("scripts") if isinstance(pj, dict) else None
        if isinstance(scripts, dict):
            out[rel] = {k: str(v) for k, v in scripts.items() if k in INSTALL_SCRIPTS + OTHER_LIFECYCLE}
    return out


def _script_changes(old, new, where):
    """Compare {script: cmd} dicts -> list of change dicts."""
    ch = []
    for k in sorted(set(old) | set(new)):
        a, b = old.get(k), new.get(k)
        if a == b:
            continue
        kind = "added" if a is None else "removed" if b is None else "changed"
        ch.append({"where": where, "script": k, "change": kind, "old": a, "new": b,
                   "install_time": k in INSTALL_SCRIPTS})
    return ch


def _fmt_finding(f):
    return f'[{f["sev"]}] {f["rule"]} {f["file"]}:{f["line"]} [{f.get("ctx")}/{f.get("loc", "-")}] {_norm(f.get("snippet"))[:160]}'


def _trigger_reason(f):
    rid, sev, ctx = f["rule"], f["sev"], f.get("ctx")
    hot = ctx in ("src", "skill")
    if rid.startswith("ATL-TP-") and (hot or f.get("loc") == "string:desc"):
        return "new tool-poisoning pattern (" + rid + ")"
    if rid == "ATL-IN-001" and sev != "info":
        return "new install-time lifecycle script (ATL-IN-001)"
    if hot and sev != "info" and (rid in TRIGGER_RULES or rid.startswith("ATL-OB-")):
        return "new " + f["title"].split(" (")[0].lower() + " (" + rid + ")"
    if hot and sev in ("high", "critical"):
        return f"new {sev} pattern ({rid})"
    return None


def diff_findings(old_f, new_f):
    old_live = [f for f in old_f if not f.get("suppressed")]
    new_live = [f for f in new_f if not f.get("suppressed")]
    oc = Counter(_key(f) for f in old_live)
    remaining = Counter(oc)
    added, unchanged = [], 0
    for f in new_live:
        k = _key(f)
        if remaining[k] > 0:
            remaining[k] -= 1
            unchanged += 1
        else:
            added.append(f)
    removed = []
    for f in old_live:
        k = _key(f)
        if remaining[k] > 0:
            remaining[k] -= 1
            removed.append(f)
    # file moves/renames: same rule + snippet elsewhere is "moved", not new behaviour
    pool = defaultdict(list)
    for f in removed:
        pool[(f["rule"], _norm(f.get("snippet")))].append(f)
    moved, really_added = 0, []
    for f in added:
        lk = (f["rule"], _norm(f.get("snippet")))
        if pool.get(lk):
            pool[lk].pop()
            moved += 1
        else:
            really_added.append(f)
    removed = [f for fs in pool.values() for f in fs]
    return really_added, removed, unchanged, moved


def diff_trees(old_root, new_root, package_mode=False, use_ast=True, old_label=None, new_label=None):
    """Scan both trees and compare. Returns the UP-002 result dict (see module doc)."""
    skip = scan.PACKAGE_SKIP_DIRS if package_mode else scan.SKIP_DIRS
    old_f, old_n, _ = scan.scan_repo(old_root, use_ast=use_ast, skip_dirs=skip)
    new_f, new_n, _ = scan.scan_repo(new_root, use_ast=use_ast, skip_dirs=skip)
    old_files, new_files = _walk(old_root, skip), _walk(new_root, skip)

    added, removed, unchanged, moved = diff_findings(old_f, new_f)

    # file-level changes
    f_added = sorted(set(new_files) - set(old_files))
    f_removed = sorted(set(old_files) - set(new_files))
    f_mod = sorted(r for r in set(old_files) & set(new_files) if _sha(old_files[r]) != _sha(new_files[r]))
    src = lambda xs: [x for x in xs if _is_source(x)]  # noqa: E731

    # tool-description drift
    od, nd = tool_descriptions(old_root, old_files), tool_descriptions(new_root, new_files)
    by_tool_old = defaultdict(list)
    for (rel, name), d in od.items():
        by_tool_old[name].append((rel, d))
    desc_changed, desc_added, desc_removed = [], [], []
    matched_old = set()
    for (rel, name), d in sorted(nd.items()):
        if (rel, name) in od:
            prev = od[(rel, name)]
            matched_old.add((rel, name))
        elif len(by_tool_old.get(name, [])) == 1 and (by_tool_old[name][0][0], name) not in nd:
            prev = by_tool_old[name][0][1]  # same tool, file moved
            matched_old.add((by_tool_old[name][0][0], name))
        else:
            desc_added.append({"file": rel, "tool": name, "text": d[:500]})
            continue
        if _norm(prev) != _norm(d):
            desc_changed.append({"file": rel, "tool": name, "diff": text_diff(prev, d)})
    for (rel, name), d in sorted(od.items()):
        if (rel, name) not in matched_old:
            desc_removed.append({"file": rel, "tool": name})

    # lifecycle scripts in package.json
    ol, nl = _lifecycle(old_files), _lifecycle(new_files)
    lifecycle = []
    for rel in sorted(set(ol) | set(nl)):
        lifecycle += _script_changes(ol.get(rel, {}), nl.get(rel, {}), rel)

    triggers = []
    for f in added:
        why = _trigger_reason(f)
        if why:
            triggers.append({"kind": "finding", "rule": f["rule"], "reason": why, "evidence": _fmt_finding(f)})
    for c in lifecycle:
        if c["install_time"] and c["change"] in ("added", "changed"):
            triggers.append({"kind": "lifecycle", "rule": "ATL-IN-001",
                             "reason": f'install-time script {c["change"]}: {c["script"]}',
                             "evidence": f'{c["where"]} scripts.{c["script"]}: {c["old"]!r} -> {c["new"]!r}'})

    t_old, t_new = trust_mod.trust(old_f), trust_mod.trust(new_f)
    res = {
        "tool": "atlas-updiff", "rule": RULE,
        "old": {"label": old_label or old_root, "files": old_n, "trust": t_old["trust"], "grade": t_old["grade"]},
        "new": {"label": new_label or new_root, "files": new_n, "trust": t_new["trust"], "grade": t_new["grade"]},
        "findings": {
            "added": len(added), "removed": len(removed), "unchanged": unchanged, "moved": moved,
            "added_list": [_fmt_finding(f) for f in added[:50]],
            "removed_list": [_fmt_finding(f) for f in removed[:50]],
        },
        "files": {
            "added": len(f_added), "removed": len(f_removed), "modified": len(f_mod),
            "source_added": len(src(f_added)), "source_removed": len(src(f_removed)), "source_modified": len(src(f_mod)),
            "examples": {"added": src(f_added)[:MAX_EXAMPLES], "removed": src(f_removed)[:MAX_EXAMPLES],
                         "modified": src(f_mod)[:MAX_EXAMPLES]},
        },
        "tool_descriptions": {"old": len(od), "new": len(nd), "changed": desc_changed,
                              "added": desc_added[:50], "removed": desc_removed[:50]},
        "lifecycle": lifecycle,
        "metadata": [],
        "triggers": triggers,
    }
    return finalize(res)


def finalize(res):
    """(Re)compute up002 / banner / trust cap from res['triggers']."""
    up = bool(res["triggers"])
    res["up002"] = up
    res["trust_cap"] = TRUST_CAP if up else None
    res["new"]["trust_capped"] = min(res["new"]["trust"], TRUST_CAP) if up else res["new"]["trust"]
    if up:
        o, n = res["old"]["label"], res["new"]["label"]
        reasons = sorted({t["reason"] for t in res["triggers"]})
        res["banner"] = {
            "en": f"{BANNER_EN} ({o} -> {n}). Trust capped at {TRUST_CAP} until a human re-reviews: " + "; ".join(reasons[:5]),
            "ja": f"{BANNER_JA}（{o} → {n}）。再レビューまで信頼スコアの上限は{TRUST_CAP}。検出 {len(res['triggers'])} 件",
        }
        res["finding"] = {"rule": RULE, "sev": "high", "ctx": "src", "file": n, "line": 0,
                          "snippet": "; ".join(reasons[:3])[:160], "title": "Behaviour changed between versions (version diff)"}
    else:
        res["banner"] = None
        res["finding"] = None
    return res


# ---------------------------------------------------------------------------
def _npm_version_meta(name, versions):
    """Per-version maintainers / publisher from the packument (best effort)."""
    try:
        meta = pkgfetch.npm_meta(name)
    except Exception:  # network/registry errors are reported as missing metadata
        return {}
    vs = meta.get("versions") or {}
    out = {}
    for v in versions:
        d = vs.get(v) or {}
        out[v] = {"maintainers": sorted({(m.get("name") or m.get("email") or "?") for m in (d.get("maintainers") or [])
                                          if isinstance(m, dict)}),
                  "publisher": (d.get("_npmUser") or {}).get("name") if isinstance(d.get("_npmUser"), dict) else None}
    return out


def metadata_diff(old_info, new_info, extra=None):
    """Evidence lines + triggers from registry metadata of two versions."""
    ev, trig = [], []
    if (old_info.get("repo") or None) != (new_info.get("repo") or None):
        line = f'repository URL changed: {old_info.get("repo")} -> {new_info.get("repo")}'
        ev.append(line)
        trig.append({"kind": "metadata", "rule": RULE, "reason": "repository URL changed", "evidence": line})
    if old_info.get("attestations") and not new_info.get("attestations"):
        line = "provenance attestation present in old version, missing in new version"
        ev.append(line)
        trig.append({"kind": "metadata", "rule": RULE, "reason": "provenance attestation lost", "evidence": line})
    elif not old_info.get("attestations") and new_info.get("attestations"):
        ev.append("provenance attestation added in new version")
    if (old_info.get("license") or None) != (new_info.get("license") or None):
        ev.append(f'license changed: {old_info.get("license")} -> {new_info.get("license")}')
    for c in _script_changes(old_info.get("scripts") or {}, new_info.get("scripts") or {}, "registry metadata"):
        if c["script"] in INSTALL_SCRIPTS + OTHER_LIFECYCLE:
            line = f'lifecycle script {c["change"]}: {c["script"]}: {c["old"]!r} -> {c["new"]!r}'
            ev.append(line)
            if c["install_time"] and c["change"] != "removed":
                trig.append({"kind": "lifecycle", "rule": "ATL-IN-001", "reason": f'install-time script {c["change"]}: {c["script"]}',
                             "evidence": line})
    extra = extra or {}
    o, n = extra.get(old_info.get("version")) or {}, extra.get(new_info.get("version")) or {}
    if o.get("maintainers") is not None and n.get("maintainers") is not None and o["maintainers"] != n["maintainers"]:
        add = sorted(set(n["maintainers"]) - set(o["maintainers"]))
        rem = sorted(set(o["maintainers"]) - set(n["maintainers"]))
        ev.append(f"maintainers changed: +{add} -{rem}")
    if o.get("publisher") and n.get("publisher") and o["publisher"] != n["publisher"]:
        ev.append(f'publisher changed: {o["publisher"]} -> {n["publisher"]}')
    if old_info.get("time") and new_info.get("time"):
        ev.append(f'published: {old_info["version"]} {old_info["time"]} -> {new_info["version"]} {new_info["time"]}')
    return ev, trig


def diff_package_versions(eco, name, old_ver, new_ver, workdir=None, use_ast=True):
    """Download + extract both published archives (as data) and diff them."""
    old_info = pkgfetch.resolve(eco, name, old_ver)
    new_info = pkgfetch.resolve(eco, name, new_ver)
    extra = _npm_version_meta(name, [old_info.get("version"), new_info.get("version")]) if eco == "npm" else {}
    with tempfile.TemporaryDirectory(prefix="atlas-updiff-", dir=workdir) as tmp:
        old_root = pkgfetch.fetch_extract(old_info, os.path.join(tmp, "old"))
        new_root = pkgfetch.fetch_extract(new_info, os.path.join(tmp, "new"))
        res = diff_trees(old_root, new_root, package_mode=True, use_ast=use_ast,
                         old_label=f'{eco}:{name}@{old_info.get("version")}',
                         new_label=f'{eco}:{name}@{new_info.get("version")}')
    ev, trig = metadata_diff(old_info, new_info, extra)
    res["package"] = {"eco": eco, "name": name, "old": old_info.get("version"), "new": new_info.get("version"),
                      "old_archive": old_info.get("tarball"), "new_archive": new_info.get("tarball")}
    res["metadata"] = ev
    have = {(t["rule"], t["reason"]) for t in res["triggers"]}
    if any(t["kind"] == "lifecycle" for t in res["triggers"]):
        trig = [t for t in trig if t["kind"] != "lifecycle"]  # already seen in the extracted package.json
    res["triggers"] += [t for t in trig if (t["rule"], t["reason"]) not in have]
    return finalize(res)


# ---------------------------------------------------------------------------
def to_markdown(res, level=2):
    h = "#" * level
    o, n = res["old"], res["new"]
    lines = [f'{h} {o["label"]} → {n["label"]}', ""]
    if res["up002"]:
        lines += [f'> **{RULE}: {res["banner"]["en"]}**', f'> **{res["banner"]["ja"]}**', ""]
    else:
        lines += ["No UP-002 trigger (no new high-risk pattern) / UP-002 該当なし", ""]
    fd, fl = res["findings"], res["files"]
    lines += [f'- Trust: {o["trust"]} ({o["grade"]}) → {n["trust"]} ({n["grade"]})'
              + (f' → capped {n["trust_capped"]}' if res["up002"] else ""),
              f'- Findings: +{fd["added"]} / -{fd["removed"]} / ={fd["unchanged"]} (moved {fd["moved"]})',
              f'- Files: +{fl["added"]} / -{fl["removed"]} / ~{fl["modified"]} '
              f'(source +{fl["source_added"]} / -{fl["source_removed"]} / ~{fl["source_modified"]})']
    td = res["tool_descriptions"]
    lines.append(f'- Tool descriptions: {td["old"]} → {td["new"]}, changed {len(td["changed"])}, '
                 f'added {len(td["added"])}, removed {len(td["removed"])}')
    if res["triggers"]:
        lines += ["", "**Triggers:**"] + [f'- {t["reason"]} — `{t["evidence"][:200]}`' for t in res["triggers"][:20]]
    if fd["added_list"]:
        lines += ["", "**New findings:**"] + [f"- `{x}`" for x in fd["added_list"][:15]]
    for c in td["changed"][:10]:
        lines += ["", f'**Description changed: `{c["tool"]}`** ({c["file"]})', "```diff", c["diff"], "```"]
    if res["lifecycle"]:
        lines += ["", "**Lifecycle scripts:**"] + [f'- {c["where"]} `{c["script"]}` {c["change"]}: {c["old"]!r} → {c["new"]!r}'
                                                   for c in res["lifecycle"]]
    if res["metadata"]:
        lines += ["", "**Registry metadata:**"] + [f"- {m}" for m in res["metadata"]]
    ex = fl["examples"]
    if any(ex.values()):
        lines += ["", "**Changed source files (examples):**"]
    for k in ("added", "removed", "modified"):
        if ex[k]:
            lines.append(f'- source {k}: ' + ", ".join(f"`{x}`" for x in ex[k]))
    return "\n".join(lines) + "\n"


def summary_line(res):
    fd, td = res["findings"], res["tool_descriptions"]
    return (f'{res["old"]["label"]} -> {res["new"]["label"]}: UP-002={"YES" if res["up002"] else "no"} '
            f'findings +{fd["added"]}/-{fd["removed"]}/={fd["unchanged"]} '
            f'files +{res["files"]["added"]}/-{res["files"]["removed"]}/~{res["files"]["modified"]} '
            f'desc-changed={len(td["changed"])} triggers={len(res["triggers"])}')
