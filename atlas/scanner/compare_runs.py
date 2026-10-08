#!/usr/bin/env python3
"""Compare scanner runs on the same corpus and emit Markdown tables.

Usage:
    python3 -I compare_runs.py v0_summary.json v1_noast_findings.jsonl v1_findings.jsonl v1_summary.json > out.md
"""
import json
import sys
from collections import Counter, defaultdict

SEV = ("critical", "high", "medium", "low", "info")


def load_jsonl(p):
    return [json.loads(l) for l in open(p)]


def main():
    v0 = json.load(open(sys.argv[1]))
    noast = load_jsonl(sys.argv[2])
    v1 = load_jsonl(sys.argv[3])
    v1s = json.load(open(sys.argv[4]))

    v0_all, v0_src = Counter(), Counter()
    for r in v0.values():
        v0_all.update(r["hits"]); v0_src.update(r["hits_src_only"])
    na_all = Counter(f["rule"] for f in noast)
    na_src = Counter(f["rule"] for f in noast if f["ctx"] in ("src", "skill"))
    live = [f for f in v1 if not f.get("suppressed")]
    v1_all = Counter(f["rule"] for f in live)
    v1_src = Counter(f["rule"] for f in live if f["ctx"] in ("src", "skill"))
    v1_hs = Counter(f["rule"] for f in live if f["ctx"] in ("src", "skill") and f["sev"] in ("high", "critical"))
    sup = Counter(f["rule"] for f in v1 if f.get("suppressed"))
    why = Counter(f.get("why") for f in v1 if f.get("suppressed"))
    ast_new = Counter(f["rule"] for f in live if f.get("method") == "ast")

    print("| Rule | v0 all | v0 src | v1 regex-only all | v1 all | v1 src+skill | v1 src+skill high/crit | suppressed | new via AST |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    rules = sorted(set(v0_all) | set(na_all) | set(v1_all) | set(sup))
    T = Counter()
    for r in rules:
        row = [v0_all[r], v0_src[r], na_all[r], v1_all[r], v1_src[r], v1_hs[r], sup[r], ast_new[r]]
        T.update(dict(enumerate(row)))
        print(f"| {r} | " + " | ".join(str(x) for x in row) + " |")
    print("| **Total** | " + " | ".join(f"**{T[i]}**" for i in range(8)) + " |")
    print()
    print("Suppression reasons:")
    print()
    print("| Reason | Count |")
    print("|---|---:|")
    for k, n in why.most_common():
        print(f"| {k} | {n} |")
    print()
    sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
    import trust
    grades = Counter(trust.grade(s["trust"]["security"]) for s in v1s.values())
    print("Security-component score bucketed with the A-F thresholds (provenance/maintenance not collected in this run):")
    print()
    print("| Grade | Repos |")
    print("|---|---:|")
    for g in "ABCDF":
        print(f"| {g} | {grades[g]} |")
    print()
    stats = Counter()
    for s in v1s.values():
        stats.update(s.get("stats", {}))
    files = sum(s["files"] for s in v1s.values())
    print(f"Files: {files}. AST parsed: {stats['ast_parsed']}, parse failed: {stats['ast_failed']}, "
          f"minified skipped: {stats['skipped_minified']}.")


if __name__ == "__main__":
    main()
