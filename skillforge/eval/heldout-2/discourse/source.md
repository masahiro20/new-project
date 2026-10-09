# データ出典：Discourse（アプリ、Rails i18n YAML：server.ja.yml + server.en.yml）

- リポジトリ：https://github.com/discourse/discourse
- コミット（2026-10-09 取得時の HEAD）：`cfc6e9200b6d1d428efcf1bf1364422bec78b329`
- ファイル（キーで組み合わせ）：
  - `config/locales/server.ja.yml` — 425,477 バイト、sha256 `045646ea8789ad86034d839c5d42e6123f62bb64b1b4b8022f91d15bf43e8872`、3,428 キー
  - `config/locales/server.en.yml` — 440,012 バイト、sha256 `7efa3a824b021508bfd6b55591fdf0462110dac7b10b08b3e0dfb120c8da43b7`、4,312 キー（ja に無いキー 884、うち複数形 `.one` 155 は Kotomark が報告対象外とした）
  - クライアント側（`client.*.yml`）は規模を抑えるため使っていない（取得はしたが評価外）。
- 方向の判定：Kotomark は en を原文、ja を訳文と正しく判定した。
- ライセンス：GPL-2.0（リポジトリの `LICENSE.txt`）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/discourse/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=cfc6e9200b6d1d428efcf1bf1364422bec78b329; mkdir -p $D/discourse
for l in ja en; do curl -sSfL -o $D/discourse/server.$l.yml https://raw.githubusercontent.com/discourse/discourse/$S/config/locales/server.$l.yml; done
npx tsx src/cli/index.ts check $D/discourse/server.ja.yml $D/discourse/server.en.yml --format json --fail-on never --no-glossary > $D/discourse.A.json
```
