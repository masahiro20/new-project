# Godot Engine — editor UI Japanese translation

| | |
|---|---|
| Repo | https://github.com/godotengine/godot |
| Commit (HEAD via `git ls-remote`, 2026-10-09) | `65e8d16951d6963cb3984c090e45f40d1ba5f704` |
| File | `editor/translations/editor/ja.po` |
| URL | https://raw.githubusercontent.com/godotengine/godot/65e8d16951d6963cb3984c090e45f40d1ba5f704/editor/translations/editor/ja.po |
| sha256 | `2d6303791bf8cc533a1c747d12ca7624e8b0e2341c48d96cc3767a3ffa516b75` |
| Translation platform | Weblate (Godot Engine project) |
| License | MIT. The PO header says "distributed under the same license as the Godot source code", and `LICENSE.txt` at this commit is MIT (Godot Engine contributors). |
| Entries | 5689 msgid entries, header excluded (the engine also reports 5689 rows). 22 have plurals (`nplurals=1`). 0 fuzzy, 0 untranslated. Direction EN→JA. |

Local copies, not committed: `/tmp/claude-0/eval/godot-editor/` holds `ja.po`, `A.json`, `B.json`, `draft.json` and the stderr logs.

## Configurations
- **A**: `check ja.po --format json --no-glossary --fail-on never`. 99 findings (78 notation.katakana, 17 placeholder.mismatch, 4 tag.mismatch).
- **B**: `draft ja.po --out draft.json` (100 terms), then `check ja.po --format json --glossary draft.json`. 229 findings (A's findings plus 130 term.missing).

## Labeling
- Both configs had more than 80 findings, so each was sampled with `random.Random(42).sample(range(n), 80)` in Python over indices into the `findings` array, then sorted.
- `labels.csv` `id` = `<config>#<index>`. No source or target text is stored.
- Precision = TP / (TP + FP). Unsure findings are left out of the denominator.
- The rules were also checked over the full A set, not just the sample:
  - All 17 placeholder.mismatch findings and all 4 tag.mismatch findings are FP.
  - All 78 katakana findings are real drifts.
  - An independent scan of the whole file for `%s/%d/%f`, `{name}` and BBCode found no real placeholder or tag mismatches.

## Misses
- 60 entries drawn with `random.Random(7).sample(entries, 60)` and reviewed by hand against the whole file.
- Whole-file counts used as evidence:
  - Remove → 除去 ×51 / 削除 ×44.
  - Trailing `...` ×150 / `…` ×31.
  - Curve → 曲線 ×16 / カーブ ×6. The sampled entry uses the majority form, so it is not counted as a miss.
