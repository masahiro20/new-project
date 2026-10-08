#!/usr/bin/env python3
"""Build atlas/data/index.json (read by the Allowlist Builder) from a scan run.

Usage:
    python3 -I build_index.py corpus.json findings.jsonl summary.json commits.json out.json

Only live (non-suppressed) findings are stored; suppressed counts are kept as numbers
so the evidence trail stays auditable without bloating the index.
"""
import json
import sys
from collections import Counter, defaultdict


def main():
    corpus_p, findings_p, summary_p, commits_p, out_p = sys.argv[1:6]
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
        })
    json.dump({"generated": "2026-10-08", "scanner": "atlas-scan v1 (regex + AST)",
               "note": "Static scan of shallow clones; nothing executed. Verdict wording: pattern detected.",
               "entries": entries}, open(out_p, "w"), ensure_ascii=False, indent=1)
    print("entries:", len(entries))


if __name__ == "__main__":
    main()
