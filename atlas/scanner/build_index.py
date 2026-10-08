#!/usr/bin/env python3
"""Build atlas/data/index.json (read by the Allowlist Builder) from a scan run.

Usage:
    python3 -I build_index.py corpus.json findings.jsonl summary.json commits.json out.json [corpus_dir]

Only live (non-suppressed) findings are stored; suppressed counts are kept as numbers
so the evidence trail stays auditable without bloating the index.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

SKIP = {".git", "node_modules", "dist", "build", ".venv", "venv", "vendor", "target"}


def package_dirs(clone, packages, max_depth=4):
    """Map 'npm:name'/'pypi:name' to the subdirectory that declares it (monorepos). Reads manifests as text."""
    want = {p.split(":", 1)[1].lower(): p for p in packages if p.startswith(("npm:", "pypi:"))}
    out = {}
    if not want or not os.path.isdir(clone):
        return out
    for dp, dns, fns in os.walk(clone):
        depth = os.path.relpath(dp, clone).count(os.sep)
        dns[:] = [d for d in dns if d not in SKIP and not d.startswith(".")] if depth < max_depth else []
        name = None
        if "package.json" in fns:
            try:
                name = json.load(open(os.path.join(dp, "package.json"), encoding="utf-8")).get("name")
            except (ValueError, OSError, AttributeError):
                name = None
        if not name and "pyproject.toml" in fns:
            try:
                m = re.search(r'(?m)^name\s*=\s*["\']([^"\']+)', open(os.path.join(dp, "pyproject.toml"), encoding="utf-8").read())
                name = m.group(1) if m else None
            except OSError:
                name = None
        if name and str(name).lower() in want:
            rel = os.path.relpath(dp, clone)
            if rel != ".":
                out[want[str(name).lower()]] = rel.replace(os.sep, "/")
    return out


def main():
    corpus_p, findings_p, summary_p, commits_p, out_p = sys.argv[1:6]
    corpus_dir = sys.argv[6] if len(sys.argv) > 6 else None
    corpus = json.load(open(corpus_p))["repos"]
    summary = json.load(open(summary_p))
    commits = json.load(open(commits_p))
    live = defaultdict(list)
    sup = defaultdict(Counter)
    for ln in open(findings_p):
        f = json.loads(ln)
        repo = f.pop("repo")
        if f.get("suppressed"):
            sup[repo][f["rule"]] += 1
        else:
            live[repo].append(f)
    entries = []
    for c in corpus:
        o, r = c["repo"].rstrip("/").split("/")[-2:]
        key = f"{o}__{r}"
        if key not in summary:
            continue
        entries.append({
            "repo": c["repo"],
            "packages": c.get("packages", []),
            "registry_name": c.get("name"),
            "commit": commits.get(key),
            "files": summary[key]["files"],
            "findings": live[key],
            "suppressed_counts": dict(sup[key]),
            "trust_security_only": summary[key]["trust"],
            "package_paths": package_dirs(os.path.join(corpus_dir, key), c.get("packages", [])) if corpus_dir else {},
        })
    json.dump({"generated": "2026-10-08", "scanner": "atlas-scan v1 (regex + AST)",
               "note": "Static scan of shallow clones; nothing executed. Verdict wording: pattern detected.",
               "entries": entries}, open(out_p, "w"), ensure_ascii=False, indent=1)
    print("entries:", len(entries))


if __name__ == "__main__":
    main()
