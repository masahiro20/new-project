#!/usr/bin/env python3
"""Atlas Allowlist Builder CLI (prototype, stdlib only).

    python3 -I atlas_allowlist.py evaluate <config.json | skills-dir | skills.json>
            [--index atlas/data/index.json] [--fetch] [--json report.json]
    python3 -I atlas_allowlist.py build <report.json> (--approve a,b | --approve-recommended)
            [--out-dir out] [--by NAME]

`evaluate` never installs or runs anything. `--fetch` downloads npm/PyPI JSON
metadata and shallow-clones the source repo (hooks off) for the read-only
regex scanner. `build` writes allowlists only for the approved items.
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
    e.add_argument("--fetch", action="store_true", help="resolve registry metadata and shallow-clone sources (network)")
    e.add_argument("--json", dest="json_out")
    b = sub.add_parser("build", help="generate allowlists from approved items")
    b.add_argument("report")
    g = b.add_mutually_exclusive_group(required=True)
    g.add_argument("--approve", help="comma-separated item names")
    g.add_argument("--approve-recommended", action="store_true")
    b.add_argument("--out-dir", default="allowlist-out")
    b.add_argument("--allow-deny", action="store_true",
                   help="allow approving items Atlas recommends to deny (logged as override)")
    b.add_argument("--by", help="approver name for decisions.md (default: $USER)")
    a = ap.parse_args(argv)

    if a.cmd == "evaluate":
        try:
            rep = core.evaluate(a.input, index_path=a.index, fetch=a.fetch)
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
    try:
        files = core.build_outputs(rep, approve=names, approve_recommended=a.approve_recommended, by=a.by,
                                   allow_deny=a.allow_deny)
    except ValueError as ex:
        print(f"error: {ex}", file=sys.stderr)
        return 2
    for p in core.write_outputs(files, a.out_dir):
        print("wrote", p)
    overrides = [i["name"] for i in rep["items"] if i["name"] in names and i["recommendation"] == "deny"]
    if overrides:
        print("note: approved despite 'deny' recommendation (logged in decisions.md): " + ", ".join(overrides))
    return 0


if __name__ == "__main__":
    sys.exit(main())
