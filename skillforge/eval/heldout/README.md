# ホールドアウト評価（P1 Kotomark、未調整の精度）

目的：ランディングページに載せる、調整していない状態での精度を1つ測ること。修正案は出さない（測定のみ）。

## ホールドアウトであることの保証

- 評価者は、エンジンのソース（`src/`）とテスト（`test/`）を一切読んでいない。CLI の `--help`、`README.md`、`docs/` の一覧だけを見た。
- 使った5プロジェクトは、これまでの調整に使われていない。調整済みの SuperTuxKart、Pixelorama、Luanti、Godot エディタ、Battle for Wesnoth、Misskey は使っていない（SuperTux は SuperTuxKart とは別のゲーム）。
- エンジンはこの評価の結果を見る前の状態で、1回だけ実行した。設定を変えての再実行や、結果を見てからのデータの入れ替えはしていない。
- 生データは `/tmp/claude-0/eval/heldout/` にだけ置いた。リポジトリには本文（原文・訳文）を入れていない。

## データ（いずれも 2026-10-09 時点の HEAD に固定。詳細は各 `source.md`）

| プロジェクト | 形式 | ライセンス | 行数 | コミット |
|---|---|---|---|---|
| Freeciv（ゲーム） | .po（`translations/core/ja.po`） | GPL-2.0+ | 8,706 | `380d482b` |
| Warzone 2100（ゲーム） | .po（`po/ja_JP.po`） | GPL-2.0 | 3,947 | `d7ce18df` |
| SuperTux（ゲーム） | .po（`data/locale/ja.po`） | GPL-3.0 | 1,248 | `b3e5c976` |
| Mastodon（アプリ） | Rails YAML（ja.yml + en.yml） | AGPL-3.0 | 2,062 キー | `07b4fd20` |
| Excalidraw（アプリ） | i18n JSON（ja-JP.json + en.json） | MIT | 635 キー | `4c00f31d` |

非営利限定のライセンスは含まない（HQ 決定 d20）。

## 方法

- 設定は1つだけ：`check <file> --format json --fail-on never --no-glossary`（CI での既定の使い方）。YAML と JSON は ja と en の2ファイルを渡し、Kotomark の既定のキー組み合わせに任せた。
- ラベル付け用の表は `kotomark labels … --no-glossary` で書き出した（指摘は check の JSON と一致することを確認）。
- 警告・エラーが60件以下のプロジェクトは全件、60件を超えるプロジェクトはシード 20261011 で60件を無作為抽出した（Python `random.Random(20261011).sample`、表の順に並べた警告・エラーの行から）。情報（info）は別に最大20件。
- ラベルは、ローカライズ QA の担当者の立場で厳しめに付けた。TP = 指摘された行に、指摘どおりの問題が実際にある。FP = 指摘の内容が誤り（問題が無い、または別の問題を誤った内容で指摘している）。unsure = 判断が分かれるもの。
- 精度 = TP /（TP + FP）。unsure を FP に数えた値も併記した。プール値は、ラベルを付けた件数をそのまま合算したもの（プロジェクトの件数による重み付けはしていない）。

## 指摘の総数（ルール・重大度別、全件）

| プロジェクト | 総数 | 内訳 |
|---|---|---|
| Freeciv | 4,012 | untranslated.fuzzy 1,972 / untranslated.empty 1,280 / placeholder.mismatch（error）711 / notation.katakana 28 / untranslated.duplicate 11 / tag.mismatch（error）10。info 0 |
| Warzone 2100 | 595 | untranslated.empty 552 / notation.katakana 42 / untranslated.copy（info）1 |
| SuperTux | 263 | untranslated.empty 262 / notation.katakana 1 |
| Mastodon | 153 | placeholder.mismatch（error）109 / tag.mismatch（error）29 / notation.katakana 15 |
| Excalidraw | 7 | placeholder.mismatch（error）3 / tag.mismatch（error）2 / notation.katakana 2 |

## 結果（警告＋エラー、ラベル付き 247件）

| | TP | FP | unsure | 精度（unsure 除外） | 精度（unsure を FP） |
|---|---|---|---|---|---|
| **プール（全ルール）** | 187 | 58 | 2 | **0.763** | 0.757 |
| **プール（untranslated.* を除く）** | 28 | 58 | 2 | **0.326** | 0.318 |
| Freeciv（60件抽出 / 4,012） | 58 | 2 | 0 | 0.967 | 0.967 |
| Warzone 2100（60件抽出 / 594） | 58 | 0 | 2 | 1.000 | 0.967 |
| SuperTux（60件抽出 / 263） | 60 | 0 | 0 | 1.000 | 1.000 |
| Mastodon（60件抽出 / 153） | 9 | 51 | 0 | 0.150 | 0.150 |
| Excalidraw（全7件） | 2 | 5 | 0 | 0.286 | 0.286 |

untranslated.* を除いたプロジェクト別：Freeciv 11/13（0.846）、Warzone 2100 5/5（unsure 2）、SuperTux 1/1、Mastodon 9/60（0.150）、Excalidraw 2/7（0.286）。

### ルール別（プール）

| ルール | TP | FP | unsure | 精度 |
|---|---|---|---|---|
| untranslated.empty | 132 | 0 | 0 | 1.000 |
| untranslated.fuzzy | 27 | 0 | 0 | 1.000 |
| notation.katakana | 18 | 0 | 2 | 1.000（unsure を FP で 0.900） |
| placeholder.mismatch | 10 | 47 | 0 | 0.175 |
| tag.mismatch | 0 | 11 | 0 | 0.000 |

### 情報（info）

ラベル対象は Warzone 2100 の1件のみ（untranslated.copy）：TP 0 / FP 1（コマンドの書式で、原文のままが正しい）。件数が少なく、精度としては意味を持たない。

## FP のパターン（簡潔に）

1. **ロケールファイルの組で、日本語側にキーが無い行**（55件 / FP 58件中）：Mastodon と Excalidraw では、Kotomark が既定で日本語ファイルを原文、英語ファイルを訳文として扱った。日本語にキーが無い行で、英語側のプレースホルダーやタグが「訳文にある余分なもの」として error になる。うち多くは、日本語に不要な複数形 `.one` のキーで、キーが無いのが正しい。それ以外は日本語訳の欠落だが、未翻訳としては報告されず、誤った内容（プレースホルダー・タグの不一致）で報告される。
2. **gettext の位置指定（`%2$s` など）による語順の入れ替え**（2件）：Freeciv。正しい c-format なのに placeholder.mismatch の error になる。全件（711件）で見ると、変換指定の種類と数が原文と同じものが 129件あり、同じパターンと推定される。
3. **プレースホルダーの繰り返し回数の違い**（1件）：Mastodon。日本語訳が `%{instance}` を英語より1回多く使っているだけで、実害は無い。
4. （unsure 2件）Warzone 2100 の中黒の有無：「チーム・アルファ」（10回）を、1回しか出ない「チームアルファ」に合わせるよう指摘している。表記の揺れ自体は実在するが、指摘された行の方が多数派。

## 限界

- ラベルは評価者1人による。二重チェックはしていない。
- 抽出は各プロジェクト60件までで、プール値はラベル件数の単純合算。全件数で重み付けすると Freeciv の未翻訳指摘が大半を占め、値は約0.94になる（`summary.json` の `warning_error_population_weighted_estimate_unsure_as_FP`）。この値は未翻訳の検出に強く引っ張られるので、LP には使わない方がよい。
- 全体の精度は、未翻訳（空の訳文・fuzzy）の検出がほぼ自明に正しいことに大きく依存する。それを除いた値（0.326）は、ほぼ Mastodon と Excalidraw の組み合わせの問題（パターン1）で決まっている。
- Freeciv の placeholder の TP 10件は、すべて fuzzy のエントリ（gettext は実行時に使わない）にある。訳文が本当にプレースホルダーを欠いているので TP としたが、同じ行の untranslated.fuzzy と重複しており、error という重大度は実害より重い。fuzzy でない placeholder 指摘（96件）は、ほぼすべてパターン2と推定される。
- notation.katakana の TP は18件と少なく、精度の信頼区間は広い。
- 再現率（見逃し）は測っていない。
- 設定は `--no-glossary` の1つだけ。YAML・JSON の原文の向きを指定する方法は試していない（既定の動作のまま測った）。

## ファイル

- `<project>/source.md`：URL、コミット、ライセンスの根拠、サイズ、sha256、再実行手順
- `<project>/labels.csv`：ラベル（本文なし。文字列 ID は sha1 の先頭10桁。note は15語以内）
- `summary.json`：全件の指摘数、プロジェクト別・プール・ルール別の精度
