# データ出典：Mastodon（Rails i18n YAML、ja.yml + en.yml）

- リポジトリ：https://github.com/mastodon/mastodon
- コミット（2026-10-09 取得時の HEAD）：`07b4fd202198db6e603cff876de2dcf1c179f6b7`
- ファイル（キーで組み合わせ）：
  - `config/locales/ja.yml` — https://raw.githubusercontent.com/mastodon/mastodon/07b4fd202198db6e603cff876de2dcf1c179f6b7/config/locales/ja.yml — 133,095 バイト、sha256 `b84eb4b33f057da4509f8e73c9de05cb4a6831b86b834936f79dee42fb83084b`、1,721 キー
  - `config/locales/en.yml` — https://raw.githubusercontent.com/mastodon/mastodon/07b4fd202198db6e603cff876de2dcf1c179f6b7/config/locales/en.yml — 132,705 バイト、sha256 `4ac9c04315070d28edde889edbee30a7b9efea5dcec5e2b5a29ce73bc9a27192`、2,062 キー
  - en にしか無いキー 341（うち多くは日本語に不要な `.one` 複数形）。
- ライセンス：AGPL-3.0（リポジトリの `LICENSE` は GNU AGPL v3 の本文）。非営利限定ではない（d20 に適合）。
- 注意：Kotomark は既定で ja.yml を原文、en.yml を訳文として扱った（実際は en が原文）。本評価はこの既定動作のまま測定した。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout/mastodon/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout; S=07b4fd202198db6e603cff876de2dcf1c179f6b7; mkdir -p $D/mastodon
for l in ja en; do curl -sSfL -o $D/mastodon/$l.yml https://raw.githubusercontent.com/mastodon/mastodon/$S/config/locales/$l.yml; done
npx tsx src/cli/index.ts check $D/mastodon/ja.yml $D/mastodon/en.yml --format json --fail-on never --no-glossary > $D/mastodon.A.json
npx tsx src/cli/index.ts labels $D/mastodon/ja.yml $D/mastodon/en.yml --no-glossary --out $D/mastodon.labels.csv
```
