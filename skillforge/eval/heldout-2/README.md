# ホールドアウト評価 第2回（P1 Kotomark、最新の修正後・未調整の精度）

目的：最新の修正を入れたエンジンについて、調整に一度も使っていないデータで、調整していない状態の精度を1つ測ること。測定のみで、修正案は出さない。

- エンジン：`skillforge` のコミット `3edc6a01eadd4b5b43d1a16e4db2ea5c18f6f725`（`git rev-parse HEAD`、2026-10-09）
- 設定：`npx tsx src/cli/index.ts check <files...> --format json --fail-on never --no-glossary` の1つだけ

## ホールドアウトであることの保証

- 評価者は、エンジンのソース（`src/`）とテスト（`test/`）を一切読んでいない。CLI の `--help` と、前回の評価（`eval/heldout/`）の書式だけを見た。
- 使った6プロジェクトは、これまでの調整にも前回のホールドアウトにも使われていない。除外リスト（SuperTuxKart、Pixelorama、Luanti、Godot、Battle for Wesnoth、Misskey、Freeciv、Warzone 2100、SuperTux、Mastodon、Excalidraw）に含まれない。
- エンジンは各プロジェクトについて1回だけ実行した。設定を変えての再実行や、結果を見てからのデータの入れ替えはしていない（データの選定は実行前に済ませ、Element Web を6本目に加えたのは、他の5本の指摘がほぼ未翻訳ルールだけだと分かった後だが、Element の結果を見る前）。
- 生データは `/tmp/claude-0/eval/heldout-2/` にだけ置いた。リポジトリには本文（原文・訳文）を入れていない。`labels.csv` は、ファイル名と行番号、文字列 ID の SHA-1 先頭10桁、判定、15語以内のメモだけを持つ。

## データ（いずれも 2026-10-09 時点の HEAD に固定。詳細は各 `source.md`）

| プロジェクト | 形式 | ライセンス | 規模 | コミット |
|---|---|---|---|---|
| Widelands（ゲーム） | .po（`widelands/ja.po` + `tribes/ja.po`） | GPL-2.0+ | msgid 4,034 | `47c5cae8` |
| Flare: Empyrean Campaign（ゲーム） | .po（`empyrean_campaign` + `fantasycore` の `data.ja.po`） | CC BY-SA 3.0 | msgid 1,426 | `af6eee6d` |
| Jitsi Meet（アプリ） | i18next JSON（main-ja.json + main.json） | Apache-2.0 | 1,606 キー | `300bdaa8` |
| Discourse（アプリ） | Rails YAML（server.ja.yml + server.en.yml） | GPL-2.0 | 4,312 キー | `cfc6e920` |
| Element Web（アプリ） | i18n JSON（ja.json + en_EN.json） | AGPL-3.0 / GPL-3.0 | 3,539 キー | `263a2b56` |
| The Question（Ren'Py サンプルゲーム） | Ren'Py 翻訳（`tl/japanese/*.rpy` 4本） | MIT | 約540 行 | `e58fd737` |

ゲームの .po が2件、ロケールファイルの組（YAML / JSON）が3件、Ren'Py が1件。非営利限定のライセンスは含まない（HQ 決定 d20）。CSV 形式で日本語訳のある適当なオープンソースのゲームは見つからなかった。

組の向き：Jitsi、Discourse、Element の3件とも、Kotomark は英語ファイルを原文、日本語ファイルを訳文と正しく判定した（`--source-lang` は渡していない）。向きの誤りという欠陥は今回は出なかった。

## 方法

- ラベル付け用の表は `kotomark labels … --no-glossary` で書き出し、件数が check の JSON と一致することを確認した。
- 警告・エラーが60件以下のプロジェクトは全件、60件を超えるプロジェクトはシード 20261012 で60件を無作為抽出した（Python `random.Random(20261012).sample`、表の順に並べた警告・エラーの行から）。情報（info）は別に最大20件（今回はすべて20件以下なので全件）。
- **追加の全数ラベル（census_extra）**：抽出した60件はほぼすべて `untranslated.empty` になり、untranslated.* を除いた精度の件数がごく少なくなる（7件）。そこで、untranslated.* 以外の警告・エラーは全件（抽出に入らなかった17件）も追加でラベルを付けた。`labels.csv` の `sample` 列が `census_extra` の行がそれ。全体の精度（抽出のみ）には入れていない。
- ラベルは、ローカライズ QA の担当者の立場で厳しめに付けた。TP = 指摘された行に、指摘どおりの問題が実際にあり、担当者が直したいもの。FP = 指摘の内容が誤り、または事実としては正しいが直す必要がまったく無いもの（例：原文が数字・日付・変数だけで、訳す内容が無い）。unsure = 判断が分かれるもの。
- .po の未翻訳の指摘は、ラベルの表の原文・訳文ではなく、元の .po の該当行を読んで確認した（後述の「計測上の注意」を参照）。
- 精度 = TP /（TP + FP）。unsure を FP に数えた値も併記した。プール値は、ラベルを付けた件数をそのまま合算したもの（プロジェクトの件数による重み付けはしていない）。95% 信頼区間は Wilson 法。

## 指摘の総数（ルール・重大度別、全件）

| プロジェクト | 総数 | 内訳 |
|---|---|---|
| Widelands | 2,391 | untranslated.empty 2,383 / notation.katakana 7 / untranslated.copy（info）1 |
| Flare | 584 | untranslated.empty 584 |
| Jitsi Meet | 542 | untranslated.empty 536 / notation.katakana 4 / untranslated.copy（info）2 |
| Discourse | 712 | untranslated.empty 707 / notation.katakana 5 |
| Element Web | 848 | untranslated.empty 842 / tag.mismatch（error）4 / notation.katakana 1 / placeholder.mismatch（error）1 |
| The Question | 6 | notation.katakana 2 / untranslated.empty 1 / untranslated.copy（info）3 |

前回のホールドアウトで FP の大半を占めた placeholder.mismatch・tag.mismatch は、今回の6件では合わせて5件しか出なかった。

## 結果（警告＋エラー）

### 全ルール（抽出した 303件）

| | TP | FP | unsure | 精度（unsure 除外） | 精度（unsure を FP） |
|---|---|---|---|---|---|
| **プール** | 287 | 10 | 6 | **0.966**（95% CI 0.939–0.982） | 0.947（0.916–0.967） |
| Widelands（60 / 2,390） | 53 | 1 | 6 | 0.981 | 0.883 |
| Flare（60 / 584） | 54 | 6 | 0 | 0.900 | 0.900 |
| Jitsi Meet（60 / 540） | 60 | 0 | 0 | 1.000 | 1.000 |
| Discourse（60 / 712） | 59 | 1 | 0 | 0.983 | 0.983 |
| Element Web（60 / 848） | 58 | 2 | 0 | 0.967 | 0.967 |
| The Question（全3件） | 3 | 0 | 0 | 1.000 | 1.000 |

### untranslated.* を除く

| | TP | FP | unsure | 精度 |
|---|---|---|---|---|
| 抽出の中だけ（7件） | 6 | 1 | 0 | 0.857 |
| **全数（抽出 7件 + census_extra 17件 = 24件）** | **22** | **2** | 0 | **0.917**（95% CI 0.742–0.977） |

全数＝untranslated.* 以外の警告・エラー全24件（Widelands 7、Jitsi 4、Discourse 5、Element 6、The Question 2）。プロジェクト別：Widelands 7/7、Jitsi 4/4、Discourse 5/5、Element 4/6（0.667）、The Question 2/2。件数が少ないため、区間は広い。

### ルール別（プール。untranslated.* は抽出から、それ以外は全数から）

| ルール | TP | FP | unsure | 精度 |
|---|---|---|---|---|
| untranslated.empty | 281 | 9 | 6 | 0.969（unsure を FP で 0.949） |
| notation.katakana | 19 | 0 | 0 | 1.000 |
| tag.mismatch | 3 | 1 | 0 | 0.750 |
| placeholder.mismatch | 0 | 1 | 0 | 0.000（1件のみ） |

### 情報（info）

全6件：TP 2 / FP 1 / unsure 3。精度 0.667（unsure を FP で 0.333）。すべて untranslated.copy。件数が少なく、精度としての意味は薄い。

## FP のパターン（測定のみ、修正案なし）

1. **訳す内容が無い原文の「未翻訳（空）」**（FP 9件中 8件）：原文が数字（`-50`）、日付（`1462/8/13`）、記号（`...`）、変数だけ（`${AVATAR_NAME}`、`%{email_prefix}: %{topic_title}`）、キー名（`Ctrl`）のもの。訳文が空でも原文がそのまま表示され、見た目の問題は無い。Flare に6件、Widelands・Discourse・Element に各1件（`Ctrl` は2件）。
2. **角かっこ・山かっこの表示用テキストをプレースホルダーやタグと見なす**（2件、Element）：`[number]`（キー操作の説明の表示用テキスト）を［番号］と訳したのを placeholder.mismatch（error）、`<space>`（表示用の文字列）を `<スペース>` と訳したのを tag.mismatch（error）としている。
3. （unsure 6件）Widelands の船名（`shipname` 文脈、全394件が未訳）：固有名詞をラテン文字のまま残すのが意図的な可能性がある。
4. （info）著者名（`mikey (ATP Projects)`）を「原文と同じ」と指摘（FP）。クレジットや「powered by」「Made with Ren'Py」は英語のままが慣例のこともあり unsure。

## 計測上の注意（エンジンの指摘とは別）

- `kotomark labels` が書き出す表で、.po の `msgctxt` が同じ複数の項目（例：Widelands の `amazons_building`）について、`string_id` に msgctxt が入り、原文・訳文の列に**別の項目の本文**が表示されることがある（例：行 924 の指摘の訳文列に、隣の項目の「倉庫」が出る）。check の指摘自体（行番号）は正しく、元の .po で確認すると全件が本当に空だった。ラベルの表だけを見て判定すると FP と誤る恐れがある。
- The Question では、check の注記に「screens.rpy の1行が空」と出るが、指摘としては報告されていない（取りこぼしの可能性。今回は精度のみの測定なので数に入れていない）。

## 限界

- 抽出の 95% が untranslated.empty で、全体の精度は実質「空の訳文を見つける精度」になっている。これらの OSS の日本語訳は未完成の部分が大きく、未翻訳の行が指摘の大半を占める。完成度の高い商用の訳文では、指摘の構成も精度も変わりうる。
- untranslated.* 以外は全数でも24件しかなく、信頼区間が広い（0.74–0.98）。placeholder.mismatch・tag.mismatch の精度は今回のデータではほぼ測れていない（合わせて5件）。
- ラベルは評価者1名によるもの。二重ラベルや一致率の測定はしていない。「訳す内容が無い原文の空欄」を FP、「船名」を unsure とした判断は、担当者によって分かれうる。
- 用語集なし（`--no-glossary`）の設定だけを測った。用語集を使う場合の精度は測っていない。
- 再現率（見逃し）は測っていない。

## LP に載せてよい一文

> 調整に使っていない6つのオープンソース（ゲーム3・アプリ3、.po / YAML / JSON / Ren'Py）の日本語訳で、Kotomark の警告・エラーを無作為抽出して自社の AI 評価者1名が判定したところ（人による確認はまだ）、判断が分かれた6件を除く 297件中 287件（96.6%）が実際に直すべき問題でした。

（注記として「指摘の大半は未翻訳の検出。未翻訳以外の指摘に限ると 24件中 22件（91.7%）」を併記することを推奨。）

## ファイル

- `<project>/source.md`：出典、コミット、ライセンス、ファイルのハッシュ、再取得の手順
- `<project>/labels.csv`：`sample`（warning_error / census_extra / info）, `finding`, `file_line`, `id_hash`, `rule`, `severity`, `side`, `verdict`, `note`
- `summary.json`：プロジェクト別・プールの集計（ルール・重大度別の総数、精度、ルール別、info）
