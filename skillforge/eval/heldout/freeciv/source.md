# データ出典：Freeciv（日本語 .po）

- リポジトリ：https://github.com/freeciv/freeciv
- コミット（2026-10-09 取得時の HEAD）：`380d482bd39f56fff2644c23eceab6b543f2d8c3`
- ファイル：`translations/core/ja.po`
  - Raw URL：https://raw.githubusercontent.com/freeciv/freeciv/380d482bd39f56fff2644c23eceab6b543f2d8c3/translations/core/ja.po
  - サイズ：2,377,646 バイト、sha256 `f19a773fedb8ad274a46902a9a366b646e0c064414aa54650df500dfedbb189f`
  - Kotomark が読んだ行数：8,706（うち訳文が空 1,280、`fuzzy` 付き 2,149 エントリ）
- ライセンス：GPL-2.0-or-later。リポジトリの `COPYING` は GNU GPL v2 の本文。ja.po のヘッダーに「This translation is covered by the GNU General Public License Version 2.」とある。非営利限定ではない（HQ 決定 d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。原文・訳文は再配布しない（labels.csv には本文を入れず、文字列 ID は sha1 の先頭10桁のみ）。生データは `/tmp/claude-0/eval/heldout/freeciv/` にのみ保存。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout; mkdir -p $D/freeciv
curl -sSfL -o $D/freeciv/ja.po https://raw.githubusercontent.com/freeciv/freeciv/380d482bd39f56fff2644c23eceab6b543f2d8c3/translations/core/ja.po
npx tsx src/cli/index.ts check $D/freeciv/ja.po --format json --fail-on never --no-glossary > $D/freeciv.A.json
npx tsx src/cli/index.ts labels $D/freeciv/ja.po --no-glossary --out $D/freeciv.labels.csv
```
