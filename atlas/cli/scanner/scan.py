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


SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
SCANNER_VERSION = "1.3"
CORPUS_MIN_STRINGS = 9  # v1.2: a string plus >= 8 sibling strings in one literal that match attack rules


# ---------------------------------------------------------------------------
def ctx_of(rel):
    p = rel.lower().replace("\\", "/")
    base = p.rsplit("/", 1)[-1]
    if base == "skill.md":
        return "skill"
    if re.search(r"(^|/)(tests?|__tests__|__mocks__|__fixtures__|mocks?|spec|specs|e2e|fixtures?|testdata|test_data|evals?|benchmarks?|testing"
                 r"|test-[\w-]+|test_[\w-]+|cypress|playwright|\.storybook)(/|$)"
                 r"|\.(test|spec|stories|bench)\.|(^|/)test_[^/]+\.py$|_tests?\.(py|go|rs|rb|ts|js)$|_spec\.rb$|(^|/)tests?\.rs$|conftest\.py$"
                 r"|(^|/)src/test/"
                 # v1.3: scripts/test-*.js, *-test.*, *.test-*.*, stress-test.*, test_*.mjs ("-test" / "test-" / "test_"
                 # must be a whole hyphen/underscore/dot-separated word, so latest.js / contest.ts do not match)
                 r"|(^|/)scripts/test[-_][^/]*\.(js|mjs|cjs|ts|mts|cts|py)$|(^|/)[^/]+-tests?\.[a-z0-9]+$"
                 r"|\.test-[^/]*\.[a-z0-9]+$|(^|/)test_[^/]+\.(mjs|cjs|js|ts|mts|cts)$", p) or re.search(r"(^|/)\w*[a-z0-9]Tests?\.(java|kt|cs)$", rel.replace("\\", "/")):
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


SENT_END = re.compile(r"(?<!\be\.g)(?<!\bi\.e)(?<!\betc)(?<!\bvs)[.!?;](?=\s)|\n[ \t]*\n|\n[ \t]*[-*\u2022][ \t]")


def negated(text, start, strict=False, prompt=False):
    """strict=True (tool descriptions): only a strong negation directly before the match counts.
    prompt=True (v1.3, prompt strings): "e.g." / "i.e." do not end the sentence."""
    if strict:
        ls = text.rfind("\n", 0, start) + 1
        return bool(STRONG_NEG.search(text[max(ls, start - 40):start]))
    ls = text.rfind("\n", 0, start) + 1
    if prompt:
        ls = max(start - 160, 0)
        cuts = [m.end() for m in SENT_END.finditer(text, ls, start)]
        ls = cuts[-1] if cuts else ls
    window = text[max(ls, start - (160 if prompt else 90)):start]
    # stop at the previous sentence boundary
    window = (SENT_END.split(window) if prompt else re.split(r"[.!?;]\s", window))[-1]
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


# ---------------------------------------------------------------------------
# v1.1: lightweight tokenizer for Rust and Go (no AST available). It only finds string
# literal and comment ranges -- including multi-line "..." and raw r#"..."# / `...`
# strings -- so text rules can tell guidance text in a message string from code.
LEX_EXT = {".rs", ".go"}
_LEX_DESC_BEFORE = re.compile(r"(description|desc|instructions?)\s*[:=(]\s*$|with_?description\(\s*$", re.I)


def lex_spans(text, ext):
    """Return [(start, end, kind, role)] for strings/comments in Rust or Go source.

    kind "string" (role "lexdesc" when the literal follows `description =` / `Description:` /
    `WithDescription(` on the same line, else "lexplain") or "comment" (role "lex").
    Best effort: on anything unexpected it stops and returns what it has.
    """
    spans = []
    n = len(text)
    i = 0
    rust = ext == ".rs"
    ident = re.compile(r"[A-Za-z0-9_]")

    def str_role(start):
        ls = text.rfind("\n", 0, start) + 1
        return "lexdesc" if _LEX_DESC_BEFORE.search(text[ls:start]) else "lexplain"
    while i < n:
        c = text[i]
        if c == "/" and text.startswith("//", i):
            e = text.find("\n", i)
            e = n if e == -1 else e
            spans.append((i, e, "comment", "lex"))
            i = e
            continue
        if c == "/" and text.startswith("/*", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if rust and text.startswith("/*", j):
                    depth += 1; j += 2
                elif text.startswith("*/", j):
                    depth -= 1; j += 2
                else:
                    j += 1
            spans.append((i, j, "comment", "lex"))
            i = j
            continue
        if rust and c in "rb" and (i == 0 or not ident.match(text[i - 1])):
            m = re.compile(r"b?r(#*)\"").match(text, i)
            if m:
                close = '"' + m.group(1)
                e = text.find(close, m.end())
                e = n if e == -1 else e + len(close)
                spans.append((i, e, "string", str_role(i)))
                i = e
                continue
            if text.startswith('b"', i):
                i += 1
                c = '"'
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                if text[j] == "\\":
                    j += 1
                elif text[j] == "\n" and not rust:
                    break  # Go interpreted strings are single-line
                j += 1
            spans.append((i, min(j + 1, n), "string", str_role(i)))
            i = j + 1
            continue
        if c == "`" and not rust:
            e = text.find("`", i + 1)
            e = n if e == -1 else e + 1
            spans.append((i, e, "string", str_role(i)))
            i = e
            continue
        if c == "'":
            m = re.compile(r"'(\\(x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]{1,6}\}|.)|[^\\'\n])'").match(text, i)
            i = m.end() if m else i + 1  # char literal, or a Rust lifetime ('a)
            continue
        i += 1
    return spans


# v1.1: pseudo-XML tag used as an output-format delimiter.
_TAG_PAIR = re.compile(r"<\s*(IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET|ADMIN|OVERRIDE)\s*>(.*?)<\s*/\s*\1\s*>", re.S)
FORMAT_CUE = re.compile(r"\b(output|format(ted|ting)?|display|print|render|list|respond|reply|layout|exactly\s+as|new\s*lines?"
                        r"|numbers?|numbered|bullets?|markdown|table|columns?|json|indent(ation)?)\b", re.I)
# concealment / credential / override / exfiltration vocabulary: if any of it is in the same
# string, the tag is not "just formatting".
CONCEAL_CUE = re.compile(r"\b(hide|hidden|secret(ly)?|silent(ly)?|conceal|covert|without\s+(telling|informing|notifying|asking)"
                         r"|(do\s+not|don'?t|never)\s+(tell|inform|mention|notify|alert|reveal|show|disclose|let)"
                         r"|ignore|disregard|override|bypass|credentials?|passwords?|tokens?|api[_ -]?keys?|private\s+keys?|ssh"
                         r"|sen[dt]|sending|upload\w*|exfiltrat\w*|transmit\w*|forward\w*|shar(e|ed|ing)|collect\w*|track(ed|ing)?"
                         r"|log(ged|ging)|stor(e|ed|ing)|record(ed|ing)|sidenote|curl|wget)\b|https?://", re.I)
_PHRASE_RULES = [r["re"] for r in R if r["id"] in ("ATL-TP-002", "ATL-TP-003", "ATL-TP-004", "ATL-TP-005", "ATL-SK-001")]


def format_tag_only(body):
    """True if every TP-001 tag pair in `body` wraps output-formatting guidance and the whole
    string carries no concealment / credential / override / exfiltration content."""
    pairs = list(_TAG_PAIR.finditer(body))
    if not pairs or CONCEAL_CUE.search(body) or any(rx.search(body) for rx in _PHRASE_RULES):
        return False
    if re.search(SENS_PATH, body, re.I):
        return False
    return all(FORMAT_CUE.search(m.group(2)) for m in pairs)


# v1.1: "do not tell the user <claim> unless <verified>" -- an honesty guard, not concealment.
HONESTY_GUARD = re.compile(r"\bunless\b|\buntil\b|\bwithout\s+(first\s+)?(verifying|checking|confirming|testing)\b"
                           r"|\b(will|would|can|could|does|do)\s+(not\s+)?(work|succeed|run|pass)\b"
                           r"|\b(is|are|was|were|has\s+been|have\s+been)\s+(not\s+)?(impossible|possible|open|ready|done|complete|completed"
                           r"|fixed|working|available|supported|unsupported|finished|successful|resolved)\b", re.I)
HONESTY_BAD_START = re.compile(r"^\s*(about|anything|what|how|where|why|when|of|regarding|this|it\b(?!\s+(will|would|is|was|works|can)))", re.I)


def honesty_guard(text, a, b):
    """True if a TP-002 match at [a,b) asks the agent not to assert an unverified claim
    (e.g. "do not tell the user it will work without an account", "never tell the user the
    panel is open unless the tool returned a link") rather than to hide something."""
    if re.search(r"\bthis\b", text[a:b], re.I):
        return False  # "do not mention this to the user" -- concealment of an action
    # sentence that contains the match: from the previous sentence end / blank line / list bullet
    st = max(text.rfind(". ", 0, a), text.rfind("\n\n", 0, a), text.rfind("\n- ", 0, a), text.rfind("\n* ", 0, a))
    sentence_head = text[st + 1 if st >= 0 else 0:a]
    tail = text[b:b + 220]
    m = re.search(r"[.;!?](\s|$)|\n\s*\n|\n\s*[-*] ", tail)
    clause = tail[:m.start()] if m else tail
    if HONESTY_BAD_START.search(clause):
        return False
    whole = sentence_head + text[a:b] + clause
    if CONCEAL_CUE.search(re.sub(r"\b(do\s+not|don'?t|never)\s+(tell|inform|mention|notify|alert|reveal|show)\b", "", whole, flags=re.I)):
        return False
    if re.search(SENS_PATH, whole, re.I) or any(rx.search(whole) for rx in _PHRASE_RULES[1:]):
        return False
    return bool(HONESTY_GUARD.search(clause))


# Exec calls that matter for a Rust / Go string literal (v1.1.1). Prose words such as "system" or a
# markdown backtick in a doc comment are not exec context.
LEX_EXEC_CONTEXT = re.compile(r"(Command::new|process::Command|exec\.Command(Context)?|syscall\.Exec|"
                              r"\.spawn\(|\.output\(|\.status\(|\bsystem\(|\bpopen\(|\bexecv?p?e?\()")


def _stmt_prefix(text, start):
    """Code of the current statement before `start` (Rust/Go): back to the previous ; { or },
    at most 300 chars -- so `Command::new("sh").arg(\n "curl ... | sh")` keeps its exec context.
    Comments and string literal contents are blanked so doc-comment prose cannot count as code."""
    lo = max(start - 300, 0)
    cut = max(text.rfind(";", lo, start), text.rfind("{", lo, start), text.rfind("}", lo, start))
    seg = text[(cut + 1 if cut >= 0 else lo):start]
    seg = re.sub(r"/\*.*?\*/", " ", seg, flags=re.S)
    seg = re.sub(r"//[^\n]*", " ", seg)
    seg = re.sub(r'"(?:\\.|[^"\\\n])*"', '""', seg)
    return seg


# ---------------------------------------------------------------------------
# v1.2 (1): data files. TP/RF/SK hits in JSON / YAML / TOML that is not an MCP manifest or tool
# definition are quoted data (policies, rule sets, eval sets) -> medium + review. Strings that
# are tool / prompt definitions, sit under an executable key, or live in a manifest stay as is.
DATA_EXT = {".json", ".jsonc", ".jsonl", ".ndjson", ".yaml", ".yml", ".toml"}
# files whose strings reach an agent / installer / client: always full severity
MANIFEST_NAMES = {"server.json", "mcp.json", ".mcp.json", "manifest.json", "plugin.json", "marketplace.json",
                  "mcp_config.json", "claude_desktop_config.json", "gemini-extension.json", "hooks.json",
                  "smithery.yaml", "smithery.yml", "glama.json", "mcp-server.json", "mcpb.json", "dxt.json"}
AGENT_CONFIG_DIRS = re.compile(r"(^|/)\.(claude|claude-plugin|cursor|codex|gemini|vscode|windsurf|continue|kiro|roo|amazonq)/")
# a key on the path to the string that makes it a tool / prompt definition
TOOL_CONTAINER_KEYS = {"tools", "prompts", "resources", "resourcetemplates", "functions", "function", "mcpservers", "mcp",
                       "toolsets", "tooldefinitions"}
# a sibling key that makes the enclosing object a tool definition
TOOL_SIBLING_KEYS = {"inputschema", "outputschema", "argsschema", "toolannotations"}
# a key on the path that makes the string executable configuration (scripts, hooks, commands)
EXEC_KEYS = {"command", "commands", "cmd", "run", "script", "scripts", "install", "preinstall", "postinstall", "prepare",
             "exec", "entrypoint", "shell", "args", "hooks", "setup", "beforeinstall", "afterinstall", "startcommand"}
DATA_RULE_PREFIX = ("ATL-TP-", "ATL-RF-", "ATL-SK-")


def _nk(k):
    return re.sub(r"[_\-\s]", "", str(k)).lower()


_JSON_WS = re.compile(r"(?:\s+|//[^\n]*|/\*.*?\*/)*", re.S)
_JSON_STR = re.compile(r'"(?:\\.|[^"\\])*"', re.S)
_JSON_LIT = re.compile(r"[^,\]\}\s:]+")


def json_string_ctx(text):
    """[(start, end, path, sibling_keys)] for every string value of a JSON / JSONC / JSON Lines text.
    path: object keys from the root ("[]" for array levels). Raises ValueError on malformed input."""
    out = []
    n = len(text)

    def skip(i):
        return _JSON_WS.match(text, i).end()

    def value(i, path, sibs, depth):
        if depth > 200:
            raise ValueError("too deep")
        i = skip(i)
        if i >= n:
            raise ValueError("eof")
        c = text[i]
        if c == "{":
            keys = []
            i = skip(i + 1)
            if text.startswith("}", i):
                return i + 1
            while True:
                m = _JSON_STR.match(text, i)
                if not m:
                    raise ValueError("key")
                k = m.group()[1:-1]
                keys.append(_nk(k))
                i = skip(m.end())
                if not text.startswith(":", i):
                    raise ValueError(":")
                i = skip(value(i + 1, path + (k,), keys, depth + 1))
                if text.startswith(",", i):
                    i = skip(i + 1)
                    if text.startswith("}", i):
                        return i + 1
                    continue
                if text.startswith("}", i):
                    return i + 1
                raise ValueError("}")
        if c == "[":
            i = skip(i + 1)
            if text.startswith("]", i):
                return i + 1
            while True:
                i = skip(value(i, path + ("[]",), sibs, depth + 1))
                if text.startswith(",", i):
                    i = skip(i + 1)
                    if text.startswith("]", i):
                        return i + 1
                    continue
                if text.startswith("]", i):
                    return i + 1
                raise ValueError("]")
        if c == '"':
            m = _JSON_STR.match(text, i)
            if not m:
                raise ValueError("string")
            out.append((i, m.end(), path, sibs))
            return m.end()
        m = _JSON_LIT.match(text, i)
        if not m:
            raise ValueError("literal")
        return m.end()

    i = skip(0)
    while i < n:
        i = skip(value(i, (), [], 0))
    return out


_YAML_KEY = re.compile(r"^(\s*)(?:-\s+)*(?:\"([^\"]+)\"|'([^']+)'|([^\s#:\-\"'][^:#]*?))\s*:(?:\s|$)")


def yaml_ctx(text, a):
    """(path, sibling_keys) for offset `a` in a YAML text, from indentation (heuristic)."""
    lines = text[:a].split("\n")
    cur = lines[-1]
    rest = text[a:].split("\n", 1)[0]
    full_line = cur + rest

    def key_of(line):
        m = _YAML_KEY.match(line)
        if not m:
            return None, None
        k = m.group(2) or m.group(3) or m.group(4)
        # column of the key text itself (after any "- " list markers)
        col = len(line) - len(line.lstrip(" -")) if line.lstrip().startswith("-") else m.end(1)
        return k.strip(), col

    path = []
    k0, c0 = key_of(full_line)
    if k0 is not None and len(cur) > c0:
        path.append(k0)
        limit = c0
    else:
        limit = len(full_line) - len(full_line.lstrip(" -"))
    own_col = c0 if k0 is not None else None
    for ln in reversed(lines[:-1]):
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue
        k, c = key_of(ln)
        ind = len(ln) - len(ln.lstrip(" -")) if ln.lstrip().startswith("-") else len(ln) - len(ln.lstrip())
        if k is not None and c < limit:
            path.append(k)
            if own_col is None:
                own_col = c
            limit = c
        elif k is None and ind < limit and not ln.lstrip().startswith("-"):
            limit = ind
        if limit == 0:
            break
    path.reverse()
    # siblings: keys at the own key's column in the same block
    sibs = []
    if own_col is not None:
        all_lines = text.split("\n")
        idx = len(lines) - 1
        for rng in (range(idx, -1, -1), range(idx + 1, len(all_lines))):
            for j in rng:
                ln = all_lines[j]
                if not ln.strip() or ln.lstrip().startswith("#"):
                    continue
                k, c = key_of(ln)
                ind = len(ln) - len(ln.lstrip())
                if k is not None and c == own_col:
                    sibs.append(_nk(k))
                    if ln.lstrip().startswith("-") and rng.step == 1:
                        break  # next list item
                    if ln.lstrip().startswith("-") and rng.step == -1:
                        break  # start of this list item
                elif ind < own_col and not (k is not None and c > own_col):
                    break
    return tuple(path), sibs


def toml_ctx(text, a):
    """(path, sibling_keys) for offset `a` in a TOML text: [table] header + key (heuristic)."""
    head = text[:a]
    table, tstart = (), 0
    for m in re.finditer(r"(?m)^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$", head):
        table = tuple(x.strip().strip("\"'") for x in m.group(1).split("."))
        tstart = m.end()
    nxt = re.compile(r"(?m)^\s*\[\[?\s*[\w\"'.-]+\s*\]").search(text, a)
    block = text[tstart:nxt.start() if nxt else len(text)]
    sibs = [_nk(k.strip("\"'")) for k in re.findall(r"(?m)^\s*([\w.\"'-]+)\s*=", block)]
    keys = re.findall(r"(?m)^\s*([\w.\"'-]+)\s*=", head[tstart:])
    path = table + (tuple(keys[-1].strip("\"'").split(".")) if keys else ())
    return path, sibs


def data_string_kind(path, sibs, rel):
    """'manifest' | 'exec' | 'data' for a string at `path` (keys) in a data file `rel`."""
    p = rel.replace("\\", "/")
    base = p.rsplit("/", 1)[-1].lower()
    if base in MANIFEST_NAMES or AGENT_CONFIG_DIRS.search("/" + p.lower()):
        return "manifest"
    keys = [_nk(k) for k in path if k != "[]"]
    if any(k in EXEC_KEYS for k in keys):
        return "exec"
    if any(k in TOOL_CONTAINER_KEYS for k in keys) or set(sibs) & TOOL_SIBLING_KEYS \
            or ("name" in sibs and ("parameters" in sibs or "arguments" in sibs)):
        return "manifest"
    if base == "package.json" and keys and keys[0] in ("mcp", "bin", "main", "exports"):
        return "manifest"
    return "data"


class DataCtx:
    """Lazily computed per-file context for data files (v1.2)."""

    def __init__(self, text, ext, rel):
        self.text, self.ext, self.rel = text, ext, rel
        self._json = None

    def kind(self, a):
        try:
            if self.ext in (".yaml", ".yml"):
                return data_string_kind(*yaml_ctx(self.text, a), self.rel)
            if self.ext == ".toml":
                return data_string_kind(*toml_ctx(self.text, a), self.rel)
            if self._json is None:
                self._json = json_string_ctx(self.text)
            for s, e, path, sibs in self._json:
                if s <= a < e:
                    return data_string_kind(path, sibs, self.rel)
            return data_string_kind(("?",), [], self.rel)
        except (ValueError, RecursionError, IndexError):
            # unparseable: fall back to the file as a whole
            if re.search(r"inputSchema|input_schema|mcpServers", self.text):
                return "manifest"
            return data_string_kind((), [], self.rel)


# ---------------------------------------------------------------------------
# v1.2 (3): Rust inline tests. #[cfg(test)] items and #[test] / #[tokio::test] functions.
_RS_CFG_TEST = re.compile(r"#\[\s*cfg\s*\(\s*(?:all\s*\(\s*)?test\s*[,)]")
_RS_TEST_ATTR = re.compile(r"#\[\s*(?:[A-Za-z_][\w]*::)*test\b[^\]]*\]")


def rust_test_ranges(text, spans):
    """[(start, end)] of Rust items marked #[cfg(test)] or #[test]-like, via brace matching that
    skips string literals and comments (lex_spans) and char literals."""
    masked = [(s, e) for s, e, k, _ in spans]
    masked.sort()
    inside = {}
    for s, e in masked:
        inside[s] = e

    def in_mask(i):
        import bisect
        j = bisect.bisect_right(masked, (i, float("inf"))) - 1
        return j >= 0 and masked[j][0] <= i < masked[j][1]

    out = []
    n = len(text)
    for rx in (_RS_CFG_TEST, _RS_TEST_ATTR):
        for m in rx.finditer(text):
            if in_mask(m.start()):
                continue
            i = m.end()
            # find the item's opening brace (or `;` for `mod tests;`)
            while i < n:
                if i in inside:
                    i = inside[i]
                    continue
                if text[i] in "{;":
                    break
                i += 1
            if i >= n or text[i] == ";":
                continue
            depth, j = 0, i
            while j < n:
                if j in inside:
                    j = inside[j]
                    continue
                c = text[j]
                if c == "'":
                    cm = re.compile(r"'(\\(x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]{1,6}\}|.)|[^\\'\n])'").match(text, j)
                    if cm:
                        j = cm.end()
                        continue
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            out.append((m.start(), min(j + 1, n)))
    return out


# v1.2 (4): presentational invisible characters
STYLE_EXT = {".css", ".scss", ".sass", ".less"}


def presentational_ob001(text, a, ext, base, line, loc):
    """True if an OB-001 hit at `a` is in a stylesheet `content:` value or in a minified CSS/JS file."""
    if loc == "string:desc":
        return False
    minified = ".min." in base.lower() or len(line) > 1000
    if ext in STYLE_EXT:
        if minified:
            return True
        ls = text.rfind("\n", 0, a) + 1
        seg = text[max(ls, a - 200):a]
        return bool(re.search(r"\bcontent\s*:\s*[^;{}]*$", seg, re.I))
    if ext in JS_EXT:
        return minified
    return False


def setup_py_calls_setup(text):
    """v1.2 (5): does this setup.py call setuptools / distutils setup()? AST, with a regex fallback."""
    import ast
    try:
        tree = ast.parse(text)
    except (SyntaxError, ValueError, RecursionError, MemoryError):
        return bool(re.search(r"\b(setuptools|distutils)\b", text) and re.search(r"\bsetup\s*\(", text))
    names = set()  # local names bound to setuptools/distutils setup
    mods = set()   # local names bound to the modules
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.split(".")[0] in ("setuptools", "distutils"):
            for al in node.names:
                if al.name == "setup":
                    names.add(al.asname or "setup")
                elif al.name == "core":
                    mods.add(al.asname or "core")
        elif isinstance(node, ast.Import):
            for al in node.names:
                if al.name.split(".")[0] in ("setuptools", "distutils"):
                    mods.add((al.asname or al.name).split(".")[0] if not al.asname else al.asname)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Name) and fn.id in names:
                return True
            if isinstance(fn, ast.Attribute) and fn.attr == "setup":
                v = fn.value
                while isinstance(v, ast.Attribute):
                    v = v.value
                if isinstance(v, ast.Name) and v.id in mods:
                    return True
    return False


# ---------------------------------------------------------------------------
# v1.3: TP-* / SK-001 are high/critical only where the text reaches an agent: a tool description
# (string:desc), a skill, a manifest / tool definition (v1.2 data files), or a prompt that the code
# sends to a model (string:prompt -- AST in ast_py / js/ast_dump.cjs; string:prompt~ -- lexical, for
# Go / Rust / other unparsed languages). Other string literals and comments: medium + review.
GATE_RULES = {"ATL-TP-001", "ATL-TP-002", "ATL-TP-003", "ATL-TP-004", "ATL-TP-005", "ATL-SK-001"}
PROMPT_LOCS = ("string:prompt", "string:prompt~")
AGENT_LOCS = {"string:desc", "code"} | set(PROMPT_LOCS)
OUTSIDE_WHY = "string outside agent-reaching locations (may be a quote, example or data); review"
# code files whose output is injected into the agent's context (plugin hooks, agent config dirs)
AGENT_CODE_PATH = re.compile(r"(^|/)(\.(claude|claude-plugin|cursor|codex|gemini|windsurf|continue|kiro|roo|amazonq)|hooks)/")
_LEX_PROMPT_NAME = ast_py.PROMPT_NAME
_LEX_FIELD = re.compile(r"([A-Za-z_]\w*)\s*(?::=|\+=|=|:)\s*(?:&?[\w:.!<>\[\]]*\s*[\(\{\[]\s*)*$")
_LEX_METHOD = re.compile(r"\.([A-Za-z_]\w*)\s*\(\s*$")
_LEX_ROLE_SYSTEM = re.compile(r"\b(ChatMessageRoleSystem|RoleSystem|Role::System|MessageRole::System)\b|\brole\s*[:=]\s*\"(system|developer)\"", re.I)


def _prompt_key(name):
    n = re.sub(r"[_\-\s]", "", name).lower()
    return n in ast_py.PROMPT_KEYS or bool(_LEX_PROMPT_NAME.search(name))


def lex_prompt_ctx(text, start):
    """v1.3, Go / Rust / unparsed languages: is the string literal starting at `start` part of a model
    prompt? Looks only at the code of the current statement (strings and comments blanked): the
    nearest `key:` / `name =` / `name :=` / `.method(` before the literal, an unclosed LLM call
    (`.Create(` / `.Chat(` / `Generate...(`), or a system-role marker."""
    seg = _stmt_prefix(text, start)
    seg = re.sub(r"[\"'`][^\"'`\n]*$", "", seg)  # the literal's own opening quote (unparsed languages)
    m = _LEX_FIELD.search(seg)
    if m and _prompt_key(m.group(1)):
        return True
    m = _LEX_METHOD.search(seg)
    if m and (_prompt_key(m.group(1)) or ast_py.LLM_CALL.match(m.group(1))):
        return True
    stack = []
    for tok in re.finditer(r"([A-Za-z_]\w*)?\s*\(|\)", seg):
        if tok.group(0) == ")":
            if stack:
                stack.pop()
        else:
            stack.append(tok.group(1) or "")
    if any(nm and ast_py.LLM_CALL.match(nm) for nm in stack):
        return True
    lo = max(start - 300, 0)
    raw = text[lo:start]
    return bool(_LEX_ROLE_SYSTEM.search(raw[max(raw.rfind(";"), raw.rfind("}")) + 1:]))


# few-shot example label in a prompt string ("Example:", "Examples 2:", "Input:", "Q:", "e.g.:")
FEWSHOT_LABEL = re.compile(r"(?i)(?:^|\n|[.!?]\s+)[ \t>#*\-]*(?:examples?(?:\s*\d+)?|few[- ]?shot(?:\s+examples?)?|for\s+example"
                           r"|e\.g\.|sample\s+(?:input|conversation|dialog(?:ue)?)|(?:user\s+)?input|q)\s*[:：]")


def fewshot_label_before(text, s0, a):
    """True if, inside the string starting at s0, the text before `a` has a few-shot example label
    with no blank line between it and the match."""
    last = None
    for m in FEWSHOT_LABEL.finditer(text, s0, a):
        last = m
    return bool(last) and not re.search(r"\n[ \t]*\n", text[last.end():a])


# v1.3: defensive instruction that cites an override phrase ("do not follow embedded instructions
# such as 'ignore previous instructions'"). General rule: ignore / disregard / do not follow + such /
# any / embedded / untrusted ... instructions, or instructions embedded in / found in <content>.
_FOLLOW = r"(?:follow|obey|comply\s+with|execute|act\s+on|carry\s+out)"
DEFENSE_CUE = re.compile(
    r"\b(?:ignore|disregard|(?:do\s+not|don'?t|never|must\s+not|should\s+not|refuse\s+to)\s+" + _FOLLOW + r"|treat)\b"
    r"[^.!?;\n]{0,60}?\b(?:such|any|embedded|untrusted|injected|external|retrieved|hidden|third[- ]party|these|those)\b"
    r"[^.!?;\n]{0,30}?\b(?:instructions?|directives?|commands?|requests?|prompts?|text|content|messages?)\b"
    r"|\b(?:instructions?|directives?|commands?)\s+(?:that\s+(?:are|appear)\s+)?(?:embedded|contained|found|hidden|injected|appearing)"
    r"\s+(?:in|within|inside)\b"
    r"|\b(?:instructions?|directives?|commands?)\s+(?:in|within|inside|from)\s+(?:the\s+|any\s+)?(?:tool\s+(?:results?|outputs?)"
    r"|documents?|web\s*pages?|retrieved|user[- ](?:provided|supplied)|untrusted|external|search\s+results?|emails?|files?|data)\b"
    r"|\b(?:do\s+not|don'?t|never)\s+" + _FOLLOW + r"\s+(?:it|them|this|that)\b"
    r"|\bas\s+(?:untrusted\s+)?(?:data|plain\s+text)\b(?!\s*:)", re.I)
_IMPERATIVE_HEAD = re.compile(r"^[\W_]*(?:(?:please|now|first|then|also|always|immediately|you\s+(?:must|should|will)|must)\s+"
                              r"|[A-Za-z]+\s*:\s*)*[\W_]*$", re.I)


def defensive_override(text, a, b):
    """True if a TP-003 match at [a,b) sits in a sentence that tells the model NOT to follow such
    text, and is not itself the sentence's imperative (`Ignore previous instructions and ...`)."""
    lo = max(a - 400, 0)
    cuts = [m.end() for m in SENT_END.finditer(text, lo, a)]
    head = text[cuts[-1] if cuts else lo:a]
    if _IMPERATIVE_HEAD.match(head):
        return False
    m = SENT_END.search(text, b, min(len(text), b + 400))
    sentence = head + " " * (b - a) + text[b:m.start() if m else min(len(text), b + 400)]
    return bool(DEFENSE_CUE.search(sentence))


# ---------------------------------------------------------------------------
# v1.3: CR-001 in Go. os.Environ() is high only when, in the same function, its result reaches JSON /
# log output / an HTTP request / a file or stream write (lexical: strings and comments blanked).
# Passing it to a child process (cmd.Env = os.Environ(), append(os.Environ(), ...)) and scanning it
# for a prefix (strings.HasPrefix) is a capability, shown as low.
GO_SINK = re.compile(r"\b(?:json\.(?:Marshal|MarshalIndent|NewEncoder)|yaml\.Marshal|xml\.Marshal|toml\.Marshal|gob\.NewEncoder"
                     r"|fmt\.(?:Print|Println|Printf|Fprint|Fprintln|Fprintf)|log\.\w+|slog\.\w+|http\.\w+"
                     r"|os\.WriteFile|ioutil\.WriteFile|\w+\.(?:Write|WriteString|WriteAll|Encode|Post|PostForm|Do|Send"
                     r"|Info|Infof|Debug|Debugf|Warn|Warnf|Error|Errorf|Print|Printf|Println|Log|Logf))\s*\(")
GO_FILTER = re.compile(r"\bstrings\.(?:HasPrefix|HasSuffix|Contains|EqualFold|Index)\s*\(")


def _go_masked(text):
    """Go source with string literal contents and comments replaced by spaces (offsets preserved)."""
    chars = list(text)
    for s, e, kind, _ in lex_spans(text, ".go"):
        lo, hi = (s + 1, e - 1) if kind == "string" else (s, e)
        for i in range(lo, min(hi, len(chars))):
            if chars[i] != "\n":
                chars[i] = " "
    return "".join(chars)


def _block_at(masked, a, open_at=None):
    """(start, end) of the top-level {...} block containing offset a (a func body), else the file."""
    depth, start = 0, None
    for i, c in enumerate(masked):
        if c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and start is not None:
                if start <= a <= i:
                    return start, i + 1
                start = None
            depth = max(depth, 0)
    return 0, len(masked)


def _call_args(masked, i):
    """Text of the balanced (...) starting at masked[i] == '('."""
    depth = 0
    for j in range(i, min(len(masked), i + 4000)):
        if masked[j] == "(":
            depth += 1
        elif masked[j] == ")":
            depth -= 1
            if depth == 0:
                return masked[i + 1:j]
    return masked[i + 1:i + 4000]


def go_environ_flow(text, a, masked=None):
    """(sev, why) for an os.Environ() call at offset a in a Go file (v1.3)."""
    masked = masked if masked is not None else _go_masked(text)
    s0, e0 = _block_at(masked, a)
    body = masked[s0:e0]
    rel_a = a - s0
    call_end = rel_a + len("os.Environ()")
    tainted = set()
    # x := os.Environ() / var x = os.Environ() / x = os.Environ()
    m = re.search(r"([A-Za-z_]\w*)\s*(?::=|=)\s*$", body[max(0, rel_a - 80):rel_a])
    if m:
        tainted.add(m.group(1))
    filtered = False
    # for _, e := range os.Environ() { ... }  (also through a tainted variable)
    loops = []
    for lm in re.finditer(r"\bfor\s+(?:([A-Za-z_]\w*)\s*,\s*)?([A-Za-z_]\w*)\s*:?=\s*range\s+([\w.()]+)\s*\{", body):
        src = lm.group(3)
        if src == "os.Environ()" and lm.start(3) == rel_a or src in tainted:
            j = lm.end() - 1
            depth, k = 0, j
            while k < len(body):
                if body[k] == "{":
                    depth += 1
                elif body[k] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            loops.append((lm.group(2), body[j:k + 1]))
    for var, lbody in loops:
        tainted.add(var)
        if GO_FILTER.search(lbody):
            filtered = True  # prefix / name scan: only selected entries are used
            continue
        # entries collected into another container: m[k] = v / out = append(out, e)
        for cm in re.finditer(r"([A-Za-z_]\w*)\s*\[[^=\n]*\]\s*=(?!=)|([A-Za-z_]\w*)\s*=\s*append\(\s*\2\b", lbody):
            tainted.add(cm.group(1) or cm.group(2))
    # does a sink receive os.Environ() itself or a tainted name?
    names = re.compile(r"\bos\.Environ\(\)" + "".join(r"|\b" + re.escape(t) + r"\b" for t in tainted))
    for sm in GO_SINK.finditer(body):
        args = _call_args(body, sm.end() - 1)
        if names.search(args):
            return "high", None
    stmt = body[max(0, rel_a - 120):rel_a]
    after = body[call_end:call_end + 40]
    if re.search(r"\bEnv\s*(?:=|:)\s*(?:append\(\s*)?$", stmt) or re.search(r"\bappend\(\s*$", stmt) \
            or re.search(r"^\s*,", after) and re.search(r"append\(\s*$", stmt):
        why = "os.Environ() passed to a child process environment (capability)"
    elif filtered:
        why = "os.Environ() scanned for selected names (strings.HasPrefix etc.), not dumped (capability)"
    else:
        why = "os.Environ() not passed to JSON / log / HTTP / file output in this function (capability)"
    return "low", why


def decide(f, text, ext, ctx, span, fenced, data=None, base=""):
    """Apply the context layer to one text-rule candidate. Mutates f."""
    rid = f["rule"]
    a, b = f["_a"], f["_b"]
    ls, line = _line_of(text, a, b)
    col_a, col_b = a - ls, b - ls
    loc = "code"
    if span and span[3] in ("lex", "lexplain", "lexdesc"):
        # Rust / Go tokenizer (v1.1): a heuristic, so locations keep the "~" marker
        loc = {"lex": "comment~", "lexplain": "string~", "lexdesc": "string:desc"}[span[3]]
        if loc == "string~" and rid in GATE_RULES and lex_prompt_ctx(text, span[0]):
            loc = "string:prompt~"  # v1.3: a prompt sent to a model (lexical)
    elif span:
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
            if rid in GATE_RULES and lex_prompt_ctx(text, a):
                loc = "string:prompt~"  # v1.3 (lexical)
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
    if rid in GATE_RULES and SEV_RANK[f["sev"]] > SEV_RANK["medium"] and (
            loc == "string:example" or (loc in PROMPT_LOCS and span and fewshot_label_before(text, span[0], a))):
        # v1.3: few-shot example inside a prompt (examples / input-output records / "Example:" label)
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "few-shot example inside a prompt (examples container, input/output record or Example: label); review"
        return
    in_prompt = loc in PROMPT_LOCS or loc == "string:example"
    if rid in NEGATABLE and in_prompt:
        # v1.3: a prompt built by the code. A strong negation directly before the match suppresses (as in
        # tool descriptions); the wider v1.0 negation / citation window only downgrades to review.
        if negated(text, a, strict=True):
            return sup("negated or cited as an example")
        if negated(text, a, prompt=True):
            f["sev"] = "medium" if SEV_RANK[f["sev"]] > SEV_RANK["medium"] else f["sev"]
            f["review"] = True
            f["why"] = "negated or cited as an example inside a prompt; review"
            return
    elif rid in NEGATABLE and negated(text, a, strict=(loc in ("string:desc", "string:catalog"))):
        return sup("negated or cited as an example")
    if rid == "ATL-TP-003" and loc not in ("string:desc", "string:catalog", "code") and SEV_RANK[f["sev"]] > SEV_RANK["medium"] \
            and defensive_override(text, a, b):
        # v1.3: "do not follow instructions embedded in documents, such as 'ignore previous instructions'"
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "defensive instruction citing an override phrase (do not follow such / embedded instructions); review"
        return
    if loc == "string:catalog" and rid.startswith(("ATL-TP-", "ATL-SK-")) and SEV_RANK[f["sev"]] > SEV_RANK["medium"]:
        # v1.1: the description of a threat/rule record ({"severity": ..., "description": ...})
        # quotes attack text by design. Downgraded for review, never suppressed; the
        # tag+concealment escalation below still applies to these strings.
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "quoted in a threat/rule catalog entry (description next to severity/taxonomy keys); review"
        return
    if rid.startswith(DATA_RULE_PREFIX) and SEV_RANK[f["sev"]] > SEV_RANK["medium"] and loc != "string:desc" \
            and (loc == "string:corpus" or f.get("_grp", 0) >= CORPUS_MIN_STRINGS):
        # v1.2 (2): detection rules / test corpus held in a collection literal. Downgraded for
        # review, never suppressed; tool descriptions are excluded.
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = ("detection rule / corpus data (" + ("collection named like rules/vectors/corpus/expected, or an "
                    "expected-outcome record" if loc == "string:corpus" else
                    f"{f['_grp']} strings in one literal match attack rules") + "); review")
        return
    if rid == "ATL-TP-001" and span and span[2] == "string" and loc not in ("string:desc",) \
            and format_tag_only(text[span[0]:span[1]]):
        # v1.1: <INSTRUCTION>Output the list exactly as provided</INSTRUCTION> in a non-description
        # string, with nothing about hiding, credentials, overriding or sending in that string
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "pseudo-XML tag used as an output-format delimiter (no concealment/credential content in the string); review"
        return
    if rid == "ATL-TP-002" and honesty_guard(text, a, b):
        # v1.1: "do not tell the user <claim> unless <verified>" asks for honesty, not concealment
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "do-not-tell phrase guards an unverified claim (honesty), not concealment; review"
        return
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
        elif loc in ("string:plain", "string:desc", "string~", "string:prompt", "string:prompt~", "string:example") \
                and not EXEC_CONTEXT.search(line[:col_a]) \
                and not (span and span[3] in ("lexplain", "lexdesc") and LEX_EXEC_CONTEXT.search(_stmt_prefix(text, span[0]))):
            low("install hint text in a string (not executed here)")
    if rid == "ATL-OB-001":
        if not re.search(r"[\u202a-\u202e\u2066-\u2069]", m_text):
            if loc in ("comment", "comment~", "prose") or ext in (".json", ".ndjson", ".xml", ".csv") or "\ufeff" in m_text:
                low("zero-width/BOM character in comment or data (no bidi control)")
        if SEV_RANK[f["sev"]] > SEV_RANK["low"] and presentational_ob001(text, a, ext, base, line, loc):
            # v1.2 (4): CSS `content:` glyphs and minified bundles are not read as instructions
            low("presentational character in stylesheet / minified bundle")
    if rid == "ATL-NW-002" and MESSAGING.search(m_text):
        if not HARDCODED_TOKEN.search(line):
            f["sev"] = "low"
            f["why"] = "messaging API without a hard-coded token (capability)"
            f["badge"] = "external-messaging"
    if rid == "ATL-OB-004":
        lit = text[a + 1:b]
        if lit.startswith(MEDIA_B64):
            return sup("embedded media (magic bytes)")
    if data is not None and rid.startswith(DATA_RULE_PREFIX) and SEV_RANK[f["sev"]] > SEV_RANK["medium"] \
            and loc not in ("comment~",) and data.kind(a) == "data":
        # v1.2 (1): quoted text in a data file that is not an MCP manifest / tool definition
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = "data file (not an MCP manifest/tool definition); review"
    if rid in GATE_RULES and not f.get("suppressed") and SEV_RANK[f["sev"]] > SEV_RANK["medium"] \
            and ext in CODE_EXT and ctx != "skill" and loc not in AGENT_LOCS \
            and not AGENT_CODE_PATH.search("/" + f["file"].replace("\\", "/")):
        # v1.3: attack-shaped text in a string literal / comment that neither describes a tool nor is
        # sent to a model. Downgraded for review, never suppressed.
        f["sev"] = "medium"
        f["review"] = True
        f["why"] = OUTSIDE_WHY


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
                ast_res["groups"] = [(g[0], g[1]) for g in utf16_spans_to_py(
                    text, [(g[0], g[1], "", "") for g in ast_res.get("groups", [])])]
        parsed = bool(ast_res and ast_res.get("ok"))
        if use_ast and (ext == ".py" or ext in JS_EXT):
            stats["ast_parsed" if parsed else "ast_failed"] += 1
        if not cands and not parsed and base not in ("package.json", "setup.py"):
            continue
        li = LineIndex(text)
        lines = text.split("\n")
        spans = ast_res["spans"] if parsed else []
        test_ranges = []
        if use_ast and not parsed and ext in LEX_EXT and cands:
            try:
                spans = lex_spans(text, ext)
                stats["lexed"] += 1
            except (IndexError, ValueError, RecursionError):
                spans = []
            if ext == ".rs" and ctx != "test":
                try:
                    test_ranges = rust_test_ranges(text, spans)
                except (IndexError, ValueError, RecursionError):
                    test_ranges = []
        data = DataCtx(text, ext, rel) if (use_ast and ext in DATA_EXT) else None
        # v1.2 (2): per collection literal, how many distinct strings hold a TP/RF/SK candidate
        grp_count = {}
        groups = ast_res.get("groups", []) if parsed else []
        if groups:
            hit_strings = set()
            for r, a, b in cands:
                if r["id"].startswith(DATA_RULE_PREFIX):
                    sp = innermost(spans, a, b)
                    if sp and sp[2] == "string":
                        hit_strings.add((sp[0], sp[1]))
            for g in groups:
                grp_count[g] = sum(1 for s0, e0 in hit_strings if g[0] <= s0 and e0 <= g[1])
        fenced = md_regions(text) if (ext in DOC_EXT or is_skill) and use_ast else []
        ast_lines = defaultdict(set)
        if parsed:
            for h in ast_res["hits"]:
                ast_lines[h["rule"]].add(h["line"])
                add(h["rule"], h["sev"], rel, h["line"], h["snippet"], h["title"], method="ast", loc="code")
        seen = set()
        file_cands = []
        go_masked = None
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
            f_ctx = ctx
            if any(s0 <= a < e0 for s0, e0 in test_ranges):
                f_ctx = f["ctx"] = "test"  # v1.2 (3): inside #[cfg(test)] / #[test] (Rust)
                f["ctx_why"] = "inside a Rust #[cfg(test)] / #[test] item"
            if grp_count:
                f["_grp"] = max((c for g, c in grp_count.items() if g[0] <= a < g[1]), default=0)
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
                if r["id"] == "ATL-CR-001" and ext == ".go" and "os.Environ()" in text[a:b]:
                    if any(s0 <= a < e0 for s0, e0, _k, _r in spans):
                        f["suppressed"] = True  # inside a string literal / comment (lexer)
                        f["why"] = "inside a string literal or comment (heuristic)"
                        continue
                    try:
                        if go_masked is None:
                            go_masked = _go_masked(text)
                        sev, why = go_environ_flow(text, a, go_masked)
                    except (IndexError, ValueError, RecursionError):
                        sev, why = f["sev"], None
                    if sev == "low":
                        f["sev"] = "low"
                        f["why"] = why
                        f["badge"] = "env-access"
                    else:
                        f["why"] = "os.Environ() reaches JSON / log / HTTP / file output in the same function"
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
            span = innermost(spans, a, b) if (parsed or ext in LEX_EXT) else None
            decide(f, text, ext, f_ctx, span, fenced, data=data, base=base)
            if ext in PATTERN_FILE_EXT and not f.get("suppressed"):
                f["suppressed"] = True
                f["why"] = "detection-rule file (YARA/semgrep)"

        # TP-001 escalation: tag + concealment/credential instruction in the same description string
        live_tp = [f for f in file_cands if f["rule"].startswith("ATL-TP-") and not f.get("suppressed")]
        if parsed and any(f["rule"] == "ATL-TP-001" for f in live_tp):
            for s, e, kind, role in spans:
                if kind != "string" or role not in ("desc", "catalog", "prompt"):
                    continue
                inside = [f for f in live_tp if s <= f["_a"] < e]
                if role == "prompt":  # v1.3: a prompt string; findings already downgraded for review stay so
                    inside = [f for f in inside if SEV_RANK[f["sev"]] > SEV_RANK["medium"]]
                rules_in = {f["rule"] for f in inside}
                if "ATL-TP-001" in rules_in and rules_in & {"ATL-TP-002", "ATL-TP-004"}:
                    for f in inside:
                        if f["rule"] in ("ATL-TP-001", "ATL-TP-002", "ATL-TP-004"):
                            f["sev"] = "critical"
                            f.pop("review", None)
                            f["why"] = ("tag + concealment/credential instruction in one " +
                                        ("model prompt" if role == "prompt" else "tool description"))

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
            n_before = len(findings)
            if re.search(r"cmdclass\s*=|\bclass\s+\w+\((install|develop|egg_info)\)", text):
                add("ATL-IN-002", "high", rel, 0, "custom cmdclass", "setup.py custom install command", method="manifest")
            if re.search(r"urllib|requests\.|socket\.|subprocess|os\.system", text):
                add("ATL-IN-002", "high", rel, 0, "network/exec in setup.py", "setup.py network/exec at install time",
                    method="manifest")
            if use_ast and len(findings) > n_before and not setup_py_calls_setup(text):
                # v1.2 (5): a module that happens to be named setup.py (e.g. a CLI "setup" command) is not
                # run by pip unless it calls setuptools/distutils setup()
                for x in findings[n_before:]:
                    x["sev"] = "info"
                    x["suppressed"] = True
                    x["why"] = "setup.py does not call setuptools/distutils setup() (AST): not an install-time script"

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
        f.pop("_grp", None)
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
