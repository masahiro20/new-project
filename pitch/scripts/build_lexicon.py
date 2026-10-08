#!/usr/bin/env python3
"""Build the demo lexicon: word list (TSV) → UniDic accent type → JSON.

Input TSV (header: surface<TAB>reading<TAB>gloss) is our own word list.
Accent (aType = downstep position, 0 = flat) comes from UniDic, used under its
BSD licence option (via the unidic-lite package, UniDic 2.1.2). Words that
UniDic does not know, or knows only with a different reading, are dropped and
listed in the report so they can be fixed by hand or with tdmelodic (BSD-3).

Usage:
  python3 -m venv .venv && .venv/bin/pip install fugashi unidic-lite
  .venv/bin/python scripts/build_lexicon.py data/words-seed-200.tsv data/lexicon-200.json
  .venv/bin/python scripts/build_lexicon.py data/words-candidates-2000.tsv data/lexicon-2000.json --limit 2000
"""
import argparse
import csv
import json
import sys
from collections import Counter

import fugashi
import unidic_lite

SMALL = set("ゃゅょぁぃぅぇぉゎ")


def hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def morae(kana: str) -> list[str]:
    out: list[str] = []
    for c in hira(kana):
        if c in SMALL and out:
            out[-1] += c
        else:
            out.append(c)
    return out


def accent_type(k: int, n: int) -> str:
    return "heiban" if k == 0 else "atamadaka" if k == 1 else "odaka" if k == n else "nakadaka"


def lookup(tagger, surface: str, reading: str):
    """Return (aType list, unidic lemma) for a single-token noun reading `reading`."""
    want = hira(reading)
    for parse in tagger.nbestToNodeList(surface, 10):
        if len(parse) != 1:
            continue
        f = parse[0].feature
        if f.pos1 != "名詞" or f.pos2 == "固有名詞":
            continue
        if hira(f.kana or "") != want:
            continue
        if not f.aType or f.aType == "*":
            return None, "no-accent"
        try:
            ks = [int(x) for x in f.aType.split(",")]
        except ValueError:
            return None, f"bad-aType:{f.aType}"
        return ks, f.lemma
    return None, "not-found"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--limit", type=int, default=0, help="stop after N accepted words")
    args = ap.parse_args()

    tagger = fugashi.Tagger()
    unidic_version = open(unidic_lite.DICDIR + "/version").read().strip()

    words, dropped, seen = [], [], set()
    with open(args.input, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            surface, reading, gloss = row["surface"].strip(), row["reading"].strip(), row["gloss"].strip()
            if (surface, reading) in seen:
                continue
            seen.add((surface, reading))
            ks, info = lookup(tagger, surface, reading)
            m = morae(reading)
            if ks is None:
                dropped.append((surface, reading, info))
                continue
            ks = [k for k in ks if 0 <= k <= len(m)]
            if not ks:
                dropped.append((surface, reading, "accent-out-of-range"))
                continue
            words.append({
                "id": f"w{len(words) + 1:04d}",
                "surface": surface,
                "kana": reading,
                "morae": m,
                "accent": ks,
                "type": accent_type(ks[0], len(m)),
                "gloss": gloss,
            })
            if args.limit and len(words) >= args.limit:
                break

    out = {
        "source": {
            "accent": f"UniDic {unidic_version} (unidic-lite), BSD licence option",
            "words_and_glosses": "P3 Pitch original word list",
        },
        "count": len(words),
        "words": words,
    }
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    types = Counter(w["type"] for w in words)
    print(f"{len(words)} words → {args.output}  {dict(types)}", file=sys.stderr)
    if dropped:
        print(f"dropped {len(dropped)}:", file=sys.stderr)
        for d in dropped:
            print("  " + "\t".join(d), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
