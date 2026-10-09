#!/usr/bin/env python3
"""Measure scanner precision/recall against hand labels -- stdlib only.

Scope: live (non-suppressed) findings with ctx in {src, skill} and sev in {high, critical},
the same population hand-classified in atlas/reports/stage2-scan-100.md section 3.

Usage:
  # measure an existing run
  python3 -I measure_fp.py --findings findings.jsonl --labels atlas/reports/stage3-labels.json \
      [--out-md out.md] [--out-json out.json]

  # scan the pinned corpus with a scanner dir, then measure (also runs the fixture recall check)
  python3 -I measure_fp.py --scanner <scanner_dir> --corpus <corpus_dir> --workdir <out_dir> \
      --labels atlas/reports/stage3-labels.json [--fixtures atlas/scanner/tests/fixtures]

  # measure an existing run and also run the fixture check with a scanner dir
  python3 -I measure_fp.py --findings findings.jsonl --scanner <scanner_dir> --labels ...

  # draw a fixed-seed sample of suppressed findings for spot-checking misses
  python3 -I measure_fp.py --findings findings.jsonl --sample-suppressed 45 --seed 20261009 --sample-out s.json

Label keys: (repo, rule, file, line, sha1(snippet)[:12]). Matching tiers, in order:
  exact -> same (repo, rule, file, snippet) at another line -> same (repo, rule, file, line)
  with a different snippet. A labelled finding that matches nothing in scope is reported as
  "disappeared", with what happened to it (suppressed / downgraded / ctx changed / gone).
The scanner under test is only run as `python3 -I -B <scanner_dir>/scan.py`; nothing from the
scanned corpus is executed.
"""
import hashlib
import json
import os
import random
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SCOPE_CTX = ("src", "skill")
SCOPE_SEV = ("high", "critical")
LABELS = ("attack", "legit", "fp")


def snip_hash(s):
    return hashlib.sha1((s or "").encode("utf-8")).hexdigest()[:12]


def key(f):
    return (f["repo"], f["rule"], f["file"], int(f.get("line") or 0), snip_hash(f.get("snippet")))


def in_scope(f):
    return not f.get("suppressed") and f.get("ctx") in SCOPE_CTX and f.get("sev") in SCOPE_SEV


def load_findings(p):
    with open(p, encoding="utf-8") as fh:
        return [json.loads(ln) for ln in fh if ln.strip()]


def match(labels, findings):
    """Return (matched: list[(label_entry, finding, tier)], unmatched_labels, new_findings)."""
    scope = [f for f in findings if in_scope(f)]
    used = set()
    by_exact, by_snip, by_line = {}, {}, {}
    for i, f in enumerate(scope):
        k = key(f)
        by_exact.setdefault(k, []).append(i)
        by_snip.setdefault((k[0], k[1], k[2], k[4]), []).append(i)
        by_line.setdefault(k[:4], []).append(i)
    matched, missing = [], []

    def take(idx_list):
        for i in idx_list or ():
            if i not in used:
                used.add(i)
                return i
        return None

    for tier, index, kf in (("exact", by_exact, lambda k: k),
                            ("moved-line", by_snip, lambda k: (k[0], k[1], k[2], k[4])),
                            ("changed-snippet", by_line, lambda k: k[:4])):
        rest = []
        for e in (labels if tier == "exact" else missing):
            k = (e["repo"], e["rule"], e["file"], int(e["line"]), e["snippet_sha1"])
            i = take(index.get(kf(k)))
            if i is None:
                rest.append(e)
            else:
                matched.append((e, scope[i], tier))
        missing = rest
    new = [scope[i] for i in range(len(scope)) if i not in used]
    return matched, missing, new


def fate(e, findings):
    """What happened to a labelled finding that is no longer in scope."""
    same = [f for f in findings if f["repo"] == e["repo"] and f["rule"] == e["rule"] and f["file"] == e["file"]]
    # same line first; otherwise same snippet elsewhere, but only out-of-scope ones (identical in-scope
    # snippets at other lines belong to other labels)
    cands = [f for f in same if int(f.get("line") or 0) == int(e["line"])] or \
            [f for f in same if snip_hash(f.get("snippet")) == e["snippet_sha1"] and not in_scope(f)]
    if not cands:
        return "gone (no finding of this rule at this place)"
    f = cands[0]
    if f.get("suppressed"):
        return "suppressed: " + str(f.get("why") or f.get("suppressed"))
    if f.get("sev") not in SCOPE_SEV:
        return f"downgraded to {f.get('sev')}" + (f" ({f['why']})" if f.get("why") else "")
    if f.get("ctx") not in SCOPE_CTX:
        return f"ctx changed to {f.get('ctx')}"
    return "present but unmatched (duplicate?)"


def measure(findings, labels_doc):
    labels = labels_doc["labels"]
    matched, missing, new = match(labels, findings)
    kept = Counter(e["label"] for e, _, _ in matched)
    base = Counter(e["label"] for e in labels)
    total = len(matched) + len(new)
    fp = kept["fp"]
    tp_base = base["attack"] + base["legit"]
    tp_kept = kept["attack"] + kept["legit"]
    res = {
        "scope": "live findings, ctx in src/skill, sev in high/critical",
        "total_in_scope": total,
        "labelled_in_scope": dict((lb, kept[lb]) for lb in LABELS),
        "unlabelled_new": len(new),
        "fp_rate_labelled_only": round(fp / total, 4) if total else 0.0,
        "fp_rate_note": "fp / total_in_scope; unlabelled new hits are counted in the denominator only. "
                        "Upper bound if every new hit were fp: see fp_rate_upper_bound.",
        "fp_rate_upper_bound": round((fp + len(new)) / total, 4) if total else 0.0,
        "recall": {
            "attack": f"{kept['attack']}/{base['attack']}",
            "legit": f"{kept['legit']}/{base['legit']}",
            "attack_plus_legit": f"{tp_kept}/{tp_base}",
            "attack_plus_legit_ratio": round(tp_kept / tp_base, 4) if tp_base else 1.0,
        },
        "baseline": {lb: base[lb] for lb in LABELS},
        "match_tiers": dict(Counter(t for _, _, t in matched)),
        "new_unlabelled": [{"repo": f["repo"], "rule": f["rule"], "sev": f["sev"], "ctx": f["ctx"], "file": f["file"],
                            "line": f.get("line"), "snippet": f.get("snippet"), "snippet_sha1": snip_hash(f.get("snippet")),
                            "why": f.get("why")} for f in new],
        "disappeared": [{"label": e["label"], "repo": e["repo"], "rule": e["rule"], "file": e["file"], "line": e["line"],
                         "snippet": e["snippet"], "fate": fate(e, findings)} for e in missing],
    }
    return res


def fixture_check(scanner, fixtures, expect):
    """Run scanner on fixture dirs; check required live (file, rule) pairs and negative controls."""
    out = {"required": [], "negatives": [], "ok": True}
    cache = {}

    def run(fx):
        if fx not in cache:
            r = subprocess.run([sys.executable, "-I", "-B", "-c",
                                "import json,sys;sys.path.insert(0,sys.argv[1]);import scan;"
                                "f,_,_=scan.scan_repo(sys.argv[2]);print(json.dumps(f))",
                                scanner, os.path.join(fixtures, fx)], capture_output=True, text=True, timeout=600)
            if r.returncode != 0:
                raise SystemExit(f"scanner failed on fixture {fx}: {r.stderr[-800:]}")
            cache[fx] = json.loads(r.stdout.strip().splitlines()[-1])
        return cache[fx]
    for req in expect.get("required", []):
        f = run(req["fixture"])
        hit = any(not x.get("suppressed") and x["file"] == req["file"] and x["rule"] == req["rule"]
                  and (not req.get("min_sev") or x["sev"] in SCOPE_SEV) for x in f)
        out["required"].append(dict(req, detected=hit))
        out["ok"] &= hit
    for fx in expect.get("negative_fixtures", []):
        bad = [f"{x['file']}:{x['line']} {x['rule']} {x['sev']}" for x in run(fx)
               if not x.get("suppressed") and x["sev"] in SCOPE_SEV]
        out["negatives"].append({"fixture": fx, "high_or_critical_live": bad, "ok": not bad})
        out["ok"] &= not bad
    det = sum(r["detected"] for r in out["required"])
    out["recall"] = f"{det}/{len(out['required'])}"
    return out


def to_md(res, fx=None, title="Atlas FP measurement"):
    L = [f"# {title}", "", f"Scope: {res['scope']}.", "",
         "| Metric | Value |", "|---|---:|",
         f"| In scope (total) | {res['total_in_scope']} |"]
    for lb in LABELS:
        L.append(f"| labelled {lb} (baseline {res['baseline'][lb]}) | {res['labelled_in_scope'][lb]} |")
    L += [f"| new, unlabelled | {res['unlabelled_new']} |",
          f"| **FP rate** (labelled fp / total) | **{res['fp_rate_labelled_only']:.1%}** |",
          f"| FP rate upper bound (if all new hits are fp) | {res['fp_rate_upper_bound']:.1%} |",
          f"| Recall attack | {res['recall']['attack']} |",
          f"| Recall legit | {res['recall']['legit']} |",
          f"| Recall attack+legit | {res['recall']['attack_plus_legit']} |", ""]
    if fx:
        L += [f"Fixture positive-control recall: **{fx['recall']}**; negatives ok: "
              f"{all(n['ok'] for n in fx['negatives'])}; overall ok: **{fx['ok']}**", ""]
        miss = [r for r in fx["required"] if not r["detected"]]
        for r in miss:
            L.append(f"- MISSED fixture positive: {r['fixture']}/{r['file']} {r['rule']}")
        for n in fx["negatives"]:
            for b in n["high_or_critical_live"]:
                L.append(f"- negative fixture {n['fixture']} has live high/critical: {b}")
        L.append("")
    L += ["## Labelled findings that disappeared", ""]
    if res["disappeared"]:
        L += ["| label | repo | rule | file:line | fate |", "|---|---|---|---|---|"]
        for d in sorted(res["disappeared"], key=lambda d: LABELS.index(d["label"])):
            L.append(f"| {d['label']} | {d['repo']} | {d['rule']} | {d['file']}:{d['line']} | {d['fate']} |")
    else:
        L.append("None.")
    L += ["", "## New unlabelled hits (label these by hand)", ""]
    if res["new_unlabelled"]:
        L += ["| repo | rule | sev | file:line | snippet |", "|---|---|---|---|---|"]
        for n in res["new_unlabelled"]:
            s = (n["snippet"] or "")[:90].replace("|", "\\|").replace("\n", " ")
            L.append(f"| {n['repo']} | {n['rule']} | {n['sev']} | {n['file']}:{n['line']} | `{s}` |")
    else:
        L.append("None.")
    return "\n".join(L) + "\n"


def sample_suppressed(findings, n, seed):
    # "duplicate of AST finding" is skipped: the same code is still reported by the AST finding,
    # so it cannot be a miss.
    sup = sorted((f for f in findings if f.get("suppressed") and not str(f.get("why", "")).startswith("duplicate")),
                 key=lambda f: key(f))
    pick = random.Random(seed).sample(sup, min(n, len(sup)))
    return [{"repo": f["repo"], "rule": f["rule"], "sev": f["sev"], "ctx": f["ctx"], "file": f["file"],
             "line": f.get("line"), "snippet": f.get("snippet"), "snippet_sha1": snip_hash(f.get("snippet")),
             "suppression_reason": f.get("why"), "spot_check": None, "note": ""} for f in pick]


def opt(args, name, default=None):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


def main():
    args = sys.argv[1:]
    findings_p = opt(args, "--findings")
    labels_p = opt(args, "--labels")
    scanner = opt(args, "--scanner")
    corpus = opt(args, "--corpus")
    workdir = opt(args, "--workdir")
    fixtures = opt(args, "--fixtures", os.path.join(HERE, "tests", "fixtures"))
    out_md = opt(args, "--out-md")
    out_json = opt(args, "--out-json")
    n_sample = opt(args, "--sample-suppressed")
    seed = int(opt(args, "--seed", "20261009"))
    sample_out = opt(args, "--sample-out")
    if args:
        raise SystemExit(f"unknown args: {args}\n{__doc__}")

    if scanner:
        scanner = os.path.abspath(scanner)
    if scanner and not findings_p:
        if not (corpus and workdir):
            raise SystemExit("--scanner needs --corpus and --workdir (or --findings to skip the scan)")
        os.makedirs(workdir, exist_ok=True)
        findings_p = os.path.join(workdir, "findings.jsonl")
        roots = sorted(os.path.join(corpus, d) for d in os.listdir(corpus) if os.path.isdir(os.path.join(corpus, d)))
        r = subprocess.run([sys.executable, "-I", "-B", os.path.join(scanner, "scan.py"), *roots, "--quiet",
                            "--json", os.path.join(workdir, "summary.json"), "--findings", findings_p],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"scan failed: {r.stderr[-2000:]}")
        out_md = out_md or os.path.join(workdir, "measure.md")
        out_json = out_json or os.path.join(workdir, "measure.json")
    if not findings_p:
        raise SystemExit(__doc__)
    findings = load_findings(findings_p)

    if n_sample:
        s = sample_suppressed(findings, int(n_sample), seed)
        doc = {"seed": seed, "n": len(s), "from": os.path.basename(findings_p),
               "population": sum(1 for f in findings if f.get("suppressed")
                                 and not str(f.get("why", "")).startswith("duplicate")),
               "population_note": "suppressed findings excluding 'duplicate of AST finding'",
               "how_to_fill": "spot_check: 'ok' (suppression correct) | 'miss' (should have been reported); note: one line",
               "items": s}
        with open(sample_out or "suppressed-sample.json", "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1, ensure_ascii=False)
        print(f"sampled {len(s)} of {doc['population']} suppressed non-duplicate findings (seed {seed})")
        if not labels_p:
            return

    labels_doc = json.load(open(labels_p, encoding="utf-8"))
    res = measure(findings, labels_doc)
    fx = None
    if scanner:
        fx = fixture_check(scanner, fixtures, labels_doc.get("fixture_expectations", {}))
        res["fixtures"] = fx
    md = to_md(res, fx)
    if out_md:
        open(out_md, "w", encoding="utf-8").write(md)
    if out_json:
        with open(out_json, "w", encoding="utf-8") as fh:
            json.dump(res, fh, indent=1, ensure_ascii=False)
    print(md)


if __name__ == "__main__":
    main()
