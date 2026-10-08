"""Atlas Allowlist Builder (prototype) -- core logic, stdlib only.

Evaluates MCP server configs and agent skills with the scan-rules-v0 trust
score (atlas/scanner/trust.py) and turns the items a human approved into
allowlist files.

Safety: this module never installs, imports, builds or executes anything it
evaluates. The optional fetch path only downloads registry JSON metadata and
shallow-clones git repos (hooks disabled, LFS smudge off) so that the
read-only regex scanner (atlas/scanner/scan.py) can read the files as text.

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
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCANNER_DIR = os.path.normpath(os.path.join(HERE, "..", "scanner"))
for _p in (HERE, SCANNER_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

sys.dont_write_bytecode = True  # do not drop __pycache__ into atlas/scanner (owned by the lead)
import scan as _scan  # noqa: E402  (atlas/scanner/scan.py, read-only regex scanner)
from trust import trust as _trust  # noqa: E402

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
def norm_repo(u):
    if not u:
        return ""
    u = str(u).strip()
    u = re.sub(r"^git\+", "", u)
    m = re.match(r"^(?:git@|ssh://git@)([^:/]+)[:/](.+)$", u)
    if m:
        u = f"https://{m.group(1)}/{m.group(2)}"
    u = re.sub(r"^(git|http)://", "https://", u)
    u = re.sub(r"^github:", "https://github.com/", u)
    u = u.split("#")[0].rstrip("/")
    if u.endswith(".git"):
        u = u[:-4]
    return u.lower()


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
UA = "atlas-allowlist-prototype/0.1 (metadata only)"


def _get_json(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https hosts)
        if r.status != 200:
            raise OSError(f"HTTP {r.status}")
        return json.loads(r.read(20_000_000).decode("utf-8", "replace"))


def resolve_npm(name, version=None):
    meta = _get_json("https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@"))
    ver = version if version in (meta.get("versions") or {}) else (meta.get("dist-tags") or {}).get("latest")
    vinfo = (meta.get("versions") or {}).get(ver) or {}
    repo = vinfo.get("repository") or meta.get("repository") or {}
    if isinstance(repo, str):
        repo = {"url": repo}
    lic = vinfo.get("license") or meta.get("license")
    return {"repo": repo.get("url"), "subdir": repo.get("directory"), "version": ver,
            "license": lic if isinstance(lic, str) else None,
            "attested": bool(((vinfo.get("dist") or {}).get("attestations"))),
            "registry_url": f"https://www.npmjs.com/package/{name}"}


def resolve_pypi(name, version=None):
    meta = _get_json(f"https://pypi.org/pypi/{urllib.parse.quote(name)}/json")
    info = meta.get("info") or {}
    repo = None
    for k, v in (info.get("project_urls") or {}).items():
        if re.search(r"source|repo|code|github|homepage", k, re.I) and re.search(r"github\.com|gitlab\.com|codeberg\.org|bitbucket\.org", str(v)):
            repo = v
            break
    if not repo and re.search(r"github\.com|gitlab\.com", str(info.get("home_page") or "")):
        repo = info["home_page"]
    osi = any("OSI Approved" in c for c in info.get("classifiers") or [])
    return {"repo": repo, "subdir": None, "version": info.get("version"),
            "license": info.get("license_expression") or (info.get("license") or "")[:40] or None,
            "osi": osi, "attested": False, "registry_url": f"https://pypi.org/project/{name}/"}


OSI_SPDX = {"MIT", "APACHE-2.0", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "ISC", "MPL-2.0", "GPL-2.0", "GPL-3.0",
            "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "UNLICENSE", "0BSD", "EPL-2.0", "GPL-3.0-OR-LATER",
            "GPL-2.0-OR-LATER", "LGPL-3.0-OR-LATER", "BSL-1.0", "ZLIB", "PSF-2.0"}


def split_tree_url(u):
    """https://github.com/o/r/tree/<ref>/sub/dir -> (https://github.com/o/r, sub/dir)."""
    m = re.match(r"^(https://(?:github\.com|gitlab\.com|codeberg\.org)/[\w.\-]+/[\w.\-]+)(?:/-)?/(?:tree|blob)/[^/]+/?(.*)$", str(u or ""))
    if m:
        return m.group(1), (m.group(2).strip("/") or None)
    return u, None


def find_package_dir(root, eco, name, max_depth=4):
    """Locate a monorepo package by reading manifests as text (never executed)."""
    want = (name or "").lower()
    if not want:
        return None
    for dp, dns, fns in os.walk(root):
        depth = os.path.relpath(dp, root).count(os.sep)
        dns[:] = [d for d in dns if d not in _scan.SKIP_DIRS and not d.startswith(".")] if depth < max_depth else []
        try:
            if eco == "npm" and "package.json" in fns:
                with open(os.path.join(dp, "package.json"), encoding="utf-8", errors="replace") as fh:
                    if str(json.load(fh).get("name", "")).lower() == want:
                        return dp
            if eco == "pypi" and "pyproject.toml" in fns:
                with open(os.path.join(dp, "pyproject.toml"), encoding="utf-8", errors="replace") as fh:
                    m = re.search(r'^name\s*=\s*["\']([^"\']+)', fh.read(), re.M)
                if m and re.sub(r"[-_.]+", "-", m.group(1).lower()) == re.sub(r"[-_.]+", "-", want):
                    return dp
        except (OSError, ValueError, AttributeError):
            continue
    return None


def safe_clone(repo_url, dest, ref=None, timeout=120):
    """Shallow clone with hooks disabled and LFS smudge off. Returns commit sha or raises."""
    u = norm_repo(repo_url)
    if not re.match(r"^https://[a-z0-9.\-]+/[\w.\-]+/[\w.\-]+(/[\w.\-]+)*$", u):
        raise ValueError(f"refusing to clone non-https / unexpected URL: {repo_url!r}")
    env = dict(os.environ, GIT_LFS_SKIP_SMUDGE="1", GIT_TERMINAL_PROMPT="0", GIT_ASKPASS="true",
               GIT_CONFIG_NOSYSTEM="1")
    base = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false",
            "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never",
            "-c", "submodule.recurse=false", "clone", "--depth", "1", "--single-branch", "--no-tags", "--quiet"]
    tries = []
    if ref:
        tries += [["--branch", "v" + ref.lstrip("v")], ["--branch", ref]]
    tries.append([])
    last = None
    for extra in tries:
        if os.path.exists(dest):
            shutil.rmtree(dest, ignore_errors=True)
        r = subprocess.run(base + extra + ["--", u + ".git", dest], env=env, capture_output=True,
                           text=True, timeout=timeout)
        if r.returncode == 0:
            sha = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-C", dest, "rev-parse", "HEAD"],
                                 env=env, capture_output=True, text=True, timeout=30).stdout.strip()
            return sha, (extra[1] if extra else "default-branch")
        last = r.stderr.strip()[-300:]
    raise OSError(f"git clone failed: {last}")


def fetch_and_scan(pkg=None, repo=None):
    """Return dict {findings, files, commit, ref, repo, meta} or {error}."""
    meta = {}
    try:
        if pkg and pkg["kind"] == "registry" and pkg["eco"] == "npm":
            meta = resolve_npm(pkg["name"], pkg.get("version"))
        elif pkg and pkg["kind"] == "registry" and pkg["eco"] == "pypi":
            meta = resolve_pypi(pkg["name"], (pkg.get("version") or "").lstrip("=@") or None)
        repo = repo or meta.get("repo")
        repo, tree_sub = split_tree_url(repo)
        if tree_sub and not meta.get("subdir"):
            meta["subdir"] = tree_sub
        if not repo:
            return {"error": "no repository URL in registry metadata", "meta": meta}
        tmp = tempfile.mkdtemp(prefix="atlas-allowlist-")
        try:
            dest = os.path.join(tmp, "repo")
            sha, ref = safe_clone(repo, dest, meta.get("version"))
            root = dest
            if meta.get("subdir"):
                cand = os.path.normpath(os.path.join(dest, meta["subdir"]))
                if cand.startswith(dest + os.sep) and os.path.isdir(cand):
                    root = cand
            elif pkg:
                root = find_package_dir(dest, pkg["eco"], pkg["name"]) or dest
            subdir = os.path.relpath(root, dest)
            f, nfiles, _ = _scan.scan_repo(root)
            return {"findings": f, "files": nfiles, "commit": sha, "ref": ref, "repo": norm_repo(repo), "meta": meta,
                    "subdir": None if subdir == "." else subdir}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    except Exception as e:  # network / git errors are reported, never fatal
        return {"error": f"{type(e).__name__}: {e}"[:300], "meta": meta}


# ---------------------------------------------------------------------------
# Verdicts
# ---------------------------------------------------------------------------
def recommend(t):
    if t["quarantined"] or t["grade"] in ("D", "F"):
        return "deny"
    if t["grade"] in ("A", "B"):
        return "approve"
    return "review"


def _evidence_lines(findings, n=6):
    fs = [f for f in findings if not f.get("suppressed")]
    fs.sort(key=lambda f: (-SEV_ORDER.get(f["sev"], 0), f["rule"]))
    out = []
    for f in fs[:n]:
        loc = f"{f['file']}:{f['line']}" if f.get("line") else f["file"]
        out.append(f"[{f['sev']}] {f['rule']} {loc} [{f.get('ctx', 'src')}] {redact(f.get('snippet', ''))[:160]}")
    return out


def build_item(name, kind, findings, provenance, maintenance, osv_ids, scan_status, scan_detail,
               config=None, packages=(), urls=(), notes=(), source=None):
    t = _trust(findings, provenance, maintenance, osv_ids)
    rec = recommend(t)
    active = [f for f in findings if not f.get("suppressed")]
    n = len(active)
    status_label = {
        "remote-only": "remote-only: not statically scanned / リモート専用：静的検査なし",
        "config-only": "launch config only: source not statically scanned / 起動設定のみ：ソース未検査",
        "index": "source scanned (Atlas index) / ソース検査済み（Atlas インデックス）",
        "fetched": "source scanned (shallow clone) / ソース検査済み（浅いクローン）",
        "local-scan": "source scanned (local files) / ソース検査済み（ローカル）",
        "not-scanned": "not statically scanned / 静的検査なし",
    }[scan_status]
    verdict = (f"Grade {t['grade']} ({t['trust']}/100) - {n} pattern(s) detected / パターンを検出: {n}件 - "
               f"{rec} / {REC_LABEL[rec]}")
    if n == 0:
        verdict = (f"Grade {t['grade']} ({t['trust']}/100) - no pattern detected / パターン検出なし - "
                   f"{rec} / {REC_LABEL[rec]}")
    reasons = []
    for p in sorted(t["penalties"], key=lambda p: -p["penalty"])[:3]:
        title = next((f["title"] for f in active if f["rule"] == p["rule"]), p["rule"])
        reasons.append(f"-{p['penalty']} {p['rule']} ({p['sev']}, {p['ctx']}, x{p['count']}): {title} - pattern detected")
    for c in t["caps"]:
        reasons.append(f"cap {c['cap']}: {c['reason']}")
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
        "recommendation_ja": REC_LABEL[rec], "verdict": verdict, "reasons": reasons,
        "evidence": _evidence_lines(findings), "findings": findings,
    }


def evaluate(input_path_or_text, index_path=DEFAULT_INDEX, fetch=False, display=None):
    kind, data, raw, display = load_input(input_path_or_text, display)
    index = load_index(index_path)
    items = []
    if kind == "mcp":
        key = data["key"]
        for name, cfg in data["servers"].items():
            if not isinstance(cfg, dict):
                continue
            items.append(_eval_server(str(name), cfg, display, key, raw, index, fetch))
    else:
        for it in data:
            items.append(_eval_skill(it, index, fetch))
    return {
        "tool": "atlas-allowlist", "version": "0.1-prototype", "generated": _now(),
        "input": {"display": display, "kind": kind, "key": data["key"] if kind == "mcp" else None},
        "index": {"path": index["path"], "generated": index["generated"], "entries": index["n"]} if index else None,
        "fetch": bool(fetch),
        "wording": "Verdicts report detected patterns (パターンを検出); they are not a judgement of intent.",
        "docs_checked": DOCS_CHECKED, "doc_urls": DOC_URLS,
        "items": items,
    }


def _prov_maint(entry, pkgs, meta=None):
    prov = {"pinned_launch": bool(pkgs) and all(p["pinned"] for p in pkgs)}
    maint = None
    osv = []
    if entry:
        prov["repo_matches_package"] = bool(entry.get("repo") and entry.get("packages"))
        for k, v in (entry.get("provenance") or {}).items():
            prov[k] = prov.get(k) or bool(v)
        lic = str(entry.get("license") or "").upper()
        if lic in OSI_SPDX:
            prov["osi_license"] = True
        maint = entry.get("maintenance")
        osv = list(entry.get("osv_ids") or [])
    if meta:
        if meta.get("repo"):
            prov["repo_matches_package"] = prov.get("repo_matches_package") or False  # unverified (DP-004 is v1)
        if meta.get("attested"):
            prov["provenance_attested"] = True
        if str(meta.get("license") or "").upper() in OSI_SPDX or meta.get("osi"):
            prov["osi_license"] = True
    return prov, maint, osv


def _eval_server(name, cfg, display, key, raw, index, fetch):
    cf, san, notes, pkgs, urls = config_findings(name, cfg, display, key, raw)
    findings = list(cf)
    is_remote = bool(cfg.get("url")) and not cfg.get("command")
    entry, matched = index_lookup(index, pkgs, [u for u in urls if re.search(r"github\.com|gitlab\.com", u)])
    detail = {}
    meta = None
    if entry:
        for f in entry.get("findings") or []:
            g = dict(f)
            g["file"] = f"{entry.get('repo', '')}@{str(entry.get('commit', ''))[:12]}:{f.get('file', '')}"
            g.setdefault("ctx", "src")
            g["source"] = "index"
            findings.append(g)
        status = "index"
        detail = {"matched": matched, "repo": entry.get("repo"), "commit": entry.get("commit"),
                  "files": entry.get("files"), "index_generated": index.get("generated")}
    elif is_remote:
        status = "remote-only"
        detail = {"note": "Remote-only server: only the URL was checked; no source is available to scan."}
    elif fetch and pkgs and pkgs[0]["kind"] == "registry" and pkgs[0]["eco"] in ("npm", "pypi"):
        res = fetch_and_scan(pkg=pkgs[0])
        meta = res.get("meta")
        if "error" in res:
            status = "config-only"
            detail = {"fetch_error": res["error"], "registry": (meta or {}).get("registry_url")}
        else:
            for f in res["findings"]:
                g = dict(f)
                g["file"] = f"{res['repo']}@{res['commit'][:12]}:{os.path.join(res.get('subdir') or '', f['file'])}"
                g["source"] = "fetch"
                findings.append(g)
            status = "fetched"
            detail = {"repo": res["repo"], "commit": res["commit"], "ref": res["ref"], "files": res["files"],
                      "subdir": res.get("subdir"),
                      "registry": meta.get("registry_url"), "version": meta.get("version"),
                      "note": "Registry repository URL is not verified against package contents (DP-004 is v1)."}
            if res["ref"] == "default-branch":
                notes = list(notes) + ["Scanned the default branch: no tag matched the package version."]
    else:
        status = "config-only"
        if pkgs and pkgs[0]["eco"] == "oci":
            detail = {"note": "OCI image: image contents are not scanned in this prototype."}
        elif not pkgs:
            detail = {"note": "Local command: no package to resolve; source not scanned."}
        else:
            detail = {"note": "Not in the Atlas index; run with --fetch to scan the source."}
    prov, maint, osv = _prov_maint(entry, pkgs, meta)
    if is_remote:
        prov["pinned_launch"] = False
    return build_item(name, "mcp", findings, prov, maint, osv, status, detail, config=san,
                      packages=pkgs, urls=urls, notes=notes)


def _eval_skill(it, index, fetch):
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
    prov, maint, osv = _prov_maint(entry, [])
    prov["pinned_launch"] = bool(re.search(r"[#@][0-9a-f]{40}\b", src))
    return build_item(name, "skill", findings, prov, maint, osv, status, detail, source=src)


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
    out.append("approve = grade A/B (承認推奨), review = C (要レビュー), deny = D/F or quarantined (拒否推奨).")
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


def build_outputs(report, approve=None, approve_recommended=False, by=None, when=None, allow_deny=False):
    items = report.get("items") or []
    names = {i["name"] for i in items}
    approve = list(approve or [])
    unknown = [n for n in approve if n not in names]
    if unknown:
        raise ValueError("unknown item name(s): " + ", ".join(unknown))
    approved = set(approve)
    if approve_recommended:
        approved |= {i["name"] for i in items if i["recommendation"] == "approve"}
    denied = sorted(i["name"] for i in items if i["name"] in approved and i["recommendation"] == "deny")
    if denied and not allow_deny:
        raise ValueError("approving item(s) recommended 'deny' needs an explicit override "
                         "(CLI --allow-deny): " + ", ".join(denied))
    by = by or os.environ.get("USER") or os.environ.get("USERNAME") or "unknown"
    when = when or _now()
    mcp_ok = [i for i in items if i["name"] in approved and i["kind"] == "mcp"]
    skills_ok = [i for i in items if i["name"] in approved and i["kind"] == "skill"]
    managed_mcp = {"mcpServers": {i["name"]: _claude_server_entry(i["config"]) for i in mcp_ok}}
    matchers = [_matcher(i["config"]) for i in mcp_ok]
    claude_settings = {
        "allowManagedMcpServersOnly": True,
        "allowedMcpServers": matchers,
    }
    copilot = {"allowedMcpServers": matchers}
    md = _decisions_md(report, items, approved, by, when, approve_recommended)
    files = {
        "managed-mcp.json": json.dumps(managed_mcp, indent=2, ensure_ascii=False) + "\n",
        "claude-managed-settings.json": json.dumps(claude_settings, indent=2, ensure_ascii=False) + "\n",
        "copilot-managed-settings.json": json.dumps(copilot, indent=2, ensure_ascii=False) + "\n",
        "decisions.md": md,
    }
    if skills_ok:
        files["approved-skills.json"] = json.dumps(
            {"note": "Atlas list only - no official skill allowlist format was confirmed.",
             "skills": [{"name": i["name"], "source": i["source"], "grade": i["grade"], "score": i["score"]}
                        for i in skills_ok]}, indent=2, ensure_ascii=False) + "\n"
    return files


def _decisions_md(report, items, approved, by, when, approve_recommended):
    L = ["# Atlas Allowlist Builder - decisions / 判定記録", "",
         f"- Decided by / 承認者: {by}",
         f"- Decided at / 日時 (UTC): {when}",
         f"- Report generated: {report.get('generated')} from `{(report.get('input') or {}).get('display')}`",
         f"- Index: {(report.get('index') or {}).get('path', 'none')} (generated {(report.get('index') or {}).get('generated', '-')})",
         f"- Mode: {'--approve-recommended' if approve_recommended else 'explicit --approve'}",
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
