# データ出典：SuperTux（日本語 .po。SuperTuxKart ではない）

- リポジトリ：https://github.com/SuperTux/supertux
- コミット（2026-10-09 取得時の HEAD）：`b3e5c976565142626876a2e2f4190c8c573452cf`
- ファイル：`data/locale/ja.po`
  - Raw URL：https://raw.githubusercontent.com/SuperTux/supertux/b3e5c976565142626876a2e2f4190c8c573452cf/data/locale/ja.po
  - サイズ：149,919 バイト、sha256 `41b27f1d686d55b2dc7587f44018d931898fd6c0b10310ff4235bf5b8a7353ce`
  - Kotomark が読んだ行数：1,248（うち訳文が空 262、`fuzzy` 0）。Transifex 管理。
- ライセンス：GPL-3.0（リポジトリの `LICENSE.txt` は GNU GPL v3 の本文）。ja.po のヘッダーに「This file is distributed under the same license as the SuperTux package.」とある。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout/supertux/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout; mkdir -p $D/supertux
curl -sSfL -o $D/supertux/ja.po https://raw.githubusercontent.com/SuperTux/supertux/b3e5c976565142626876a2e2f4190c8c573452cf/data/locale/ja.po
npx tsx src/cli/index.ts check $D/supertux/ja.po --format json --fail-on never --no-glossary > $D/supertux.A.json
npx tsx src/cli/index.ts labels $D/supertux/ja.po --no-glossary --out $D/supertux.labels.csv
```
