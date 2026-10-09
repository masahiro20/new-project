# Source: SuperTuxKart Japanese translation

- Repo: https://github.com/supertuxkart/stk-code
- Commit: `5e7a54420a2748ae5a5e743555dd00ddf513302d` (HEAD from `git ls-remote` on 2026-10-09)
- File: `data/po/ja.po` (EN→JA gettext PO, Transifex export)
- License: GPL-3.0-or-later. The PO header says "distributed under the same license as the supertuxkart package". `COPYING` at that commit says the code is GPL v3 "or (at your option) any later version". It also says data files use mixed licenses listed in per-directory `licenses.txt`; for `.po` files the PO header's "same license as the package" applies.
- Size: 252,276 bytes; 1,255 entries (Kotomark rows; 160 have an empty msgstr, 9 have plural forms with nplurals=1)
- `id` in labels.csv/misses.csv is the msgid that Kotomark uses as the row id. It is cut to 40 characters.

Re-fetch and re-run (from `skillforge/`):

```bash
SHA=5e7a54420a2748ae5a5e743555dd00ddf513302d; D=/tmp/claude-0/eval/stk; mkdir -p $D
curl -sSfL -o $D/ja.po https://raw.githubusercontent.com/supertuxkart/stk-code/$SHA/data/po/ja.po
npx tsx src/cli/index.ts check $D/ja.po --format json --no-glossary --fail-on never > $D/A.json
npx tsx src/cli/index.ts draft $D/ja.po --out $D/draft.json
npx tsx src/cli/index.ts check $D/ja.po --format json --glossary $D/draft.json --fail-on never > $D/B.json
```

Raw outputs (A.json, B.json, draft.json) are in /tmp/claude-0/eval/stk/. They are not committed.
Labeling: every finding was labeled (A=4, B=18, both ≤80). Miss sample: `random.Random(20261009).sample(entries, 60)` over the parsed entries, judged against the config B findings.
