# データ出典：Element Web（アプリ、i18n JSON：ja.json + en_EN.json）

- リポジトリ：https://github.com/element-hq/element-web
- コミット（2026-10-09 取得時の HEAD）：`263a2b56d933711bd0c35637c79bee51f157e110`
- ファイル（キーで組み合わせ）：
  - `apps/web/src/i18n/strings/ja.json` — 254,427 バイト、sha256 `0127df7ec314a6eadefff9f5b91466d0f5c35968ababd65fe5cfe310606c3e5b`、2,670 キー
  - `apps/web/src/i18n/strings/en_EN.json` — 271,142 バイト、sha256 `7e351757145349d426f4ab62986216a750dac59646448f1866ddbfcb205fd7fd`、3,539 キー（ja に無いキー 869、うち複数形 27 は報告対象外）
- 方向の判定：Kotomark は en_EN を原文、ja を訳文と正しく判定した。
- ライセンス：AGPL-3.0 または GPL-3.0（または有償の商用ライセンス）の選択制（`README.md` と `LICENSE-AGPL-3.0` / `LICENSE-GPL-3.0`）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/element/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=263a2b56d933711bd0c35637c79bee51f157e110; mkdir -p $D/element
for f in ja en_EN; do curl -sSfL -o $D/element/$f.json https://raw.githubusercontent.com/element-hq/element-web/$S/apps/web/src/i18n/strings/$f.json; done
npx tsx src/cli/index.ts check $D/element/ja.json $D/element/en_EN.json --format json --fail-on never --no-glossary > $D/element.A.json
```
