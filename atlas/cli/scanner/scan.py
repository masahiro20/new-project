#!/usr/bin/env python3
"""Atlas static scanner v1 -- READ-ONLY. Python stdlib + an optional JS/TS parser helper.

Implements the [P] rules of scan-rules-v0.md in two tiers:
  1. regex candidates (as in v0), pre-filtered per file;
  2. a context layer that decides whether each candidate is real:
       - Python: `ast` + `tokenize` (atlas/scanner/ast_py.py)
       - JS/TS:  TypeScript parser via node (atlas/scanner/js/ast_dump.cjs)
       - Markdown/text: fenced blocks, inline code, quotes, negation window
     Code rules (CE-001, CE-002, OB-003, CR-001, NW-001) are re-derived from the AST
     on parsed files. Text rules (TP-*, SK-001, RF-001, NW-002, OB-004) are kept or
     suppressed depending on where the match sits (tool description vs comment vs
     detection-pattern string vs negated sentence).
Suppressed candidates are kept in the output with `suppressed: true` and a `why`,
so every decision is auditable. They do not count toward the trust score.

Nothing from the scanned tree is executed, imported, installed or built: files
are read as text; the JS helper only calls ts.createSourceFile on file contents.

Usage:
    python3 -I scan.py <repo_dir> [...] [--json out.json] [--findings out.jsonl]
                       [--no-ast] [--max-examples N] [--quiet]
"""
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ast_py  # noqa: E402
import trust as trust_mod  # noqa: E402

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__",
             ".next", "vendor", "target", "coverage", ".tox", ".mypy_cache"}
PACKAGE_SKIP_DIRS = SKIP_DIRS - {"dist", "build"}  # published archives ship built code there
MAX_BYTES = 1_000_000
CODE_EXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".go", ".rs", ".rb",
            ".php", ".sh", ".bash", ".zsh", ".ps1", ".java", ".kt", ".cs"}
TEXT_EXT = {".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml"}
DOC_EXT = {".md", ".mdx", ".txt", ".rst"}
JS_EXT = {".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx"}
SCRIPT_EXT = {".sh", ".bash", ".zsh", ".ps1", ".py", ".js", ".mjs", ".cjs", ".ts", ".rb"}
HASH_COMMENT_EXT = {".sh", ".bash", ".zsh", ".rb", ".yaml", ".yml", ".toml", ".ps1", ".py"}
SLASH_COMMENT_EXT = {".go", ".rs", ".java", ".kt", ".cs", ".php", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}
PATTERN_FILE_EXT = {".yar", ".yara", ".semgrep", ".sigma"}  # detection-rule files of scanners

JS_HELPER = os.path.join(HERE, "js", "ast_dump.cjs")
# Optional overrides (used by the packaged CLI in atlas/cli): ATLAS_TS_PATH = directory of
# the `typescript` package the helper should load; ATLAS_NODE = node binary. Unset -> the
# helper uses js/node_modules/typescript and `node` from PATH, as before.
TS_PATH_ENV = "ATLAS_TS_PATH"
NODE_ENV = "ATLAS_NODE"

# ---------------------------------------------------------------------------
# Rule table. scope: "code" | "text" | "any"
# ---------------------------------------------------------------------------
R = []


def rule(rid, sev, scope, pattern, title, flags=re.I):
    R.append({"id": rid, "sev": sev, "scope": scope, "re": re.compile(pattern, flags), "title": title})


rule("ATL-TP-001", "high", "any",
     r"<\s*/?\s*(IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET|ADMIN|OVERRIDE)\s*>",
     "Pseudo-XML instruction tag (<IMPORTANT>, <SYSTEM> ...) typical of tool poisoning", flags=0)
rule("ATL-TP-002", "high", "any",
     r"\b(do\s+not|don'?t|never)\s+(tell|inform|mention|notify|alert|reveal|show)\s+(this\s+)?(to\s+)?(the\s+)?(user|human)\b",
     "Concealment instruction (hide behaviour from the user)")
rule("ATL-TP-003", "high", "any",
     r"\b(ignore|disregard|forget|override)\s+(all\s+)?(the\s+)?(previous|prior|above|earlier|system|other)\s+(instructions?|prompts?|rules|guidelines|tools?)\b",
     "Instruction-override phrase")
SENS_PATH = (r"(~|\$HOME|%USERPROFILE%|homedir\(\))[/\\]?\.?(ssh|aws|gnupg|cursor[/\\]mcp\.json|claude\.json|docker[/\\]config\.json|kube[/\\]config|npmrc|pypirc|netrc|git-credentials)"
             r"|\bid_(rsa|ed25519|ecdsa)\b|\.aws[/\\]credentials|\bwallet\.dat\b|Login Data|\.config[/\\]gh[/\\]hosts\.yml")
rule("ATL-TP-004", "high", "any",
     r"\b(read|cat|open|send|pass|upload|include|copy|attach|provide|extract)\b[^\n]{0,80}(" + SENS_PATH + ")",
     "Instruction/code that reads or passes a credential / agent-config file")
rule("ATL-FS-001", "low", "code", SENS_PATH, "Code references a credential / agent-config path")
rule("ATL-TP-005", "medium", "any",
     r"\b(before|prior\s+to)\s+(using|calling|invoking|running)\s+(this|any\s+other)\s+tool\b.{0,80}\b(read|send|pass|include|call)\b",
     "Coercive tool-ordering instruction (shadowing pattern)")
rule("ATL-OB-001", "high", "any",
     r"[​⁠‪-‮⁦-⁩]|(?<=.)﻿|(?<=[A-Za-z0-9 ])[‌‍](?=[A-Za-z0-9 ])",
     "Zero-width / bidi control character", flags=0)
rule("ATL-OB-002", "critical", "any", r"[\U000E0000-\U000E007F]",
     "Unicode TAG character (invisible ASCII smuggling)", flags=0)
rule("ATL-OB-003", "high", "code",
     r"\b(eval|exec|Function)\s*\(\s*(atob|Buffer\.from|base64\.b64decode|codecs\.decode|bytes\.fromhex|zlib\.decompress)"
     r"|base64\s+(-d|--decode)\s*\|\s*(ba)?sh",
     "Decode-then-execute")
rule("ATL-OB-004", "medium", "code", r"['\"][A-Za-z0-9+/]{400,}={0,2}['\"]",
     "Very long base64-like string literal", flags=0)
rule("ATL-CE-001", "medium", "code",
     r"subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.(system|popen)\s*\(|\bchild_process\b.{0,40}\b(exec|execSync)\b"
     r"|\brequire\(\s*['\"]child_process['\"]\s*\)\.exec(Sync)?\b|\bexec(Sync)?\s*\(\s*`",
     "Shell command execution (shell=True / os.system / child_process.exec)")
rule("ATL-CE-002", "medium", "code",
     r"(?<![\w.-])eval\s*\(|\bnew\s+Function\s*\(|\bvm\.runIn(New|This)Context\b|(?<![\w.])exec\s*\(\s*(compile|open|requests|urllib)",
     "Dynamic code evaluation (eval / new Function / vm)")
rule("ATL-RF-001", "critical", "any",
     r"\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^\n|]{0,200}\|\s*(iex|Invoke-Expression)\b"
     r"|\bsh\s+-c\s+\"?\$\((curl|wget)",
     "Pipe-to-shell remote script (curl | sh)")
rule("ATL-NW-001", "medium", "code",
     r"(host|hostname|bind|listen|addr(ess)?)\s*[=:(,]\s*['\"]?0\.0\.0\.0|['\"]0\.0\.0\.0:\d+|\.listen\(\s*\d+\s*,\s*['\"]0\.0\.0\.0",
     "Server binds to all interfaces (0.0.0.0)")
# v1: word boundaries (v0 matched `RequestBinding`); messaging APIs split out below
rule("ATL-NW-002", "high", "any",
     r"webhook\.site|\brequestbin\b|pipedream\.net|\.ngrok(-free)?\.(io|app)|\binteract\.sh\b|\boast\.(fun|me|pro|live)\b|burpcollaborator"
     r"|discord(app)?\.com/api/webhooks|api\.telegram\.org/bot|\btransfer\.sh\b|pastebin\.com/raw|\bhookbin\b",
     "Known exfiltration / callback endpoint")
rule("ATL-CR-001", "high", "code",
     r"JSON\.stringify\(\s*process\.env\s*\)|\bdict\(\s*os\.environ\s*\)|os\.environ\.copy\(\)\s*\)|\bObject\.(entries|keys)\(\s*process\.env\s*\)"
     r"|\bos\.Environ\(\)",
     "Bulk environment dump")
rule("ATL-SK-001", "high", "text",
     r"--dangerously-skip-permissions|\"?defaultMode\"?\s*:\s*\"?bypassPermissions|--yolo\b|disable\s+(the\s+)?(sandbox|safety|guardrails?|permission\s+prompts?)"
     r"|without\s+asking\s+(the\s+user\s+)?for\s+(permission|confirmation)|auto[- ]?approve\s+all",
     "Instruction to disable agent safety / permissions")

SEMANTIC_RULES = {"ATL-CE-001", "ATL-CE-002", "ATL-OB-003", "ATL-CR-001", "ATL-NW-001"}
TEXT_RULES = {"ATL-TP-001", "ATL-TP-002", "ATL-TP-003", "ATL-TP-004", "ATL-TP-005", "ATL-SK-001",
              "ATL-RF-001", "ATL-NW-002"}
NEGATABLE = {"ATL-TP-003", "ATL-TP-004", "ATL-TP-005", "ATL-SK-001", "ATL-RF-001", "ATL-NW-002", "ATL-TP-001"}
NEG_CUE = re.compile(
    r"\b(never|don'?t|do\s+not|doesn'?t|does\s+not|must\s+not|should\s+not|shouldn'?t|avoid|without|refuse[sd]?|reject(s|ed)?"
    r"|block(s|ed|ing)?|detect(s|ed|ing|ion)?|flag(s|ged)?|warn(s|ing)?|prevent(s|ed)?|instead\s+of|rather\s+than|not|no"
    r"|such\s+as|e\.g\.?|i\.e\.?|for\s+example|example|like|attacks?|attackers?|patterns?|phrases?|injections?|malicious|suspicious"
    r"|beware|careful|unsafe|dangerous|risky|untrusted)\b", re.I)
INSTALLER_HOSTS = re.compile(
    r"https?://(sh\.rustup\.rs|get\.docker\.com|astral\.sh/uv|astral\.sh/ruff|bun\.sh/install|deno\.land/install|deno\.land/x/install"
    r"|raw\.githubusercontent\.com/(nvm-sh|Homebrew|golangci|helm|pyenv)/|get\.pnpm\.io|install\.python-poetry\.org|ollama\.com/install"
    r"|claude\.ai/install|fly\.io/install|cli\.github\.com|sdk\.cloud\.google\.com|awscli\.amazonaws\.com|golangci-lint\.run/install"
    r"|get\.helm\.sh|tailscale\.com/install|nixos\.org/nix/install|install\.determinate\.systems|opencode\.ai/install|cursor\.com/install"
    r"|starship\.rs/install|deb\.nodesource\.com|rpm\.nodesource\.com|foundry\.paradigm\.xyz|sh\.vector\.dev|get\.k3s\.io|mise\.run|pixi\.sh)", re.I)
MESSAGING = re.compile(r"discord(app)?\.com/api/webhooks|api\.telegram\.org/bot", re.I)
HARDCODED_TOKEN = re.compile(r"api\.telegram\.org/bot\d{6,}:[\w-]{30,}|discord(app)?\.com/api/webhooks/\d{10,}/[\w-]{40,}", re.I)
MEDIA_B64 = ("iVBORw0KGgo", "/9j/", "R0lGOD", "UklGR", "AAABAA", "T2dnUw", "d09GR", "d09GM", "PHN2Zy", "PD94bWwg",
             "JVBERi0", "AAAAIGZ0eXA", "AAAAHGZ0eXA", "SUQz", "GkXfo", "AGFzbQ")


# ---------------------------------------------------------------------------
def ctx_of(rel):
    p = rel.lower().replace("\\", "/")
    base = p.rsplit("/", 1)[-1]
    if base == "skill.md":
        return "skill"
    if re.search(r"(^|/)(tests?|__tests__|__mocks__|spec|specs|e2e|fixtures?|testdata|test_data|evals?|benchmarks?|testing|test-[\w-]+|test_[\w-]+)(/|$)"
                 r"|\.(test|spec)\.|(^|/)test_[^/]+\.py$|_tests?\.(py|go|rs|rb|ts|js)$|(^|/)tests?\.rs$|conftest\.py$", p):
        return "test"
    if re.search(r"(^|/)(examples?|samples?|demos?|playground)(/|$)", p):
        return "example"
    if re.search(r"(^|/)(\.github|\.circleci|\.gitlab|\.buildkite|ci)/|(^|/)(dockerfile|makefile|justfile)$|\.gitlab-ci\.yml$", p):
        return "ci"
    if p.endswith((".md", ".mdx", ".txt", ".rst", ".svg", ".html", ".htm", ".astro")) or re.search(r"(^|/)(docs?|documentation)/", p):
        return "docs"
    return "src"


def scope_ok(scope, ext, is_skill):
    if scope == "any":
        return True
    if scope == "code":
        return ext in CODE_EXT
    if scope == "text":
        return ext in TEXT_EXT or is_skill
    return False


class LineIndex:
    def __init__(self, text):
        self.starts = [0] + [m.end() for m in re.finditer("\n", text)]

    def line(self, off):
        lo, hi = 0, len(self.starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self.starts[mid] <= off:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1


def innermost(spans, a, b):
    best = None
    for s, e, kind, role in spans:
        if s <= a and b <= e and (best is None or (e - s) < (best[1] - best[0])):
            best = (s, e, kind, role)
    return best


def md_regions(text):
    """Return list of (start, end) char ranges of fenced code blocks in Markdown."""
    out = []
    for m in re.finditer(r"(?ms)^[ \t]*(```|~~~)[^\n]*\n.*?^[ \t]*\1[ \t]*$", text):
        out.append((m.start(), m.end()))
    return out


def quoted_on_line(line, a, b):
    """True if [a,b) (line-relative) sits inside `inline code` or a "quoted" phrase."""
    for q in ("`", '"', "“", "'"):
        close = "”" if q == "“" else q
        left = line.rfind(q, 0, a)
        if left == -1:
            continue
        right = line.find(close, b)
        if right != -1 and (q != "`" or line.count("`", 0, a) % 2 == 1):
            return True
    return False


STRONG_NEG = re.compile(r"\b(never|don'?t|do\s+not|must\s+not|should\s+not|shouldn'?t|avoid|refuse\s+to)\b[^.\n]{0,25}$", re.I)


def negated(text, start, strict=False):
    """strict=True (tool descriptions): only a strong negation directly before the match counts."""
    if strict:
        ls = text.rfind("\n", 0, start) + 1
        return bool(STRONG_NEG.search(text[max(ls, start - 40):start]))
    ls = text.rfind("\n", 0, start) + 1
    window = text[max(ls, start - 90):start]
    # stop at the previous sentence boundary
    window = re.split(r"[.!?;]\s", window)[-1]
    cues = list(NEG_CUE.finditer(window))
    if not cues:
        return False
    after = window[cues[-1].end():]
    if re.search(r"\b(use|run|execute|install|then|type|paste|enter|please|read|send|pass|include|copy|upload|attach)\b", after, re.I):
        return False
    return True


# ---------------------------------------------------------------------------
_node_ok = None


def js_ast_batch(paths):
    """Run the TypeScript-parser helper on many files. Returns {path: result}."""
    global _node_ok
    node = os.environ.get(NODE_ENV) or "node"
    ts_path = os.environ.get(TS_PATH_ENV)
    env = None
    if ts_path:
        ts_path = os.path.abspath(ts_path)
        env = dict(os.environ, **{TS_PATH_ENV: ts_path})
    if _node_ok is None:
        ts_dir = ts_path or os.path.join(HERE, "js", "node_modules", "typescript")
        _node_ok = bool(shutil.which(node)) and os.path.isdir(ts_dir) and os.path.isfile(JS_HELPER)
        if not _node_ok:
            hint = (f"{TS_PATH_ENV}={ts_path} not found" if ts_path
                    else "run `npm install --ignore-scripts` in atlas/scanner/js")
            print(f"[atlas] JS/TS AST disabled: {hint}", file=sys.stderr)
    if not _node_ok or not paths:
        return {}
    out = {}
    # the helper runs with cwd=HERE, so hand it absolute paths and map results back
    back = {os.path.abspath(p): p for p in paths}
    abs_paths = list(back)
    for i in range(0, len(abs_paths), 1500):
        chunk = abs_paths[i:i + 1500]
        try:
            r = subprocess.run([node, JS_HELPER], input=json.dumps(chunk), capture_output=True, text=True,
                               timeout=600, cwd=HERE, env=env)
        except subprocess.TimeoutExpired:
            continue
        for ln in r.stdout.splitlines():
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            out[back.get(d["file"], d["file"])] = d
    return out


EXEC_CONTEXT = re.compile(r"\b(exec|execSync|spawn|system|popen|Popen|subprocess|Command::new|Invoke-Expression|run\(|\$\(|`)", re.I)


def _line_of(text, a, b):
    ls = text.rfind("\n", 0, a) + 1
    le = text.find("\n", b)
    return ls, text[ls:le if le != -1 else len(text)]


def utf16_spans_to_py(text, spans):
    """The TS helper reports UTF-16 offsets; Python indexes code points. Shift by astral chars."""
    astral = [i for i, ch in enumerate(text) if ord(ch) > 0xFFFF]
    if not astral:
        return spans
    # utf16 offset of each astral char = py index + number of astral chars before it
    u16 = [i + k for k, i in enumerate(astral)]
    import bisect

    def conv(o):
        return o - bisect.bisect_left(u16, o)
    return [(conv(a), conv(b), k, r) for a, b, k, r in spans]


def decide(f, text, ext, ctx, span, fenced):
    """Apply the context layer to one text-rule candidate. Mutates f."""
    rid = f["rule"]
    a, b = f["_a"], f["_b"]
    ls, line = _line_of(text, a, b)
    col_a, col_b = a - ls, b - ls
    loc = "code"
    if span:
        kind, role = span[2], span[3]
        loc = kind if kind != "string" else ("string:" + role)
    elif ext in DOC_EXT or ctx == "skill":
        loc = "fenced" if any(s <= a < e for s, e in fenced) else "prose"
    elif ext in CODE_EXT or ext in HASH_COMMENT_EXT or not ext:
        # unparsed languages (Go, Rust, shell, PowerShell, ...): light heuristics
        stripped = line.lstrip()
        cpos = -1
        if ext in SLASH_COMMENT_EXT and "//" in line[:col_a]:
            cpos = line.find("//")
        if cpos == -1 and (ext in HASH_COMMENT_EXT or not ext) and stripped.startswith("#") and not stripped.startswith("#!"):
            cpos = line.find("#")
        if 0 <= cpos < col_a:
            loc = "comment~"
        elif quoted_on_line(line, col_a, col_b) or (line.lstrip().startswith(("\"", "r\"", "r#\"")) and line.rstrip().endswith("\\")):
            loc = "string~"
    f["loc"] = loc

    def sup(why):
        f["suppressed"] = True
        f["why"] = why

    def low(why):
        f["sev"] = "low"
        f["why"] = why

    m_text = text[a:b]
    if loc in ("comment", "comment~") and ctx != "skill" and rid in TEXT_RULES:
        if rid == "ATL-RF-001":
            return low("usage text in a comment (not executed)")
        return sup("inside a code comment" + (" (AST)" if loc == "comment" else " (heuristic)"))
    if loc in ("regex", "string:pattern", "string:patternlist"):
        return sup("inside a detection pattern / pattern list (AST)")
    if loc == "string:test":
        return sup("assertion literal (AST)")
    if rid == "ATL-RF-001" and re.search(r"(curl|wget|irm|iwr)\s+(-\S+\s+)*(\.\.\.|\u2026|<[^>]+>|\$URL\b)", m_text):
        return sup("placeholder, not a concrete command")
    if rid in NEGATABLE and negated(text, a, strict=(loc == "string:desc")):
        return sup("negated or cited as an example")
    if rid.startswith(("ATL-TP-", "ATL-SK-")) and quoted_on_line(line, col_a, col_b):
        if loc == "prose" and ctx != "skill":
            return sup("quoted in documentation")
        if loc in ("prose", "string:plain", "string~") and rid != "ATL-TP-001":
            return low("phrase quoted/cited inside text")
    if rid == "ATL-RF-001":
        if INSTALLER_HOSTS.search(m_text):
            f["sev"] = "medium" if ctx == "skill" else "low"
            f["why"] = "known installer domain"
        elif ctx in ("docs", "ci", "example"):
            low("installer one-liner in docs/CI")
        elif loc in ("string:plain", "string:desc", "string~") and not EXEC_CONTEXT.search(line[:col_a]):
            low("install hint text in a string (not executed here)")
    if rid == "ATL-OB-001":
        if not re.search(r"[\u202a-\u202e\u2066-\u2069]", m_text):
            if loc in ("comment", "comment~", "prose") or ext in (".json", ".ndjson", ".xml", ".csv") or "\ufeff" in m_text:
                low("zero-width/BOM character in comment or data (no bidi control)")
    if rid == "ATL-NW-002" and MESSAGING.search(m_text):
        if not HARDCODED_TOKEN.search(line):
            f["sev"] = "low"
            f["why"] = "messaging API without a hard-coded token (capability)"
            f["badge"] = "external-messaging"
    if rid == "ATL-OB-004":
        lit = text[a + 1:b]
        if lit.startswith(MEDIA_B64):
            return sup("embedded media (magic bytes)")


def scan_repo_ex(root, use_ast=True, skip_dirs=None):
    """Scan one tree. Returns (findings, n_files, n_skill_dirs, stats).

    skip_dirs: directory names to skip (default SKIP_DIRS). Published packages keep their
    code in dist/ or build/, so package scans pass PACKAGE_SKIP_DIRS instead.
    """
    skip = SKIP_DIRS if skip_dirs is None else set(skip_dirs)
    findings = []
    skill_dirs = set()
    files = []
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in skip]
        for fn in fns:
            full = os.path.join(dp, fn)
            if os.path.islink(full):
                continue
            files.append(full)
            if fn == "SKILL.md":
                skill_dirs.add(dp)

    def add(rid, sev, rel, line, snip, title, **kw):
        d = {"rule": rid, "sev": sev, "file": rel, "line": line, "snippet": snip[:160],
             "ctx": ctx_of(rel), "title": title}
        d.update(kw)
        findings.append(d)
        return d

    texts = {}
    for full in files:
        try:
            if os.path.getsize(full) > MAX_BYTES:
                continue
            with open(full, "rb") as fh:
                raw = fh.read()
        except OSError:
            continue
        if b"\x00" in raw[:4096]:
            continue
        texts[full] = raw.decode("utf-8", "replace")

    js_files = [f for f, t in texts.items() if os.path.splitext(f)[1].lower() in JS_EXT
                and max((len(l) for l in t.splitlines()), default=0) <= 5000]
    js_res = js_ast_batch(js_files) if use_ast else {}
    stats = Counter()

    for full, text in texts.items():
        rel = os.path.relpath(full, root)
        ext = os.path.splitext(full)[1].lower()
        base = os.path.basename(full)
        is_skill = base == "SKILL.md"
        ctx = ctx_of(rel)
        if ext in {".js", ".mjs", ".cjs"} and max((len(l) for l in text.splitlines()), default=0) > 5000:
            stats["skipped_minified"] += 1
            continue
        cands = []
        for r in R:
            if not scope_ok(r["scope"], ext, is_skill):
                continue
            if not r["re"].search(text):
                continue
            for m in r["re"].finditer(text):
                cands.append((r, m.start(), m.end()))
        ast_res = None
        if use_ast and ext == ".py":
            ast_res = ast_py.analyse(text)
        elif use_ast and ext in JS_EXT:
            ast_res = js_res.get(full)
            if ast_res and ast_res.get("ok"):
                ast_res["spans"] = utf16_spans_to_py(text, ast_res["spans"])
        parsed = bool(ast_res and ast_res.get("ok"))
        if use_ast and (ext == ".py" or ext in JS_EXT):
            stats["ast_parsed" if parsed else "ast_failed"] += 1
        if not cands and not parsed and base not in ("package.json", "setup.py"):
            continue
        li = LineIndex(text)
        lines = text.split("\n")
        spans = ast_res["spans"] if parsed else []
        fenced = md_regions(text) if (ext in DOC_EXT or is_skill) and use_ast else []
        ast_lines = defaultdict(set)
        if parsed:
            for h in ast_res["hits"]:
                ast_lines[h["rule"]].add(h["line"])
                add(h["rule"], h["sev"], rel, h["line"], h["snippet"], h["title"], method="ast", loc="code")
        seen = set()
        file_cands = []
        for r, a, b in cands:
            ln = li.line(a)
            key = (r["id"], ln)
            if key in seen:
                continue  # one finding per rule per line, as in v0
            seen.add(key)
            f = add(r["id"], r["sev"], rel, ln, lines[ln - 1].strip(), r["title"], method="regex")
            if not use_ast:
                continue
            f["_a"], f["_b"] = a, b
            file_cands.append(f)
            if r["id"] in SEMANTIC_RULES and parsed:
                f["suppressed"] = True
                f["why"] = ("duplicate of AST finding" if ln in ast_lines[r["id"]]
                            else "not confirmed as executable code by AST")
                continue
            if r["id"] in SEMANTIC_RULES or r["id"] in ("ATL-FS-001",):
                # unparsed languages: line-comment heuristic
                line = lines[ln - 1]
                col = a - li.starts[ln - 1]
                cpos = -1
                if ext in SLASH_COMMENT_EXT:
                    cpos = line.find("//")
                if cpos == -1 and ext in HASH_COMMENT_EXT:
                    cpos = line.find("#")
                if 0 <= cpos < col and not parsed:
                    f["suppressed"] = True
                    f["why"] = "inside a line comment (heuristic)"
                    continue
                if parsed:
                    sp = innermost(spans, a, b)
                    if sp and sp[2] == "comment":
                        f["suppressed"] = True
                        f["why"] = "inside a code comment (AST)"
                    elif sp and (sp[2] == "regex" or sp[3] in ("pattern", "patternlist", "test")):
                        f["suppressed"] = True
                        f["why"] = "inside a detection pattern / assertion (AST)"
                continue
            span = innermost(spans, a, b) if parsed else None
            decide(f, text, ext, ctx, span, fenced)
            if ext in PATTERN_FILE_EXT and not f.get("suppressed"):
                f["suppressed"] = True
                f["why"] = "detection-rule file (YARA/semgrep)"

        # TP-001 escalation: tag + concealment/credential instruction in the same description string
        live_tp = [f for f in file_cands if f["rule"].startswith("ATL-TP-") and not f.get("suppressed")]
        if parsed and any(f["rule"] == "ATL-TP-001" for f in live_tp):
            for s, e, kind, role in spans:
                if kind != "string" or role != "desc":
                    continue
                inside = [f for f in live_tp if s <= f["_a"] < e]
                rules_in = {f["rule"] for f in inside}
                if "ATL-TP-001" in rules_in and rules_in & {"ATL-TP-002", "ATL-TP-004"}:
                    for f in inside:
                        if f["rule"] in ("ATL-TP-001", "ATL-TP-002", "ATL-TP-004"):
                            f["sev"] = "critical"
                            f["why"] = "tag + concealment/credential instruction in one tool description"

        if base == "package.json":
            try:
                pj = json.loads(text)
            except ValueError:
                pj = {}
            if not isinstance(pj, dict):
                pj = {}
            scripts = pj.get("scripts") or {}
            for k in ("preinstall", "install", "postinstall", "prepare"):
                if isinstance(scripts, dict) and k in scripts:
                    sev = "info" if k == "prepare" else "high"
                    if use_ast and pj.get("private") is True and k != "prepare":
                        sev = "low"  # never published to npm: runs only for contributors
                    add("ATL-IN-001", sev, rel, 0, f"{k}: {scripts[k]}", "npm install-time lifecycle script",
                        method="manifest")
            for sect in (() if pj.get("workspaces") else ("dependencies", "optionalDependencies")):
                deps = pj.get(sect) or {}
                if not isinstance(deps, dict):
                    continue
                for name, ver in deps.items():
                    if not isinstance(ver, str):
                        continue
                    if ver.strip() in ("*", "latest", "") or re.match(r"^(git\+|git:|github:|https?:)", ver) or re.match(r"^[\w.-]+/[\w.-]+(#.*)?$", ver):
                        add("ATL-DP-001", "medium", rel, 0, f"{name}: {ver}", "Unpinned / non-registry dependency",
                            method="manifest")
        if base == "setup.py":
            if re.search(r"cmdclass\s*=|\bclass\s+\w+\((install|develop|egg_info)\)", text):
                add("ATL-IN-002", "high", rel, 0, "custom cmdclass", "setup.py custom install command", method="manifest")
            if re.search(r"urllib|requests\.|socket\.|subprocess|os\.system", text):
                add("ATL-IN-002", "high", rel, 0, "network/exec in setup.py", "setup.py network/exec at install time",
                    method="manifest")

    for sd in skill_dirs:
        for dp, dns, fns in os.walk(sd):
            dns[:] = [d for d in dns if d not in skip]
            for fn in fns:
                if os.path.splitext(fn)[1].lower() in SCRIPT_EXT:
                    rel = os.path.relpath(os.path.join(dp, fn), root)
                    add("ATL-SK-002", "info", rel, 0, fn, "Executable script bundled with skill", method="manifest")

    for full in files:
        if os.path.basename(full) == "hooks.json" or full.endswith(os.path.join(".claude", "settings.json")):
            t = texts.get(full, "")
            if '"command"' in t:
                add("ATL-PL-001", "low", os.path.relpath(full, root), 0, "hooks with command",
                    "Plugin/settings hook executes shell command", method="manifest")

    for f in findings:
        f.pop("_a", None)
        f.pop("_b", None)
    return findings, len(files), len(skill_dirs), dict(stats)


def scan_repo(root, use_ast=True, skip_dirs=None):
    """Stable interface (v0-compatible): (findings, n_files, n_skill_dirs)."""
    f, n, s, _ = scan_repo_ex(root, use_ast=use_ast, skip_dirs=skip_dirs)
    return f, n, s


# ---------------------------------------------------------------------------
def summarize(name, f, nfiles, nskills, stats, max_ex=3):
    live = [x for x in f if not x.get("suppressed")]
    by_rule = Counter(x["rule"] for x in live)
    by_rule_src = Counter(x["rule"] for x in live if x["ctx"] in ("src", "skill"))
    by_rule_all = Counter(x["rule"] for x in f)
    ex = defaultdict(list)
    for x in live:
        if len(ex[x["rule"]]) < max_ex:
            ex[x["rule"]].append(f'{x["file"]}:{x["line"]} [{x["ctx"]}/{x.get("loc", "-")}] {x["snippet"]}')
    t = trust_mod.trust(f)
    return {"files": nfiles, "skills": nskills, "stats": stats, "candidates": dict(by_rule_all),
            "hits": dict(by_rule), "hits_src_only": dict(by_rule_src), "trust": t, "examples": ex}


def main():
    args = sys.argv[1:]
    out_json = out_findings = None
    max_ex = 3
    use_ast = True
    quiet = False
    if "--json" in args:
        i = args.index("--json"); out_json = args[i + 1]; del args[i:i + 2]
    if "--findings" in args:
        i = args.index("--findings"); out_findings = args[i + 1]; del args[i:i + 2]
    if "--max-examples" in args:
        i = args.index("--max-examples"); max_ex = int(args[i + 1]); del args[i:i + 2]
    if "--no-ast" in args:
        args.remove("--no-ast"); use_ast = False
    if "--quiet" in args:
        args.remove("--quiet"); quiet = True
    report = {}
    total = Counter()
    total_src = Counter()
    fh_find = open(out_findings, "w") if out_findings else None
    for root in args:
        f, nfiles, nskills, stats = scan_repo_ex(root, use_ast=use_ast)
        name = os.path.basename(os.path.normpath(root))
        s = summarize(name, f, nfiles, nskills, stats, max_ex)
        report[name] = s
        total.update(s["hits"]); total_src.update(s["hits_src_only"])
        if fh_find:
            for x in f:
                fh_find.write(json.dumps(dict(x, repo=name), ensure_ascii=False) + "\n")
        if not quiet:
            t = s["trust"]
            print(f"\n== {name}  files={nfiles} skills={nskills} findings={sum(s['hits'].values())} "
                  f"(src/skill={sum(s['hits_src_only'].values())}) trust={t['trust']} {t['grade']}")
            for rid, n in sorted(s["hits"].items()):
                print(f"  {rid:<11} {n:>5}  (src {s['hits_src_only'].get(rid, 0)})")
    if fh_find:
        fh_find.close()
    print("\n== TOTAL (all ctx / src+skill)")
    for rid in sorted(total):
        print(f"  {rid:<11} {total[rid]:>5} / {total_src.get(rid, 0)}")
    if out_json:
        with open(out_json, "w") as fh:
            json.dump(report, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
