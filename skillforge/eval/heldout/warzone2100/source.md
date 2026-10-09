# データ出典：Warzone 2100（日本語 .po）

- リポジトリ：https://github.com/Warzone2100/warzone2100
- コミット（2026-10-09 取得時の HEAD）：`d7ce18df8d998c968915a5e6410a68626927813e`
- ファイル：`po/ja_JP.po`（ゲーム本体・キャンペーン台詞・UI）
  - Raw URL：https://raw.githubusercontent.com/Warzone2100/warzone2100/d7ce18df8d998c968915a5e6410a68626927813e/po/ja_JP.po
  - サイズ：347,668 バイト、sha256 `496d6c9c6ffda6b469ccc9586c1ff43651c06cf88496c1e5db98e83e3b284284`
  - Kotomark が読んだ行数：3,947（うち訳文が空 552、`fuzzy` 0）。Crowdin 管理（PO-Revision-Date 2026-04-04）。
- ライセンス：GPL-2.0（リポジトリの `COPYING` は GNU GPL v2 の本文）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout/warzone2100/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout; mkdir -p $D/warzone2100
curl -sSfL -o $D/warzone2100/ja_JP.po https://raw.githubusercontent.com/Warzone2100/warzone2100/d7ce18df8d998c968915a5e6410a68626927813e/po/ja_JP.po
npx tsx src/cli/index.ts check $D/warzone2100/ja_JP.po --format json --fail-on never --no-glossary > $D/warzone2100.A.json
npx tsx src/cli/index.ts labels $D/warzone2100/ja_JP.po --no-glossary --out $D/warzone2100.labels.csv
```
