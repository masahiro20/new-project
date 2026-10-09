# データ出典：Widelands（ゲーム、gettext .po）

- リポジトリ：https://github.com/widelands/widelands
- コミット（2026-10-09 取得時の HEAD）：`47c5cae8c6cb080e4bf86163a3873bd0847bc0e4`
- ファイル（2本をまとめて1回の check に渡した）：
  - `data/i18n/translations/widelands/ja.po` — 361,011 バイト、sha256 `ec4af45fe927ee1cf24e61c68793c8952a4ca564f16fe6e9740a346d005e8cb4`、msgid 2,445（うち msgstr 空 約1,520）
  - `data/i18n/translations/tribes/ja.po` — 370,755 バイト、sha256 `d7b70d4238b8c6fce75200936f34d8aae6c6b85449c9cb83ab9ac418c7c2c38e`、msgid 1,589（うち msgstr 空 約815）
- ライセンス：GPL-2.0 or later（リポジトリの `COPYING` は GNU GPL v2 の本文）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/widelands/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=47c5cae8c6cb080e4bf86163a3873bd0847bc0e4; mkdir -p $D/widelands
for f in widelands tribes; do curl -sSfL -o $D/widelands/$f.ja.po https://raw.githubusercontent.com/widelands/widelands/$S/data/i18n/translations/$f/ja.po; done
npx tsx src/cli/index.ts check $D/widelands/widelands.ja.po $D/widelands/tribes.ja.po --format json --fail-on never --no-glossary > $D/widelands.A.json
```
