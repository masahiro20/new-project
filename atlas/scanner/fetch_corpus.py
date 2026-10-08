#!/usr/bin/env python3
"""Shallow-clone a corpus of public repos for read-only scanning -- stdlib only.

Usage:
    python3 -I fetch_corpus.py corpus.json <dest_dir> [--jobs 8]

corpus.json: [{"repo": "https://github.com/o/r", ...}, ...]

Safety: depth-1 single-branch clone, LFS smudge off, hooks path disabled, no
submodules. Nothing is built, installed, imported or executed.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.symlinks=false",
       "-c", "protocol.file.allow=never"]


def dest_name(url):
    parts = url.rstrip("/").split("/")
    return f"{parts[-2]}__{parts[-1]}".removesuffix(".git")


def clone(url, dest):
    if os.path.isdir(os.path.join(dest, ".git")):
        return url, "cached"
    env = dict(os.environ, GIT_LFS_SKIP_SMUDGE="1", GIT_TERMINAL_PROMPT="0")
    r = subprocess.run(GIT + ["clone", "--quiet", "--depth", "1", "--single-branch",
                              "--no-recurse-submodules", url, dest],
                       env=env, capture_output=True, text=True, timeout=300)
    return url, "ok" if r.returncode == 0 else "fail: " + r.stderr.strip()[-200:]


def main():
    args = sys.argv[1:]
    jobs = 8
    if "--jobs" in args:
        i = args.index("--jobs"); jobs = int(args[i + 1]); del args[i:i + 2]
    corpus = json.load(open(args[0]))
    out = args[1]
    os.makedirs(out, exist_ok=True)
    with ThreadPoolExecutor(jobs) as ex:
        futs = [ex.submit(clone, c["repo"], os.path.join(out, dest_name(c["repo"]))) for c in corpus]
        for f in futs:
            url, status = f.result()
            print(f"{status:<8} {url}", flush=True)


if __name__ == "__main__":
    main()
