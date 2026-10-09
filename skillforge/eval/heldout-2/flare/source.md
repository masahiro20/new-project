# データ出典：Flare（ゲーム「Flare: Empyrean Campaign」、gettext .po）

- リポジトリ：https://github.com/flareteam/flare-game
- コミット（2026-10-09 取得時の HEAD）：`af6eee6d339ac98011864bfe89da837fe7769c28`
- ファイル（2本をまとめて1回の check に渡した）：
  - `mods/empyrean_campaign/languages/data.ja.po` — 150,831 バイト、sha256 `9d9685dd1a900075226122d7edce2f2fb1fc5dac4c0ed77f9384970ba97de4b1`、msgid 1,349（msgstr 空 582）
  - `mods/fantasycore/languages/data.ja.po` — 6,137 バイト、sha256 `a4f8a2fef2f0744bc62c427740f3ceea7d19af9b8de7fcfad9421fa1df29da11`、msgid 77（msgstr 空 2）
- ライセンス：ゲームデータは CC BY-SA 3.0（リポジトリの `LICENSE.txt`）。商用利用可、非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/flare/` のみ。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=af6eee6d339ac98011864bfe89da837fe7769c28; mkdir -p $D/flare
for m in empyrean_campaign fantasycore; do curl -sSfL -o $D/flare/$m.data.ja.po https://raw.githubusercontent.com/flareteam/flare-game/$S/mods/$m/languages/data.ja.po; done
npx tsx src/cli/index.ts check $D/flare/empyrean_campaign.data.ja.po $D/flare/fantasycore.data.ja.po --format json --fail-on never --no-glossary > $D/flare.A.json
```
