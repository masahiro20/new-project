#!/usr/bin/env python3
"""atlas-scan: command-line front end for the Atlas static scanner (scan.py). READ-ONLY.

Nothing in the scanned tree is executed, imported, installed or built, and nothing is
sent over the network: files are read as text, and the optional JS/TS helper only calls
the TypeScript parser (ts.createSourceFile) on file contents.

    python3 -I cli.py <path> [<path> ...] [--format text|json] [--json FILE]
                      [--findings FILE] [--min-severity LEVEL] [--show-suppressed]
                      [--no-ast] [--quiet] [--version]

Exit codes: 0 = no high/critical pattern in src/skill code, 1 = high/critical pattern
detected in src/skill code, 2 = usage or runtime error.

Wording rule (see trust.py): output says "pattern detected"; it never calls code
malware or malicious.

The packaged npm CLI (atlas/cli) runs this file via bin/atlas-scan.js; `scan.py`'s own
usage is unchanged.
"""
import argparse
import json
import os
import sys
import unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scan  # noqa: E402
import trust as trust_mod  # noqa: E402

__version__ = "0.1.0"
PROG = "atlas-scan"
SEVERITIES = ["critical", "high", "medium", "low", "info"]
SEV_RANK = {s: i for i, s in enumerate(reversed(SEVERITIES))}  # info=0 .. critical=4
FAIL_SEVS = ("high", "critical")
FAIL_CTX = ("src", "skill")
CTX_ORDER = {"skill": 0, "src": 1, "docs": 2, "ci": 3, "example": 4, "test": 5}
FOOTER = "Static analysis only — nothing was executed. Findings are patterns, not a verdict of intent."
EXIT_OK, EXIT_FINDINGS, EXIT_ERROR = 0, 1, 2
SNIPPET_MAX = 140


class UsageError(Exception):
    pass


def version_string():
    v = os.environ.get("ATLAS_CLI_VERSION") or __version__
    py = ".".join(str(x) for x in sys.version_info[:3])
    return f"{PROG} {v} (Atlas static scanner v1; Python {py})"


def build_parser():
    p = argparse.ArgumentParser(
        prog=PROG,
        description="Static, read-only pattern scan of MCP servers, skills and plugins. "
                    "Nothing in the scanned tree is executed, installed or imported, and nothing is sent "
                    "over the network.",
        epilog="Exit codes: 0 = no high/critical pattern in src/skill code; 1 = high/critical pattern "
               "detected in src/skill code (independent of --min-severity); 2 = usage or runtime error. "
               + FOOTER,
    )
    p.add_argument("paths", nargs="*", metavar="PATH", help="directory to scan (one or more)")
    p.add_argument("--format", choices=("text", "json"), default="text",
                   help="stdout format (default: text)")
    p.add_argument("--json", metavar="FILE", dest="json_out",
                   help="also write the JSON report to FILE")
    p.add_argument("--findings", metavar="FILE",
                   help="write every finding (including suppressed ones) as JSON Lines to FILE")
    p.add_argument("--min-severity", choices=list(reversed(SEVERITIES)), default="info",
                   help="hide findings below this severity in the text/JSON report (default: info). "
                        "Does not change the exit code or --findings")
    p.add_argument("--show-suppressed", action="store_true",
                   help="also list candidates the context layer suppressed, with the reason")
    p.add_argument("--no-ast", action="store_true",
                   help="regex tier only (skip the Python/JS/TS AST context layer)")
    p.add_argument("--quiet", "-q", action="store_true",
                   help="text format: one summary line per target, no finding details")
    p.add_argument("--version", action="version", version=version_string())
    return p


# ---------------------------------------------------------------------------
def clean(s, limit=SNIPPET_MAX):
    """Make scanned text safe to print: escape control/format chars (ANSI escapes, bidi
    overrides, zero-width chars) so a scanned file cannot drive the terminal."""
    out = []
    for ch in str(s):
        if ch == "\t":
            out.append(" ")
        elif unicodedata.category(ch)[0] == "C":
            out.append(f"\\u{ord(ch):04x}" if ord(ch) <= 0xFFFF else f"\\U{ord(ch):08x}")
        else:
            out.append(ch)
    s = "".join(out).strip()
    return s if len(s) <= limit else s[:limit - 1] + "…"


def is_fail(f):
    return not f.get("suppressed") and f.get("sev") in FAIL_SEVS and f.get("ctx") in FAIL_CTX


def sort_key(f):
    return (-SEV_RANK.get(f.get("sev"), 0), CTX_ORDER.get(f.get("ctx"), 9), f.get("file", ""),
            f.get("line") or 0, f.get("rule", ""))


def scan_target(path, use_ast):
    f, nfiles, nskills, stats = scan.scan_repo_ex(path, use_ast=use_ast)
    live = [x for x in f if not x.get("suppressed")]
    t = trust_mod.trust(f)
    return {
        "path": path,
        "files": nfiles,
        "skills": nskills,
        "trust": t,
        "counts": {s: sum(1 for x in live if x["sev"] == s) for s in SEVERITIES},
        "counts_src_skill": {s: sum(1 for x in live if x["sev"] == s and x["ctx"] in FAIL_CTX)
                             for s in SEVERITIES},
        "suppressed": sum(1 for x in f if x.get("suppressed")),
        "hits": dict(Counter(x["rule"] for x in live)),
        "stats": stats,
        "high_or_critical_src_skill": sum(1 for x in f if is_fail(x)),
        "_all": f,
    }


def visible(findings, min_sev, show_suppressed):
    floor = SEV_RANK[min_sev]
    return sorted((x for x in findings
                   if SEV_RANK.get(x.get("sev"), 0) >= floor and (show_suppressed or not x.get("suppressed"))),
                  key=sort_key)


# ---------------------------------------------------------------------------
class Style:
    def __init__(self, enabled):
        self.on = enabled

    def _w(self, code, s):
        return f"\x1b[{code}m{s}\x1b[0m" if self.on else s

    def sev(self, sev, s):
        return self._w({"critical": "1;31", "high": "31", "medium": "33", "low": "36", "info": "2"}.get(sev, "0"), s)

    def bold(self, s):
        return self._w("1", s)

    def dim(self, s):
        return self._w("2", s)


def render_text(results, args, out):
    st = Style(out.isatty() and not os.environ.get("NO_COLOR") and os.environ.get("TERM") != "dumb")
    w = out.write
    for r in results:
        t = r["trust"]
        c = r["counts"]
        live_total = sum(c.values())
        counts = ", ".join(f"{c[s]} {s}" for s in SEVERITIES if c[s]) or "none"
        if args.quiet:
            w(f"{r['path']}: grade {t['grade']} ({t['trust']}/100), findings: {counts}; "
              f"high/critical in src/skill: {r['high_or_critical_src_skill']}\n")
            continue
        w("\n" + st.bold(f"== {r['path']}") + "\n")
        w(f"   Grade {st.bold(t['grade'])}  trust {t['trust']}/100  "
          f"(security {t['security']}, provenance {t['provenance']} [not assessed in a local scan], "
          f"maintenance {t['maintenance']} [neutral])\n")
        w(f"   Files {r['files']}, skills {r['skills']}; findings {live_total} ({counts}); "
          f"suppressed {r['suppressed']}\n")
        for cap in t["caps"]:
            w(f"   Cap: {cap['reason']}\n")
        if t["badges"]:
            w(f"   Capabilities: {', '.join(t['badges'])}\n")
        shown = visible(r["_all"], args.min_severity, args.show_suppressed)
        if not shown:
            note = "No findings" if not live_total else f"No findings at or above {args.min_severity}"
            w(f"\n   {note}.\n")
        groups = [(sev.upper(), sev, [x for x in shown if x["sev"] == sev and not x.get("suppressed")])
                  for sev in SEVERITIES]
        groups.append(("SUPPRESSED (not counted; kept for audit)", "info",
                       [x for x in shown if x.get("suppressed")]))
        for label, color, group in groups:
            if not group:
                continue
            w("\n   " + st.sev(color, f"{label} ({len(group)})") + "\n")
            for x in group:
                loc = f"{x['file']}:{x['line']}" if x.get("line") else x["file"]
                ctx = x.get("ctx", "-") + (f" / {x['loc']}" if x.get("loc") else "")
                sup = x.get("suppressed")
                tag = f" {x['sev']}" if sup else ""
                w(f"     {st.sev(x['sev'], x['rule'])}{tag}  {clean(loc, 200)}  [{ctx}]\n")
                w(f"         {'candidate' if sup else 'pattern detected'}: {clean(x.get('title', ''))}\n")
                if x.get("snippet"):
                    w(f"         > {clean(x['snippet'])}\n")
                if x.get("why"):
                    w(f"         why: {clean(x['why'])}\n")
        n = r["high_or_critical_src_skill"]
        w("\n   Result: " + (st.sev("high", f"high/critical pattern detected in src/skill ({n})") if n
                             else "no high/critical pattern in src/skill") + "\n")
    w("\n" + FOOTER + "\n")


def report_json(results, args, exit_code):
    targets = []
    for r in results:
        d = {k: v for k, v in r.items() if not k.startswith("_")}
        d["findings"] = visible(r["_all"], args.min_severity, args.show_suppressed)
        targets.append(d)
    return {
        "tool": PROG,
        "version": os.environ.get("ATLAS_CLI_VERSION") or __version__,
        "filters": {"min_severity": args.min_severity, "show_suppressed": args.show_suppressed,
                    "ast": not args.no_ast},
        "targets": targets,
        "exit_code": exit_code,
        "note": FOOTER,
    }


def run(argv):
    args = build_parser().parse_args(argv)
    if not args.paths:
        raise UsageError("no PATH given (try: atlas-scan ./my-server, or --help)")
    paths = []
    for p in args.paths:
        if not os.path.exists(p):
            raise UsageError(f"path not found: {p}")
        if not os.path.isdir(p):
            raise UsageError(f"not a directory: {p} (pass the directory that contains it)")
        paths.append(os.path.normpath(p))
    results = [scan_target(p, use_ast=not args.no_ast) for p in paths]
    exit_code = EXIT_FINDINGS if any(r["high_or_critical_src_skill"] for r in results) else EXIT_OK

    if args.findings:
        with open(args.findings, "w", encoding="utf-8") as fh:
            for r in results:
                for x in r["_all"]:
                    fh.write(json.dumps(dict(x, target=r["path"]), ensure_ascii=False) + "\n")
    rep = None
    if args.json_out or args.format == "json":
        rep = report_json(results, args, exit_code)
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(rep, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
    if args.format == "json":
        sys.stdout.write(json.dumps(rep, indent=1, ensure_ascii=False) + "\n")
    else:
        render_text(results, args, sys.stdout)
    return exit_code


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):  # never crash on a narrow console encoding
        try:
            stream.reconfigure(errors="backslashreplace")
        except (AttributeError, ValueError):
            pass
    try:
        return run(sys.argv[1:] if argv is None else argv)
    except UsageError as e:
        print(f"{PROG}: error: {e}", file=sys.stderr)
        return EXIT_ERROR
    except SystemExit as e:  # argparse: --help/--version exit 0, bad usage exits 2
        return e.code if isinstance(e.code, int) else EXIT_ERROR
    except KeyboardInterrupt:
        return EXIT_ERROR
    except Exception as e:  # runtime error: never mistaken for "clean" (0) or "findings" (1)
        print(f"{PROG}: error: {type(e).__name__}: {e}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
