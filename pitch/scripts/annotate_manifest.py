#!/usr/bin/env python3
"""Add reading + UniDic accent to an evaluation manifest.

manifest.json: [{"file": ..., "surface": ...}, ...]  →  adds "kana", "accent"
(list of downstep positions) for entries that are a single UniDic noun token.
Entries that already have kana+accent are kept; others are dropped and counted.
Usage: .venv/bin/python scripts/annotate_manifest.py in.json out.json
"""
import json
import sys

import fugashi


def hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    tagger = fugashi.Tagger()
    items = json.load(open(src, encoding="utf-8"))
    out, dropped = [], 0
    for it in items:
        if it.get("kana") and it.get("accent") is not None:
            out.append(it)
            continue
        toks = tagger(it["surface"])
        f = toks[0].feature if len(toks) == 1 else None
        if not f or f.pos1 != "名詞" or f.pos2 == "固有名詞" or not f.aType or f.aType == "*":
            dropped += 1
            continue
        try:
            it["accent"] = [int(x) for x in f.aType.split(",")]
        except ValueError:
            dropped += 1
            continue
        it["kana"] = hira(f.kana)
        out.append(it)
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(out)} annotated, {dropped} dropped → {dst}", file=sys.stderr)


if __name__ == "__main__":
    main()
