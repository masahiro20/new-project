#!/usr/bin/env python3
"""Build the demo lexicon: word list (TSV) → UniDic accent type → JSON.

Input TSV (header: surface<TAB>reading<TAB>gloss) is our own word list.
Accent comes from UniDic, used under its BSD licence option (via the unidic-lite
package, UniDic 2.1.2), in up to three tiers; every entry records which one in
"source":

  "unidic"       UniDic has the word as one token with that reading: its aType
                 (downstep position, 0 = flat) is used as is.
  "unidic-rule"  UniDic splits the word into several short units (お+茶, 図書+館,
                 二+つ, …). The accent is computed from the parts' aType and
                 aConType with UniDic's own accent-combination tables (see
                 "Combination rules" below). "rule" shows the parts used.
  "tdmelodic"    Optional (--tdmelodic / --tdmelodic-tsv): words still unresolved
                 get the prediction of tdmelodic (BSD-3, PKSHA Technology).

Words resolved by none of these are dropped and listed on stderr.

Combination rules
-----------------
Source: "UniDic-MeCab 解説" manual (UniDic consortium, 2008), §6.5–6.7, table 10
(aConType of common nouns / suffixes, read from the *second* element) and table 11
(aConType of prefixes, read from the *prefix*). N1/M1 = mora count / accent of the
first element, N2/M2 = those of the second:

  C1 → N1 + M2    C2 → N1 + 1    C3 → N1    C4 → 0    C5 → M1
  P1 → 0 if M2 is 0 or N2, else N1 + M2
  P2 → N1 + 1 if M2 is 0 or N2, else N1 + M2
  P4 → N1 + 1 if M2 is 0 or N2, else M1
  P6 → 0      P13 → M1      P14 → M1 if M2 is 0 or N2, else N1 + M2

Licence note: the combination logic is ported from Open JTalk (modified BSD,
© 2008-2014 Nagoya Institute of Technology; full notice in data/OPENJTALK-BSD-LICENSE).
The same rules (C1–C5, P1/P2/P6/P14) are implemented in Open JTalk's
njd_set_accent_type.c (modified BSD, HTS Working Group / Nagoya Institute of
Technology), which applies them left to right over a chain of words; we do the same.
Like Open JTalk, an aConType of the form "名詞%F1,動詞%F2@0" is resolved by the
part of speech of the preceding element.

One phonological step is added on top: a downstep cannot sit on a special mora
(撥音 ん, 促音 っ, or the second half of a long vowel — taken from UniDic's pron
field, e.g. タンジョウ / タンジョー). If the rule lands on one, the downstep moves
one mora to the left (たんじょう|び → たんじょ|うび).

When a part has several aType values the result is computed for every combination;
the order is kept, so accent[0] comes from each part's preferred value.

tdmelodic (optional)
--------------------
chainer 7.8.1, which tdmelodic needs, does not import on Python ≥ 3.12 (numpy.distutils
was removed) or with numpy 2. Python 3.9 + numpy<2 works. Setup used for this repo:

  uv venv -p 3.9 /tmp/tdm
  uv pip install -p /tmp/tdm "setuptools<70" wheel
  uv pip install -p /tmp/tdm --no-build-isolation chainer==7.8.1
  uv pip install -p /tmp/tdm "tdmelodic @ git+https://github.com/PKSHATechnology-Research/tdmelodic" \
      unidic-lite "numpy<2"
  # tdmelodic looks UniDic 2.1.2 up as `mecab-config --dicdir`/unidic; unidic-lite *is*
  # UniDic 2.1.2, so point a stub mecab-config at it:
  mkdir -p /tmp/tdmbin /tmp/tdmdic
  ln -s "$(/tmp/tdm/bin/python -c 'import unidic_lite; print(unidic_lite.DICDIR)')" /tmp/tdmdic/unidic
  printf '#!/bin/sh\\necho /tmp/tdmdic\\n' > /tmp/tdmbin/mecab-config; chmod +x /tmp/tdmbin/mecab-config

Then either let this script call it (one batch through `tdmelodic-sy2a`):

  PATH=/tmp/tdmbin:$PATH .venv/bin/python scripts/build_lexicon.py IN.tsv OUT.json \
      --tdmelodic --tdmelodic-cmd /tmp/tdm/bin/tdmelodic-sy2a

or pre-generate a TSV elsewhere and pass it with --tdmelodic-tsv:

  awk -F'\\t' 'NR>1 {print $1","$2}' IN.tsv > /tmp/sy.csv
  PATH=/tmp/tdmbin:$PATH /tmp/tdm/bin/tdmelodic-sy2a < /tmp/sy.csv > /tmp/ya.txt
  paste <(tr ',' '\\t' < /tmp/sy.csv) /tmp/ya.txt > /tmp/tdmelodic.tsv
  .venv/bin/python scripts/build_lexicon.py IN.tsv OUT.json --tdmelodic-tsv /tmp/tdmelodic.tsv

The TSV has columns surface, reading, accent (no header); accent is either an
integer or tdmelodic's marked kana (オ[ミ]ヤゲ: "[" rise, "]" downstep after the mora).

Usage:
  python3 -m venv .venv && .venv/bin/pip install fugashi unidic-lite
  .venv/bin/python scripts/build_lexicon.py data/words-seed-200.tsv data/lexicon-200.json
  .venv/bin/python scripts/build_lexicon.py data/words-candidates-2000.tsv data/lexicon-2000.json --limit 2000
"""
import argparse
import csv
import json
import os
import shlex
import subprocess
import sys
from collections import Counter

SMALL = set("ゃゅょぁぃぅぇぉゎ")
SPECIAL = set("んっー")  # moras that cannot carry the downstep


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


def parse_atype(s) -> list[int] | None:
    if not s or s == "*":
        return None
    try:
        return [int(x) for x in s.split(",")]
    except ValueError:
        return None


def special_flags(kana: str, pron: str) -> list[bool]:
    """Per mora of `kana`: is it a special mora (ん, っ, long-vowel second half)?

    kana spells long vowels out (タンジョウ); pron marks them (タンジョー). Where the
    two have the same mora count, a ー in pron flags the matching kana mora.
    """
    km, pm = morae(kana), morae(pron or "")
    same = len(km) == len(pm)
    return [m in SPECIAL or (same and pm[i] in SPECIAL) for i, m in enumerate(km)]


def shift_off_special(k: int, flags: list[bool]) -> int:
    """Move a downstep that falls on a special mora (1-based k) one mora left."""
    while k > 1 and k <= len(flags) and flags[k - 1]:
        k -= 1
    return k


# --- UniDic accent-combination rules (manual tables 10 and 11) -------------

def con_rule(acon: str, prev_pos: str) -> str | None:
    """Pick the aConType code that applies after a word of part of speech `prev_pos`.

    Plain codes ("C3") apply everywhere; "名詞%F1,動詞%F2@0" picks the entry whose
    POS occurs in prev_pos (as Open JTalk's get_rule does). Returns e.g. "C3", or None.
    """
    if not acon or acon == "*":
        return None
    for item in acon.replace(" ", "").split(","):
        if "%" in item:
            pos, code = item.split("%", 1)
            if pos in prev_pos:
                return code
        elif item:
            return item
    return None


def combine_noun(code: str, n1: int, m1: int, m2: int | None) -> int | None:
    """Table 10: second element of a compound noun (common noun / suffix)."""
    if code == "C1":
        return None if m2 is None else n1 + m2
    if code == "C2":
        return n1 + 1
    if code == "C3":
        return n1
    if code == "C4":
        return 0
    if code == "C5":
        return m1
    return None


def combine_prefix(code: str, n1: int, m1: int | None, n2: int, m2: int) -> int | None:
    """Table 11: prefix (first element, carries the code) + word."""
    flat_or_odaka = m2 == 0 or m2 == n2
    if code == "P1":
        return 0 if flat_or_odaka else n1 + m2
    if code == "P2":
        return n1 + 1 if flat_or_odaka else n1 + m2
    if code == "P4":
        return n1 + 1 if flat_or_odaka else m1
    if code == "P6":
        return 0
    if code == "P13":
        return m1
    if code == "P14":
        return m1 if flat_or_odaka else n1 + m2
    return None


def _dedupe(xs):
    out = []
    for x in xs:
        if x is not None and x not in out:
            out.append(x)
    return out


def combine_parts(parts: list[dict]) -> tuple[list[int] | None, str]:
    """Combined accent of a multi-token noun.

    Each part: {surface, pos1, pos2, kana, pron, aType (list|None), aConType}.
    Shape: [prefix] (noun | na-adjective stem) (noun | noun-like suffix)*. Returns (accents, rule-string)
    or (None, reason).
    """
    i, prefix = 0, None
    if parts and parts[0]["pos1"] == "接頭辞":
        prefix, i = parts[0], 1
    if i >= len(parts):
        return None, "shape"
    head = parts[i]
    if head["pos1"] not in ("名詞", "形状詞") or head["pos2"] == "固有名詞" or not head["aType"]:
        return None, "shape"
    accs = list(head["aType"])
    n = len(morae(head["kana"]))
    trace = [f"{head['surface']}({','.join(map(str, head['aType']))})"]
    flags = special_flags(head["kana"], head["pron"])

    if prefix:
        code = con_rule(prefix["aConType"], head["pos1"])
        if not code or not code.startswith("P"):
            return None, f"prefix-rule:{prefix['aConType']}"
        np_ = len(morae(prefix["kana"]))
        m1s = prefix["aType"] or [None]
        accs = _dedupe(combine_prefix(code, np_, m1, n, m2) for m1 in m1s for m2 in accs)
        if not accs:
            return None, f"prefix-rule:{code}"
        n += np_
        flags = special_flags(prefix["kana"], prefix["pron"]) + flags
        trace.insert(0, f"{prefix['surface']}[{code}]")

    prev_pos = head["pos1"]
    for p in parts[i + 1:]:
        if not ((p["pos1"] == "名詞" and p["pos2"] != "固有名詞") or (p["pos1"] == "接尾辞" and p["pos2"] == "名詞的")):
            return None, f"shape:{p['pos1']}"
        code = con_rule(p["aConType"], prev_pos)
        if not code or not code.startswith("C"):
            return None, f"con-rule:{p['aConType']}"
        m2s = p["aType"] or [None]
        accs = _dedupe(combine_noun(code, n, m1, m2) for m1 in accs for m2 in m2s)
        if not accs:
            return None, f"con-rule:{code}"
        trace.append(f"{p['surface']}[{code}]")
        n += len(morae(p["kana"]))
        flags += special_flags(p["kana"], p["pron"])
        prev_pos = p["pos1"]

    accs = _dedupe(shift_off_special(k, flags) for k in accs)
    accs = [k for k in accs if 0 <= k <= n]
    return (accs or None), " + ".join(trace)


# --- lookup ----------------------------------------------------------------

def _part(node) -> dict:
    f = node.feature
    return {
        "surface": node.surface, "pos1": f.pos1, "pos2": f.pos2,
        "kana": f.kana or "", "pron": f.pron or "",
        "aType": parse_atype(f.aType), "aConType": f.aConType or "*",
    }


def lookup(tagger, surface: str, reading: str):
    """Return (accents, info, source). info = UniDic lemma, rule trace or failure reason."""
    want = hira(reading)
    parses = tagger.nbestToNodeList(surface, 20)
    for parse in parses:
        if len(parse) != 1:
            continue
        f = parse[0].feature
        if f.pos1 != "名詞" or f.pos2 == "固有名詞":
            continue
        if hira(f.kana or "") != want:
            continue
        if not f.aType or f.aType == "*":
            return None, "no-accent", None
        ks = parse_atype(f.aType)
        if ks is None:
            return None, f"bad-aType:{f.aType}", None
        return ks, f.lemma, "unidic"
    why = "not-found"
    for parse in parses:
        if len(parse) < 2:
            continue
        parts = [_part(n) for n in parse]
        kana = hira("".join(p["kana"] for p in parts))
        pron = hira("".join(p["pron"] for p in parts))
        if want not in (kana, pron):
            continue
        # Only the best-ranked segmentation with the right reading is used; deeper
        # n-best parses are mostly implausible splits (大+き+さ, 足+野+裏).
        ks, info = combine_parts(parts)
        if ks:
            return ks, info, "unidic-rule"
        return None, info, None
    return None, why, None


# --- tdmelodic ---------------------------------------------------------------

def parse_tdmelodic(marked: str) -> tuple[int, int] | None:
    """tdmelodic marked kana → (downstep, mora count). "]" after a mora = downstep."""
    marked = marked.strip()
    if not marked:
        return None
    plain = marked.replace("[", "").replace("]", "")
    n = len(morae(plain))
    k = 0
    if "]" in marked:
        k = len(morae(marked[: marked.index("]")].replace("[", "")))
    return k, n


def _tdmelodic_value(s: str, reading: str) -> int | None:
    s = s.strip()
    if s.lstrip("-").isdigit():
        return int(s)
    r = parse_tdmelodic(s)
    if r is None or r[1] != len(morae(reading)):
        return None
    return r[0]


def tdmelodic_predict(cmd: str, pairs: list[tuple[str, str]]) -> dict:
    """Run `tdmelodic-sy2a` once over (surface, reading) pairs."""
    pairs = [p for p in pairs if "," not in p[0] and "," not in p[1]]
    if not pairs:
        return {}
    inp = "".join(f"{s},{r}\n" for s, r in pairs)
    res = subprocess.run(shlex.split(cmd), input=inp, capture_output=True, text=True, env=os.environ)
    lines = [l for l in res.stdout.splitlines() if l.strip()]
    if res.returncode != 0 or len(lines) != len(pairs):
        sys.exit(f"tdmelodic failed (exit {res.returncode}, {len(lines)}/{len(pairs)} lines):\n{res.stderr[-2000:]}")
    out = {}
    for (s, r), line in zip(pairs, lines):
        k = _tdmelodic_value(line, r)
        if k is not None:
            out[(s, r)] = k
    return out


def tdmelodic_read_tsv(path: str) -> dict:
    out = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 3:
                continue
            s, r = cols[0].strip(), cols[1].strip()
            k = _tdmelodic_value(cols[2], r)
            if k is not None:
                out[(s, r)] = k
    return out


def needs_review(w: dict) -> str:
    """Entries we don't trust yet; held out of the shipped lexicon until a native check.

    - お/ご + noun: UniDic codes the prefix P2, which puts a drop after the 2nd mora,
      but many everyday お-words are flat (お茶, お金, お土産 …).
    - number + つ: C3 gives ふたつ 2 / みっつ 1, but the usual reading is 3.
    - tdmelodic predictions: weak on short words (cannot tell 花 from 鼻).
    """
    if w["source"] == "tdmelodic":
        return "tdmelodic-prediction"
    rule = w.get("rule", "")
    if w["source"] == "unidic-rule" and "[P" in rule.split(" + ")[0]:
        return "prefix-rule"
    if w["source"] == "unidic-rule" and rule.endswith("つ[C3]"):
        return "counter-tsu-rule"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--limit", type=int, default=0, help="stop after N accepted words")
    ap.add_argument("--tdmelodic", action="store_true", help="fill unresolved words with tdmelodic")
    ap.add_argument("--tdmelodic-cmd", default=os.environ.get("TDMELODIC_CMD", "tdmelodic-sy2a"),
                    help="tdmelodic-sy2a command (default: $TDMELODIC_CMD or tdmelodic-sy2a)")
    ap.add_argument("--tdmelodic-tsv", help="pre-generated tdmelodic TSV (surface, reading, accent)")
    ap.add_argument("--review-out", help="write held-back (unverified) entries to this TSV")
    ap.add_argument("--include-unverified", action="store_true",
                    help="keep entries whose accent rule is known to be unreliable (see needs_review)")
    args = ap.parse_args()

    import fugashi
    import unidic_lite

    tagger = fugashi.Tagger()
    unidic_version = open(unidic_lite.DICDIR + "/version").read().strip()

    rows, seen = [], set()
    with open(args.input, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            surface, reading, gloss = row["surface"].strip(), row["reading"].strip(), row["gloss"].strip()
            if (surface, reading) in seen:
                continue
            seen.add((surface, reading))
            ks, info, source = lookup(tagger, surface, reading)
            rows.append([surface, reading, gloss, ks, info, source])

    td = {}
    unresolved = [(r[0], r[1]) for r in rows if r[3] is None]
    if args.tdmelodic_tsv:
        td = tdmelodic_read_tsv(args.tdmelodic_tsv)
    elif args.tdmelodic:
        td = tdmelodic_predict(args.tdmelodic_cmd, unresolved)
    for r in rows:
        if r[3] is None and (r[0], r[1]) in td:
            r[3], r[4], r[5] = [td[(r[0], r[1])]], "tdmelodic", "tdmelodic"

    words, dropped, held = [], [], []
    for surface, reading, gloss, ks, info, source in rows:
        m = morae(reading)
        if ks is None:
            dropped.append((surface, reading, info))
            continue
        ks = [k for k in ks if 0 <= k <= len(m)]
        if not ks:
            dropped.append((surface, reading, "accent-out-of-range"))
            continue
        w = {
            "id": f"w{len(words) + 1:04d}",
            "surface": surface,
            "kana": reading,
            "morae": m,
            "accent": ks,
            "type": accent_type(ks[0], len(m)),
            "gloss": gloss,
            "source": source,
        }
        if source == "unidic-rule":
            w["rule"] = info
        why = needs_review(w)
        if why and not args.include_unverified:
            held.append((surface, reading, ",".join(map(str, ks)), source, w.get("rule", ""), why))
            continue
        words.append(w)
        if args.limit and len(words) >= args.limit:
            break

    sources = Counter(w["source"] for w in words)
    src = {
        "accent": f"UniDic {unidic_version} (unidic-lite), BSD licence option",
        "accent_rules": "multi-token words (source: unidic-rule): UniDic aType/aConType combined "
                        "with the UniDic manual's accent-combination tables (C1-C5, P1-P14)",
        "words_and_glosses": "P3 Pitch original word list",
    }
    if sources.get("tdmelodic"):
        src["accent_fallback"] = "tdmelodic (PKSHA Technology, BSD-3-Clause) predictions (source: tdmelodic)"
    out = {"source": src, "count": len(words), "words": words}
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    types = Counter(w["type"] for w in words)
    print(f"{len(words)} words → {args.output}  {dict(types)}", file=sys.stderr)
    print(f"sources: {dict(sources)}", file=sys.stderr)
    if held:
        print(f"held back for native review: {len(held)}", file=sys.stderr)
        if args.review_out:
            with open(args.review_out, "w", encoding="utf-8") as fh:
                fh.write("surface\treading\taccent\tsource\trule\treason\n")
                for h in held:
                    fh.write("\t".join(h) + "\n")
    if dropped:
        print(f"dropped {len(dropped)}:", file=sys.stderr)
        for d in dropped:
            print("  " + "\t".join(d), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
