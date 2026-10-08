#!/usr/bin/env python3
"""Atlas Allowlist Builder CLI (prototype, stdlib only).

    python3 -I atlas_allowlist.py evaluate <config.json | skills-dir | skills.json>
            [--index atlas/data/index.json] [--osv] [--fetch] [--policy policy.json] [--json report.json]
    python3 -I atlas_allowlist.py build <report.json> (--approve a,b | --approve-recommended)
            [--reason a="why"]... [--allow-deny] [--out-dir out] [--by NAME]

`evaluate` never installs or runs anything. `--osv` queries api.osv.dev only.
`--fetch` (implies --osv) downloads the published npm/PyPI archive as data,
shallow-clones the declared repo (hooks off) at the version tag, compares the
two (DP-004) and scans both. `build` writes allowlists only for the approved
items; approving an item not recommended 'approve' needs --reason NAME="text".
Formats checked 2026-10-08 against https://code.claude.com/docs/en/managed-mcp
and https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "scanner")))
sys.path.insert(0, HERE)

import allowlist_core as core  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(prog="atlas_allowlist")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("evaluate", help="evaluate an MCP config or skill list")
    e.add_argument("input")
    e.add_argument("--index", default=core.DEFAULT_INDEX)
    e.add_argument("--fetch", action="store_true",
                   help="download published package + shallow-clone repo, DP-004 compare, OSV (network reads only)")
    e.add_argument("--osv", action="store_true", help="query OSV for the package and (with --fetch) its direct deps")
    e.add_argument("--policy", help="org policy JSON, e.g. {\"high_in_skill_or_launch\": \"deny\"}")
    e.add_argument("--json", dest="json_out")
    b = sub.add_parser("build", help="generate allowlists from approved items")
    b.add_argument("report")
    g = b.add_mutually_exclusive_group(required=True)
    g.add_argument("--approve", help="comma-separated item names")
    g.add_argument("--approve-recommended", action="store_true")
    b.add_argument("--out-dir", default="allowlist-out")
    b.add_argument("--allow-deny", action="store_true",
                   help="allow approving items Atlas recommends to deny (logged as override; needs --reason)")
    b.add_argument("--reason", action="append", default=[], metavar='NAME="text"',
                   help="reason for an override approval (any item not recommended 'approve'); repeatable")
    b.add_argument("--by", help="approver name for decisions.md (default: $USER)")
    a = ap.parse_args(argv)

    if a.cmd == "evaluate":
        try:
            rep = core.evaluate(a.input, index_path=a.index, fetch=a.fetch, osv=a.osv, policy=a.policy)
        except (ValueError, OSError) as ex:
            print(f"error: {ex}", file=sys.stderr)
            return 2
        print(core.format_table(rep))
        if a.json_out:
            with open(a.json_out, "w", encoding="utf-8") as fh:
                json.dump(rep, fh, indent=1, ensure_ascii=False)
            print(f"\nreport: {a.json_out}")
        return 0

    with open(a.report, encoding="utf-8") as fh:
        rep = json.load(fh)
    names = [n.strip() for n in (a.approve or "").split(",") if n.strip()]
    reasons = {}
    for r in a.reason:
        if "=" not in r:
            print(f'error: --reason must be NAME="text": {r!r}', file=sys.stderr)
            return 2
        k, v = r.split("=", 1)
        reasons[k.strip()] = v.strip()
    try:
        files = core.build_outputs(rep, approve=names, approve_recommended=a.approve_recommended, by=a.by,
                                   allow_deny=a.allow_deny, reasons=reasons)
    except ValueError as ex:
        print(f"error: {ex}", file=sys.stderr)
        return 2
    for p in core.write_outputs(files, a.out_dir):
        print("wrote", p)
    overrides = [i["name"] for i in rep["items"] if i["name"] in names and i["recommendation"] != "approve"]
    if overrides:
        print("note: override approval (reason logged in decisions.md / decisions.json): " + ", ".join(overrides))
    return 0


if __name__ == "__main__":
    sys.exit(main())
