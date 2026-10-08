#!/usr/bin/env python3
"""Download the licence-checked Lingua Libre word recordings for internal evaluation.

data/eval-lingualibre-candidates.json lists 650 native(-ish) Japanese word recordings
from Wikimedia Commons (Category:Lingua Libre pronunciation-jpn), licence-filtered to
CC0 / CC BY / CC BY-SA. Audio is for evaluation only: keep it OUTSIDE the repo and do
not ship it.

Wikimedia rate-limits media downloads (HTTP 429, retry-after 600 s from a shared IP
in our sandbox). This script is deliberately slow and always honours retry-after.
Set a contact address in the User-Agent as Wikimedia's policy asks:

  WIKIMEDIA_CONTACT=you@example.com python3 scripts/fetch_lingualibre.py OUT_DIR [max]
  .venv/bin/python scripts/annotate_manifest.py OUT_DIR/manifest.json OUT_DIR/manifest-annot.json
  node scripts/eval-real.mjs OUT_DIR/manifest-annot.json --swiftf0 --csv OUT_DIR/results.csv

Before using results: check which speakers are native (not verified).
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DELAY = 5.0  # seconds between downloads


def main():
    out = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10**9
    contact = os.environ.get("WIKIMEDIA_CONTACT", "")
    ua = "P3PitchEval/0.2 (internal pitch-accent evaluation" + (f"; {contact}" if contact else "") + ")"
    cands = json.load(open(os.path.join(HERE, "..", "data", "eval-lingualibre-candidates.json"), encoding="utf-8"))
    os.makedirs(f"{out}/raw", exist_ok=True)
    os.makedirs(f"{out}/wav", exist_ok=True)
    mpath = f"{out}/manifest.json"
    manifest = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else []
    done = {m["source_url"] for m in manifest}
    for c in cands:
        if len(manifest) >= limit:
            break
        if c["source_url"] in done:
            continue
        url = c["download_url"]
        ext = os.path.splitext(urllib.parse.urlsplit(url).path)[1].lower() or ".wav"
        stem = f"{len(manifest):04d}"
        raw, wav = f"{out}/raw/{stem}{ext}", f"{out}/wav/{stem}.wav"
        while True:
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=60).read()
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503):
                    wait = int(e.headers.get("retry-after") or 60) + 5
                    print(f"HTTP {e.code}: waiting {wait}s", file=sys.stderr, flush=True)
                    time.sleep(wait)
                    continue
                raise
        open(raw, "wb").write(data)
        p = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", raw, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav])
        if p.returncode == 0:
            manifest.append(dict(file=wav, surface=c["surface"], speaker=c["speaker"], license=c["license"],
                                 author=c["author"], source_url=c["source_url"]))
            done.add(c["source_url"])
            json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(f"{len(manifest)} {c['surface']} ({c['speaker']}, {c['license']})", file=sys.stderr, flush=True)
        time.sleep(DELAY)


if __name__ == "__main__":
    main()
