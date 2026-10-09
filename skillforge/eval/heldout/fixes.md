# ホールドアウト評価で見つかった誤検知の修正（2026-10-09）

> **注意：この修正のあと、Freeciv・Warzone 2100・SuperTux・Mastodon・Excalidraw の5プロジェクトは、もうホールドアウト（調整に使っていないデータ）ではありません。**
> 修正にあたって、評価の結果・ラベル・誤検知の行を読み、それに合わせて規則を直しました。下の「修正後」の数字は、調整に使ったデータでの数字です。`README.md` と `summary.json` の精度（警告・エラー 0.763 など）は修正**前**のエンジンの値で、これが未調整の精度です。LP などで未調整の精度として引用するのは、修正前の値だけにしてください。修正後の汎化を測るには、新しい未使用のプロジェクトが必要です。

回帰テストは `test/heldout-fixes.test.ts` です。テストの文字列はすべて新しく書いたもので、5プロジェクトの文は使っていません。

## 変更内容

| # | 場所 | 内容 |
|---|---|---|
| 1 | `core/inputs.ts`（`pairDirection`、`loadInputs`）、`cli/index.ts` | **ロケールファイルの組の向き**。これまでは ja のファイルを常に原文にしていました。今は組ごとに次の順で決めます。(a) 明示の指定（`LoadOptions.pairSource` / `langs.source`、CLI の `--source-lang ja\|en`）。(b) キーの集合：相手に無いキーを持つ側（相手側の2倍以上）が原文。翻訳ツールは原文のファイルに先にキーを足すためです。en にしか無いキーがあれば en→ja（OSS アプリの日本語化）、ja にしか無いキーがあれば ja→en（日本のゲーム）。(c) ファイル名やパスに base / default / source / master / template / original / reference があれば、その側が原文。(d) どれでも決まらなければ従来どおり ja（`--source-lang en` を案内）。決めた向きと理由を、組み合わせの note に `direction en→ja (…)` として書きます。Mastodon（en にだけ 341 キー）と Excalidraw（en にだけ 21 キー）は en→ja になります。キー数が同じ既存のサンプルは ja→en のままです。 |
| 2 | `core/inputs.ts`（`pairTables`）、`types.ts`（`Row.missing`、`Row.pluralVariant`）、`checks/rules.ts` | **片方のファイルにしか無いキー**。行に `missing` を付け、プレースホルダー・タグ・ルビ・文字数の規則を一切かけません。訳文側に無いキーは `untranslated.empty`（警告、「訳文のファイルにこのキーがありません」）。原文側に無いキーは新ルール `untranslated.extra-key`（**情報**、廃止されたキーなど）。**日本語に不要な複数形**：日本語側に無い `.one` `.zero` `.two` `.few` `.many`（`_one` などの i18next 形式も）は、`other` の兄弟キーがあれば報告しません（`x_plural` は `x` が兄弟）。`other` も無い場合（複数形まるごと未翻訳）は `other` の1件だけを報告します。省いた件数とキーは note に出します。 |
| 3 | `checks/rules.ts`（`placeholderDiff`、`printfArgs`）、`text.ts`（`PLACEHOLDER`） | **printf の位置指定**。`%2$s %1$s` と `%s %s` は、引数の位置ごとの変換（1: s, 2: s …）が同じなら一致とみなします。gettext の c-format と同じ考え方なので、同じ引数を2回使う `%1$s … %1$s` も可、型が入れ替わる `%1$d … %2$s`（原文 `%s … %d`）や引数を落とすものは従来どおりエラーです。あわせて `%c` と長さ修飾子（`%ld` など）をプレースホルダーとして認識します（これまでは `%1$c` の `$c` を変数と誤認していた）。**名前付きプレースホルダーの回数違い**：`{name}` `%{name}` `${x}` `[NAME]` `%1$s` などが両方にあり、回数だけが違う場合はエラーにせず、新ルール `placeholder.count`（**情報**）にします。名前の無い `%s` `%d` の数の違いは従来どおりエラーです。 |
| 4 | `checks/terms.ts`（`containsWord`、多数派の決定） | **中黒の多数派**。複合語の表記を、単独で使われる語（チーム ×18）の表記に合わせる処理で、語の直後の `・` を「語の続き」とみなしていたため、「チーム・アルファ」には チーム が含まれないと判定され、1回しか出ない「チームアルファ」が多数派になっていました。中黒は語の区切りとして扱うよう直しました。中黒の有無だけが違う形は、単独の語では決まらなくなり、回数で決まります（チーム・アルファ 10回が多数派、チームアルファ 1回を指摘）。**同数のとき**は、従来の結果を保つため、中黒の無い形を多数派にします（デバッグ・モード 2回 / デバッグモード 2回 → 中黒のある方を指摘。修正前と同じ）。 |
| 5 | `checks/rules.ts`（`looksUntranslatedCopy`） | **コマンドの書式の `untranslated.copy`**。語の中に `:` `_` `=` `\` が挟まる書式（`tcp:port`、`log_level=debug`）を含む文字列は、原文のままでも報告しません。 |

## 5プロジェクトの再実行（`--no-glossary`、ルール・重大度別の全件数）

| プロジェクト | ルール | 修正前 | 修正後 | 理由 |
|---|---|---:|---:|---|
| Freeciv | placeholder.mismatch（error） | 711 | 595 | 位置指定の入れ替え 117件が消えた（fuzzy でない 86件 + fuzzy 31件）。fuzzy の古い訳にある `%c` で 1件増えた（実際に不一致）。 |
| | 他（untranslated.* 3,263、notation.katakana 28、tag.mismatch 10） | 同じ | 同じ | |
| Warzone 2100 | notation.katakana | 42 | 31 | チーム・アルファ 9件 → チームアルファ 1件、デバッグ・メニュー 4件 → デバッグメニュー 1件（いずれも少数派の方を指摘するようになった）。デバッグ・モード（2対2）は変わらず。 |
| | untranslated.copy（info） | 1 | 0 | コマンドの書式 |
| | untranslated.empty | 552 | 552 | |
| SuperTux | 全ルール | 263 | 263 | 変化なし |
| Mastodon | placeholder.mismatch（error） | 109 | 0 | 向きの修正と、キーの無い行に比較の規則をかけないことによる |
| | tag.mismatch（error） | 29 | 0 | 同上 |
| | notation.katakana | 15 | 15 | 同じ 15件（日本語が訳文側になったので side が target に、行番号が en.yml の行に変わった） |
| | untranslated.empty | 0 | 284 | ja.yml に無いキー（en にだけある 341 キーから、日本語に不要な複数形 56 を除いたもの） |
| | placeholder.count（info） | 0 | 1 | `%{instance}` を英語より1回多く使う訳（修正前は error） |
| | tag.emphasis-dropped（info） | 0 | 1 | 訳文で `<strong>` を省いた行 |
| | untranslated.copy（info） | 0 | 2 | 日本語訳が英語のままの2行（実際に未翻訳） |
| Excalidraw | placeholder.mismatch / tag.mismatch（error） | 3 / 2 | 0 / 0 | 向きの修正 |
| | notation.katakana | 2 | 2 | |
| | untranslated.empty | 0 | 54 | ja-JP.json に無いキー 21 + 値が空文字列のキー 33 |

警告・エラーの合計：Freeciv 4,012 → 3,896、Warzone 2100 594 → 583、SuperTux 263 → 263、Mastodon 153 → 299、Excalidraw 7 → 56。

## ラベル付きの指摘への影響（`labels.csv`）

PO は行番号とルール、YAML・JSON は向きが変わって行番号が変わるため、キー（`id_hash`）とルールで照合しました。notation.katakana は指摘された表記も一致を確認しました。

| ラベル | 件数 | 修正後も出る | 消えた |
|---|---:|---:|---:|
| TP（警告・エラー） | 187 | **187**（重大度も同じ） | 0 |
| FP（警告・エラー） | 58 | 0 | **58** |
| unsure（Warzone の中黒 2件） | 2 | 0 | 2（指摘は少数派の「チームアルファ」の行へ移った） |
| FP（info、untranslated.copy） | 1 | 0 | 1 |

- Freeciv の FP 2件（位置指定）、Mastodon の FP 51件（日本語にキーが無い行 50件、`%{instance}` の回数 1件は info へ）、Excalidraw の FP 5件がすべて消えました。
- ラベルを付けた TP で消えたものはありません。
- 新しく出た警告（Mastodon 284件、Excalidraw 54件の untranslated.empty）はラベルを付けていません。英語のファイルにあって日本語のファイルに無い（または値が空の）キーで、Mastodon から無作為に 12件見たところ、すべて日本語訳の欠落でした。精度としては測っていません。

## 調整済みデータでの回帰確認

| データ | 結果 |
|---|---|
| 調整に使った .po 6本（SuperTuxKart、Pixelorama、Luanti、Godot エディタ、Wesnoth httt・lib、`--no-glossary`）と Wesnoth httt の設定 C | 指摘（ルール・重大度・行・id・side）は全件同じ |
| Misskey A・C | 全件同じ（CSV に変換して読むため、組み合わせの変更は関係しない） |
| 合成ベンチ #1・#2（`score.mjs`、G・A、clean・drifted） | 指摘は全件同じ、採点結果（`results.json` 相当）も同じ |

テストのうち、意図して変えた期待値は1つだけです：`test/formats-yaml-renpy.test.ts` の YAML サンプルで、en にしか無いキー `debug.fps` に `untranslated.extra-key`（info）が出るようになりました（変更 2）。

## 残っている問題（今回は直していない）

- Freeciv の fuzzy でない placeholder.mismatch が 10件残ります。9件は Freeciv 独自の `?文脈:` 付きの msgid（`?size [short]:Sz`。`[short]` は実行時に取り除かれる注記）で、1件は `[printable]` を訳文で角括弧なしに訳したものです。
- 向きの判定は、キーの集合が同じで名前にも手がかりが無いときは ja を原文にします。英語が原文で、日本語のキーが欠けていないプロジェクトでは `--source-lang en` が必要です。
