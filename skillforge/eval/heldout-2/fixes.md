# ホールドアウト評価 第2回で見つかった問題の修正（2026-10-09）

> **注意：この修正のあと、Widelands・Flare・Jitsi Meet・Discourse・Element Web・The Question の6プロジェクトは、もうホールドアウト（調整に使っていないデータ）ではありません。**
> 修正にあたって、評価の結果・ラベル・誤検知の行を読み、それに合わせて規則を直しました。下の「修正後」の数字は、調整に使ったデータでの数字です。`README.md` と `summary.json` の精度（警告・エラー 0.966、untranslated.* を除く全数 0.917 など）は修正**前**のエンジン（`3edc6a01`）の値で、これが未調整の精度です。LP などで未調整の精度として引用するのは、修正前の値だけにしてください。修正後の汎化を測るには、新しい未使用のプロジェクトが必要です。

回帰テストは `test/heldout2-fixes.test.ts` です。テストの文字列はすべて新しく書いたもので、6プロジェクトの文は使っていません。

## 変更内容

| # | 場所 | 内容 |
|---|---|---|
| 1 | `core/text.ts`（`nothingToTranslate`）、`checks/rules.ts`、`core/inputs.ts` | **訳す内容が無い原文の `untranslated.empty`**。マークアップとプレースホルダー（`${X}`、`%{x}`、`%1$s`、`{{x}}` など）を除くと文字（`\p{L}`）が残らない原文は、訳文が空でも報告しません。数字・符号（`-50`、`+3`）、日付・時刻（`1462/8/13`、`9:15 PM`）、記号・省略記号（`...`、`★`、`–`）、変数だけ・プレースホルダーだけの書式（`${AVATAR_NAME}`、`%{email_prefix}: %{topic_title}`、`%1$s / %2$s`）が対象です。倍率の `1.5x` / `x2` と時刻の後の AM/PM は文字に数えません。**キー名**：`Ctrl` `Shift` `Alt` `AltGr` `Cmd` `Esc` `Del` `Ins` `PgUp` `PgDn` `Fn` `F1`〜`F24` と、その組み合わせ（`Ctrl+S`、`Shift+Alt+F4`）も報告しません。`Tab` `Home` `Enter` `Space` のように普通の語として訳されうるものは従来どおり報告します。`[DISABLED]` のような角かっこの大文字の語は表示される文字として扱います（`{} [DISABLED]` は報告する）。訳文ファイルにキーが無い行（`missing`）にも同じ判定を使います。「N of M rows have an empty target」の注記も、報告しない行を数えないようにしました。 |
| 2 | `checks/rules.ts`（`TRANSLATED_BRACKET`、`VALUE_TAGS`、`tags`） | **表示用テキストをプレースホルダー・タグと見なす誤り**（Element の2件）。(a) `[number]` → `［番号］`：小文字の `[word]` を訳文の「訳された角かっこのラベル」で置き換えたときは不一致にしない仕組みが既にありましたが、半角の `[…]` しか数えていなかったため、全角の `［…］` で訳した行に効いていませんでした。全角の角かっこも数えます。(b) `<space>` → `<スペース>`：閉じタグの無い裸の `<word>` は表示用テキストとみなす仕組みが既にありましたが、`space` が TextMeshPro のタグ名として既知のタグの一覧に入っていたため、対象外でした。TextMeshPro で値が必須のタグ（`space` `voffset` `pos` `indent` `cspace` `mspace` `alpha` `margin` `line-height` `line-indent` `rotate` `gradient` `width` `size` `color` `sprite` `material`）は、値も属性も閉じタグも無い裸の形ならタグとみなしません。`<space=2em>` や `<color=red>…</color>` は従来どおりタグとして比べます。 |
| 3 | `core/pilot.ts`（`findingsToLabelCsv`） | **ラベル付け用の表に別の項目の本文が出る問題**。行を「ファイル + ID」で引いていたため、`msgctxt` が同じ（ID が同じ）.po の項目が複数あると、最後の項目の原文・訳文が全部の行に出ていました。指摘の「ファイル + 行 + ID」で引き、見つからなければ「ファイル + 行」、最後に「ファイル + ID」で引きます。組み合わせた .ks の行は、元ファイルのファイルと行（`sourceRef`）でも引けるようにしました（原文側の指摘はそちらを指すため）。Widelands の `tribes.ja.po:924` は、表の訳文列が「倉庫」ではなく正しく空になります。 |
| 4 | `core/inputs.ts`（空の訳文の注記） | **Ren'Py の screens.rpy の「空」**。README に「注記に出るが指摘が無い」とあった screens.rpy の1行は、`old " "` / `new " "`（原文も訳文も空白1文字）で、訳す内容の無い行でした。取りこぼしではなく注記の数え違いだったため、原文が空白だけの行（と 1 の対象の行）は注記に数えないようにしました。指摘は従来どおり出しません。 |
| 5 | `core/inputs.ts`（`pairTables`）、`types.ts`（`Row.targetSpeaker`）、`checks/names.ts`、`i18n.ts`（`nameSpeakerTarget`） | **.ks の訳文側の話者名**。組み合わせた .ks の行は原文の話者だけを持っていたため、訳文ファイルの話者ラベル（`#Akne` など）は検査されていませんでした。訳文側の話者を `targetSpeaker` に持たせ、原文の話者からキャラクターを決めて、訳文の言語の名前・別名（ja は読みも）・キャラクター ID のどれとも一致しなければ `name.speaker-label`（警告）、禁止表記（`forbidden.en` / `forbidden.ja`）なら `name.forbidden`（エラー）を、訳文ファイルの行に side = target で出します。キャラクター表が無いときは検査しません。Ren'Py は話者が変数（`e "…"`）で原文と訳文に共通なので、対象外です。 |

## 6プロジェクトの再実行（`--no-glossary`、ルール・重大度別の全件数）

| プロジェクト | ルール | 修正前 | 修正後 | 理由 |
|---|---|---:|---:|---|
| Widelands | untranslated.empty | 2,383 | 2,327 | 書式だけ・記号だけ・数字だけの 51件、キー名 5件（Shift / Alt / Cmd / Ctrl / Esc） |
| Flare | untranslated.empty | 584 | 564 | 日付 13件、数字 5件、`...`、`${AVATAR_NAME}` |
| Jitsi Meet | untranslated.empty | 536 | 535 | `{{current}}/{{total}}` |
| Discourse | untranslated.empty | 707 | 691 | `%{email_prefix}: %{topic_title}` 13件などプレースホルダーだけの 16件 |
| Element Web | untranslated.empty | 842 | 838 | キー名 4件（Alt / Ctrl / Esc / Shift） |
| | placeholder.mismatch（error） | 1 | 0 | `[number]` → `［番号］` |
| | tag.mismatch（error） | 4 | 3 | `<space>` → `<スペース>` |
| The Question | 全ルール | 6 | 6 | 変化なし（screens.rpy の注記だけが消えた） |

消えた untranslated.empty 97件の原文はすべて目で確認し、文字が残らないものかキー名だけでした。他のルールの指摘は全件同じです（ルール・重大度・行・ID・side・メッセージ）。

## ラベル付きの指摘への影響（`labels.csv`）

.po と .rpy はファイル名・行番号・ルール・重大度、YAML・JSON はキー（`id_hash`）・ルール・重大度で照合しました。

| ラベル | 件数 | 修正後も出る | 消えた |
|---|---:|---:|---:|
| TP（警告・エラー、抽出 + census_extra） | 303 | **303** | 0 |
| FP（警告・エラー） | 11 | 0 | **11** |
| unsure（警告・エラー、Widelands の船名） | 6 | 6 | 0 |
| info（TP 2 / FP 1 / unsure 3） | 6 | 6 | 0 |

- 消えた FP 11件：訳す内容が無い原文の `untranslated.empty` 9件（Flare 6、Widelands・Discourse・Element 各1）と、Element の `[number]`・`<space>` の2件。README の FP パターン 1・2 はすべて消えました。
- ラベルを付けた TP で消えたものはありません。
- 参考までに、抽出した 303件に当てはめると TP 287 / FP 0 / unsure 6 になりますが、上の注意のとおり、これは調整後の値で、未調整の精度ではありません。
- 残る FP は info の1件（`untranslated.copy`、著者名）で、今回は直していません。

## 調整済みデータでの回帰確認

| データ | 結果 |
|---|---|
| 調整に使った .po 6本（SuperTuxKart、Pixelorama、Luanti、Godot エディタ、Wesnoth httt・lib、`--no-glossary`）と Wesnoth httt の設定 C | Wesnoth lib で2件減（`★`、`$title ($count/$total)`。ラベル無し）。他は全件同じ |
| Misskey A・C | 全件同じ |
| 合成ベンチ #1・#2（G・A、clean・drifted） | 全件同じ（採点結果も同じ） |
| ホールドアウト第1回の5プロジェクト | SuperTux・Warzone 2100・Mastodon・Excalidraw は全件同じ。Freeciv は 3,896 → 3,886（下記） |

Freeciv の 10件減の内訳：`untranslated.empty` 8件（`   ∞%s`、`'%s'`、`%.1f%%`、`[%2d] %s`、`>=%s`、ダッシュだけの行など）と、`tag.mismatch` 2件（`<space>` を「スペースキー」と訳した行、`playercolor <player-name> <color>` を `<カラーコード>` と訳した行。どちらも表示用テキストで、これまでは誤検知）。ラベル付きの指摘への影響は次のとおりです。

- **第1回のラベルで TP だった1件が消えます**：`freeciv/ja.po:12444`（原文がダッシュ `-` だけの行、`untranslated.empty`）。第1回のラベルは `untranslated.empty` をまとめて「msgstr empty」で TP にしていましたが、第2回の基準（原文が記号だけなら訳文が空でも見た目の問題は無く FP。`...` が FP と判定されている）ではこの行は FP にあたります。基準の違いによるもので、意図した変化として扱いました。
- 第1回の他の TP 186件はすべて残ります。

## テスト

- `test/heldout2-fixes.test.ts`（12件）を追加しました。
- 既存のテストの期待値の変更は1つだけです：`test/i18n.test.ts` のメッセージ一覧に、新しい `nameSpeakerTarget` の呼び出し例を追加しました。
- `npm test`（243件）、`npm run typecheck`、`build:demo` / `build:action` / `build:site` はすべて成功しています。

## 残っている問題（今回は直していない）

- info の `untranslated.copy` が、著者名（`mikey (ATP Projects)`）のような固有名詞だけの原文を指摘する（FP 1件）。
- Widelands の船名（`shipname` 文脈）394件の `untranslated.empty`。ラテン文字のまま残すのが意図的な可能性があり、unsure のまま。
- `nothingToTranslate` は単位（`5 km`）や序数（`1st`）を訳す内容のある文字列として扱います（訳す場合があるため）。
