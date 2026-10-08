"""Atlas Allowlist Builder (prototype) -- core logic, stdlib only.

Evaluates MCP server configs and agent skills with the scan-rules-v0 trust
score (atlas/scanner/trust.py) and turns the items a human approved into
allowlist files.

Safety: this module never installs, imports, builds or executes anything it
evaluates. The optional fetch path downloads registry JSON metadata and the
published package archive (extracted as data by atlas/scanner/pkgfetch.py),
shallow-clones the declared repo (hooks disabled, LFS smudge off) for the
DP-004 comparison (atlas/scanner/dp004.py), and queries OSV
(atlas/scanner/osv.py). The read-only scanner reads every file as text.

Wording rule: verdicts say "pattern detected" / "パターンを検出". The only
exception is quoting an OSV MAL-* id, which trust.py phrases itself.

Output formats were checked against the official docs on 2026-10-08:
  - Claude Code managed-mcp.json / allowedMcpServers:
      https://code.claude.com/docs/en/managed-mcp
      https://code.claude.com/docs/en/managed-settings (file locations)
  - GitHub Copilot (Copilot app, Copilot CLI, VS Code) enterprise managed settings:
      https://github.blog/changelog/2026-08-06-mcp-allowlists-in-enterprise-managed-settings
      https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings
      https://docs.github.com/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings
"""
import copy
import datetime as _dt
import ipaddress
import json
import os
import re
import shlex
import shutil
import sys
import tempfile
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SCANNER_DIR = os.path.normpath(os.path.join(HERE, "..", "scanner"))
for _p in (HERE, SCANNER_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

sys.dont_write_bytecode = True  # do not drop __pycache__ into atlas/scanner (owned by the lead)
import scan as _scan  # noqa: E402  (atlas/scanner/scan.py, read-only regex scanner)
import dp004 as _dp004  # noqa: E402  (package <-> repo comparison, safe clone)
import osv as _osv  # noqa: E402  (OSV querybatch, DP-002)
import pkgfetch as _pkgfetch  # noqa: E402  (registry metadata + guarded archive extraction)
from trust import trust as _trust  # noqa: E402

# moved to atlas/scanner/dp004.py; kept here as aliases for existing callers
norm_repo = _dp004.norm_repo
split_tree_url = _dp004.split_tree_url
find_package_dir = _dp004.find_package_dir
safe_clone = _dp004.safe_clone

DEFAULT_INDEX = os.path.normpath(os.path.join(HERE, "..", "data", "index.json"))
DOCS_CHECKED = "2026-10-08"
DOC_URLS = {
    "claude_managed_mcp": "https://code.claude.com/docs/en/managed-mcp",
    "claude_managed_settings": "https://code.claude.com/docs/en/managed-settings",
    "copilot_changelog": "https://github.blog/changelog/2026-08-06-mcp-allowlists-in-enterprise-managed-settings",
    "copilot_reference": "https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings",
    "copilot_configure": "https://docs.github.com/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings",
}
SEV_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
REC_LABEL = {"approve": "承認推奨", "review": "要レビュー", "deny": "拒否推奨"}

# ---------------------------------------------------------------------------
# Config-level rule table (same finding shape as scan.py)
# ---------------------------------------------------------------------------
CONFIG_RULES = {
    "ATL-UP-001": ("medium", "Floating version in launch config (unpinned / @latest / :latest)"),
    "ATL-PL-002": ("high", "Launch config pulls a git source on a mutable ref (no commit sha)"),
    "ATL-CR-003": ("high", "Inline secret in launch config (redacted)"),
    "ATL-CR-005": ("medium", "Possible inline credential in env/header (literal value, redacted)"),
    "ATL-CE-005": ("medium", "Server launched through a shell wrapper (bash -c / sh -c)"),
    "ATL-NW-006": ("high", "Remote server over plain http:// to a non-localhost host"),
    "ATL-NW-007": ("high", "Remote server on an ephemeral tunnel host"),
    "ATL-NW-008": ("medium", "Remote server addressed by raw IP"),
    "ATL-PM-004": ("high", "Container launched with host-level privileges (--privileged / host root mount / host network)"),
}

SECRET_RES = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{10,}"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9]{32,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bglpat-[A-Za-z0-9_\-]{20,}"),
]
CRED_KEY_RE = re.compile(r"(TOKEN|SECRET|PASSW(OR)?D|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH)", re.I)
TUNNEL_SUFFIXES = ("trycloudflare.com", "ngrok.io", "ngrok-free.app", "ngrok.app", "ngrok-free.dev",
                   "ngrok.dev", "loca.lt", "localtunnel.me", "serveo.net", "serveousercontent.com",
                   "localhost.run", "lhr.life", "pinggy.io", "pinggy.link", "pinggy.online",
                   "bore.pub", "devtunnels.ms", "tunnelmole.net", "telebit.io", "localto.net")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"}
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish"}
WIN_SHELLS = {"cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"}
DOCKER_VALUE_OPTS = {"-e", "--env", "-v", "--volume", "--name", "-p", "--publish", "--network", "--net",
                     "-w", "--workdir", "-u", "--user", "--entrypoint", "--mount", "--env-file", "-l",
                     "--label", "--platform", "--pull", "-h", "--hostname", "--add-host", "--cap-add",
                     "--cap-drop", "--device", "-m", "--memory", "--cpus", "--restart", "--security-opt",
                     "--tmpfs", "--ulimit", "--ipc", "--pid", "--gpus", "--runtime", "--log-driver"}


def redact(s):
    """Redact secret-looking substrings: keep 4 chars, then [REDACTED]."""
    s = str(s)
    for r in SECRET_RES:
        s = r.sub(lambda m: m.group(0)[:4] + "…[REDACTED]", s)
    return s


def has_secret(s):
    return any(r.search(str(s)) for r in SECRET_RES)


def _now():
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------
# Input parsing
# ---------------------------------------------------------------------------
def load_input(path_or_text, display=None):
    """Return ("mcp", servers_dict, raw_text, display) or ("skills", [items], raw_text, display)."""
    if isinstance(path_or_text, str) and os.path.isdir(path_or_text):
        return "skills", find_skill_dirs(path_or_text), "", display or path_or_text
    if isinstance(path_or_text, str) and os.path.isfile(path_or_text):
        with open(path_or_text, encoding="utf-8") as fh:
            raw = fh.read()
        display = display or path_or_text
        base_dir = os.path.dirname(os.path.abspath(path_or_text))
    else:
        raw = path_or_text
        display = display or "pasted-config"
        base_dir = os.getcwd()
    data = json.loads(raw)
    if isinstance(data, list):
        items = []
        for i, it in enumerate(data):
            if not isinstance(it, dict) or not it.get("source"):
                raise ValueError(f"skill list item {i} needs 'source'")
            src = str(it["source"])
            if not re.match(r"^(https?://|git@|ssh://)", src) and not os.path.isabs(src):
                src = os.path.normpath(os.path.join(base_dir, src))
            items.append({"name": str(it.get("name") or os.path.basename(src.rstrip("/"))), "source": src})
        return "skills", items, raw, display
    if isinstance(data, dict):
        servers = None
        key = None
        for k in ("mcpServers", "servers"):
            if isinstance(data.get(k), dict):
                servers, key = data[k], k
                break
        if servers is None and isinstance(data.get("mcp"), dict):  # VS Code settings.json {"mcp": {"servers": ...}}
            for k in ("servers", "mcpServers"):
                if isinstance(data["mcp"].get(k), dict):
                    servers, key = data["mcp"][k], "mcp." + k
                    break
        if servers is None:
            raise ValueError("no 'mcpServers' or 'servers' object found")
        return "mcp", {"key": key, "servers": servers}, raw, display
    raise ValueError("unsupported input")


def find_skill_dirs(root):
    out = []
    for dp, dns, fns in os.walk(root):
        dns[:] = sorted(d for d in dns if d not in _scan.SKIP_DIRS)
        if "SKILL.md" in fns:
            out.append({"name": _skill_name(dp), "source": dp})
            dns[:] = []  # a skill's own subdirs belong to that skill
    return out


def _skill_name(d):
    try:
        with open(os.path.join(d, "SKILL.md"), encoding="utf-8", errors="replace") as fh:
            head = fh.read(4000)
        m = re.search(r"^---\s*\n(.*?)\n---", head, re.S)
        if m:
            n = re.search(r"^name:\s*['\"]?([^'\"\n]+)", m.group(1), re.M)
            if n:
                return n.group(1).strip()
    except OSError:
        pass
    return os.path.basename(os.path.normpath(d))


# ---------------------------------------------------------------------------
# Launch-config analysis
# ---------------------------------------------------------------------------
def argv_of(cfg):
    cmd = cfg.get("command")
    if not cmd:
        return []
    args = cfg.get("args") or []
    if not isinstance(args, list):
        args = [str(args)]
    argv = [str(cmd)] + [str(a) for a in args]
    if not args and " " in str(cmd).strip():
        try:
            argv = shlex.split(str(cmd))
        except ValueError:
            argv = str(cmd).split()
    return argv


def _base(cmd):
    return os.path.basename(cmd).lower()


NPM_EXACT = re.compile(r"^v?\d+\.\d+\.\d+(?:[-+][\w.\-]+)?$")


def parse_npm_spec(spec):
    """-> (name, version or None, kind) kind in registry|git|url|path."""
    if re.match(r"^(git\+|git:|github:|gitlab:|bitbucket:)", spec) or re.match(r"^[\w.\-]+/[\w.\-]+(#.*)?$", spec):
        return spec, None, "git"
    if re.match(r"^https?://", spec):
        return spec, None, "url"
    if spec.startswith((".", "/", "~", "file:")):
        return spec, None, "path"
    at = spec.rfind("@")
    if at > 0:
        return spec[:at], spec[at + 1:], "registry"
    return spec, None, "registry"


def parse_pypi_spec(spec):
    if spec.startswith("git+") or re.match(r"^https?://", spec):
        return spec, None, "git" if spec.startswith("git+") else "url"
    if spec.startswith((".", "/", "~")):
        return spec, None, "path"
    m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._\-]*)(?:\[[^\]]*\])?\s*(==|@|>=|~=|<=|>|<|!=)?\s*(.*)$", spec)
    if not m:
        return spec, None, "registry"
    name, op, ver = m.group(1), m.group(2), (m.group(3) or "").strip()
    if op in ("==", "@") and ver and ver != "latest" and not ver.endswith("*"):
        return name, ver, "registry"
    return name, (op + ver) if op else None, "registry"


def _git_ref_pinned(spec):
    return bool(re.search(r"[#@]([0-9a-f]{40})\b", spec))


def derive_packages(argv):
    """Return list of package dicts: {eco, name, version, pinned, kind, raw}."""
    if not argv:
        return []
    b = _base(argv[0])
    rest = argv[1:]
    # unwrap `cmd /c npx ...` (Windows) for package derivation
    if b in ("cmd", "cmd.exe") and rest and rest[0].lower() in ("/c", "/k"):
        return derive_packages(rest[1:])
    pkgs = []

    def npm(spec):
        name, ver, kind = parse_npm_spec(spec)
        if kind == "git":
            pinned = _git_ref_pinned(spec)
        elif kind == "registry":
            pinned = bool(ver and NPM_EXACT.match(ver))
        else:
            pinned = False
        pkgs.append({"eco": "npm", "name": name, "version": ver, "pinned": pinned, "kind": kind, "raw": spec})

    def pypi(spec):
        name, ver, kind = parse_pypi_spec(spec)
        if kind == "git":
            pinned = _git_ref_pinned(spec)
        else:
            pinned = bool(kind == "registry" and ver and not re.match(r"^[<>~!]", ver))
        pkgs.append({"eco": "pypi", "name": name, "version": ver, "pinned": pinned, "kind": kind, "raw": spec})

    if b in ("npx", "bunx") or (b in ("pnpm", "yarn", "bun") and rest[:1] in (["dlx"], ["x"])) or (b == "npm" and rest[:1] in (["exec"], ["x"])):
        if b in ("pnpm", "yarn", "bun", "npm"):
            rest = rest[1:]
        explicit = []
        i = 0
        first_pos = None
        while i < len(rest):
            a = rest[i]
            if a in ("-p", "--package"):
                if i + 1 < len(rest):
                    explicit.append(rest[i + 1])
                i += 2
                continue
            if a.startswith("--package="):
                explicit.append(a.split("=", 1)[1])
            elif a == "--":
                i += 1
                if first_pos is None and i < len(rest):
                    first_pos = rest[i]
                break
            elif not a.startswith("-"):
                first_pos = a
                break
            i += 1
        for s in explicit or ([first_pos] if first_pos else []):
            npm(s)
    elif b in ("uvx",) or (b == "uv" and rest[:2] == ["tool", "run"]) or (b == "pipx" and rest[:1] == ["run"]):
        if b == "uv":
            rest = rest[2:]
        elif b == "pipx":
            rest = rest[1:]
        frm = None
        first_pos = None
        i = 0
        while i < len(rest):
            a = rest[i]
            if a in ("--from", "--spec"):
                frm = rest[i + 1] if i + 1 < len(rest) else None
                i += 2
                continue
            if a.startswith(("--from=", "--spec=")):
                frm = a.split("=", 1)[1]
            elif a in ("--with", "-w", "--python", "-p", "--index-url", "--index", "--extra-index-url", "--pip-args"):
                i += 2
                continue
            elif not a.startswith("-"):
                first_pos = a
                break
            i += 1
        if frm or first_pos:
            pypi(frm or first_pos)
    elif b in ("docker", "podman", "nerdctl") and rest[:1] == ["run"] or (b in ("docker", "podman") and rest[:2] == ["container", "run"]):
        rest = rest[2:] if rest[0] == "container" else rest[1:]
        i = 0
        while i < len(rest):
            a = rest[i]
            if a in DOCKER_VALUE_OPTS:
                i += 2
                continue
            if a.startswith("-"):
                i += 1
                continue
            image = a
            digest = "@sha256:" in image
            tag = None
            last = image.split("/")[-1]
            if not digest and ":" in last:
                tag = last.rsplit(":", 1)[1]
            name = image.split("@")[0]
            if tag:
                name = name[: -(len(tag) + 1)]
            pkgs.append({"eco": "oci", "name": name, "version": "digest" if digest else tag,
                         "pinned": digest or (tag is not None and tag != "latest"), "kind": "registry", "raw": image})
            break
    return pkgs


def docker_privileges(argv):
    hits = []
    if not argv or _base(argv[0]) not in ("docker", "podman", "nerdctl"):
        return hits
    for i, a in enumerate(argv):
        if a == "--privileged":
            hits.append(a)
        if a in ("--network", "--net") and i + 1 < len(argv) and argv[i + 1] == "host":
            hits.append(a + " host")
        if a in ("--network=host", "--net=host", "--pid=host"):
            hits.append(a)
        if a in ("-v", "--volume") and i + 1 < len(argv) and re.match(r"^/(:|$)|^/var/run/docker\.sock", argv[i + 1]):
            hits.append(a + " " + argv[i + 1])
    return hits


def check_url(u):
    """Return list of (rule_id, note) for a remote URL."""
    out = []
    try:
        p = urllib.parse.urlsplit(u)
    except ValueError:
        return [("ATL-NW-008", "unparseable URL")]
    host = (p.hostname or "").lower().rstrip(".")
    local = host in LOCAL_HOSTS
    if p.scheme == "http" and not local:
        out.append(("ATL-NW-006", "plain http to " + host))
    if any(host == s or host.endswith("." + s) for s in TUNNEL_SUFFIXES):
        out.append(("ATL-NW-007", "tunnel host " + host))
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        if not ip.is_loopback:
            out.append(("ATL-NW-008", "raw IP " + host + (" (non-public range)" if ip.is_private else "")))
    except ValueError:
        pass
    return out


def _line_of(raw, needle, after=0):
    if not raw or not needle:
        return 0
    lines = raw.splitlines()
    needle = str(needle)
    enc = json.dumps(needle)[1:-1]
    for i in range(after, len(lines)):
        if needle in lines[i] or enc in lines[i]:
            return i + 1
    return 0


def config_findings(name, cfg, display, key, raw=""):
    """Static checks on one server's launch config. Returns (findings, sanitized_cfg, notes)."""
    findings = []
    san = copy.deepcopy(cfg)
    base_ptr = f"{display}#/{key.replace('.', '/')}/{name}"
    start = max(0, _line_of(raw, f'"{name}"') - 1)
    notes = []

    def add(rid, ptr, value, note=None, sev=None, hint=None):
        sev_d, title = CONFIG_RULES.get(rid, (sev or "medium", rid))
        snip = redact(value)[:160]
        if note:
            snip = f"{snip}  ({note})"
        findings.append({"rule": rid, "sev": sev or sev_d, "file": f"{base_ptr}/{ptr}",
                         "line": _line_of(raw, hint or (str(value)[:40] if not has_secret(value) else str(value)[:4]), start),
                         "snippet": snip[:200], "ctx": "src", "title": title, "source": "config"})

    argv = argv_of(cfg)
    cmdline = " ".join(argv)
    # 1. scanner regex rules (any/text scope) over the joined command line
    if cmdline:
        for r in _scan.R:
            if r["scope"] in ("any", "text") and r["re"].search(cmdline):
                findings.append({"rule": r["id"], "sev": r["sev"], "file": f"{base_ptr}/args",
                                 "line": _line_of(raw, argv[-1][:40], start), "snippet": redact(cmdline)[:200],
                                 "ctx": "src", "title": r["title"], "source": "config"})
    # 2. shell wrapper
    if argv:
        b = _base(argv[0])
        if b in SHELLS and any(a in ("-c", "-lc", "-ic") for a in argv[1:3]):
            add("ATL-CE-005", "command", cmdline, hint=argv[-1][:40])
        elif b in WIN_SHELLS and len(argv) > 1 and argv[1].lower() in ("/c", "/k", "-command", "-c", "-encodedcommand", "-enc"):
            inner = derive_packages(argv)
            if argv[1].lower() in ("-encodedcommand", "-enc"):
                add("ATL-CE-005", "command", cmdline, "encoded PowerShell", sev="high")
            elif not inner:
                add("ATL-CE-005", "command", cmdline, sev="low")
    # 3. packages / floating versions / mutable refs
    pkgs = derive_packages(argv)
    for p in pkgs:
        if p["kind"] == "git" and not p["pinned"]:
            add("ATL-PL-002", "args", p["raw"], f"{p['eco']} git source without commit sha")
        elif p["kind"] in ("registry", "url") and not p["pinned"]:
            why = "no version" if not p["version"] else f"floating '{p['version']}'"
            add("ATL-UP-001", "args", p["raw"], f"{p['eco']} {why}")
    for h in docker_privileges(argv):
        add("ATL-PM-004", "args", h)
    # 4. remote URLs (url key, plus URLs passed as args e.g. mcp-remote)
    urls = []
    if cfg.get("url"):
        urls.append(("url", str(cfg["url"])))
    for a in argv[1:]:
        if re.match(r"^https?://", a):
            urls.append(("args", a))
    for ptr, u in urls:
        for rid, note in check_url(u):
            add(rid, ptr, u, note)
        if ptr == "url":
            for r in _scan.R:
                if r["id"] == "ATL-NW-002" and r["re"].search(u) and not any(f["rule"] == "ATL-NW-007" for f in findings):
                    add("ATL-NW-002", ptr, u, sev="high")
    # 5. inline secrets (env, headers, args, url) -> finding + redact in sanitized copy
    sec_n = [0]

    def placeholder(hint):
        sec_n[0] += 1
        hint = re.sub(r"[^A-Za-z0-9_]", "_", hint).upper() or "SECRET"
        return "${" + (hint if sec_n[0] == 1 or hint != "SECRET" else f"{hint}_{sec_n[0]}") + "}"

    for sect in ("env", "headers"):
        d = cfg.get(sect)
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            v = str(v)
            if has_secret(v):
                add("ATL-CR-003", f"{sect}/{k}", f"{k}={v}")
                san[sect][k] = _sub_secrets(v, placeholder(k if sect == "env" else "ATLAS_" + k))
            elif CRED_KEY_RE.search(k) and _literal_cred(v):
                add("ATL-CR-005", f"{sect}/{k}", f"{k}=" + v[:4] + "…[REDACTED]")
                pfx = ""
                if sect == "headers" and re.match(r"^(Bearer|Basic|Token)\s+", v, re.I):
                    pfx = v.split()[0] + " "
                san[sect][k] = pfx + placeholder(k if sect == "env" else "ATLAS_" + k)
    if isinstance(cfg.get("args"), list):
        for i, a in enumerate(cfg["args"]):
            if has_secret(a):
                add("ATL-CR-003", f"args/{i}", a)
                san["args"][i] = _sub_secrets(str(a), placeholder("ATLAS_SECRET"))
    for k in ("url", "command"):
        if cfg.get(k) and has_secret(cfg[k]):
            add("ATL-CR-003", k, cfg[k])
            san[k] = _sub_secrets(str(cfg[k]), placeholder("ATLAS_SECRET"))
    if any(f["rule"] == "ATL-NW-007" for f in findings):  # same host already counted as a tunnel
        findings = [f for f in findings if f["rule"] != "ATL-NW-002"]
    if any(f["rule"] in ("ATL-CR-003", "ATL-CR-005") for f in findings):
        notes.append("Inline credential values were replaced with ${VAR} placeholders in this report and in every "
                     "generated file; set them per user (managed-mcp.json is readable by every user on the machine).")
    if re.search(r"\$\{input:", json.dumps(cfg)):
        notes.append("Uses VS Code ${input:...} variables, which Claude Code does not expand.")
    return findings, san, notes, pkgs, [u for _, u in urls]


def _sub_secrets(s, ph):
    for r in SECRET_RES:
        s = r.sub(ph, s)
    if "-----BEGIN" in ph or "PRIVATE KEY" in s:
        s = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|$)", ph, s, flags=re.S)
    return s


def _literal_cred(v):
    v = v.strip()
    if len(v) < 8 or " " in v.replace("Bearer ", "").replace("Basic ", "").replace("Token ", ""):
        return False
    if v.startswith(("${", "$", "http://", "https://", "/", "~", ".", "<", "{env:", "{{")):
        return False
    if v.lower() in ("true", "false", "changeme", "your-api-key", "your_api_key", "xxxxxxxx"):
        return False
    return True


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------
def load_index(path):
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    by_pkg, by_repo = {}, {}
    for e in data.get("entries") or []:
        for p in e.get("packages") or []:
            by_pkg[str(p).lower()] = e
        if e.get("repo"):
            by_repo[norm_repo(e["repo"])] = e
    return {"path": path, "generated": data.get("generated"), "by_pkg": by_pkg, "by_repo": by_repo,
            "n": len(data.get("entries") or [])}


def index_lookup(index, pkgs=(), repos=()):
    if not index:
        return None, None
    for p in pkgs:
        if p["kind"] != "registry":
            continue
        k = f"{p['eco']}:{p['name']}".lower()
        if k in index["by_pkg"]:
            return index["by_pkg"][k], k
    for r in repos:
        k = norm_repo(r)
        if k in index["by_repo"]:
            return index["by_repo"][k], k
    return None, None


# ---------------------------------------------------------------------------
# Optional fetch (metadata JSON + shallow clone). Never installs or executes.
# ---------------------------------------------------------------------------
OSI_SPDX = {"MIT", "APACHE-2.0", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "ISC", "MPL-2.0", "GPL-2.0", "GPL-3.0",
            "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "UNLICENSE", "0BSD", "EPL-2.0", "GPL-3.0-OR-LATER",
            "GPL-2.0-OR-LATER", "LGPL-3.0-OR-LATER", "BSL-1.0", "ZLIB", "PSF-2.0"}


def fetch_and_scan(pkg=None, repo=None):
    """Clone-and-scan a repo (skills given as git URLs). Return {findings, files, commit, ref, repo} or {error}."""
    try:
        repo, tree_sub = split_tree_url(repo)
        if not repo:
            return {"error": "no repository URL"}
        tmp = tempfile.mkdtemp(prefix="atlas-allowlist-")
        try:
            dest = os.path.join(tmp, "repo")
            sha, ref = safe_clone(repo, dest)
            root = dest
            if tree_sub:
                cand = os.path.normpath(os.path.join(dest, tree_sub))
                if cand.startswith(dest + os.sep) and os.path.isdir(cand):
                    root = cand
            subdir = os.path.relpath(root, dest)
            f, nfiles, _ = _scan.scan_repo(root)
            return {"findings": f, "files": nfiles, "commit": sha, "ref": ref, "repo": norm_repo(repo),
                    "subdir": None if subdir == "." else subdir}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    except Exception as e:  # network / git errors are reported, never fatal
        return {"error": f"{type(e).__name__}: {e}"[:300]}


def fetch_package(pkg):
    """--fetch for a registry npm/PyPI server: download the published archive (data only),
    clone the declared repo at the version tag, run DP-004 and scan both trees.
    Returns the dp004.check() dict plus {"info", "deps"}, or {"error", "info"}."""
    info = None
    tmp = tempfile.mkdtemp(prefix="atlas-allowlist-")
    try:
        ver = (pkg.get("version") or "").lstrip("=@") if pkg.get("pinned") else None
        info = _pkgfetch.resolve(pkg["eco"], pkg["name"], ver or None)
        pkg_root = _pkgfetch.fetch_extract(info, os.path.join(tmp, "pkg"))
        res = _dp004.check(info, pkg_root, tmp)
        res["info"] = info
        res["deps"] = _osv.deps_from_package(pkg_root, pkg["eco"])
        return res
    except Exception as e:  # network / registry / archive errors are reported, never fatal
        return {"error": f"{type(e).__name__}: {e}"[:300], "info": info}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# Verdicts and org policy
# ---------------------------------------------------------------------------
DEFAULT_POLICY = {
    # high findings in a skill or in the launch config: "review" (never auto-approve) or "deny"
    "high_in_skill_or_launch": "review",
    # "approve" needs verified provenance: DP-004 clean (repo matches package) or npm attestation
    "require_provenance_for_approve": True,
}


def load_policy(policy=None):
    """dict | path to policy.json | None -> validated policy dict (defaults filled in)."""
    if isinstance(policy, str) and policy:
        with open(policy, encoding="utf-8") as fh:
            policy = json.load(fh)
    pol = dict(DEFAULT_POLICY)
    for k, v in (policy or {}).items():
        if k not in DEFAULT_POLICY:
            raise ValueError(f"unknown policy key: {k!r} (known: {', '.join(DEFAULT_POLICY)})")
        pol[k] = v
    if pol["high_in_skill_or_launch"] not in ("review", "deny"):
        raise ValueError("policy high_in_skill_or_launch must be 'review' or 'deny'")
    pol["require_provenance_for_approve"] = bool(pol["require_provenance_for_approve"])
    return pol


def recommend(t, findings=(), kind="mcp", provenance=None, policy=None):
    """-> (recommendation, [policy notes]).
    1. OSV MAL-* (quarantined) or a critical finding in src/skill/launch config -> deny.
    2. Grade: A/B approve, C review, D/F deny.
    3. High finding in a skill or in the launch config -> at least review (policy: or deny).
    4. Approve needs verified provenance (policy require_provenance_for_approve)."""
    pol = load_policy(policy)
    live = [f for f in findings if not f.get("suppressed")]
    if t["quarantined"]:
        return "deny", ["policy: OSV MAL-* id -> quarantined, deny"]
    crit = [f for f in live if f.get("sev") == "critical" and f.get("ctx", "src") in ("src", "skill")]
    if crit:
        return "deny", [f"policy: critical pattern detected ({crit[0]['rule']}) -> deny"]
    notes = []
    rec = "approve" if t["grade"] in ("A", "B") else "review" if t["grade"] == "C" else "deny"
    highs = [f for f in live if f.get("sev") == "high"
             and (f.get("source") == "config" or (kind == "skill" and f.get("ctx", "src") in ("skill", "src")))]
    if highs and rec != "deny":
        where = "launch config" if kind == "mcp" else "skill"
        if pol["high_in_skill_or_launch"] == "deny":
            rec = "deny"
            notes.append(f"policy: high pattern in {where} ({highs[0]['rule']}) -> deny (org policy)")
        elif rec == "approve":
            rec = "review"
            notes.append(f"policy: high pattern in {where} ({highs[0]['rule']}) -> review, never auto-approve")
    p = provenance or {}
    if rec == "approve" and pol["require_provenance_for_approve"] and not (
            p.get("repo_matches_package") or p.get("provenance_attested")):
        rec = "review"
        notes.append("policy: no verified provenance (DP-004 clean or npm attestation) -> review")
    return rec, notes


def _evidence_lines(findings, n=6):
    fs = [f for f in findings if not f.get("suppressed")]
    fs.sort(key=lambda f: (-SEV_ORDER.get(f["sev"], 0), f["rule"]))
    out = []
    for f in fs[:n]:
        loc = f"{f['file']}:{f['line']}" if f.get("line") else f["file"]
        out.append(f"[{f['sev']}] {f['rule']} {loc} [{f.get('ctx', 'src')}] {redact(f.get('snippet', ''))[:160]}")
    return out


def _verdict(t, n, rec):
    if n == 0:
        return (f"Grade {t['grade']} ({t['trust']}/100) - no pattern detected / パターン検出なし - "
                f"{rec} / {REC_LABEL[rec]}")
    return (f"Grade {t['grade']} ({t['trust']}/100) - {n} pattern(s) detected / パターンを検出: {n}件 - "
            f"{rec} / {REC_LABEL[rec]}")


def build_item(name, kind, findings, provenance, maintenance, osv_ids, scan_status, scan_detail,
               config=None, packages=(), urls=(), notes=(), source=None, policy=None, extra_evidence=()):
    t = _trust(findings, provenance, maintenance, osv_ids)
    rec, pnotes = recommend(t, findings, kind, provenance, policy)
    active = [f for f in findings if not f.get("suppressed")]
    n = len(active)
    status_label = {
        "remote-only": "remote-only: not statically scanned / リモート専用：静的検査なし",
        "config-only": "launch config only: source not statically scanned / 起動設定のみ：ソース未検査",
        "index": "source scanned (Atlas index) / ソース検査済み（Atlas インデックス）",
        "fetched": "source + published package scanned (--fetch) / ソースと公開パッケージを検査済み",
        "local-scan": "source scanned (local files) / ソース検査済み（ローカル）",
        "not-scanned": "not statically scanned / 静的検査なし",
    }[scan_status]
    reasons = []
    for p in sorted(t["penalties"], key=lambda p: -p["penalty"])[:3]:
        title = next((f["title"] for f in active if f["rule"] == p["rule"]), p["rule"])
        if p["rule"] == "ATL-DP-002" and p["sev"] == "critical":
            reasons.append(f"-{p['penalty']} {p['rule']} ({p['sev']}, x{p['count']}): {title}")
        else:
            reasons.append(f"-{p['penalty']} {p['rule']} ({p['sev']}, {p['ctx']}, x{p['count']}): {title} - pattern detected")
    for c in t["caps"]:
        reasons.append(f"cap {c['cap']}: {c['reason']}")
    reasons += pnotes
    if t["badges"]:
        reasons.append("capability badges: " + ", ".join(t["badges"]))
    if t["provenance"] == 0:
        reasons.append("provenance 0: no registry/repo provenance evidence available")
    reasons.append(status_label)
    reasons += list(notes)
    return {
        "name": name, "kind": kind, "source": source, "config": config, "packages": list(packages),
        "urls": list(urls), "scan_status": scan_status, "scan_label": status_label, "scan_detail": scan_detail,
        "trust": t, "grade": t["grade"], "score": t["trust"], "recommendation": rec,
        "recommendation_ja": REC_LABEL[rec], "verdict": _verdict(t, n, rec), "reasons": reasons,
        "provenance_inputs": dict(provenance or {}), "policy_notes": pnotes,
        "evidence": list(extra_evidence) + _evidence_lines(findings), "findings": findings,
    }


def evaluate(input_path_or_text, index_path=DEFAULT_INDEX, fetch=False, display=None, osv=False, policy=None):
    """fetch=True implies osv=True (network: registry + git + OSV). osv=True alone queries OSV only."""
    pol = load_policy(policy)
    osv = bool(osv or fetch)
    kind, data, raw, display = load_input(input_path_or_text, display)
    index = load_index(index_path)
    items = []
    if kind == "mcp":
        key = data["key"]
        for name, cfg in data["servers"].items():
            if not isinstance(cfg, dict):
                continue
            items.append(_eval_server(str(name), cfg, display, key, raw, index, fetch, osv, pol))
    else:
        for it in data:
            items.append(_eval_skill(it, index, fetch, pol))
    return {
        "tool": "atlas-allowlist", "version": "0.2-prototype", "generated": _now(),
        "input": {"display": display, "kind": kind, "key": data["key"] if kind == "mcp" else None},
        "index": {"path": index["path"], "generated": index["generated"], "entries": index["n"]} if index else None,
        "fetch": bool(fetch), "osv": osv, "policy": pol,
        "wording": "Verdicts report detected patterns (パターンを検出); they are not a judgement of intent.",
        "docs_checked": DOCS_CHECKED, "doc_urls": DOC_URLS,
        "items": items,
    }


def _osi(lic):
    if isinstance(lic, dict):
        lic = lic.get("type")
    s = str(lic or "").strip().upper().strip("()")
    return bool(s) and all(part.strip() in OSI_SPDX for part in re.split(r"\s+OR\s+", s))


def _prov_maint(entry, pkgs, fetched=None):
    prov = {"pinned_launch": bool(pkgs) and all(p["pinned"] for p in pkgs)}
    maint = None
    osv_ids = []
    if entry:
        # repo_matches_package is granted only by a clean DP-004 (from --fetch, or recorded in the index)
        for k, v in (entry.get("provenance") or {}).items():
            prov[k] = prov.get(k) or bool(v)
        if _osi(entry.get("license")):
            prov["osi_license"] = True
        maint = entry.get("maintenance")
        osv_ids = list(entry.get("osv_ids") or [])
    if fetched:
        info = fetched.get("info") or {}
        prov["repo_matches_package"] = fetched.get("status") == "clean"
        if info.get("attestations"):
            prov["provenance_attested"] = True
        if _osi(info.get("license")):
            prov["osi_license"] = True
    return prov, maint, osv_ids


def _prov_line(prov, fetched, info):
    def yn(k):
        return "yes" if prov.get(k) else "no"
    if fetched is None:
        rm = "yes (index)" if prov.get("repo_matches_package") else "not checked (use --fetch)"
        at = "yes (index)" if prov.get("provenance_attested") else "not checked (use --fetch)"
    else:
        rm = "yes (DP-004 clean)" if prov.get("repo_matches_package") else f"no (DP-004 {fetched.get('status')})"
        at = yn("provenance_attested") + (" (npm dist.attestations)" if (info or {}).get("eco") == "npm" else " (PyPI: not read)")
    lic = (info or {}).get("license")
    if isinstance(lic, dict):
        lic = lic.get("type")
    lic_s = f"{yn('osi_license')}" + (f" ({str(lic)[:40]})" if lic else "")
    return (f"provenance: repo_matches_package={rm}; provenance_attested={at}; osi_license={lic_s}; "
            f"pinned_launch={yn('pinned_launch')}")


def _eval_server(name, cfg, display, key, raw, index, fetch, osv_on=False, policy=None):
    cf, san, notes, pkgs, urls = config_findings(name, cfg, display, key, raw)
    notes = list(notes)
    findings = list(cf)
    is_remote = bool(cfg.get("url")) and not cfg.get("command")
    entry, matched = index_lookup(index, pkgs, [u for u in urls if re.search(r"github\.com|gitlab\.com", u)])
    reg = pkgs[0] if pkgs and pkgs[0]["kind"] == "registry" and pkgs[0]["eco"] in ("npm", "pypi") else None
    detail = {}
    fetched = None
    if fetch and reg and not is_remote:
        res = fetch_package(reg)
        if "error" in res:
            detail["fetch_error"] = res["error"]
        else:
            fetched = res
    extra = []
    info = (fetched or {}).get("info") or {}
    if fetched:
        sub = fetched.get("subdir") or ""
        for f in fetched["repo_scan"]:
            g = dict(f)
            g["file"] = f"{fetched['repo']}@{fetched['commit'][:12]}:{os.path.join(sub, f['file'])}"
            g["source"] = "fetch"
            findings.append(g)
        plabel = f"{info.get('eco')}:{info.get('name')}@{info.get('version')}"
        for f in fetched["pkg_scan"]:
            g = dict(f)
            g["file"] = f"{plabel}:{f['file']}"
            findings.append(g)
        findings += fetched["findings"]
        status = "fetched"
        detail.update({"repo": fetched.get("repo"), "commit": fetched.get("commit"), "ref": fetched.get("ref"),
                       "files": fetched.get("files"), "package_files": fetched.get("pkg_files"),
                       "subdir": fetched.get("subdir"), "version": info.get("version"),
                       "tarball": info.get("tarball"), "dp004": {"status": fetched["status"], **fetched["stats"]}})
        if fetched.get("note"):
            notes.append(fetched["note"])
        extra.append(_dp004.summary_line(fetched))
    elif entry:
        # monorepos: keep only findings under the matched package's own directory
        sub = (entry.get("package_paths") or {}).get(matched) if matched else None
        for f in entry.get("findings") or []:
            if sub and not str(f.get("file", "")).replace(os.sep, "/").startswith(sub.rstrip("/") + "/"):
                continue
            g = dict(f)
            g["file"] = f"{entry.get('repo', '')}@{str(entry.get('commit', ''))[:12]}:{f.get('file', '')}"
            g.setdefault("ctx", "src")
            g["source"] = "index"
            findings.append(g)
        status = "index"
        detail.update({"matched": matched, "repo": entry.get("repo"), "commit": entry.get("commit"), "subdir": sub,
                       "files": entry.get("files"), "index_generated": index.get("generated")})
    elif is_remote:
        status = "remote-only"
        detail = {"note": "Remote-only server: only the URL was checked; no source is available to scan."}
    else:
        status = "config-only"
        if pkgs and pkgs[0]["eco"] == "oci":
            detail.setdefault("note", "OCI image: image contents are not scanned in this prototype.")
        elif not pkgs:
            detail.setdefault("note", "Local command: no package to resolve; source not scanned.")
        else:
            detail.setdefault("note", "Not in the Atlas index; run with --fetch to scan the source and package.")
    prov, maint, osv_ids = _prov_maint(entry, pkgs, fetched)
    if is_remote:
        prov["pinned_launch"] = False
    if osv_on and reg:
        ver = (reg.get("version") or "").lstrip("=@") or None
        o = _osv.check(reg["eco"], reg["name"], ver, reg["pinned"], (fetched or {}).get("deps"),
                       resolved_version=None if reg["pinned"] else info.get("version"))
        findings += o["findings"]
        osv_ids = sorted(set(osv_ids) | set(o["osv_ids"]))
        detail["osv"] = {k: o.get(k) for k in ("status", "mal_ids", "package", "error") if o.get(k) is not None}
        detail["osv"]["deps_checked"] = len(o.get("deps") or [])
        extra.append(_osv.summary_line(o))
    if reg or fetched:
        extra.insert(0, _prov_line(prov, fetched, info or {"eco": reg["eco"] if reg else None}))
    return build_item(name, "mcp", findings, prov, maint, osv_ids, status, detail, config=san,
                      packages=pkgs, urls=urls, notes=notes, policy=policy, extra_evidence=[e for e in extra if e])


def _eval_skill(it, index, fetch, policy=None):
    src = it["source"]
    name = it["name"]
    findings = []
    detail = {}
    if os.path.isdir(src):
        f, nfiles, nskills = _scan.scan_repo(src)
        for x in f:
            g = dict(x)
            g["file"] = f"{name}/{x['file']}"
            g["source"] = "local"
            findings.append(g)
        status = "local-scan"
        detail = {"path": src, "files": nfiles}
        if not os.path.isfile(os.path.join(src, "SKILL.md")):
            detail["note"] = "No SKILL.md at the top of this source."
        entry = None
    else:
        entry, matched = index_lookup(index, (), [src])
        if entry:
            for x in entry.get("findings") or []:
                g = dict(x)
                g["file"] = f"{entry.get('repo', '')}@{str(entry.get('commit', ''))[:12]}:{x.get('file', '')}"
                g.setdefault("ctx", "src")
                g["source"] = "index"
                findings.append(g)
            status = "index"
            detail = {"matched": matched, "repo": entry.get("repo"), "commit": entry.get("commit")}
        elif fetch and re.match(r"^https://", src):
            res = fetch_and_scan(repo=src)
            if "error" in res:
                status, detail = "not-scanned", {"fetch_error": res["error"]}
            else:
                for x in res["findings"]:
                    g = dict(x)
                    g["file"] = f"{res['repo']}@{res['commit'][:12]}:{x['file']}"
                    g["source"] = "fetch"
                    findings.append(g)
                status = "fetched"
                detail = {"repo": res["repo"], "commit": res["commit"], "files": res["files"]}
        else:
            status = "not-scanned"
            detail = {"note": "Remote source not in the Atlas index; run with --fetch to scan it."}
    prov, maint, osv_ids = _prov_maint(entry, [])
    prov["pinned_launch"] = bool(re.search(r"[#@][0-9a-f]{40}\b", src))
    return build_item(name, "skill", findings, prov, maint, osv_ids, status, detail, source=src, policy=policy)


# ---------------------------------------------------------------------------
# Human table
# ---------------------------------------------------------------------------
def format_table(report):
    rows = [("NAME", "KIND", "GRADE", "SCORE", "REC", "SCAN", "TOP REASON")]
    for it in report["items"]:
        top = next((r for r in it["reasons"] if r.startswith(("-", "cap"))), "no pattern detected")
        rows.append((it["name"][:28], it["kind"], it["grade"], str(it["score"]),
                     f"{it['recommendation']}", it["scan_status"], top[:70]))
    w = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    lines = ["  ".join(c.ljust(w[i]) for i, c in enumerate(r)) for r in rows]
    lines.insert(1, "  ".join("-" * x for x in w))
    out = ["\n".join(lines), ""]
    for it in report["items"]:
        out.append(f"== {it['name']} ({it['kind']}): {it['verdict']}")
        out.append(f"   {it['scan_label']}")
        for e in it["evidence"]:
            out.append("   " + e)
    out.append("")
    out.append("approve = grade A/B with verified provenance (承認推奨), review = C or high pattern in launch config/skill "
               "(要レビュー), deny = D/F, critical, or OSV MAL-* quarantine (拒否推奨). Policy: "
               + json.dumps(report.get("policy") or DEFAULT_POLICY))
    out.append("Verdicts report detected patterns (パターンを検出), not intent.")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Allowlist generation (approved items only)
# ---------------------------------------------------------------------------
def _claude_server_entry(cfg):
    """Normalise a VS Code / Claude Desktop / .mcp.json entry to Claude Code .mcp.json shape."""
    out = {}
    if cfg.get("url") and not cfg.get("command"):
        t = str(cfg.get("type") or "http").lower()
        out["type"] = "sse" if t == "sse" else "http"
        out["url"] = cfg["url"]
        if cfg.get("headers"):
            out["headers"] = cfg["headers"]
        if cfg.get("oauth"):
            out["oauth"] = cfg["oauth"]
        if cfg.get("headersHelper"):
            out["headersHelper"] = cfg["headersHelper"]
    else:
        out["type"] = "stdio"
        argv = argv_of(cfg)
        out["command"] = argv[0] if argv else cfg.get("command")
        if argv[1:]:
            out["args"] = argv[1:]
        if cfg.get("env"):
            out["env"] = cfg["env"]
    return out


def _matcher(cfg):
    if cfg.get("url") and not cfg.get("command"):
        return {"serverUrl": str(cfg["url"])}
    return {"serverCommand": argv_of(cfg)}


def build_outputs(report, approve=None, approve_recommended=False, by=None, when=None, allow_deny=False,
                  reasons=None):
    """Approved items only. Approving an item whose recommendation is not 'approve' is an override and
    needs a recorded reason (reasons={name: text}); 'deny' items additionally need allow_deny."""
    items = report.get("items") or []
    names = {i["name"] for i in items}
    approve = list(approve or [])
    unknown = [n for n in approve if n not in names]
    if unknown:
        raise ValueError("unknown item name(s): " + ", ".join(unknown))
    reasons = {str(k): str(v).strip() for k, v in (reasons or {}).items()}
    unknown = [n for n in reasons if n not in names]
    if unknown:
        raise ValueError("--reason given for unknown item name(s): " + ", ".join(unknown))
    approved = set(approve)
    if approve_recommended:
        approved |= {i["name"] for i in items if i["recommendation"] == "approve"}
    denied = sorted(i["name"] for i in items if i["name"] in approved and i["recommendation"] == "deny")
    if denied and not allow_deny:
        raise ValueError("approving item(s) recommended 'deny' needs an explicit override "
                         "(CLI --allow-deny plus --reason NAME=\"text\"): " + ", ".join(denied))
    over = [i for i in items if i["name"] in approved and i["recommendation"] != "approve"]
    missing = [i["name"] for i in over if len(reasons.get(i["name"], "")) < 3]
    if missing:
        raise ValueError("override approval needs a recorded reason for item(s) not recommended 'approve' "
                         "(CLI --reason NAME=\"text\", web UI reason box): " + ", ".join(missing))
    by = by or os.environ.get("USER") or os.environ.get("USERNAME") or "unknown"
    when = when or _now()
    overrides = [_override_record(i, by, when, reasons[i["name"]]) for i in over]
    mcp_ok = [i for i in items if i["name"] in approved and i["kind"] == "mcp"]
    skills_ok = [i for i in items if i["name"] in approved and i["kind"] == "skill"]
    managed_mcp = {"mcpServers": {i["name"]: _claude_server_entry(i["config"]) for i in mcp_ok}}
    matchers = [_matcher(i["config"]) for i in mcp_ok]
    claude_settings = {
        "allowManagedMcpServersOnly": True,
        "allowedMcpServers": matchers,
    }
    copilot = {"allowedMcpServers": matchers}
    md = _decisions_md(report, items, approved, by, when, approve_recommended, overrides)
    dj = _decisions_json(report, items, approved, by, when, approve_recommended, overrides)
    files = {
        "managed-mcp.json": json.dumps(managed_mcp, indent=2, ensure_ascii=False) + "\n",
        "claude-managed-settings.json": json.dumps(claude_settings, indent=2, ensure_ascii=False) + "\n",
        "copilot-managed-settings.json": json.dumps(copilot, indent=2, ensure_ascii=False) + "\n",
        "decisions.md": md,
        "decisions.json": json.dumps(dj, indent=2, ensure_ascii=False) + "\n",
    }
    if skills_ok:
        files["approved-skills.json"] = json.dumps(
            {"note": "Atlas list only - no official skill allowlist format was confirmed.",
             "skills": [{"name": i["name"], "source": i["source"], "grade": i["grade"], "score": i["score"]}
                        for i in skills_ok]}, indent=2, ensure_ascii=False) + "\n"
    return files


def _top_findings(i, n=3):
    return [redact(e)[:200] for e in _evidence_lines(i.get("findings") or [], n)]


def _override_record(i, by, when, reason):
    return {"item": i["name"], "kind": i["kind"], "recommendation": i["recommendation"],
            "grade": i["grade"], "score": i["score"], "quarantined": bool((i.get("trust") or {}).get("quarantined")),
            "approver": by, "time": when, "reason": redact(reason)[:1000],
            "policy_notes": i.get("policy_notes") or [], "top_findings": _top_findings(i)}


def _decisions_json(report, items, approved, by, when, approve_recommended, overrides):
    ov = {o["item"]: o for o in overrides}
    return {
        "tool": "atlas-allowlist", "schema": "atlas-decisions/1",
        "decided_by": by, "decided_at": when,
        "report": {"generated": report.get("generated"), "input": (report.get("input") or {}).get("display"),
                   "index": (report.get("index") or {}).get("path"), "fetch": report.get("fetch"),
                   "osv": report.get("osv")},
        "policy": report.get("policy") or DEFAULT_POLICY,
        "mode": "approve-recommended" if approve_recommended else "explicit",
        "items": [{"name": i["name"], "kind": i["kind"], "grade": i["grade"], "score": i["score"],
                   "recommendation": i["recommendation"],
                   "decision": "approved" if i["name"] in approved else "not_approved",
                   "override": i["name"] in ov, "reason": ov[i["name"]]["reason"] if i["name"] in ov else None,
                   # for atlas_watch.py (UP-002): sanitized launch config + derived packages
                   "config": i.get("config"), "packages": i.get("packages") or [], "source": i.get("source")}
                  for i in items],
        "overrides": overrides,
    }


def _decisions_md(report, items, approved, by, when, approve_recommended, overrides=()):
    pol = report.get("policy") or DEFAULT_POLICY
    L = ["# Atlas Allowlist Builder - decisions / 判定記録", "",
         f"- Decided by / 承認者: {by}",
         f"- Decided at / 日時 (UTC): {when}",
         f"- Report generated: {report.get('generated')} from `{(report.get('input') or {}).get('display')}`",
         f"- Index: {(report.get('index') or {}).get('path', 'none')} (generated {(report.get('index') or {}).get('generated', '-')})",
         f"- Mode: {'--approve-recommended' if approve_recommended else 'explicit --approve'}",
         f"- Policy / ポリシー: `{json.dumps(pol, ensure_ascii=False)}`",
         f"- Output formats checked against official docs on {report.get('docs_checked', DOCS_CHECKED)}:",
         ]
    for u in (report.get("doc_urls") or DOC_URLS).values():
        L.append(f"  - {u}")
    L += ["", "Verdicts report detected patterns (パターンを検出); they are not a judgement of intent.", "",
          "| Item | Kind | Grade | Score | Atlas rec. | Decision |", "|---|---|---|---|---|---|"]
    for i in items:
        dec = "APPROVED / 承認" if i["name"] in approved else "NOT APPROVED / 不承認"
        if i["name"] in approved and i["recommendation"] != "approve":
            dec += f" (override of '{i['recommendation']}')"
        L.append(f"| {i['name']} | {i['kind']} | {i['grade']} | {i['score']} | {i['recommendation']} | {dec} |")
    L += ["", "## Overrides / 上書き承認"]
    if not overrides:
        L.append("(none)")
    for o in overrides:
        L += ["", f"### {o['item']} ({o['kind']}) - override of '{o['recommendation']}'",
              f"- Approver / 承認者: {o['approver']}",
              f"- Time / 日時 (UTC): {o['time']}",
              f"- Reason / 理由: {o['reason']}",
              f"- Grade / score: {o['grade']} ({o['score']}/100){' - quarantined (OSV MAL-*)' if o['quarantined'] else ''}"]
        for pn in o["policy_notes"]:
            L.append(f"- {pn}")
        for e in o["top_findings"]:
            L.append(f"  - top finding: `{e}`")
    for title, sel in (("Approved / 承認", True), ("Not approved / 不承認", False)):
        L += ["", f"## {title}"]
        chosen = [i for i in items if (i["name"] in approved) == sel]
        if not chosen:
            L.append("(none)")
        for i in chosen:
            L += ["", f"### {i['name']} ({i['kind']})", f"- Verdict: {i['verdict']}", f"- Scan: {i['scan_label']}"]
            d = i.get("scan_detail") or {}
            if d.get("commit"):
                L.append(f"- Source: {d.get('repo')} @ {d.get('commit')}")
            if i["kind"] == "mcp":
                L.append(f"- Matcher: `{json.dumps(_matcher(i['config']), ensure_ascii=False)}`")
            for r in i["reasons"]:
                L.append(f"- {r}")
            for e in i["evidence"]:
                L.append(f"  - evidence: `{e}`")
    L += ["", "## Files", "- managed-mcp.json: Claude Code fixed server set (exclusive control).",
          "- claude-managed-settings.json: Claude Code managed-settings fragment (approved catalog; allowManagedMcpServersOnly).",
          "- copilot-managed-settings.json: fragment for `copilot/managed-settings.json` in the `.github-private` repo (Copilot app, Copilot CLI, VS Code).",
          "- decisions.json: machine-readable copy of these decisions, including overrides.",
          "- serverName matchers are not emitted: the docs say a name is a user-assigned label, not a security control.",
          ""]
    return "\n".join(L)


def write_outputs(files, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for n, content in files.items():
        p = os.path.join(out_dir, n)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(content)
        paths.append(p)
    return paths
