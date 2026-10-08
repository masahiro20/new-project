#!/usr/bin/env python3
"""Atlas UP-002 for the official MCP Registry -- diff two server.json versions. READ-ONLY, stdlib only.

    versions("io.github.owner/server")              # [{version, status, publishedAt, isLatest, ...}] oldest first
    get("io.github.owner/server", "1.2.0")          # {"server": {...server.json...}, "_meta": {...}}
    diff_server_json(old_entry, new_entry)          # evidence + UP-002 triggers (offline)
    diff_registry_versions(name, old=None, new=None, deep=False)
        # default: old = version published before the latest, new = latest.
        # deep=True: also diff the npm/PyPI package archives (updiff.diff_package_versions).

Remote-only servers (no package, only `remotes[]`) have nothing to download, so the
registry version history is the only signal: this module is how Atlas watches them.

UP-002 triggers (registry metadata):
  * repository URL changed (or removed);
  * a package identifier / registryType added or changed;
  * a package version moved to a floating spec (latest, ^1, *, OCI image without a fixed tag ...);
  * a remote URL on a new host (incl. a new remote) -- flagged harder for ephemeral tunnel
    hosts (trycloudflare.com, ngrok ...), raw IP addresses and plain http;
  * a package transport type changed (e.g. stdio -> streamable-http);
  * a new required environment variable marked secret;
  * the server description/title gains a tool-poisoning pattern (scan.R ATL-TP-001..005,
    plus invisible-character rules ATL-OB-001/002).
Info only: status changed to deprecated / deleted.  Evidence only: version bump,
description text change (difflib), removed packages/remotes, same-host remote URL change,
remote type change (sse <-> streamable-http), header / argument changes.

Wording rule: "behaviour changed: new pattern(s) detected" / 「挙動の変化：新しいパターンを検出」.
Never call a server malicious -- this is a diff of declared metadata, not a verdict on intent.
Nothing is installed, imported, built or executed; only registry JSON is read.
"""
import ipaddress
import json
import re
import sys
import os
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import scan  # noqa: E402
import updiff  # noqa: E402

BASE = "https://registry.modelcontextprotocol.io/v0/servers"
ALLOWED_HOSTS = {"registry.modelcontextprotocol.io"}
UA = "atlas-registry-diff/0.1 (static analysis; never installs)"
META_KEY = "io.modelcontextprotocol.registry/official"
RULE = updiff.RULE
TRUST_CAP = updiff.TRUST_CAP
DESC_RULES = ("ATL-TP-001", "ATL-TP-002", "ATL-TP-003", "ATL-TP-004", "ATL-TP-005", "ATL-OB-001", "ATL-OB-002")
EPHEMERAL_HOSTS = ("trycloudflare.com", "ngrok.io", "ngrok.app", "ngrok-free.app", "ngrok-free.dev", "ngrok.dev",
                   "loca.lt", "localtunnel.me", "serveo.net", "serveousercontent.com", "localhost.run", "lhr.life",
                   "pinggy.io", "pinggy.link", "bore.pub", "playit.gg", "devtunnels.ms", "tunnelmole.net",
                   "webhook.site", "pipedream.net", "requestbin.net", "oast.fun", "interact.sh")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
EXACT_VER = re.compile(r"^v?\d+(\.\d+)*([.-]?[0-9A-Za-z.-]+)?(\+[\w.]+)?$")
FLOAT_WORDS = {"", "latest", "next", "*", "x", "stable", "main", "master", "nightly", "canary", "beta", "alpha", "edge"}


class RegistryError(Exception):
    pass


# ---------------------------------------------------------------------------
# HTTP (registry JSON only)
# ---------------------------------------------------------------------------
def _get_json(url, timeout=60):
    """GET a registry URL as JSON. Tests patch this function."""
    p = urllib.parse.urlparse(url)
    if p.scheme != "https" or (p.hostname or "") not in ALLOWED_HOSTS:
        raise RegistryError(f"refusing non-registry URL: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (allow-listed https host)
            data = r.read(20 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as e:
        raise RegistryError(f"HTTP {e.code} for {url}") from None
    if len(data) > 20 * 1024 * 1024:
        raise RegistryError(f"response too large: {url}")
    return json.loads(data.decode("utf-8"))


def _q(s):
    return urllib.parse.quote(str(s), safe="")


def _meta(entry):
    return ((entry or {}).get("_meta") or {}).get(META_KEY) or {}


def versions(name):
    """All versions of a registry server, oldest first (by publishedAt).

    [{version, status, publishedAt, updatedAt, statusChangedAt, isLatest}]
    """
    out, cursor = [], None
    for _ in range(50):  # pagination guard
        url = f"{BASE}/{_q(name)}/versions" + (f"?cursor={_q(cursor)}" if cursor else "")
        d = _get_json(url)
        for e in d.get("servers") or []:
            m = _meta(e)
            out.append({"version": (e.get("server") or {}).get("version"), "status": m.get("status"),
                        "publishedAt": m.get("publishedAt"), "updatedAt": m.get("updatedAt"),
                        "statusChangedAt": m.get("statusChangedAt"), "isLatest": bool(m.get("isLatest"))})
        cursor = (d.get("metadata") or {}).get("nextCursor")
        if not cursor or not d.get("servers"):
            break
    if not out:
        raise RegistryError(f"no versions for {name}")
    out.sort(key=lambda v: (v.get("publishedAt") or "", v.get("version") or ""))
    return out


def get(name, version):
    """One version entry: {"server": server.json, "_meta": {...}}."""
    d = _get_json(f"{BASE}/{_q(name)}/versions/{_q(version)}")
    if not isinstance(d, dict) or not isinstance(d.get("server"), dict):
        raise RegistryError(f"unexpected response for {name}@{version}")
    return d


def latest_version(vs):
    lat = [v for v in vs if v["isLatest"]]
    return (lat[-1] if lat else vs[-1])["version"]


def previous_version(vs, ver):
    """The version published just before `ver` (None if `ver` is the first)."""
    idx = [i for i, v in enumerate(vs) if v["version"] == ver]
    if not idx or idx[0] == 0:
        return None
    return vs[idx[0] - 1]["version"]


# ---------------------------------------------------------------------------
# server.json comparison (offline)
# ---------------------------------------------------------------------------
def _split(entry):
    """Accept {"server":..., "_meta":...} or a bare server.json dict."""
    entry = entry or {}
    if isinstance(entry.get("server"), dict):
        return entry["server"], _meta(entry)
    return entry, ((entry.get("_meta") or {}).get(META_KEY) or {})


def _norm_url(u):
    u = str(u or "").strip()
    if not u:
        return None
    u = re.sub(r"^git\+", "", u)
    u = u.removesuffix("/").removesuffix(".git").rstrip("/")
    return u.lower()


def _host(url):
    try:
        return (urllib.parse.urlparse(str(url)).hostname or "").lower()
    except ValueError:
        return ""


def host_flags(url):
    """Risk tags for a remote URL: ephemeral-tunnel host, raw IP, plain http."""
    p = urllib.parse.urlparse(str(url or ""))
    h = (p.hostname or "").lower()
    flags = []
    if any(h == e or h.endswith("." + e) for e in EPHEMERAL_HOSTS):
        flags.append("ephemeral tunnel host")
    try:
        ipaddress.ip_address(h)
        flags.append("raw IP address")
    except ValueError:
        pass
    if p.scheme == "http" and h not in LOCAL_HOSTS:
        flags.append("plain http")
    return flags


def _oci_split(ident):
    """'ghcr.io/o/i:1.2' -> ('ghcr.io/o/i', '1.2'); digest pins count as exact."""
    ident = str(ident or "")
    if "@sha256:" in ident:
        base, dig = ident.split("@", 1)
        return base.rsplit(":", 1)[0] if ":" in base.rsplit("/", 1)[-1] else base, dig
    last = ident.rsplit("/", 1)[-1]
    if ":" in last:
        base, tag = ident.rsplit(":", 1)
        return base, tag
    return ident, None


def _pkg_key(p, server_version=None):
    rt = str(p.get("registryType") or "?").lower()
    ident = str(p.get("identifier") or "")
    if rt == "oci":
        ident = _oci_split(ident)[0]
    elif rt not in ("npm", "pypi"):
        # mcpb / nuget / cargo identifiers are often download URLs that embed the version
        for v in {str(p.get("version") or ""), str(server_version or "")} - {""}:
            ident = ident.replace(v, "<v>")
    return rt, ident


def _pkg_version(p):
    rt = str(p.get("registryType") or "").lower()
    v = p.get("version")
    if rt == "oci" and not v:
        v = _oci_split(p.get("identifier"))[1]
    return None if v is None else str(v).strip()


def is_floating(ver, rt=None):
    """True for 'latest', ranges (^1, ~1.2, >=1, 1.x, *), empty / missing (OCI: no tag)."""
    if ver is None:
        return True
    v = str(ver).strip()
    if v.lower() in FLOAT_WORDS:
        return True
    if v.startswith("sha256:"):
        return False
    if re.search(r"[\^~<>=*|]|\s-\s|\bx\b|\.x\b|\.\*", v, re.I):
        return True
    return not EXACT_VER.match(v)


def _transport(p):
    t = p.get("transport")
    if isinstance(t, dict):
        return t.get("type")
    return t


def _env(p):
    return {str(e.get("name")): e for e in (p.get("environmentVariables") or []) if isinstance(e, dict) and e.get("name")}


def _desc_hits(text):
    """{rule: [matched text]} for the tool-poisoning rules on free text."""
    hits = {}
    for r in scan.R:
        if r["id"] in DESC_RULES:
            ms = [m.group(0) for m in r["re"].finditer(text or "")]
            if ms:
                hits[r["id"]] = ms
    return hits


def _trig(reason, evidence, rule=RULE, kind="registry"):
    return {"kind": kind, "rule": rule, "reason": reason, "evidence": evidence[:400]}


def diff_server_json(old, new, old_label=None, new_label=None):
    """Compare two registry entries (or bare server.json). Returns the result dict (see module doc)."""
    os_, om = _split(old)
    ns, nm = _split(new)
    name = ns.get("name") or os_.get("name") or "?"
    ov, nv = os_.get("version"), ns.get("version")
    ev, info, trig = [], [], []

    # version / timestamps
    if ov != nv:
        ev.append(f"version: {ov} -> {nv}")
    if om.get("publishedAt") or nm.get("publishedAt"):
        ev.append(f'published: {ov} {om.get("publishedAt")} -> {nv} {nm.get("publishedAt")}')

    # status
    ost, nst = om.get("status"), nm.get("status")
    if ost != nst and nst:
        line = f"status: {ost} -> {nst}"
        (info if nst in ("deprecated", "deleted") else ev).append(line)

    # repository
    orp, nrp = os_.get("repository") or {}, ns.get("repository") or {}
    ou, nu = _norm_url(orp.get("url")), _norm_url(nrp.get("url"))
    if ou != nu:
        line = f'repository URL changed: {orp.get("url")} -> {nrp.get("url")}'
        if ou:
            trig.append(_trig("repository URL changed", line))
        ev.append(line)
    if (orp.get("subfolder") or None) != (nrp.get("subfolder") or None):
        ev.append(f'repository subfolder: {orp.get("subfolder")} -> {nrp.get("subfolder")}')

    # packages
    op = {_pkg_key(p, ov): p for p in (os_.get("packages") or []) if isinstance(p, dict)}
    np_ = {_pkg_key(p, nv): p for p in (ns.get("packages") or []) if isinstance(p, dict)}
    old_types = {k[0] for k in op}
    pkg_pairs = []
    for k, p in np_.items():
        label = f"{k[0]}:{k[1]}"
        nver = _pkg_version(p)
        if k not in op:
            what = "registryType changed" if k[0] not in old_types and op else "identifier added/changed"
            line = f"package {label} added (version {nver}, transport {_transport(p)})"
            if op:
                line += "; old packages: " + ", ".join(f"{a}:{b}" for a, b in op)
            trig.append(_trig(f"package {what}: {label}", line))
            ev.append(line)
            continue
        q = op[k]
        over = _pkg_version(q)
        pkg_pairs.append({"registryType": k[0], "identifier": k[1], "old": over, "new": nver})
        if over != nver:
            ev.append(f"package {label} version: {over} -> {nver}")
        if is_floating(nver, k[0]) and not is_floating(over, k[0]):
            trig.append(_trig(f"package version moved to a floating spec: {label}",
                              f"package {label} version {over!r} -> {nver!r}"))
        ot, nt = _transport(q), _transport(p)
        if ot != nt:
            trig.append(_trig(f"package transport changed: {label} {ot} -> {nt}",
                              f"package {label} transport.type {ot!r} -> {nt!r}"))
            ev.append(f"package {label} transport: {ot} -> {nt}")
        oe, ne = _env(q), _env(p)
        for en, e in sorted(ne.items()):
            if en in oe:
                pe = oe[en]
                if (e.get("isRequired") and e.get("isSecret")) and not (pe.get("isRequired") and pe.get("isSecret")):
                    trig.append(_trig(f"environment variable became required secret: {en}",
                                      f"package {label} env {en}: required/secret now true"))
                continue
            line = (f"package {label} new env {en} (required={bool(e.get('isRequired'))}, "
                    f"secret={bool(e.get('isSecret'))}): {str(e.get('description') or '')[:120]}")
            ev.append(line)
            if e.get("isRequired") and e.get("isSecret"):
                trig.append(_trig(f"new required secret environment variable: {en}", line))
        for en in sorted(set(oe) - set(ne)):
            ev.append(f"package {label} env removed: {en}")
        for fld in ("runtimeArguments", "packageArguments", "runtimeHint", "registryBaseUrl"):
            a, b = q.get(fld), p.get(fld)
            if fld.endswith("Arguments"):
                a, b = _strip_ver(a, over), _strip_ver(b, nver)
            if a != b:
                ev.append(f"package {label} {fld} changed")
    for k in op:
        if k not in np_:
            ev.append(f"package {k[0]}:{k[1]} removed")

    # remotes
    orm = [r for r in (os_.get("remotes") or []) if isinstance(r, dict)]
    nrm = [r for r in (ns.get("remotes") or []) if isinstance(r, dict)]
    o_urls = {str(r.get("url")): r for r in orm}
    o_hosts = {_host(r.get("url")) for r in orm}
    o_flags = {f for r in orm for f in host_flags(r.get("url"))}
    for r in nrm:
        url, h = str(r.get("url")), _host(r.get("url"))
        flags = host_flags(url)
        if url in o_urls:
            if (o_urls[url].get("type") != r.get("type")):
                ev.append(f'remote {url} type: {o_urls[url].get("type")} -> {r.get("type")}')
            _header_ev(o_urls[url], r, ev)
            continue
        tag = f" [{', '.join(flags)}]" if flags else ""
        if h not in o_hosts:
            kind = "remote host changed" if orm else "new remote added"
            line = f"{kind}: {r.get('type')} {url}{tag}" + (f"; old: {', '.join(o_urls)}" if orm else "")
            trig.append(_trig(f"{kind}: {h}{tag}", line))
            ev.append(line)
        else:
            new_flags = [f for f in flags if f not in o_flags]
            line = f"remote URL changed on same host: {url}{tag}"
            ev.append(line)
            if new_flags:
                trig.append(_trig(f"remote URL now {', '.join(new_flags)}: {h}", line))
        same = [x for x in orm if _host(x.get("url")) == h]
        if same:
            _header_ev(same[0], r, ev)
    n_urls = {str(r.get("url")) for r in nrm}
    for u in o_urls:
        if u not in n_urls:
            ev.append(f"remote removed: {u}")

    # description / title
    desc_diff = None
    for fld in ("description", "title"):
        a, b = str(os_.get(fld) or ""), str(ns.get(fld) or "")
        if a == b:
            continue
        d = updiff.text_diff(a, b)
        if fld == "description":
            desc_diff = d
        ev.append(f"{fld} changed")
        oh, nh = _desc_hits(a), _desc_hits(b)
        for rid, ms in sorted(nh.items()):
            if len(ms) > len(oh.get(rid, [])):
                rt = next(r for r in scan.R if r["id"] == rid)
                trig.append(_trig(f"{fld} gained tool-poisoning pattern ({rid})",
                                  f"{fld}: {rt['title']}: {ms[-1][:120]!r}", rule=rid, kind="description"))

    res = {
        "tool": "atlas-registry-diff", "rule": RULE, "server": name,
        "old": {"label": old_label or f"registry:{name}@{ov}", "version": ov, "status": ost,
                "publishedAt": om.get("publishedAt")},
        "new": {"label": new_label or f"registry:{name}@{nv}", "version": nv, "status": nst,
                "publishedAt": nm.get("publishedAt")},
        "remote_only": bool(nrm) and not ns.get("packages"),
        "evidence": ev, "info": info, "description_diff": desc_diff,
        "package_pairs": pkg_pairs, "packages": [], "errors": [], "triggers": trig,
    }
    return finalize(res)


def _strip_ver(args, ver):
    """Argument lists often embed the version (image tags) -- ignore that part of the change."""
    s = json.dumps(args, sort_keys=True) if args is not None else ""
    return s.replace(str(ver), "<v>") if ver else s


def _header_ev(old_r, new_r, ev):
    oh = {str(h.get("name")): h for h in (old_r.get("headers") or []) if isinstance(h, dict)}
    for h in new_r.get("headers") or []:
        if isinstance(h, dict) and str(h.get("name")) not in oh:
            ev.append(f'remote {new_r.get("url")} new header {h.get("name")} '
                      f'(required={bool(h.get("isRequired"))}, secret={bool(h.get("isSecret"))})')


def finalize(res):
    up = bool(res["triggers"])
    res["up002"] = up
    res["trust_cap"] = TRUST_CAP if up else None
    if up:
        o, n = res["old"]["label"], res["new"]["label"]
        reasons = []
        for t in res["triggers"]:
            if t["reason"] not in reasons:
                reasons.append(t["reason"])
        res["banner"] = {
            "en": f"{updiff.BANNER_EN} ({o} -> {n}). Trust capped at {TRUST_CAP} until a human re-reviews: "
                  + "; ".join(reasons[:5]),
            "ja": f"{updiff.BANNER_JA}（{o} → {n}）。再レビューまで信頼スコアの上限は{TRUST_CAP}。検出 {len(res['triggers'])} 件",
        }
        res["finding"] = {"rule": RULE, "sev": "high", "ctx": "src", "file": n, "line": 0,
                          "snippet": "; ".join(reasons[:3])[:160],
                          "title": "Behaviour changed between registry versions (version diff)"}
    else:
        res["banner"] = None
        res["finding"] = None
    return res


# ---------------------------------------------------------------------------
def diff_registry_versions(name, old=None, new=None, deep=False, use_ast=True):
    """Fetch two versions from the official registry and diff them (see module doc)."""
    vs = versions(name)
    known = {v["version"] for v in vs}
    new = new or latest_version(vs)
    old = old or previous_version(vs, new)
    if not old:
        raise RegistryError(f"{name}: no version before {new} (only {len(vs)} version(s))")
    for v in (old, new):
        if v not in known:
            raise RegistryError(f"{name}: version {v} not in registry history")
    res = diff_server_json(get(name, old), get(name, new))
    res["history"] = {"count": len(vs), "latest": latest_version(vs),
                      "statuses": sorted({v["status"] for v in vs if v.get("status")})}
    if deep:
        for pp in res["package_pairs"]:
            eco = {"npm": "npm", "pypi": "pypi"}.get(pp["registryType"])
            if not eco or pp["old"] == pp["new"]:
                continue
            if is_floating(pp["old"]) or is_floating(pp["new"]):
                res["errors"].append(f'{eco}:{pp["identifier"]}: floating version, deep diff skipped')
                continue
            try:
                pd = updiff.diff_package_versions(eco, pp["identifier"], pp["old"], pp["new"], use_ast=use_ast)
            except Exception as e:  # registry/network errors are reported, not fatal
                res["errors"].append(f'{eco}:{pp["identifier"]}: deep diff failed: {type(e).__name__}: {e}'[:300])
                continue
            res["packages"].append(pd)
            for t in pd["triggers"]:
                t = dict(t, evidence=f'{pd["new"]["label"]}: {t["evidence"]}'[:400])
                res["triggers"].append(t)
        finalize(res)
    return res


# ---------------------------------------------------------------------------
def to_markdown(res, level=2):
    h = "#" * level
    o, n = res["old"], res["new"]
    L = [f'{h} {o["label"]} → {n["label"]}', ""]
    if res["up002"]:
        L += [f'> **{RULE}: {res["banner"]["en"]}**', f'> **{res["banner"]["ja"]}**', ""]
    else:
        L += ["No UP-002 trigger (no new high-risk registry change) / UP-002 該当なし", ""]
    L.append(f'- Published: {o.get("publishedAt")} → {n.get("publishedAt")}; status {o.get("status")} → {n.get("status")}'
             + ("; remote-only server" if res.get("remote_only") else ""))
    if res.get("history"):
        L.append(f'- Registry history: {res["history"]["count"]} versions, latest {res["history"]["latest"]}')
    if res["triggers"]:
        L += ["", "**Triggers:**"] + [f'- {t["reason"]} — `{t["evidence"][:200]}`' for t in res["triggers"][:20]]
    if res["info"]:
        L += ["", "**Info:**"] + [f"- {x}" for x in res["info"]]
    if res["evidence"]:
        L += ["", "**Registry metadata:**"] + [f"- {x}" for x in res["evidence"][:40]]
    if res.get("description_diff"):
        L += ["", "**Description changed:**", "```diff", res["description_diff"], "```"]
    for e in res.get("errors") or []:
        L.append(f"- note: {e}")
    for pd in res.get("packages") or []:
        L += ["", updiff.to_markdown(pd, level=level + 1)]
    return "\n".join(L) + "\n"


def summary_line(res):
    return (f'{res["old"]["label"]} -> {res["new"]["label"]}: UP-002={"YES" if res["up002"] else "no"} '
            f'triggers={len(res["triggers"])} evidence={len(res["evidence"])} info={len(res["info"])}'
            + (" remote-only" if res.get("remote_only") else "")
            + (f' packages-diffed={len(res["packages"])}' if res.get("packages") else ""))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        raise SystemExit("usage: registry_diff.py <server-name> [old] [new] [--deep]")
    deep = "--deep" in a
    a = [x for x in a if x != "--deep"]
    r = diff_registry_versions(a[0], *(a[1:3] + [None, None])[:2], deep=deep)
    print(to_markdown(r))
    print(summary_line(r))
    sys.exit(20 if r["up002"] else 0)
