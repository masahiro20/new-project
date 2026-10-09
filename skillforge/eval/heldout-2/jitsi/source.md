# データ出典：Jitsi Meet（アプリ、i18next JSON：main-ja.json + main.json）

- リポジトリ：https://github.com/jitsi/jitsi-meet
- コミット（2026-10-09 取得時の HEAD）：`300bdaa8683b057e54b559d98318bda6e9c51b12`
- ファイル（キーで組み合わせ）：
  - `lang/main-ja.json` — 81,075 バイト、sha256 `69ceba431f8c638473074b747c6edec5d4ae17310268c31b63e649604125b20b`、1,070 キー
  - `lang/main.json` — 99,521 バイト、sha256 `e9e180c72f757c0e408bdd0951b6136ace4e90a63673702c230c1ae8d79a4ecb`、1,606 キー（ja に無いキー 536）
- 方向の判定：Kotomark は en（main.json）を原文、ja を訳文と正しく判定した（`--source-lang` は渡していない）。
- ライセンス：Apache-2.0（リポジトリの `LICENSE`）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/jitsi/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=300bdaa8683b057e54b559d98318bda6e9c51b12; mkdir -p $D/jitsi
for f in main main-ja; do curl -sSfL -o $D/jitsi/$f.json https://raw.githubusercontent.com/jitsi/jitsi-meet/$S/lang/$f.json; done
npx tsx src/cli/index.ts check $D/jitsi/main-ja.json $D/jitsi/main.json --format json --fail-on never --no-glossary > $D/jitsi.A.json
```
