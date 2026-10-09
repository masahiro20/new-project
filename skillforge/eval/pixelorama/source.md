# Source: Pixelorama Japanese translation

- Repo: https://github.com/Orama-Interactive/Pixelorama
- Commit: `e205f47699f424244a7ddc738bac2e0ca42769c1` (HEAD from `git ls-remote` on 2026-10-09)
- File: `Translations/ja_JP.po` (EN→JA gettext PO, Crowdin export)
- License: MIT. Checked against `LICENSE` at that commit: "MIT License, Copyright (c) 2019-present Orama Interactive and contributors".
- Size: 139,711 bytes; 1,163 entries (2 have an empty msgstr; no plural forms)
- `id` in labels.csv/misses.csv is the msgid that Kotomark uses as the row id. It is cut to 40 characters.

Re-fetch and re-run (from `skillforge/`):

```bash
SHA=e205f47699f424244a7ddc738bac2e0ca42769c1; D=/tmp/claude-0/eval/pixelorama; mkdir -p $D
curl -sSfL -o $D/ja_JP.po https://raw.githubusercontent.com/Orama-Interactive/Pixelorama/$SHA/Translations/ja_JP.po
npx tsx src/cli/index.ts check $D/ja_JP.po --format json --no-glossary --fail-on never > $D/A.json
npx tsx src/cli/index.ts draft $D/ja_JP.po --out $D/draft.json
npx tsx src/cli/index.ts check $D/ja_JP.po --format json --glossary $D/draft.json --fail-on never > $D/B.json
```

Raw outputs (A.json, B.json, draft.json) are in /tmp/claude-0/eval/pixelorama/. They are not committed.
Labeling: every finding was labeled (A=4, B=31, both ≤80). Miss sample: `random.Random(20261009).sample(entries, 60)` over the parsed entries, judged against the config B findings.
