"""OSV lookup for Atlas (ATL-DP-002) -- stdlib only, network reads only.

    res = check("npm", "postmark-mcp", version="1.0.16", pinned=True,
                deps=[{"name": "nodemailer", "spec": "^6.9.0"}])
    res["status"]    -> "ok" | "unavailable" | "skipped"
    res["mal_ids"]   -> ["MAL-2025-47604"]           (package + direct deps)
    res["findings"]  -> scanner-shaped findings (rule ATL-DP-002)
    res["osv_ids"]   -> ids to pass to trust.trust(osv_ids=...)

Uses https://api.osv.dev/v1/querybatch (ids only; follows next_page_token).
Responses are cached in memory per (ecosystem, name, version). A network or
parse failure gives status "unavailable"; it never raises.

Wording rule: only an OSV MAL-* entry may be called malicious, and the title
always quotes the id ("Listed as malicious in OSV (MAL-...)").

Verified live on 2026-10-08: npm `postmark-mcp` (name-only and @1.0.16) ->
MAL-2025-47604 ("Malicious code in postmark-mcp (npm)", introduced 1.0.16).
"""
import json
import os
import re
import tomllib
import threading
import urllib.error
import urllib.request

API = "https://api.osv.dev/v1"
UA = "atlas-osv/0.1 (read-only advisory lookup)"
ECOSYSTEMS = {"npm": "npm", "pypi": "PyPI", "PyPI": "PyPI"}
BATCH = 500          # API limit is 1000 queries per batch
MAX_PAGES = 10
_CACHE = {}
_LOCK = threading.Lock()


class OSVError(Exception):
    pass


def clear_cache():
    with _LOCK:
        _CACHE.clear()


def _post_json(url, body, timeout=20):
    """HTTP layer (replace in tests). Returns the decoded JSON object."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https host)
        return json.loads(r.read(20_000_000).decode("utf-8"))


def split_ids(ids):
    ids = sorted(set(ids))
    mal = [i for i in ids if str(i).upper().startswith("MAL-")]
    return {"ids": ids, "mal": mal, "vulns": [i for i in ids if i not in mal]}


def _key(q):
    return (q["ecosystem"], q["name"].lower() if q["ecosystem"] == "npm" else _norm_py(q["name"]), q.get("version") or "")


def _norm_py(n):
    return re.sub(r"[-_.]+", "-", str(n)).lower()


def query_batch(pkgs, timeout=20):
    """pkgs: [{"ecosystem": "npm"|"PyPI"|"pypi", "name", "version"?}] -> [{"ids","mal","vulns","status"}]
    (same order). status "unavailable" on any network/HTTP/JSON error."""
    qs = []
    for p in pkgs:
        eco = ECOSYSTEMS.get(p.get("ecosystem") or p.get("eco"), p.get("ecosystem") or p.get("eco"))
        q = {"ecosystem": eco, "name": str(p["name"])}
        if p.get("version"):
            q["version"] = str(p["version"])
        qs.append(q)
    out = [None] * len(qs)
    todo = []
    with _LOCK:
        for i, q in enumerate(qs):
            hit = _CACHE.get(_key(q))
            if hit is not None:
                out[i] = dict(hit)
            else:
                todo.append(i)
    # de-duplicate identical queries inside one call
    uniq = {}
    for i in todo:
        uniq.setdefault(_key(qs[i]), []).append(i)
    keys = list(uniq)
    for start in range(0, len(keys), BATCH):
        chunk = keys[start:start + BATCH]
        try:
            ids_per = _run_chunk([qs[uniq[k][0]] for k in chunk], timeout)
        except Exception as e:  # noqa: BLE001 - network must never crash a scan
            err = f"{type(e).__name__}: {e}"[:200]
            for k in chunk:
                for i in uniq[k]:
                    out[i] = {"ids": [], "mal": [], "vulns": [], "status": "unavailable", "error": err}
            continue
        for k, ids in zip(chunk, ids_per):
            res = dict(split_ids(ids), status="ok")
            with _LOCK:
                _CACHE[k] = res
            for i in uniq[k]:
                out[i] = dict(res)
    return out


def _run_chunk(queries, timeout):
    ids = [[] for _ in queries]
    pending = [(i, q) for i, q in enumerate(queries)]
    for _ in range(MAX_PAGES):
        if not pending:
            break
        body = {"queries": [{"package": {"ecosystem": q["ecosystem"], "name": q["name"]},
                             **({"version": q["version"]} if q.get("version") else {}),
                             **({"page_token": q["page_token"]} if q.get("page_token") else {})}
                            for _, q in pending]}
        resp = _post_json(API + "/querybatch", body, timeout)
        results = resp.get("results") if isinstance(resp, dict) else None
        if not isinstance(results, list) or len(results) != len(pending):
            raise OSVError("unexpected querybatch response shape")
        nxt = []
        for (i, q), r in zip(pending, results):
            r = r or {}
            for v in r.get("vulns") or []:
                if isinstance(v, dict) and v.get("id"):
                    ids[i].append(str(v["id"]))
            if r.get("next_page_token"):
                nxt.append((i, dict(q, page_token=r["next_page_token"])))
        pending = nxt
    return ids


# ---------------------------------------------------------------------------
# Direct dependencies of an extracted (never installed) package
# ---------------------------------------------------------------------------
EXACT = re.compile(r"^v?(\d+\.\d+\.\d+(?:[-+][\w.\-]+)?)$")


def _estimate_npm(spec):
    """'^1.2.3' -> ('1.2.3', True) estimated; '1.2.3' -> ('1.2.3', False); else (None, False)."""
    s = str(spec or "").strip()
    m = EXACT.match(s)
    if m:
        return m.group(1), False
    m = re.match(r"^(?:\^|~|>=|=)\s*v?(\d+\.\d+\.\d+(?:-[\w.\-]+)?)$", s)
    if m:
        return m.group(1), True
    return None, False


def npm_deps(pkg_json):
    """Direct runtime deps from a package.json dict -> [{"name","spec","version","estimated"}]."""
    out = []
    for sect in ("dependencies", "optionalDependencies"):
        d = pkg_json.get(sect) if isinstance(pkg_json, dict) else None
        if not isinstance(d, dict):
            continue
        for name, spec in d.items():
            spec = str(spec)
            real = name
            if spec.startswith("npm:"):  # alias: "x": "npm:real@^1.0.0"
                body = spec[4:]
                at = body.rfind("@")
                real, spec = (body[:at], body[at + 1:]) if at > 0 else (body, "")
            if re.match(r"^(git|git\+|github:|https?:|file:|link:|workspace:|\.|/)", spec) or re.match(r"^[\w.\-]+/[\w.\-]+", spec):
                continue  # non-registry: covered by DP-001
            ver, est = _estimate_npm(spec)
            out.append({"name": real, "spec": spec, "version": ver, "estimated": est})
    return out


REQ_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._\-]*)\s*(?:\[[^\]]*\])?\s*(?:\(?\s*([^;]*?)\s*\)?)?\s*(?:;(.*))?$")


def pypi_deps(requirements):
    """Requires-Dist / PEP 621 strings -> [{"name","spec","version","estimated"}]; extras-only skipped."""
    out = []
    for r in requirements or []:
        m = REQ_RE.match(str(r))
        if not m:
            continue
        name, spec, marker = m.group(1), (m.group(2) or "").strip(), m.group(3) or ""
        if re.search(r"\bextra\s*==", marker):
            continue
        ver, est = None, False
        m2 = re.match(r"^===?\s*([\w.\-+]+)$", spec)
        if m2 and "*" not in m2.group(1):
            ver = m2.group(1)
        else:
            m3 = re.search(r"(?:>=|~=)\s*([\w.\-+]+)", spec)
            if m3:
                ver, est = m3.group(1), True
        out.append({"name": name, "spec": spec, "version": ver, "estimated": est})
    return out


def deps_from_package(pkg_root, eco):
    """Read direct deps from an extracted package as text: package.json, or PKG-INFO /
    *.dist-info/METADATA Requires-Dist, or pyproject.toml [project].dependencies."""
    if not pkg_root or not os.path.isdir(pkg_root):
        return []
    try:
        if eco == "npm":
            with open(os.path.join(pkg_root, "package.json"), encoding="utf-8", errors="replace") as fh:
                return npm_deps(json.load(fh))
        metas = [os.path.join(pkg_root, "PKG-INFO")]
        metas += [os.path.join(pkg_root, d, "METADATA") for d in sorted(os.listdir(pkg_root)) if d.endswith(".dist-info")]
        for m in metas:
            if os.path.isfile(m):
                with open(m, encoding="utf-8", errors="replace") as fh:
                    head = fh.read(500_000).split("\n\n", 1)[0]
                reqs = [ln.split(":", 1)[1].strip() for ln in head.splitlines() if ln.lower().startswith("requires-dist:")]
                if reqs:
                    return pypi_deps(reqs)
        pp = os.path.join(pkg_root, "pyproject.toml")
        if os.path.isfile(pp):
            with open(pp, "rb") as fh:
                proj = tomllib.load(fh).get("project") or {}
            return pypi_deps(proj.get("dependencies") or [])
    except (OSError, ValueError):  # tomllib.TOMLDecodeError is a ValueError
        pass
    return []


# ---------------------------------------------------------------------------
# High-level check -> findings
# ---------------------------------------------------------------------------
def _f(sev, title, snippet, file, **kw):
    d = {"rule": "ATL-DP-002", "sev": sev, "file": file, "line": 0, "snippet": snippet[:200],
         "ctx": "src", "title": title, "source": "osv", "method": "OSV"}
    d.update(kw)
    return d


def check(eco, name, version=None, pinned=False, deps=None, resolved_version=None, timeout=20):
    """Query the server package (and direct deps) and turn the answer into findings.

    - pinned: query name+version; MAL-* -> critical, other ids -> high (affects the pinned version).
    - unpinned: query by name only (any MAL-* applies); other ids -> info. If `resolved_version`
      (what the registry serves today) is given, ids affecting it -> medium.
    - deps: name-only query (MAL-* -> critical, quarantine) + estimated/exact version query
      (other ids -> info evidence only).
    """
    eco_l = "pypi" if str(eco).lower() == "pypi" else str(eco).lower()
    if eco_l not in ("npm", "pypi"):
        return {"status": "skipped", "mal_ids": [], "osv_ids": [], "findings": [], "package": None, "deps": []}
    E = ECOSYSTEMS[eco_l]
    file = f"osv:{E}/{name}"
    deps = list(deps or [])
    qs = [{"ecosystem": E, "name": name}]                                   # 0: name-only
    vi = None
    if pinned and version:
        vi = len(qs)
        qs.append({"ecosystem": E, "name": name, "version": version})      # pinned version
    elif resolved_version:
        vi = len(qs)
        qs.append({"ecosystem": E, "name": name, "version": resolved_version})
    dep_idx = []
    for d in deps:
        a = len(qs)
        qs.append({"ecosystem": E, "name": d["name"]})
        b = None
        if d.get("version"):
            b = len(qs)
            qs.append({"ecosystem": E, "name": d["name"], "version": d["version"]})
        dep_idx.append((a, b))
    res = query_batch(qs, timeout=timeout)
    if any(r["status"] != "ok" for r in res):
        err = next((r.get("error") for r in res if r["status"] != "ok"), "")
        return {"status": "unavailable", "error": err, "mal_ids": [], "osv_ids": [], "package": None, "deps": [],
                "findings": [_f("info", "OSV lookup unavailable", f"OSV query failed ({err}); advisories not checked",
                                file)]}
    findings = []
    name_only = res[0]
    ver_res = res[vi] if vi is not None else None
    pkg_mal = sorted(set(name_only["mal"]) | set((ver_res or {}).get("mal") or []))
    for mid in pkg_mal:
        findings.append(_f("critical", f"Listed as malicious in OSV ({mid})",
                           f"{name}{'@' + version if version else ''}: {mid} (https://osv.dev/vulnerability/{mid})",
                           file, osv_id=mid))
    label = f"{name}@{version}" if pinned and version else name
    if pinned and version:
        for vid in ver_res["vulns"]:
            findings.append(_f("high", f"Known vulnerability affecting the pinned version ({vid})",
                               f"{label}: {vid} (https://osv.dev/vulnerability/{vid})", file, osv_id=vid))
    else:
        affecting = set()
        if ver_res:
            affecting = set(ver_res["vulns"])
            for vid in sorted(affecting):
                findings.append(_f("medium", f"Known vulnerability affecting the version served today ({vid})",
                                   f"{name}@{resolved_version} (launch config unpinned): {vid}", file, osv_id=vid))
        other = [v for v in name_only["vulns"] if v not in affecting]
        if other:
            findings.append(_f("info", "OSV advisories exist for some versions (launch config unpinned)",
                               f"{name}: {', '.join(other[:8])}{' …' if len(other) > 8 else ''}", file))
    dep_out = []
    dep_mal = []
    for d, (a, b) in zip(deps, dep_idx):
        mal = sorted(set(res[a]["mal"]) | set(res[b]["mal"] if b is not None else []))
        vulns = res[b]["vulns"] if b is not None else []
        dep_out.append({"name": d["name"], "spec": d.get("spec"), "version": d.get("version"),
                        "estimated": d.get("estimated"), "mal": mal, "vulns": vulns})
        for mid in mal:
            dep_mal.append(mid)
            findings.append(_f("critical", f"Listed as malicious in OSV ({mid})",
                               f"direct dependency {d['name']} {d.get('spec') or ''}: {mid} "
                               f"(https://osv.dev/vulnerability/{mid})", file + "#dependencies", osv_id=mid))
        if vulns:
            est = " (estimated: lowest version in range)" if d.get("estimated") else ""
            findings.append(_f("info", "Known vulnerability in a direct dependency",
                               f"{d['name']}@{d['version']}{est}: {', '.join(vulns[:6])}{' …' if len(vulns) > 6 else ''}",
                               file + "#dependencies"))
    mal_all = sorted(set(pkg_mal) | set(dep_mal))
    pkg_ids = sorted(set(name_only["ids"]) | set((ver_res or {}).get("ids") or []))
    return {"status": "ok", "mal_ids": mal_all, "osv_ids": sorted(set(mal_all) | set((ver_res or {}).get("vulns") or [])),
            "package": {"name": name, "version": version if pinned else resolved_version, "pinned": bool(pinned),
                        "ids": pkg_ids, "mal": pkg_mal,
                        "affecting": sorted(set((ver_res or {}).get("ids") or [])) if ver_res else None},
            "deps": dep_out, "findings": findings}


def summary_line(res):
    """One evidence line (no 'malicious' wording unless quoting MAL ids)."""
    if not res or res.get("status") == "skipped":
        return None
    if res["status"] != "ok":
        return f"OSV: unavailable ({res.get('error', '')[:80]})"
    p = res.get("package") or {}
    deps = res.get("deps") or []
    dv = sum(1 for d in deps if d["vulns"])
    aff = p.get("affecting")
    s = (f"OSV: {p.get('name')}{'@' + p['version'] if p.get('version') else ' (name only)'}: "
         + (f"{len(aff)} advisory id(s) affect this version ({len(p.get('ids') or [])} for any version); "
            if aff is not None else f"{len(p.get('ids') or [])} advisory id(s) for any version (not version-checked); ")
         + f"{len(deps)} direct dep(s) checked, {dv} with advisories (estimated versions)")
    if res.get("mal_ids"):
        s += "; MAL ids: " + ", ".join(res["mal_ids"])
    return s
