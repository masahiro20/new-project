# データ出典：The Question（Ren'Py 同梱のサンプルゲーム、Ren'Py 翻訳ファイル `tl/japanese/*.rpy`）

- リポジトリ：https://github.com/renpy/renpy
- コミット（2026-10-09 取得時の HEAD）：`e58fd737ebcbcad20240d80cf821be5a0ffd2dc1`
- ファイル（4本をまとめて1回の check に渡した。原文は各ブロックのコメント / `old`）：
  - `the_question/game/tl/japanese/common.rpy` — 47,887 バイト、sha256 `79628482b6d97886c4ad87468206dee716469bce68960ce164e4abdc0681236b`
  - `the_question/game/tl/japanese/script.rpy` — 14,648 バイト、sha256 `d5f78325a1d108571b10cd725a023e62c34ec3ad94e4beb3a96a00829c430893`（77 行）
  - `the_question/game/tl/japanese/screens.rpy` — 8,507 バイト、sha256 `c437b7da8e9b71108fb4de252b7852ed7e03e98358a20c9d6e823636b609b677`（102 行）
  - `the_question/game/tl/japanese/options.rpy` — 774 バイト、sha256 `0b0dc6dfc0f09cce74b35de93affdb66d37f9a9e11a8fdbf66fe47d74c4cb896`
- ライセンス：Ren'Py は大部分が MIT（`sphinx/source/license.rst`。デモの素材も同条件と明記）。非営利限定ではない（d20 に適合）。
- 利用範囲：ローカルでの QA 評価のみ。本文は再配布しない。生データは `/tmp/claude-0/eval/heldout-2/the-question/` のみ。
- 注意：規模が小さく（警告3件・情報3件）、精度への寄与は小さい。

## 再取得と再実行

```bash
D=/tmp/claude-0/eval/heldout-2; S=e58fd737ebcbcad20240d80cf821be5a0ffd2dc1; mkdir -p $D/the-question
for f in common script screens options; do curl -sSfL -o $D/the-question/$f.rpy https://raw.githubusercontent.com/renpy/renpy/$S/the_question/game/tl/japanese/$f.rpy; done
npx tsx src/cli/index.ts check $D/the-question/common.rpy $D/the-question/script.rpy $D/the-question/screens.rpy $D/the-question/options.rpy --format json --fail-on never --no-glossary > $D/the-question.A.json
```
