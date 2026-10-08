#!/usr/bin/env python3
"""Atlas prototype static scanner (v0) -- stdlib only, regex based, READ-ONLY.

Implements a subset of scan-rules-v0.md. It never executes, imports or installs
anything from the scanned tree; it only reads files as text.

Usage:
    python3 -I scan.py <repo_dir> [<repo_dir> ...] [--json out.json] [--max-examples N]

Each finding: rule id, severity, file, line, snippet, and a `ctx` tag
("test", "docs", "example") so obvious false-positive locations can be
down-weighted in the trust score.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__",
             ".next", "vendor", "target", "coverage", ".tox", ".mypy_cache"}
MAX_BYTES = 1_000_000
CODE_EXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".go", ".rs", ".rb",
            ".php", ".sh", ".bash", ".zsh", ".ps1", ".java", ".kt", ".cs"}
TEXT_EXT = {".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml"}
SCRIPT_EXT = {".sh", ".bash", ".zsh", ".ps1", ".py", ".js", ".mjs", ".cjs", ".ts", ".rb"}

SEV_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

# ---------------------------------------------------------------------------
# Rule table. scope: "code" | "text" | "any" | "skill" (SKILL.md + files beside it)
# ---------------------------------------------------------------------------
R = []


def rule(rid, sev, scope, pattern, title, flags=re.I):
    R.append({"id": rid, "sev": sev, "scope": scope, "re": re.compile(pattern, flags), "title": title})


# Tool poisoning / hidden instructions (text in descriptions, docstrings, SKILL.md)
rule("ATL-TP-001", "high", "any",
     r"<\s*/?\s*(IMPORTANT|SYSTEM|INSTRUCTIONS?|HIDDEN|SECRET|ADMIN|OVERRIDE)\s*>",
     "Pseudo-XML instruction tag (<IMPORTANT>, <SYSTEM> ...) typical of tool poisoning",
     flags=0)
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

# Obfuscation (escapes written explicitly; the original used literal invisible characters)
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

# Command execution / dynamic code
rule("ATL-CE-001", "medium", "code",
     r"subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.(system|popen)\s*\(|\bchild_process\b.{0,40}\b(exec|execSync)\b"
     r"|\brequire\(\s*['\"]child_process['\"]\s*\)\.exec(Sync)?\b|\bexec(Sync)?\s*\(\s*`",
     "Shell command execution (shell=True / os.system / child_process.exec)")
rule("ATL-CE-002", "medium", "code",
     r"(?<![\w.-])eval\s*\(|\bnew\s+Function\s*\(|\bvm\.runIn(New|This)Context\b|(?<![\w.])exec\s*\(\s*(compile|open|requests|urllib)",
     "Dynamic code evaluation (eval / new Function / vm)")

# Remote code fetch
rule("ATL-RF-001", "critical", "any",
     r"\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^\n|]{0,200}\|\s*(iex|Invoke-Expression)\b"
     r"|\bsh\s+-c\s+\"?\$\((curl|wget)",
     "Pipe-to-shell remote script (curl | sh)")

# Network
rule("ATL-NW-001", "medium", "code",
     r"(host|hostname|bind|listen|addr(ess)?)\s*[=:(,]\s*['\"]?0\.0\.0\.0|['\"]0\.0\.0\.0:\d+|\.listen\(\s*\d+\s*,\s*['\"]0\.0\.0\.0",
     "Server binds to all interfaces (0.0.0.0)")
rule("ATL-NW-002", "high", "any",
     r"webhook\.site|requestbin|pipedream\.net|\.ngrok(-free)?\.(io|app)|interact\.sh|\boast\.(fun|me|pro|live)\b|burpcollaborator"
     r"|discord(app)?\.com/api/webhooks|api\.telegram\.org/bot|transfer\.sh|pastebin\.com/raw|hookbin",
     "Known exfiltration / callback endpoint")

# Credential / env access
rule("ATL-CR-001", "high", "code",
     r"JSON\.stringify\(\s*process\.env\s*\)|\bdict\(\s*os\.environ\s*\)|os\.environ\.copy\(\)\s*\)|\bObject\.(entries|keys)\(\s*process\.env\s*\)"
     r"|\bos\.Environ\(\)",
     "Bulk environment dump")

# Skill / agent safety
rule("ATL-SK-001", "high", "text",
     r"--dangerously-skip-permissions|\"?defaultMode\"?\s*:\s*\"?bypassPermissions|--yolo\b|disable\s+(the\s+)?(sandbox|safety|guardrails?|permission\s+prompts?)"
     r"|without\s+asking\s+(the\s+user\s+)?for\s+(permission|confirmation)|auto[- ]?approve\s+all",
     "Instruction to disable agent safety / permissions")


# ---------------------------------------------------------------------------
def ctx_of(rel):
    p = rel.lower()
    if re.search(r"(^|/)(tests?|__tests__|spec|e2e|fixtures?|testdata|evals?|benchmarks?)(/|$)|\.(test|spec)\.", p):
        return "test"
    if re.search(r"(^|/)(examples?|samples?|demo)(/|$)", p):
        return "example"
    if p.endswith((".md", ".mdx", ".txt")) and not p.endswith("skill.md"):
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


def scan_repo(root, max_examples=5):
    findings = []
    skill_dirs = set()
    files = []
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            full = os.path.join(dp, fn)
            if os.path.islink(full):
                continue
            files.append(full)
            if fn == "SKILL.md":
                skill_dirs.add(dp)

    def add(rid, sev, rel, line, snip, title):
        findings.append({"rule": rid, "sev": sev, "file": rel, "line": line,
                         "snippet": snip[:160], "ctx": ctx_of(rel), "title": title})

    for full in files:
        rel = os.path.relpath(full, root)
        ext = os.path.splitext(full)[1].lower()
        base = os.path.basename(full)
        is_skill = base == "SKILL.md"
        try:
            if os.path.getsize(full) > MAX_BYTES:
                continue
            with open(full, "rb") as fh:
                raw = fh.read()
        except OSError:
            continue
        if b"\x00" in raw[:4096]:
            continue  # binary
        text = raw.decode("utf-8", "replace")
        if ext in {".js", ".mjs", ".cjs"} and max((len(l) for l in text.splitlines()), default=0) > 5000:
            continue  # minified bundle: skip (noted as FP source)
        lines = text.splitlines()
        for r in R:
            if not scope_ok(r["scope"], ext, is_skill):
                continue
            for i, ln in enumerate(lines, 1):
                if r["re"].search(ln):
                    add(r["id"], r["sev"], rel, i, ln.strip(), r["title"])

        # ATL-IN-001 npm lifecycle scripts
        if base == "package.json":
            try:
                pj = json.loads(text)
            except ValueError:
                pj = {}
            scripts = pj.get("scripts") or {}
            for k in ("preinstall", "install", "postinstall", "prepare"):
                if isinstance(scripts, dict) and k in scripts:
                    sev = "info" if k == "prepare" else "high"
                    add("ATL-IN-001", sev, rel, 0, f"{k}: {scripts[k]}", "npm install-time lifecycle script")
            # ATL-DP-001 unpinned / non-registry deps
            for sect in (() if pj.get("workspaces") else ("dependencies", "optionalDependencies")):
                for name, ver in (pj.get(sect) or {}).items():
                    if not isinstance(ver, str):
                        continue
                    if ver.strip() in ("*", "latest", "") or re.match(r"^(git\+|git:|github:|https?:)", ver) or re.match(r"^[\w.-]+/[\w.-]+(#.*)?$", ver):
                        add("ATL-DP-001", "medium", rel, 0, f"{name}: {ver}", "Unpinned / non-registry dependency")
        # ATL-IN-002 setup.py custom install commands or network/exec at install
        if base == "setup.py":
            if re.search(r"cmdclass\s*=|\bclass\s+\w+\((install|develop|egg_info)\)", text):
                add("ATL-IN-002", "high", rel, 0, "custom cmdclass", "setup.py custom install command")
            if re.search(r"urllib|requests\.|socket\.|subprocess|os\.system", text):
                add("ATL-IN-002", "high", rel, 0, "network/exec in setup.py", "setup.py network/exec at install time")

    # ATL-SK-002 executable scripts bundled next to a SKILL.md
    for sd in skill_dirs:
        for dp, dns, fns in os.walk(sd):
            dns[:] = [d for d in dns if d not in SKIP_DIRS]
            for fn in fns:
                if os.path.splitext(fn)[1].lower() in SCRIPT_EXT:
                    rel = os.path.relpath(os.path.join(dp, fn), root)
                    add("ATL-SK-002", "info", rel, 0, fn, "Executable script bundled with skill")

    # ATL-PL-001 Claude Code plugin hooks running shell commands
    for full in files:
        if os.path.basename(full) == "hooks.json" or full.endswith(os.path.join(".claude", "settings.json")):
            try:
                with open(full, encoding="utf-8", errors="replace") as fh:
                    t = fh.read()
            except OSError:
                continue
            if '"command"' in t:
                add("ATL-PL-001", "low", os.path.relpath(full, root), 0, "hooks with command", "Plugin/settings hook executes shell command")

    return findings, len(files), len(skill_dirs)


def main():
    args = sys.argv[1:]
    out_json = None
    max_ex = 3
    if "--json" in args:
        i = args.index("--json"); out_json = args[i + 1]; del args[i:i + 2]
    if "--max-examples" in args:
        i = args.index("--max-examples"); max_ex = int(args[i + 1]); del args[i:i + 2]
    report = {}
    total = Counter()
    total_src = Counter()
    for root in args:
        f, nfiles, nskills = scan_repo(root)
        name = os.path.basename(os.path.normpath(root))
        by_rule = Counter(x["rule"] for x in f)
        by_rule_src = Counter(x["rule"] for x in f if x["ctx"] == "src")
        total.update(by_rule); total_src.update(by_rule_src)
        ex = defaultdict(list)
        for x in f:
            if len(ex[x["rule"]]) < max_ex:
                ex[x["rule"]].append(f'{x["file"]}:{x["line"]} [{x["ctx"]}] {x["snippet"]}')
        report[name] = {"files": nfiles, "skills": nskills, "hits": dict(by_rule),
                        "hits_src_only": dict(by_rule_src), "examples": ex}
        print(f"\n== {name}  files={nfiles} skills={nskills} findings={len(f)} (src={sum(by_rule_src.values())})")
        for rid, n in sorted(by_rule.items()):
            print(f"  {rid:<11} {n:>5}  (src {by_rule_src.get(rid,0)})")
    print("\n== TOTAL (all ctx / src only)")
    for rid in sorted(total):
        print(f"  {rid:<11} {total[rid]:>5} / {total_src.get(rid,0)}")
    if out_json:
        with open(out_json, "w") as fh:
            json.dump(report, fh, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
