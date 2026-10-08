#!/usr/bin/env python3
"""Atlas OCI image inspector -- READ-ONLY, stdlib only.

Reads a container image through the OCI Distribution API over https and treats
everything it downloads as DATA. No container runtime is used (no docker /
podman / skopeo / crane) and nothing from the image is ever executed: the
config blob is parsed as JSON, layer blobs are read with tarfile into a fresh
temp dir (regular files only, guarded paths, size caps), and the application
part of the filesystem is handed to scan.scan_repo().

    res = inspect_image("ghcr.io/github/github-mcp-server")
    res["config"]        entrypoint / cmd / env (redacted) / user / ports / labels / workdir
    res["findings"]      scanner-shaped dicts with source "oci"
    res["source_repo"]   org.opencontainers.image.source (usable for DP-004)
    res["layers"]        per-layer status (scanned / skipped-size / skipped-budget / ...)

Rules emitted here
  ATL-UP-001 medium  floating tag (:latest, explicit or default); low for other tags without a digest
  ATL-IN-003 medium  image runs as root; history has curl|sh, ADD https://, chmod 777, --privileged hints
  ATL-RF-001 low/med pipe-to-shell in a build step (history); low for known installer domains
  ATL-CR-003 high/med secret-looking value baked into ENV / history (values are redacted in the output)
  ATL-OB-006 info/med native binaries (ELF / PE / Mach-O, .node, .so) in application paths
  + every scan.py rule on the extracted application paths

Wording: findings say "pattern detected"; never anything stronger.

CLI:  python3 -I oci.py <ref> [--platform linux/arm64] [--no-layers] [--max-total MB] [--json out.json]
"""
import gzip
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import scan as _scan  # noqa: E402

UA = "atlas-oci/0.1 (static analysis; never runs images)"
MB = 1024 * 1024
MAX_LAYER = 200 * MB          # skip single layers larger than this
MAX_TOTAL = 500 * MB          # stop downloading layers after this many bytes
MAX_MANIFEST = 4 * MB
MAX_CONFIG = 16 * MB
MAX_FILE = 5 * MB             # largest file written to disk (bigger ones: magic bytes only)
MAX_APP_FILES = 50000
MAX_APP_BYTES = 400 * MB
MAX_INVENTORY = 300000
DEFAULT_PLATFORM = "linux/amd64"

DOCKER_HUB = "registry-1.docker.io"
REGISTRY_ALIASES = {"docker.io": DOCKER_HUB, "index.docker.io": DOCKER_HUB, "registry.hub.docker.com": DOCKER_HUB}
# Registries / token endpoints / blob CDNs we are willing to talk to (https only).
ALLOWED_HOSTS = {DOCKER_HUB, "auth.docker.io", "production.cloudflare.docker.com",
                 "ghcr.io", "pkg-containers.githubusercontent.com",
                 "quay.io", "cdn.quay.io", "cdn01.quay.io", "cdn02.quay.io", "cdn03.quay.io",
                 "public.ecr.aws", "mcr.microsoft.com", "gcr.io", "registry.gitlab.com"}
ALLOWED_SUFFIXES = (".docker.com", ".docker.io", ".githubusercontent.com", ".quay.io", ".cloudfront.net",
                    ".data.mcr.microsoft.com", ".r2.cloudflarestorage.com", ".storage.googleapis.com")

MT_DOCKER_MANIFEST = "application/vnd.docker.distribution.manifest.v2+json"
MT_DOCKER_LIST = "application/vnd.docker.distribution.manifest.list.v2+json"
MT_OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json"
MT_OCI_INDEX = "application/vnd.oci.image.index.v1+json"
ACCEPT = ", ".join([MT_OCI_INDEX, MT_DOCKER_LIST, MT_OCI_MANIFEST, MT_DOCKER_MANIFEST])

APP_PREFIXES = ("app", "srv", "opt", "usr/src/app", "workspace", "server")
SYSTEM_DIRS = {"", "bin", "sbin", "usr", "usr/bin", "usr/sbin", "usr/local", "usr/local/bin", "usr/local/sbin",
               "usr/lib", "usr/local/lib", "lib", "lib64", "etc", "var", "tmp", "root", "home", "/"}
INTERPRETERS = {"node", "nodejs", "python", "python3", "bun", "deno", "sh", "bash", "dash", "ash", "uv", "uvx",
                "npx", "java", "dotnet", "ruby", "php", "tini", "dumb-init", "env", "exec", "su-exec", "gosu"}
# runtime base noise: these are never "the MCP package"
GENERIC_PKGS = {"mcp", "npm", "corepack", "pip", "setuptools", "wheel", "uv", "yarn", "pnpm"}


class OCIError(Exception):
    pass


# ---------------------------------------------------------------------------
# Reference parsing
# ---------------------------------------------------------------------------
def parse_ref(ref):
    """'mcp/foo' | 'docker.io/mcp/foo:tag' | 'ghcr.io/org/img@sha256:...' -> dict.

    Returns {"registry", "repo", "tag", "digest", "floating", "default_tag", "raw"}.
    """
    raw = ref.strip()
    s = re.sub(r"^(docker|oci)://", "", raw)
    if not s or any(c.isspace() for c in s):
        raise OCIError(f"invalid image reference: {ref!r}")
    digest = None
    if "@" in s:
        s, digest = s.split("@", 1)
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise OCIError(f"unsupported digest in reference: {digest}")
    first, _, rest = s.partition("/")
    if rest and ("." in first or ":" in first or first == "localhost"):
        registry, path = first.lower(), rest
    else:
        registry, path = DOCKER_HUB, s
    registry = REGISTRY_ALIASES.get(registry, registry)
    tag = None
    last = path.rsplit("/", 1)[-1]
    if ":" in last:
        path, tag = path.rsplit(":", 1)
    default_tag = tag is None and digest is None
    if default_tag:
        tag = "latest"
    if registry == DOCKER_HUB and "/" not in path:
        path = "library/" + path
    if not re.fullmatch(r"[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*", path):
        raise OCIError(f"invalid repository name: {path!r}")
    if tag is not None and not re.fullmatch(r"[\w][\w.-]{0,127}", tag):
        raise OCIError(f"invalid tag: {tag!r}")
    return {"registry": registry, "repo": path, "tag": tag, "digest": digest,
            "floating": digest is None, "default_tag": default_tag, "raw": raw}


def host_allowed(url, extra_hosts=()):
    p = urllib.parse.urlparse(url)
    h = (p.hostname or "").lower()
    if p.scheme != "https" or not h:
        return False
    return h in ALLOWED_HOSTS or h in set(extra_hosts) or h.endswith(ALLOWED_SUFFIXES)


# ---------------------------------------------------------------------------
# HTTP (no automatic redirects: every hop is checked against the allow-list)
# ---------------------------------------------------------------------------
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class _Resp:
    def __init__(self, status, headers, fp):
        self.status, self.headers, self._fp = status, headers, fp

    def read(self, n=-1):
        return self._fp.read(n) if self._fp else b""

    def close(self):
        if self._fp:
            self._fp.close()


def urllib_transport(url, headers, timeout=60):
    """Default transport: (url, headers, timeout) -> response with .status, .headers.get(), .read(n), .close()."""
    opener = urllib.request.build_opener(_NoRedirect())
    req = urllib.request.Request(url, headers=headers)
    try:
        r = opener.open(req, timeout=timeout)  # noqa: S310 (allow-listed https hosts only)
        return _Resp(r.status, r.headers, r)
    except urllib.error.HTTPError as e:
        return _Resp(e.code, e.headers, e)


class Client:
    def __init__(self, registry, repo, transport=None, extra_hosts=(), timeout=60):
        self.registry, self.repo = registry, repo
        self.transport = transport or urllib_transport
        self.extra_hosts = tuple(extra_hosts)
        self.timeout = timeout
        self.token = None
        self.bytes = 0
        self.requests = 0

    def _check(self, url):
        if not host_allowed(url, self.extra_hosts):
            raise OCIError(f"refusing non-allow-listed or non-https URL: {url}")

    def _token_from_challenge(self, www):
        m = re.match(r"\s*Bearer\s+(.*)$", www or "", re.I)
        if not m:
            raise OCIError(f"unsupported auth challenge: {www!r}")
        params = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        realm = params.pop("realm", None)
        if not realm:
            raise OCIError("auth challenge without realm")
        self._check(realm)
        params.setdefault("scope", f"repository:{self.repo}:pull")
        url = realm + ("&" if "?" in realm else "?") + urllib.parse.urlencode(
            {k: v for k, v in params.items() if k in ("service", "scope")})
        r = self.transport(url, {"User-Agent": UA}, self.timeout)
        try:
            self.requests += 1
            if r.status != 200:
                raise OCIError(f"token endpoint returned HTTP {r.status} ({urllib.parse.urlparse(realm).hostname})")
            body = r.read(1 * MB + 1)
            self.bytes += len(body)
        finally:
            r.close()
        try:
            d = json.loads(body.decode("utf-8"))
        except ValueError as e:
            raise OCIError("token endpoint returned non-JSON") from e
        tok = d.get("token") or d.get("access_token")
        if not tok:
            raise OCIError("token endpoint returned no token")
        self.token = tok

    def open(self, path, accept=None):
        """GET https://<registry>/v2/<repo>/<path>; follows allow-listed redirects (auth dropped cross-host)."""
        url = f"https://{self.registry}/v2/{self.repo}/{path}"
        authed_host = self.registry
        tried_auth = False
        for _ in range(6):
            self._check(url)
            host = urllib.parse.urlparse(url).hostname
            h = {"User-Agent": UA}
            if accept:
                h["Accept"] = accept
            if self.token and host == authed_host:
                h["Authorization"] = "Bearer " + self.token
            r = self.transport(url, h, self.timeout)
            self.requests += 1
            if r.status == 401 and host == authed_host and not tried_auth:
                www = r.headers.get("WWW-Authenticate") if r.headers else None
                r.close()
                tried_auth = True
                self._token_from_challenge(www)
                continue
            if r.status in (301, 302, 303, 307, 308):
                loc = r.headers.get("Location") if r.headers else None
                r.close()
                if not loc:
                    raise OCIError(f"redirect without Location from {host}")
                url = urllib.parse.urljoin(url, loc)
                continue
            if r.status != 200:
                r.close()
                raise OCIError(f"HTTP {r.status} for {self.registry}/{self.repo} {path.split('/')[0]}")
            return r
        raise OCIError("too many redirects / auth retries")

    def get_bytes(self, path, limit, accept=None):
        r = self.open(path, accept)
        try:
            data = r.read(limit + 1)
        finally:
            r.close()
        self.bytes += len(data)
        if len(data) > limit:
            raise OCIError(f"response larger than {limit} bytes")
        return data, r.headers

    def get_blob_to_file(self, digest, dest_path, limit):
        """Stream a blob to disk, verifying its sha256 digest. Returns bytes written."""
        algo, _, want = digest.partition(":")
        if algo != "sha256":
            raise OCIError(f"unsupported digest algorithm: {algo}")
        r = self.open("blobs/" + digest)
        h = hashlib.sha256()
        n = 0
        try:
            with open(dest_path, "wb") as fh:
                while True:
                    chunk = r.read(1 * MB)
                    if not chunk:
                        break
                    n += len(chunk)
                    self.bytes += len(chunk)
                    if n > limit:
                        raise OCIError(f"blob {digest[:19]} larger than {limit} bytes")
                    h.update(chunk)
                    fh.write(chunk)
        finally:
            r.close()
        if h.hexdigest() != want:
            raise OCIError(f"digest mismatch for blob {digest[:19]}... (got sha256:{h.hexdigest()[:12]}...)")
        return n


def _verify(data, digest, what):
    if digest is None:
        return
    algo, _, want = digest.partition(":")
    if algo != "sha256" or hashlib.sha256(data).hexdigest() != want:
        raise OCIError(f"digest mismatch for {what} ({digest[:19]}...)")


# ---------------------------------------------------------------------------
# Manifests
# ---------------------------------------------------------------------------
def _platform_match(p, want):
    parts = want.split("/")
    os_, arch = parts[0], parts[1] if len(parts) > 1 else "amd64"
    variant = parts[2] if len(parts) > 2 else None
    if (p or {}).get("os") != os_ or p.get("architecture") != arch:
        return False
    return variant is None or p.get("variant") == variant


def fetch_manifest(client, ref, platform=DEFAULT_PLATFORM):
    """Returns (manifest dict, manifest digest, index digest or None, available platforms)."""
    target = ref["digest"] or ref["tag"]
    data, headers = client.get_bytes("manifests/" + target, MAX_MANIFEST, accept=ACCEPT)
    _verify(data, ref["digest"], "manifest")
    top_digest = "sha256:" + hashlib.sha256(data).hexdigest()
    hdr_digest = headers.get("Docker-Content-Digest") if headers else None
    if hdr_digest and hdr_digest != top_digest:
        raise OCIError("manifest digest does not match Docker-Content-Digest header")
    m = json.loads(data.decode("utf-8"))
    mt = m.get("mediaType") or (headers.get("Content-Type") if headers else "") or ""
    if mt in (MT_OCI_INDEX, MT_DOCKER_LIST) or "manifests" in m:
        plats = [f"{(d.get('platform') or {}).get('os')}/{(d.get('platform') or {}).get('architecture')}"
                 + (f"/{d['platform']['variant']}" if (d.get("platform") or {}).get("variant") else "")
                 for d in m.get("manifests") or []]
        pick = next((d for d in m.get("manifests") or [] if _platform_match(d.get("platform"), platform)), None)
        if not pick:
            raise OCIError(f"no {platform} image in index (available: {', '.join(sorted(set(plats)))})")
        data2, _ = client.get_bytes("manifests/" + pick["digest"], MAX_MANIFEST, accept=ACCEPT)
        _verify(data2, pick["digest"], "platform manifest")
        return json.loads(data2.decode("utf-8")), pick["digest"], top_digest, plats
    if m.get("schemaVersion") == 1:
        raise OCIError("schema v1 manifests are not supported")
    return m, top_digest, None, []


# ---------------------------------------------------------------------------
# Config analysis
# ---------------------------------------------------------------------------
SECRET_KEY = re.compile(r"(TOKEN|SECRET|PASSW(OR)?D|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?|AUTH|_PAT\b|_KEY$)", re.I)
SECRET_VALUE = re.compile(
    r"\b(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|sk-ant-[A-Za-z0-9_-]{20,}"
    r"|sk-(proj-)?[A-Za-z0-9]{32,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,}"
    r"|npm_[A-Za-z0-9]{36})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----")
PLACEHOLDER = re.compile(r"^(|\$\{?\w+\}?|<[^>]*>|x+|changeme|change_me|your[_-].*|example.*|dummy|placeholder|none|null|"
                         r"false|true|0|1|test|todo|\*+|replace[_-]?me)$", re.I)
NON_SECRET_KEYS = re.compile(r"(_PATH|_FILE|_DIR|_URL|_HOST|_PORT|_MODE|_TYPE|_ENABLED|_TIMEOUT|_VERSION|_HEADER|_NAME)$"
                             r"|^GPG_KEYS?$|PUBLIC_?KEY|FINGERPRINT|_KEY_?ID$|KEYRING", re.I)


def _redact(v):
    if len(v) <= 4:
        return "****"
    return v[:3] + "…" + f"({len(v)} chars)"


def _finding(rule, sev, file, snippet, title, ctx="src", line=0, **kw):
    d = {"rule": rule, "sev": sev, "file": file, "line": line, "snippet": str(snippet)[:160], "ctx": ctx,
         "title": title, "source": "oci", "method": "oci"}
    d.update(kw)
    return d


def analyse_env(env):
    """Returns (redacted env list, findings)."""
    out, finds = [], []
    for i, kv in enumerate(env or []):
        k, sep, v = str(kv).partition("=")
        hit = SECRET_VALUE.search(v)
        secretish = bool(SECRET_KEY.search(k)) and not NON_SECRET_KEYS.search(k) and not PLACEHOLDER.match(v.strip())
        if hit:
            out.append(f"{k}={_redact(v)}")
            finds.append(_finding("ATL-CR-003", "high", "image-config:Env", f"{k}={_redact(v)}",
                                  "Hard-coded secret pattern detected in image ENV", line=i + 1))
        elif secretish and len(v) >= 8:
            out.append(f"{k}={_redact(v)}")
            finds.append(_finding("ATL-CR-003", "medium", "image-config:Env", f"{k}={_redact(v)}",
                                  "Secret-looking value baked into image ENV", line=i + 1))
        elif secretish:
            out.append(f"{k}={_redact(v)}" if v else kv)
        else:
            out.append(kv if sep else k)
    return out, finds


def runs_as_root(user):
    u = (user or "").strip()
    name = u.split(":", 1)[0]
    return name in ("", "root", "0")


HIST_RULES = [
    ("pipe-to-shell (curl | sh)", re.compile(r"\b(curl|wget)\b[^\n|;&]{0,300}\|\s*(sudo\s+)?(ba|z|da)?sh\b", re.I)),
    ("ADD from a remote URL", re.compile(r"(^|\s|#\(nop\)\s*)ADD\s+(--\S+\s+)*https?://", re.I)),
    ("chmod 777 (world-writable)", re.compile(r"\bchmod\s+(-R\s+)?0?777\b", re.I)),
    ("--privileged / host namespace hint", re.compile(r"--privileged\b|--(network|net|pid)[= ]host\b|/var/run/docker\.sock", re.I)),
]


def analyse_history(history):
    finds = []
    rf = next(r for r in _scan.R if r["id"] == "ATL-RF-001")
    extra = [r for r in _scan.R if r["id"] in ("ATL-NW-002", "ATL-OB-003")]
    for i, h in enumerate(history or []):
        cb = str((h or {}).get("created_by") or "")
        if not cb:
            continue
        snip = re.sub(r"\s+", " ", cb).strip()
        for title, rx in HIST_RULES:
            if rx.search(cb):
                finds.append(_finding("ATL-IN-003", "medium", "image-history", snip,
                                      f"Image build step: {title} pattern detected", ctx="ci", line=i + 1))
        m = rf["re"].search(cb)
        if m:
            inst = _scan.INSTALLER_HOSTS.search(cb[max(0, m.start() - 10):m.end() + 10])
            finds.append(_finding("ATL-RF-001", "low" if inst else "medium", "image-history", snip,
                                  rf["title"] + " in an image build step (ran at build time, not at runtime)",
                                  ctx="ci", line=i + 1, why="known installer domain" if inst else "build-time step"))
        for r in extra:
            if r["re"].search(cb):
                finds.append(_finding(r["id"], r["sev"], "image-history", snip, r["title"], ctx="ci", line=i + 1))
        sv = SECRET_VALUE.search(cb)
        if sv:
            red = cb[:sv.start()] + _redact(sv.group(0))
            finds.append(_finding("ATL-CR-003", "high", "image-history", re.sub(r"\s+", " ", red)[:160],
                                  "Hard-coded secret pattern detected in an image build step", ctx="ci", line=i + 1))
    return finds


def summarize_config(cfgblob):
    c = cfgblob.get("config") or {}
    env, env_findings = analyse_env(c.get("Env"))
    labels = c.get("Labels") or {}
    out = {"entrypoint": c.get("Entrypoint"), "cmd": c.get("Cmd"), "workdir": c.get("WorkingDir") or "",
           "user": c.get("User") or "", "env": env, "exposed_ports": sorted((c.get("ExposedPorts") or {}).keys()),
           "volumes": sorted((c.get("Volumes") or {}).keys()), "labels": labels,
           "os": cfgblob.get("os"), "architecture": cfgblob.get("architecture"), "created": cfgblob.get("created"),
           "history_steps": len(cfgblob.get("history") or [])}
    return out, env_findings


# ---------------------------------------------------------------------------
# App-path selection
# ---------------------------------------------------------------------------
def _norm_pkg(n):
    return re.sub(r"[-_.]+", "_", n.lower())


def app_selection(config, ref):
    """Returns (path prefixes (relative, no leading slash), package-name hints)."""
    prefixes = set(APP_PREFIXES)
    hints = set()
    wd = (config.get("workdir") or "").strip("/")
    if wd and wd not in SYSTEM_DIRS:
        prefixes.add(posixpath.normpath(wd))
    argv = [str(a) for a in (config.get("entrypoint") or []) + (config.get("cmd") or [])]
    for i, a in enumerate(argv):
        if a.startswith("/"):
            p = posixpath.normpath(a).lstrip("/")
            d = posixpath.dirname(p)
            prefixes.add(p)  # the file itself (inventory / OB-006)
            if d not in SYSTEM_DIRS and not d.startswith(("usr/bin", "usr/local/bin", "bin", "sbin")):
                prefixes.add(d)
            base = posixpath.basename(p)
        else:
            base = a
        if i > 0 and argv[i - 1] == "-m":
            hints.add(_norm_pkg(a.split(".")[0]))
        if not a.startswith("-") and base not in INTERPRETERS and re.fullmatch(r"[@\w][\w@/.-]*", base) \
                and not re.search(r"\.(js|mjs|cjs|py|ts|sh)$", base):
            hints.add(_norm_pkg(base.split("@")[0] if not base.startswith("@") else base))
        m = re.search(r"node_modules/((?:@[\w.-]+/)?[\w.-]+)", a)
        if m:
            hints.add(_norm_pkg(m.group(1)))
        m = re.search(r"site-packages/([\w.-]+)", a)
        if m:
            hints.add(_norm_pkg(m.group(1)))
    title = (config.get("labels") or {}).get("org.opencontainers.image.title")
    if title:
        hints.add(_norm_pkg(title))
    hints.add(_norm_pkg(ref["repo"].rsplit("/", 1)[-1]))
    # Docker Hub mcp/<x> images ship "mcp-server-<x>" / "<x>-mcp" packages
    last = _norm_pkg(ref["repo"].rsplit("/", 1)[-1])
    hints |= {f"mcp_server_{last}", f"{last}_mcp", f"mcp_{last}", f"server_{last}"}
    hints -= {_norm_pkg(x) for x in GENERIC_PKGS | INTERPRETERS} | {""}
    prefixes.discard("")
    return prefixes, hints


NM_RX = re.compile(r"^(.*?/)?node_modules/((?:@[^/]+/)?[^/]+)(/|$)")
SP_RX = re.compile(r"^(.*?/(?:site|dist)-packages)/([^/]+)(/|$)")


def app_root_of(rel, prefixes, hints):
    """Return the application root (relative path) this file belongs to, or None."""
    m = NM_RX.match(rel)
    if m and (m.group(1) or "").rstrip("/") in ("usr/local/lib", "usr/lib", "opt/node/lib", "usr/local/share/.config/yarn/global"):
        name = _norm_pkg(m.group(2))
        if name in hints or (("mcp" in name) and name not in {"mcp", "modelcontextprotocol_sdk"}):
            return rel[:m.end(2)]
        return None
    m = SP_RX.match(rel)
    if m and not any(rel == p or rel.startswith(p.rstrip("/") + "/") for p in APP_PREFIXES):
        name = _norm_pkg(re.sub(r"(-[\d.]+)?\.(dist|egg)-info$", "", m.group(2)))
        if name in hints or name.startswith("mcp_server") or name.endswith("_mcp"):
            return rel[:m.end(2)]
        return None
    best = None
    for p in prefixes:
        if rel == p or rel.startswith(p + "/"):
            if best is None or len(p) < len(best):
                best = p
    if best:
        return best
    if rel.startswith("home/"):
        parts = rel.split("/")
        if len(parts) >= 3:
            return "/".join(parts[:2])
    return None


DEP_DIR_RX = re.compile(r"(^|/)(node_modules|site-packages|dist-packages|\.venv|venv)/")


def package_root_of(rel, hints):
    """If rel sits inside the MCP package directory under node_modules / site-packages, return that directory."""
    m = SP_RX.match(rel)
    if m:
        name = _norm_pkg(m.group(2))
        if name in hints or name.startswith("mcp_server") or name.endswith("_mcp"):
            return rel[:m.end(2)]
    for m in re.finditer(r"node_modules/((?:@[^/]+/)?[^/]+)(?=/)", rel):
        name = _norm_pkg(m.group(1))
        if name in hints or ("mcp" in name and name not in {"mcp", "modelcontextprotocol_sdk"}
                             and not name.startswith("modelcontextprotocol_sdk")):
            return rel[:m.end(1)]
    return None


# ---------------------------------------------------------------------------
# Layer extraction (data only)
# ---------------------------------------------------------------------------
def safe_rel(name):
    """Normalise a tar member name; None for absolute / parent / empty / odd names."""
    if not name or "\x00" in name:
        return None
    n = name.replace("\\", "/")
    while n.startswith("./"):
        n = n[2:]
    if n.startswith("/") or re.match(r"^[A-Za-z]:", n):
        return None
    if any(part == ".." for part in n.split("/")):
        return None
    rel = posixpath.normpath(n)
    if rel in ("", ".") or rel.startswith("../"):
        return None
    return rel


def native_kind(head, rel):
    if head[:4] == b"\x7fELF":
        return "ELF"
    if head[:2] == b"MZ":
        return "PE"
    if head[:4] in (b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe"):
        return "Mach-O"
    low = rel.lower()
    if low.endswith(".node"):
        return ".node"
    if low.endswith((".so", ".dylib", ".dll")) or re.search(r"\.so\.\d", low):
        return "shared-lib"
    return None


def _open_layer(path, media_type):
    with open(path, "rb") as fh:
        head = fh.read(4)
    if head[:2] == b"\x1f\x8b":
        return tarfile.open(fileobj=gzip.open(path, "rb"), mode="r|")
    if head == b"\x28\xb5\x2f\xfd" or "zstd" in (media_type or ""):
        try:
            from compression import zstd  # Python 3.14+
        except ImportError:
            raise OCIError("zstd-compressed layer (needs Python 3.14+ to read)") from None
        return tarfile.open(fileobj=zstd.open(path, "rb"), mode="r|")
    return tarfile.open(path, mode="r|")


class Extractor:
    """Applies layers in order. Keeps a whole-image inventory; writes only app-path files."""

    def __init__(self, dest, prefixes, hints, max_file=MAX_FILE):
        self.dest = os.path.abspath(dest)
        self.prefixes, self.hints, self.max_file = prefixes, hints, max_file
        self.inv = {}          # rel -> {"size", "type", "layer", "app_root", "native", "written"}
        self.children = {}     # dir rel ("" = /) -> set of direct child rels (files and dirs)
        self.unsafe = []
        self.inv_truncated = False
        self.app_bytes = 0
        self.app_files = 0
        self.whiteouts = 0

    def _index(self, rel):
        parts = rel.split("/")
        for i in range(len(parts)):
            parent = "/".join(parts[:i])
            self.children.setdefault(parent, set()).add("/".join(parts[:i + 1]))

    def _drop(self, p):
        e = self.inv.pop(p, None)
        if e and e.get("written"):
            try:
                os.remove(os.path.join(self.dest, p))
            except OSError:
                pass

    def _subtree(self, rel):
        out, stack = [], [rel]
        while stack:
            p = stack.pop()
            out.append(p)
            stack.extend(self.children.get(p, ()))
        return out

    def _remove(self, rel, keep, children_only=False):
        """Delete rel (or only what is below it) from inventory and disk, except paths added in this layer."""
        start = list(self.children.get(rel, ())) if children_only else [rel]
        for s in start:
            for p in self._subtree(s):
                if p in keep:
                    continue
                self._drop(p)
                kids = self.children.get(p)
                if kids is not None and not (kids & keep):
                    self.children.pop(p, None)
        if not children_only and rel not in keep:
            par = posixpath.dirname(rel)
            if rel not in self.children and par in self.children:
                self.children[par].discard(rel)

    def apply(self, layer_path, idx, media_type=None):
        stats = {"entries": 0, "files": 0, "app_files": 0, "unsafe": 0, "whiteouts": 0}
        added = set()
        with _open_layer(layer_path, media_type) as t:
            for m in t:
                stats["entries"] += 1
                if m.isdir() and m.name in ("", ".", "./", "/"):
                    continue  # the layer's root directory entry ("./" or "/")
                rel = safe_rel(m.name)
                if rel is None:
                    stats["unsafe"] += 1
                    if len(self.unsafe) < 20:
                        self.unsafe.append(m.name[:200])
                    continue
                d, base = posixpath.split(rel)
                if base == ".wh..wh..opq":
                    stats["whiteouts"] += 1
                    self._remove(d, added, children_only=True)
                    continue
                if base.startswith(".wh."):
                    stats["whiteouts"] += 1
                    target = posixpath.join(d, base[4:]) if d else base[4:]
                    self._remove(target, added)
                    continue
                if m.isdir():
                    continue
                # a new entry replaces whatever was at that path (and below it, if it was a directory)
                if rel in self.inv or rel in self.children:
                    self._remove(rel, added)
                kind = "file" if m.isreg() else "symlink" if m.issym() else "hardlink" if m.islnk() else "other"
                entry = {"size": m.size if m.isreg() else 0, "type": kind, "layer": idx}
                if kind == "symlink":
                    entry["target"] = m.linkname[:300]
                root = app_root_of(rel, self.prefixes, self.hints)
                if root:
                    entry["app_root"] = root
                if m.isreg():
                    stats["files"] += 1
                    f = t.extractfile(m) if root else None
                    if f is not None:
                        head = f.read(4)
                        entry["native"] = native_kind(head, rel)
                        stats["app_files"] += 1
                        if (m.size <= self.max_file and self.app_files < MAX_APP_FILES
                                and self.app_bytes + m.size <= MAX_APP_BYTES):
                            out = os.path.join(self.dest, rel)
                            if os.path.abspath(out).startswith(self.dest + os.sep):
                                parent = os.path.dirname(out)
                                if self._safe_parent(parent):
                                    os.makedirs(parent, exist_ok=True)
                                    if os.path.isdir(out):
                                        shutil.rmtree(out, ignore_errors=True)
                                    with open(out, "wb") as fh:
                                        fh.write(head)
                                        fh.write(f.read(m.size))
                                    entry["written"] = True
                                    self.app_files += 1
                                    self.app_bytes += m.size
                if len(self.inv) < MAX_INVENTORY:
                    self.inv[rel] = entry
                    self._index(rel)
                    added.add(rel)
                else:
                    self.inv_truncated = True
        self.whiteouts += stats["whiteouts"]
        return stats

    def _safe_parent(self, parent):
        """The parent chain must be real directories inside dest (we never create symlinks, but be strict)."""
        p = os.path.abspath(parent)
        while p.startswith(self.dest + os.sep):
            if os.path.islink(p) or (os.path.exists(p) and not os.path.isdir(p)):
                if os.path.isfile(p) and not os.path.islink(p):
                    os.remove(p)  # a file replaced by a directory in a later layer
                    return True
                return False
            p = os.path.dirname(p)
        return p == self.dest

    def inventory_summary(self, top=15):
        from collections import Counter
        tops = Counter()
        size = 0
        types = Counter()
        for rel, e in self.inv.items():
            parts = rel.split("/")
            tops["/" + "/".join(parts[:2]) if parts[0] in ("usr", "opt", "home", "var") and len(parts) > 2 else "/" + parts[0]] += 1
            size += e.get("size", 0)
            types[e["type"]] += 1
        return {"entries": len(self.inv), "bytes": size, "types": dict(types),
                "top_dirs": dict(tops.most_common(top)), "truncated": self.inv_truncated}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def _root_findings(ref):
    if ref["digest"]:
        return []
    if ref["tag"] == "latest":
        how = "default tag" if ref["default_tag"] else "explicit tag"
        return [_finding("ATL-UP-001", "medium", "image-ref", ref["raw"],
                         f"Floating image tag :latest ({how}); pin by digest", ctx="src")]
    return [_finding("ATL-UP-001", "low", "image-ref", ref["raw"],
                     "Image tag without digest (tags can be re-pointed); pin by @sha256", ctx="src")]


def inspect_image(ref, platform=DEFAULT_PLATFORM, max_total=MAX_TOTAL, max_layer=MAX_LAYER, scan_layers=True,
                  transport=None, workdir=None, keep_dir=False, use_ast=True, extra_hosts=(), timeout=60,
                  keep_inventory=False):
    """Inspect an image as data. Raises OCIError on reference / network / digest errors.

    Returns {"ref", "resolved", "digest", "index_digest", "platform", "config", "findings", "files_scanned",
             "layers", "source_repo", "revision", "notes", "bytes_downloaded", "elapsed_s", "inventory",
             "app_roots", "native_binaries"}.
    """
    t0 = time.time()
    r = parse_ref(ref)
    client = Client(r["registry"], r["repo"], transport=transport, extra_hosts=extra_hosts, timeout=timeout)
    notes = []
    findings = _root_findings(r)
    manifest, mdigest, idigest, plats = fetch_manifest(client, r, platform)
    cdesc = manifest.get("config") or {}
    if not cdesc.get("digest"):
        raise OCIError("manifest has no config descriptor")
    cdata, _ = client.get_bytes("blobs/" + cdesc["digest"], MAX_CONFIG)
    _verify(cdata, cdesc["digest"], "config blob")
    cfgblob = json.loads(cdata.decode("utf-8"))
    config, env_f = summarize_config(cfgblob)
    findings += env_f
    if runs_as_root(config["user"]):
        findings.append(_finding("ATL-IN-003", "medium", "image-config:User", config["user"] or "(no USER set)",
                                 "Image runs as root (no non-root USER in the image config)"))
    findings += analyse_history(cfgblob.get("history"))
    labels = config["labels"] or {}
    src = labels.get("org.opencontainers.image.source") or labels.get("org.label-schema.vcs-url")
    source_repo = None
    if src:
        try:
            import dp004
            source_repo = dp004.norm_repo(src) or None
        except Exception:  # noqa: BLE001
            source_repo = src
    revision = labels.get("org.opencontainers.image.revision") or labels.get("org.label-schema.vcs-ref")
    if not src:
        notes.append("No org.opencontainers.image.source label: source repo cannot be linked (DP-004 not possible).")

    layers = []
    for i, ld in enumerate(manifest.get("layers") or []):
        layers.append({"index": i, "digest": ld.get("digest"), "size": int(ld.get("size") or 0),
                       "media_type": ld.get("mediaType"), "status": "not-scanned"})
    res = {"ref": ref, "resolved": {k: r[k] for k in ("registry", "repo", "tag", "digest")},
           "digest": mdigest, "index_digest": idigest, "platform": platform, "platforms": plats,
           "config": config, "findings": findings, "files_scanned": 0, "layers": layers,
           "source_repo": source_repo, "source_label": src, "revision": revision, "notes": notes,
           "bytes_downloaded": 0, "elapsed_s": 0.0, "inventory": None, "app_roots": [], "native_binaries": {}}

    if scan_layers and layers:
        own_tmp = workdir is None
        base = tempfile.mkdtemp(prefix="atlas-oci-") if own_tmp else workdir
        os.makedirs(base, exist_ok=True)
        blobs = os.path.join(base, "blobs")
        fsroot = os.path.join(base, "rootfs")
        os.makedirs(blobs, exist_ok=True)
        os.makedirs(fsroot, exist_ok=True)
        prefixes, hints = app_selection(config, r)
        ex = Extractor(fsroot, prefixes, hints)
        total = 0
        stopped = False
        try:
            for L in layers:
                if stopped:
                    L["status"] = "skipped-budget"
                    continue
                mt = L["media_type"] or ""
                if "foreign" in mt or "nondistributable" in mt:
                    L["status"] = "skipped-foreign"
                    continue
                if L["size"] > max_layer:
                    L["status"] = "skipped-size"
                    notes.append(f"Layer {L['index']} ({L['size'] // MB} MB) larger than {max_layer // MB} MB: not downloaded.")
                    continue
                if total + L["size"] > max_total:
                    L["status"] = "skipped-budget"
                    stopped = True
                    notes.append(f"Download budget {max_total // MB} MB reached at layer {L['index']}: remaining layers not scanned.")
                    continue
                lp = os.path.join(blobs, f"layer{L['index']}")
                n = client.get_blob_to_file(L["digest"], lp, limit=max(L["size"], 1) if L["size"] else max_layer)
                total += n
                L["downloaded"] = n
                try:
                    st = ex.apply(lp, L["index"], mt)
                    L.update(st)
                    L["status"] = "scanned"
                except OCIError as e:
                    L["status"] = "skipped-format"
                    notes.append(f"Layer {L['index']}: {e}")
                except (tarfile.TarError, OSError, EOFError) as e:
                    L["status"] = "error"
                    notes.append(f"Layer {L['index']}: unreadable tar ({type(e).__name__}).")
                finally:
                    try:
                        os.remove(lp)
                    except OSError:
                        pass
            if ex.unsafe:
                notes.append(f"{sum(L.get('unsafe', 0) for L in layers)} unsafe layer entries (absolute / parent paths) skipped.")
            # application roots that still exist after whiteouts
            roots = {e["app_root"] for e in ex.inv.values() if e.get("app_root")}
            # the MCP package itself, when installed inside an app root (e.g. /app/.venv/.../site-packages/mcp_server_x,
            # /app/node_modules/@scope/x-mcp): scan_repo skips .venv / node_modules, so it becomes its own root
            pkg_roots = set()
            for rel, e in ex.inv.items():
                if e.get("app_root") and e.get("written"):
                    pr = package_root_of(rel, hints)
                    if pr:
                        pkg_roots.add(pr)
            roots = sorted(roots | pkg_roots)
            skip = _scan.PACKAGE_SKIP_DIRS
            roots = [x for x in roots if not any(
                x != y and x.startswith(y + "/") and not (set(x[len(y) + 1:].split("/")[:-1]) & skip) for y in roots)]
            res["app_roots"] = ["/" + x for x in roots]
            files_scanned = 0
            for root in roots:
                full = os.path.join(fsroot, root)
                if not os.path.isdir(full):
                    continue
                fs, n, _ = _scan.scan_repo(full, use_ast=use_ast, skip_dirs=_scan.PACKAGE_SKIP_DIRS)
                files_scanned += n
                for f in fs:
                    f["file"] = "/" + root + "/" + f["file"]
                    f["source"] = "oci"
                    findings.append(f)
            res["files_scanned"] = files_scanned
            # OB-006: native binaries in app paths
            ep = {posixpath.normpath(a).lstrip("/") for a in (config.get("entrypoint") or []) + (config.get("cmd") or [])
                  if isinstance(a, str) and a.startswith("/")}
            nat = {rel: e["native"] for rel, e in ex.inv.items() if e.get("app_root") and e.get("native")}
            from collections import Counter
            kinds = Counter(nat.values())
            res["native_binaries"] = {"count": len(nat), "kinds": dict(kinds),
                                      "examples": ["/" + p for p in sorted(nat)[:15]]}
            for p in sorted(set(nat) & ep):
                findings.append(_finding("ATL-OB-006", "info", "/" + p, f"{nat[p]} entrypoint",
                                         "Entrypoint is a native binary (contents not source-scannable)"))
            others = sorted(set(nat) - ep)
            in_pkg = lambda p: any(p.startswith(r + "/") for r in pkg_roots)  # noqa: E731
            deps = [p for p in others if DEP_DIR_RX.search(p) and not in_pkg(p)]
            own = [p for p in others if p not in set(deps)]
            for group, sev, title in ((own, "medium", "Bundled native binaries pattern detected in application paths"),
                                      (deps, "info", "Native extensions in third-party dependencies (node_modules / site-packages)")):
                if not group:
                    continue
                kc = Counter(nat[p] for p in group)
                findings.append(_finding(
                    "ATL-OB-006", sev, "/" + group[0],
                    f"{len(group)} native binaries ({', '.join(f'{k}: {v}' for k, v in kc.most_common())}); e.g. "
                    + ", ".join(p.rsplit("/", 1)[-1] for p in group[:5]),
                    title, count=len(group), examples=["/" + p for p in group[:20]]))
            res["inventory"] = ex.inventory_summary()
            if keep_inventory:
                res["inventory"]["files"] = {"/" + k: v for k, v in ex.inv.items()}
            if not roots:
                notes.append("No application paths found (/app, /srv, /opt, WORKDIR, entrypoint dirs, MCP package dirs); only config/history were checked.")
        finally:
            if keep_dir:
                res["workdir"] = base
            elif own_tmp:
                shutil.rmtree(base, ignore_errors=True)
            else:
                shutil.rmtree(blobs, ignore_errors=True)
    elif not scan_layers:
        notes.append("Layers not downloaded (scan_layers=False): only the image config was checked.")
    res["bytes_downloaded"] = client.bytes
    res["requests"] = client.requests
    res["elapsed_s"] = round(time.time() - t0, 2)
    return res


# ---------------------------------------------------------------------------
# Allowlist integration helpers
# ---------------------------------------------------------------------------
def provenance_hints(res):
    """Fields allowlist_core can fold into its provenance dict."""
    r = res.get("resolved") or {}
    return {"pinned_launch": bool(r.get("digest")),
            "source_repo": res.get("source_repo"), "revision": res.get("revision"),
            "verified_namespace": r.get("registry") == DOCKER_HUB and str(r.get("repo", "")).startswith("mcp/")}


def detail_for(res):
    """Compact dict for the allowlist 'detail' block (no full findings / inventory)."""
    c = res.get("config") or {}
    return {"image": res.get("ref"), "digest": res.get("digest"), "index_digest": res.get("index_digest"),
            "platform": res.get("platform"), "entrypoint": c.get("entrypoint"), "cmd": c.get("cmd"),
            "user": c.get("user"), "exposed_ports": c.get("exposed_ports"), "source_repo": res.get("source_repo"),
            "revision": res.get("revision"), "app_roots": res.get("app_roots"), "files_scanned": res.get("files_scanned"),
            "layers": [{k: L.get(k) for k in ("index", "size", "status")} for L in res.get("layers") or []],
            "native_binaries": (res.get("native_binaries") or {}).get("count", 0),
            "bytes_downloaded": res.get("bytes_downloaded"), "notes": res.get("notes")}


def summary_line(res):
    live = [f for f in res.get("findings") or [] if not f.get("suppressed")]
    from collections import Counter
    sev = Counter(f["sev"] for f in live)
    scanned = sum(1 for L in res.get("layers") or [] if L.get("status") == "scanned")
    return (f"OCI {res.get('ref')} @ {str(res.get('digest'))[:19]}: {scanned}/{len(res.get('layers') or [])} layers, "
            f"{res.get('files_scanned', 0)} app files scanned, findings "
            + (", ".join(f"{k} {sev[k]}" for k in ("critical", "high", "medium", "low", "info") if sev[k]) or "none")
            + " (pattern detected)")


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Inspect an OCI image as data (never runs it).")
    ap.add_argument("ref")
    ap.add_argument("--platform", default=DEFAULT_PLATFORM)
    ap.add_argument("--no-layers", action="store_true")
    ap.add_argument("--max-total", type=int, default=MAX_TOTAL // MB, help="MB")
    ap.add_argument("--max-layer", type=int, default=MAX_LAYER // MB, help="MB")
    ap.add_argument("--json")
    a = ap.parse_args(argv)
    try:
        res = inspect_image(a.ref, platform=a.platform, scan_layers=not a.no_layers,
                            max_total=a.max_total * MB, max_layer=a.max_layer * MB)
    except OCIError as e:
        print(f"[atlas-oci] error: {e}", file=sys.stderr)
        return 2
    print(summary_line(res))
    c = res["config"]
    print(f"  entrypoint={c['entrypoint']} cmd={c['cmd']} user={c['user'] or '(root)'} workdir={c['workdir']}")
    print(f"  ports={c['exposed_ports']} source={res['source_repo']} revision={res['revision']}")
    print(f"  app_roots={res['app_roots']} bytes={res['bytes_downloaded']} time={res['elapsed_s']}s")
    for f in res["findings"]:
        if not f.get("suppressed"):
            print(f"  {f['sev']:<8} {f['rule']:<11} {f['file']}:{f['line']}  {f['snippet'][:100]}")
    for n in res["notes"]:
        print("  note:", n)
    if a.json:
        with open(a.json, "w") as fh:
            json.dump(res, fh, indent=1, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
