# Source data: Battle for Wesnoth (Japanese .po)

- Repository: https://github.com/wesnoth/wesnoth
- Commit (HEAD at fetch time, 2026-10-09, via `git ls-remote https://github.com/wesnoth/wesnoth HEAD`): `9ec35a2f4cbaf036dedf9e96272a03387d7bc03a`
- License: GPL-2.0-or-later. `COPYING` at that commit is the GNU GPL v2 text; the repo's `copyright` file says "or at your option any later version". The text is used here for local QA evaluation only. It is not redistributed: no source/target text goes into labels.csv or misses.csv, and fp-patterns.md quotes only short excerpts.

| File | Raw URL | Entries (non-header, non-obsolete) | fuzzy | empty msgstr | plural | sha256 |
|---|---|---|---|---|---|---|
| `po/wesnoth-httt/ja.po` (Heir to the Throne, dialogue) | https://raw.githubusercontent.com/wesnoth/wesnoth/9ec35a2f4cbaf036dedf9e96272a03387d7bc03a/po/wesnoth-httt/ja.po | 1230 | 5 | 5 | 2 | `f7f147f550dbf21be52420b0278929754b0bb280cc5032a40961682f79469ec6` |
| `po/wesnoth-lib/ja.po` (UI / terrain / help strings) | https://raw.githubusercontent.com/wesnoth/wesnoth/9ec35a2f4cbaf036dedf9e96272a03387d7bc03a/po/wesnoth-lib/ja.po | 1691 | 98 | 94 | 9 | `f9f12d7aca068e56812008815fc376ba240c31b50c9d482b62d8c00ddebdee5b` |

Kotomark's own row counts match: 1230 and 1691. Header: `Language: ja`, `Plural-Forms: nplurals=1`. Last translator: RatArmy (Transifex wesnoth-jp). Both requested files existed, so no substitutes were needed.

Note on the translation style: this JA translation keeps proper names in Latin script ("Konrad", "Delfador 師匠", "Kalenz 様", "Li'sar", "Weldyn"). That drives several of the findings.

## Re-fetch and re-run

```bash
SHA=9ec35a2f4cbaf036dedf9e96272a03387d7bc03a; D=/tmp/claude-0/eval/wesnoth
mkdir -p $D/httt $D/lib
curl -sSfL -o $D/httt/ja.po https://raw.githubusercontent.com/wesnoth/wesnoth/$SHA/po/wesnoth-httt/ja.po
curl -sSfL -o $D/lib/ja.po  https://raw.githubusercontent.com/wesnoth/wesnoth/$SHA/po/wesnoth-lib/ja.po
curl -sSfL -o $D/COPYING    https://raw.githubusercontent.com/wesnoth/wesnoth/$SHA/COPYING
cd skillforge
for f in httt lib; do
  npx tsx src/cli/index.ts check $D/$f/ja.po --format json --no-glossary > $D/$f.A.json            # config A
  npx tsx src/cli/index.ts draft $D/$f/ja.po --out $D/$f.draft.json
  npx tsx src/cli/index.ts check $D/$f/ja.po --format json --glossary $D/$f.draft.json > $D/$f.B.json  # config B
done
npx tsx src/cli/index.ts check $D/httt/ja.po --format json --glossary eval/wesnoth/httt.hand-glossary.json > $D/httt.C.json  # config C
```

Engine state: skillforge working tree as of 2026-10-09 (uncommitted src/ unchanged by this evaluation).

## Configs

- **A**: `--no-glossary`.
- **B**: auto-drafted glossary (`draft`; httt: 34 terms / 0 characters, lib: 100 terms / 0 characters), used unedited.
- **C** (httt only): `httt.hand-glossary.json` lists 5 characters (Konrad, Li'sar, Delfador, Kalenz, Asheviere). The `ja` value is the Latin spelling the translation actually uses. It also gives Delfador the first-person pronoun わし and sets `honorificPolicy: localize`.

## Labeling conventions

- Every finding was labeled, because every config had 80 or fewer findings (max 72), so no sampling seed was needed.
- `id` column: the first 10 hex characters of the sha1 of Kotomark's finding `id` (PO msgid), so the CSV holds no source text. In misses.csv it is the sha1 of the msgid.
- `file_line` is the line of the `msgid`/`msgctxt` (Kotomark's line).
- Miss sample: `random.Random(20261009).sample(range(len(entries)), 60)` over the parsed non-header, non-obsolete entries in file order. Rows tagged `[targeted]` in misses.csv come from a separate scan for Latin tokens that appear in a target but in no source. They are not part of the random sample.
