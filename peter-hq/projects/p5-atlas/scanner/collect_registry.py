#!/usr/bin/env python3
"""Fetch the official MCP Registry (latest version of every server) -- stdlib only.

Usage:
    python3 -I collect_registry.py out.json [--since 2026-10-07T00:00:00Z]

Full crawl (2026-10-08): 408 pages x 100 = 40,700 servers, ~25 min sequential
(server is slow on deep cursors; occasional HTTP 500 / read timeouts -> retry).
Incremental: pass --since (RFC3339); note updated_since implies include_deleted=true
and returns all versions touched, not only latest.
"""
import json
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://registry.modelcontextprotocol.io/v0/servers"


def crawl(since=None):
    cur, out = None, []
    while True:
        q = {"limit": "100"}
        if since:
            q["updated_since"] = since
        else:
            q["version"] = "latest"
        if cur:
            q["cursor"] = cur
        url = BASE + "?" + urllib.parse.urlencode(q)
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "atlas-collector/0.1 (research)"})
                d = json.load(urllib.request.urlopen(req, timeout=90))
                break
            except Exception as e:  # noqa: BLE001
                print("retry", attempt, e, file=sys.stderr)
                time.sleep(2 ** attempt)
        else:
            raise SystemExit("giving up at cursor %r" % cur)
        out += d.get("servers", [])
        print(len(out), file=sys.stderr, flush=True)
        cur = d.get("metadata", {}).get("nextCursor")
        if not cur or not d.get("servers"):
            return out
        time.sleep(0.2)  # be polite


if __name__ == "__main__":
    args = sys.argv[1:]
    since = None
    if "--since" in args:
        i = args.index("--since"); since = args[i + 1]; del args[i:i + 2]
    data = crawl(since)
    with open(args[0], "w") as fh:
        json.dump(data, fh)
    print("servers:", len(data))
