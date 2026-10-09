# Luanti (formerly Minetest) — Japanese UI/settings translation

| | |
|---|---|
| Repo | https://github.com/luanti-org/luanti |
| Commit (HEAD via `git ls-remote`, 2026-10-09) | `9a1b92d0d4d2c47fced18e6077722c6301eb04f5` |
| File | `po/ja/luanti.po` (there is no `po/ja/minetest.po` at this commit) |
| URL | https://raw.githubusercontent.com/luanti-org/luanti/9a1b92d0d4d2c47fced18e6077722c6301eb04f5/po/ja/luanti.po |
| sha256 | `703673567e880d9515158c9a7f9f8e06f8ab02cb11c22df0b14c63fa14af5b8d` |
| Translation platform | Weblate (hosted.weblate.org/projects/minetest/minetest/ja), PO-Revision-Date 2026-08-13 |
| License | The PO header has no license line. `LICENSE.txt` says the source code is LGPL-2.1-or-later and README shows an LGPLv2.1+ badge. The `po/` files are part of the source tree, so they are treated as LGPL-2.1-or-later. (Media assets in the repo are CC BY-SA 3.0/4.0, which does not apply here.) |
| Entries | 1575 msgid entries, header excluded (the engine also reports 1575 rows). 0 plural, 0 fuzzy, 0 untranslated. Direction EN→JA. |

Local copies, not committed: `/tmp/claude-0/eval/luanti/` holds `luanti.po`, `A.json`, `B.json`, `draft.json` and the stderr logs.

## Configurations
- **A**: `npx tsx src/cli/index.ts check luanti.po --format json --no-glossary --fail-on never`. 15 findings (13 notation.katakana, 2 tag.mismatch).
- **B**: `draft luanti.po --out draft.json` (34 terms), then `check luanti.po --format json --glossary draft.json`. 32 findings (A's findings plus 17 term.missing).

## Labeling
- Both configs had 80 findings or fewer, so every finding was labeled.
- `labels.csv` `id` = `<config>#<index into findings[]>` in the raw JSON. No source or target text is stored.
- Precision = TP / (TP + FP). Unsure findings are left out of the denominator. `summary.json` also gives `precisionUnsureAsFp`.

## Misses
- 60 entries drawn with `random.Random(7).sample(entries, 60)` in Python, over the parsed non-header entries in file order.
- Each was checked by hand against the whole file for term/notation drift, names, placeholders/tags and untranslated text.
- An independent placeholder scan (`$N`, `%s/%d`, `@N`) and tag scan of the whole file found no real mismatches.
- One drift outside the sample was also seen: トライリニアフィルタリング ×2 / トリリニアフィルタリング ×3. It is not in `misses.csv` because it is not part of the sample.
