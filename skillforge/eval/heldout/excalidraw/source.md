# データ出典：Excalidraw（i18n ロケール JSON、ja-JP.json + en.json）

- リポジトリ：https://github.com/excalidraw/excalidraw
- コミット（2026-10-09 取得時の HEAD）：`4c00f31ddcc20086bac1020428819fe0b9a30bce`
- ファイル（キーで組み合わせ）：
  - `packages/excalidraw/locales/ja-JP.json` — https://raw.githubusercontent.com/excalidraw/excalidraw/4c00f31ddcc20086bac1020428819fe0b9a30bce/packages/excalidraw/locales/ja-JP.json — 38,813 バイト、sha256 `cce212ebfb50581ac6332ec656e4c03b0dbf96120b30ae11c63bbff232edbd92`、614 キー
  - `packages/excalidraw/locales/en.json` — https://raw.githubusercontent.com/excalidraw/excalidraw/4c00f31ddcc20086bac1020428819fe0b9a30bce/packages/excalidraw/locales/en.json — 33,126 バイト、sha256 `1167d15e859dade257505291eccfa8f1410d4b2c4a49d054b113fdb5f9918369`、635 キー
  - en にしか無いキー 21。
- ライセンス：MIT（リポジトリの `LICENSE`、「Copyright (c) 2020 Excalidraw」）。
- 注意：Mastodon と同じく、Kotomark は既定で ja を原文として扱った。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout/excalidraw/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout; S=4c00f31ddcc20086bac1020428819fe0b9a30bce; mkdir -p $D/excalidraw
for l in ja-JP en; do curl -sSfL -o $D/excalidraw/$l.json https://raw.githubusercontent.com/excalidraw/excalidraw/$S/packages/excalidraw/locales/$l.json; done
npx tsx src/cli/index.ts check $D/excalidraw/ja-JP.json $D/excalidraw/en.json --format json --fail-on never --no-glossary > $D/excalidraw.A.json
npx tsx src/cli/index.ts labels $D/excalidraw/ja-JP.json $D/excalidraw/en.json --no-glossary --out $D/excalidraw.labels.csv
```
