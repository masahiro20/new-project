# Misskey（日→英 UI）：誤検知のパターンと修正案

評価日 2026-10-09。データは misskey@53ac6808 の `locales/ja-JP.yml` → `en-US.yml`（CSV に変換済み）。詳細は labels.csv と summary.json を参照してください。

| 設定 | 指摘数 | ラベル数 | TP | FP | 保留 | 精度 |
|---|---|---|---|---|---|---|
| A（用語集なし） | 21 | 21 | 21 | 0 | 0 | 1.00 |
| B（自動用語集） | 760 | 60 | 7 | 51 | 2 | 0.12（すべて情報レベル。警告・エラーは A と同じ 21/21） |
| C（手作りの用語集） | 93 | 60 | 44 | 16 | 0 | 0.73（`term.missing` のみでは 27/43 = 0.63） |

- **CI の基準（警告とエラー）では、A・B とも 21/21 が本物でした**（JA 原文のカタカナ揺れ 6件：サーバ／サーバー、フォルダ／フォルダー、バーナー／バナー の誤字、未翻訳 15件）。
- カタカナ揺れの指摘は **原文側（日本語）** の問題です。日→英の案件では「原文の表記揺れ」として翻訳者ではなく原文の担当者に回す必要があります。メッセージにはその区別がありません。
- C の本物の指摘の大半は、サーバー が旧称の "instance" のまま残っている行です（無作為抽出 60 件中 26 件）。製品の用語変更が訳に反映されていない実例で、日→英の用語チェックが役立つ典型例です。

---

## 1. 英語の語形変化を照合できない（B 32件、C 11件。FP の最大要因）

訳文の照合 `enPhraseRegex` は、用語の**末尾に複数形の -s/-es を足す**方向にしか対応していません。そのため、次の3通りの取りこぼしが起きます。
- 用語が複数形で、訳文が単数形：自動用語集の `ノート → notes` に対し "Note black hole"、`通知 → notifications` に対し "Notification type"、`ファイル → files` に対し "File successfully uploaded"
- 動詞の活用：用語集の `リノート → Renote` に対し "Renoted."、"can't be renoted"。`リアクション → reaction` に対し "reacted"、"reacting"、"React on a note"。`連合 → federation` に対し "Federating"
- 派生語・複合語：`ホスト → host` に対し "hostnames"、`削除 → Delete` に対し "deletion"、`招待 → Invite` に対し "invitation-only"、`詳細 → details` に対し "detailed"

**修正案**
- `src/core/text.ts` の `enPhraseRegex`：訳文側の照合（`checks/terms.ts` で `containsPhrase(tgt, a, "en", false, true)`、つまり `loose=true` のとき）に限り、最後の語を `singularOf()` で単数形に戻してから、次の末尾を許可する。`(?:s|es|d|ed|ing|er|ers|ion|ions|ation)?`。語尾の e の脱落（React→Reacting は不要、Renote→Renoting）と子音の重複（Ban→Banned）も扱う。照合が緩むのは訳文側だけで、原文側の判定には影響しない。
- `src/core/draft.ts`：自動用語集の英訳候補は、単数形・原形（`notes` → `note`、`updated` → `update`）にそろえて提案する。

## 2. 自動用語集が、一般語や別の語を用語として提案する（B 5件。語形変化と重なるものを含めるとさらに多い）

- 漢語の一般語が用語になる：`入力 → Enter`、`更新 → updated`、`管理 → Manage`、`推奨 → recommended`、`詳細 → details`、`追加 → Add`。UI の文では、自然に言い換えたり省いたりする語です。
- 誤った組み合わせ：`メディア → "sensitive media"`（共起しやすい語にくっついた）、`データ → data`（訳文の "database" に当たらず、すべて FP）。

**修正案（`src/core/draft.ts`）**
- 日→英の自動用語集では、2〜3文字の漢語サ変名詞（入力、更新、管理、追加、削除、選択、編集、詳細、推奨、設定、確認、表示など）を既定の除外リストに入れる。製品の固有用語（カタカナの造語、固有名詞）を優先する。
- 候補の訳が複数語で、そのうち1語が別の用語候補の訳と重なる場合（`sensitive media` は `センシティブ → sensitive` と重なる）、短い方を採用する。

## 3. 訳文が用語を自然に省いたり言い換えたりしている（B 14件：省略 5、言い換え 5、同義語 4。C 4件）

"Ask search engines to not index your profile page, notes, Pages, etc."（コンテンツ を省略）、"A Misskey restart is required"（サーバー を Misskey と言い換え）、"Owned"（管理中）など。日→英では、日本語の説明的な名詞を英語で省くのは普通のことです。

**修正案**：用語集の用語（`draft` でないもの）のうち、カタカナの製品用語・固有名詞は警告のままにします。漢語の一般名詞は、手作りの用語集でも `severity: "info"` を指定できるようにします（`GlossaryTerm` に `severity?` を追加し、`checks/terms.ts` で参照）。

## 4. 語の内部での一致（C 1件）

`ノート → note` が、日本語の「スーパーノート」→ "Supernote" で `term.missing` になります。英語側の照合は単語境界が前提なので、"Supernote" は note を含むとみなされません。日本語側では、ノート が長いカタカナ語の一部であることを考慮していません。

**修正案（`src/core/text.ts` の `containsPhrase`、日本語側）**：カタカナの用語は、前後が別のカタカナに隣接する場合（`[ァ-ヴー]ノート|ノート[ァ-ヴー]`）、一致とみなさない。リノート も、ノート の誤一致を「長い用語が優先」で避けているだけなので、同じ規則で一貫させる。

---

## 見逃し（misses.csv）

- 無作為抽出 60 行で、Kotomark の対象カテゴリの見逃しは 1件（英訳の末尾の空白）。対象を絞った走査で、さらに 3件の末尾空白・改行が見つかりました。→ `checks/rules.ts` に `whitespace.edge`（原文と訳文で前後の空白・改行が違う。情報レベル）を追加する案。
- 用語集なし（A）では、サーバー の訳が server ×104 / instance ×44 で揺れていることを警告として出せません。B の自動用語集は `サーバー → server` を正しく提案していますが、指摘は 739 件の情報レベルの中に埋もれます。→ 自動用語集で、**ひとつの原語に2つ以上の訳が 20% 以上ずつ使われている**場合は、`term.split`（警告、用語集がなくても出す）として「どちらかに統一」を求める案（`src/core/draft.ts` の notes にすでにある「also "…" ×n」の集計を、指摘に昇格させる）。
- 訳が古いまま（原文だけ書き直された行）は、ルールの対象外です。B/C の `term.missing` に偶然かかりました。
- プレースホルダー `{name}` とタグ `<b>` の不一致は、データに 0件でした（Kotomark も 0件）。

## 製品のギャップ

- **YAML のロケールファイル（Misskey、Rails i18n、Crowdin の YAML）を読めません。** `ja-JP.yml` と `en-US.yml` のように、言語ごとに分かれたネストした YAML です。i18n JSON と同じ扱い（キーをドットでつないで平らにし、ja と en をキーで対応付け、行番号は YAML の行）で対応できます。パーサーは `src/core/parsers/` に追加し、`loadInputs` のペアリングに `.yml/.yaml` を加えます。
