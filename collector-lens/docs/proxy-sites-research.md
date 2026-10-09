# 代理購入サイト（Buyee / ZenMarket ほか）対応 調査メモ

- 調査日（アクセス日）: **2026-10-09**
- 担当: P4 リサーチ
- 対象: Buyee、ZenMarket（主）、FromJapan、Neokyo、Jauce（副・簡易）
- 方法: 各サイトの robots.txt を先に確認 → 許可されたパスだけを WebFetch / curl で数回だけ閲覧。**ログイン・アカウント作成・フォーム送信・入札はしていない。実ページの HTML は保存していない**（その場で構造だけを見た）。

> **法的助言ではありません。** 規約の読み方は調査担当の理解であり、公開前に弁護士の確認が必要です。引用は英語版規約の短い抜粋で、正本（日本語版など）と食い違う場合は正本が優先します。

---

## 0. 結論（先に）

| サイト | 判定 | 一言 |
|---|---|---|
| **Buyee** | **条件付き Go** | 規約に拡張機能やスクレイピングの明文禁止はない。ただし**説明文は最初の HTML になく、あとから JS で読み込まれる**（Mercari 分は読み込み先が robots.txt で Disallow）。状態の値は Buyee が**英語に置き換えて表示**するので、対応表が必要。実ブラウザでの確認を条件に進める |
| **ZenMarket** | **条件付き（保留寄り）** | 規約ページ・商品ページとも **403 で読めなかった**。自動翻訳を提供していることは二次情報で確認。規約全文を人が読むまで実装しない |
| FromJapan | 保留 | 商品ページが 403。robots.txt 上は商品パスは Disallow ではない |
| Neokyo | 保留 | robots.txt が `*/product/` を全クローラーに Disallow しているため**取得しなかった** |
| Jauce | No-go（現時点） | TLS 証明書の期限切れでつながらず（curl: certificate has expired）。安全上も対象外 |

自分たちの約束（**外部通信なし・データ収集なし・Shadow DOM のパネルを追加するだけ**）は、どの代理購入サイトでもそのまま守れる。論点は「規約」より「**ページに日本語の原文が出ているか**」と「**後から読み込まれる DOM に追いつけるか**」。

---

## 1. 規約（Terms of Service）

### 1-1. Buyee（運営: tenso, inc. ／ 決済は tenso Hong Kong Limited）

出典: https://buyee.jp/help/common/terms （英語版。改定履歴の最新は「28/Jul/2026 amended」）

| 論点 | 該当条項 | 抜粋（短く） | 読み方 |
|---|---|---|---|
| 禁止事項（運営妨害） | 第20条1項7号 | "An act that obstructs operation of the Service." | 読むだけの拡張は運営を妨げない。リクエストを増やさないことが前提 |
| 設備の不正利用 | 第20条1項5号 | "An act that illegally uses the Company's or other third party's equipment or obstructs operation of such equipment." | 同上 |
| 包括条項 | 第20条1項8号 | "Any other act that the Company deems inappropriate." | **唯一の不確定要素**。運営の判断次第 |
| 知的財産 | 第20条1項2号 | "An act that infringes any trademark right, copyright, ... or other intellectual property right" | 出品文を保存・転載しないので該当しにくい。パネルは用語の解説で、原文の複製ではない |
| 自動アクセス・スクレイピング・クローリング | なし | 明文の条項は見当たらない | ― |
| ブラウザ拡張・第三者ソフト | 第21条7項・8項（免責のみ） | "does not guarantee in any way the operation of any equipment or software used by Members" | 禁止ではなく、動作の保証をしないという免責 |
| 表示の改変・重ね表示 | なし | 明文の条項は見当たらない | ― |
| リバースエンジニアリング | なし | ― | ― |
| **翻訳** | 第17条1項・2項 | "The Company may provide translated texts of the product descriptions..." / "include automatic translation by computer systems" / "provided for reference purposes only" / "makes no guarantees regarding the accuracy" | **Buyee 自身が機械翻訳を提供し、正確さは保証しない** |
| **商品説明の定義** | 第12条2項 | "The Product Description refers only to text written by the Merchant or store operator" / "does not include the output of automatic translation." | **拠り所になるのは日本語の原文**。原文の用語を解説するという私たちの価値と一致する |
| 第三者情報の免責 | 第21条3項、第9条3項 | "bears no responsibility for the content of information clearly provided by a party other than the Company" | 出品情報の責任は出品者側 |

robots.txt（https://buyee.jp/robots.txt）: `User-agent: *` に対し `/api/v1/`、`/internalapi/`、`/mypage/`、`/ya/`、`/payments/` などに加えて **`/mercari/item/description/`** を Disallow。`/item/` と `/mercari/item/`（商品ページ本体）は Disallow されていない。
→ Mercari 商品の**説明文は別のエンドポイントから後で読み込まれる**ことを示している。拡張はこのエンドポイントを自分で叩かず、ページ自身の JS が DOM に描いた後の文字列を読むだけにする（robots.txt はクローラー向けの決まりで、利用者がブラウザで開いたページには及ばないと理解している。ただし念のため明記）。

### 1-2. ZenMarket（運営: ZenGroup Inc.、大阪）

- 規約URL: https://zenmarket.jp/en/useragreement.aspx → **HTTP 403（WebFetch・curl とも）で本文を確認できず**。
- robots.txt: `https://zenmarket.jp/robots.txt` は 404（規則の掲示なし）。ただしサイト全体が自動取得を 403 で拒否している（ボット対策と思われる）。
- 検索エンジンの抜粋（二次情報・古い可能性あり）で分かったこと:
  - 免責の節に、商品タイトルと説明は "translated into the Client's language by means of automated translation" との記載あり。
  - 関連ページ https://zenmarket.jp/en/responsibility.aspx に、誤訳による購入の責任は負わない旨の記載あり。
  - 自動化について書かれているのは ZenMarket 側の自動入札・自動購入（ZenBot）のみ。利用者のスクレイピングや拡張機能に関する条項は、抜粋の範囲では**確認できなかった**。
- **要対応**: 人が通常のブラウザで規約全文を開き、禁止事項・知的財産・自動アクセスの条項を確認する。

### 1-3. その他（簡易）

| サイト | 規約 | robots.txt | メモ |
|---|---|---|---|
| FromJapan | 検索で見つからず、未確認 | https://www.fromjapan.co.jp/robots.txt: `/japan/s/`、`/japan/urlOrder/`、`/japan/tools/` などを Disallow。`Crawl-delay: 30` | 商品ページの推定パス（`/japan/en/auction/yahoo/input/<id>/`）は WebFetch で 403 |
| Neokyo | 未確認 | https://neokyo.com/robots.txt: `User-agent: *` に `Disallow: */product/` と `Disallow: /*?*`（Googlebot だけ `*/product/mercari/` を Allow） | **商品ページは robots.txt に従い取得しなかった** |
| Jauce | 未確認 | 取得失敗（TLS 証明書期限切れ） | 2026-10-09 時点でサイトの状態が不安定 |

---

## 2. ページ構造（2026-10-09 時点、各1件だけ確認）

### 2-1. Buyee

| 項目 | ヤフオク商品 | メルカリ商品 |
|---|---|---|
| URL パターン | `https://buyee.jp/item/jdirectitems/auction/<オークションID>`（検索結果からのリンクには `?conversionType=...` が付く） | `https://buyee.jp/mercari/item/<m+数字>`（同上） |
| タイトル | 日本語の原題。「Original Japanese Name:」の行もある | 同左 |
| 項目ラベルの言語 | **英語**（Item Condition、Starting Price、Domestic Shipping Fee Responsibility、Auction ID、Closing Time (JST) など） | **英語**（Item Condition、Shipping Paid By、Estimated shipping date など） |
| 状態の値 | **英語に置き換え済み**（例: やや傷や汚れあり → 英語表記） | **英語に置き換え済み**（例: 目立った傷や汚れなし → "No obvious damages/dirt"） |
| 返品ラベル | **なし**（ヤフオク本体の「返品」欄に当たる表示が見当たらない） | なし |
| 説明文 | 見出し「Item Explanation」はあるが、**サーバーが返す HTML の中には本文がない** | 同左。読み込み先は robots.txt で Disallow の `/mercari/item/description/` |
| 描画方式 | 本体はサーバー描画。説明文と画像は**JS で後から読み込まれる**（画像は `loading-spacer.gif` の仮画像） | 同左 |
| 原文と翻訳の切替 | 今回の取得では確認できず（JS 実行後に出る可能性） | 同左 |
| 自動取得 | curl は **HTTP 202（中身なし、ボット対策の確認画面と思われる）**。WebFetch は通った | 同左 |

**未確認で、実ブラウザでの確認が必要なこと**
1. 説明文が**日本語原文のまま DOM に入るか、機械翻訳だけか、切り替えられるか**。
2. 説明文が **iframe（別オリジン）** に入っていないか。別オリジンなら `all_frames` とその iframe のオリジンへの権限が必要になり、権限が広がる。
3. ページ内の遷移が SPA 的（pushState）かどうか。

### 2-2. ZenMarket

- 推定 URL パターン（未検証）: ヤフオク `https://zenmarket.jp/<lang>/auction.aspx?itemCode=<ID>`、メルカリ `https://zenmarket.jp/<lang>/mercariproduct.aspx?itemCode=<ID>`
- 2026-10-09 時点で **WebFetch・curl とも 403**。構造は未確認。
- 二次情報では、タイトルと説明を自動翻訳して表示する。原文が DOM に残るかどうかは未確認。

### 2-3. FromJapan / Neokyo / Jauce

上の 1-3 のとおり、構造は未確認（403、robots.txt で Disallow、TLS エラー）。

---

## 3. 推奨（サイトごと）

### 3-1. Buyee — 条件付き Go

**最小のマッチパターン（案）**
```
https://buyee.jp/item/jdirectitems/auction/*
https://buyee.jp/mercari/item/*
```
- `host_permissions` も同じ2行に絞る（`https://buyee.jp/*` にはしない）。`permissions` は空のまま。
- 実ブラウザの確認で SPA 遷移だと分かった場合だけ、メルカリと同じように `https://buyee.jp/*` にマッチさせ、スクリプト内でパスを判定する方式に切り替える（権限は広がるので、そのときに再判断する）。
- Buyee のラクマ・その他ストアのページは未確認なので対象外。

**抽出に必要なもの（説明のみ。実ページのセレクタはコピーしていない）**
- **タイトル**: 「Original Japanese Name:」の値、または `h1`。日本語原題なので既存の辞書がそのまま効く。
- **状態**: 英語ラベル「Item Condition」の隣の値。値は Buyee の英語表記なので、**ヤフオクとメルカリの標準6段階（新品、未使用に近い、目立った傷や汚れなし、やや傷や汚れあり、傷や汚れあり、全体的に状態が悪い）と Buyee の英語表記の対応表**を `data/glossary.json` 側に追加する。英語の値から日本語の標準語に戻して既存の解説を出す。
- **説明**: 見出し「Item Explanation」の後ろにある本文。**後から読み込まれる**ので、既存の SPA 追従（MutationObserver）で本文が入るまで待つ。読むのは日本語原文が DOM にある場合だけにする。英語訳しかない場合は「原文が見つからない」ことを表示し、英語訳を解析しない（誤訳を根拠に警告を出さない）。
- **返品**: ラベルがないので、説明文の中の「返品不可」「ノークレームノーリターン」などを辞書で拾う。
- `sites.js` には `CONDITION_LABELS` に英語ラベル（"Item Condition"）を足し、DESCRIPTION 側に "Item Explanation" を足す程度で済む見込み。

**リスク**
- 第20条1項8号（"deems inappropriate"）の包括条項。拡張は追加表示だけで通信もしないため影響は小さいとみるが、**弁護士確認の対象に加える**。
- パネルを Buyee 自身の UI（入札ボタン、費用表示など）に重ねない。位置は画面の隅に固定し、閉じられるようにする（今の実装と同じ）。
- Buyee のロゴや名前を、提携しているように見える形で使わない。ストアの説明文では「works on pages you open at Buyee」程度の事実の記載にとどめる。
- 説明文の読み込みに失敗するページがある（Buyee 自身が「表示されないことがある、元のページを見てほしい」と案内している）。その場合は空のまま何も推測しない。
- ボット対策（curl に 202）があるため、拡張から**決して fetch しない**という今の方針を維持する。

### 3-2. ZenMarket — 条件付き（規約を読むまで実装しない）

- 想定パターン（未検証）: `https://zenmarket.jp/*/auction.aspx*`、`https://zenmarket.jp/*/mercariproduct.aspx*`
- 条件: ① 規約全文を人が確認する ② 実ブラウザで「日本語原文が DOM にあるか」「状態の値の言語」「iframe かどうか」を確認する。
- リスク: 規約が未確認。自動翻訳だけを表示している場合は、私たちの日本語辞書が使えず価値が小さい。

### 3-3. FromJapan / Neokyo / Jauce

- FromJapan: 保留（403。規約も未確認）。
- Neokyo: 保留。robots.txt が商品パスを全クローラーに Disallow している。拡張自体はクローラーではないが、運営が商品ページの機械的な扱いを嫌う意思表示とみて、優先度は下げる。
- Jauce: No-go（TLS 証明書切れ。利用者に勧めるべきでない状態）。

---

## 4. 自分たちの約束との照合

| 約束 | 代理購入サイトでの影響 |
|---|---|
| 外部通信なし | 影響なし。Buyee の説明文は**ページ自身の JS が読み込んだ後の DOM を読む**だけ。Disallow のエンドポイントは叩かない |
| データ収集なし | 影響なし。保存も送信もしない |
| Shadow DOM のパネルを追加するだけ | 影響なし。Buyee の規約に「表示の改変」を禁じる明文はないが、ヤフオク規約8.3と同じ配慮で、元の要素は書き換えない |
| 権限は最小 | 上の2パターンだけを追加。`https://buyee.jp/*` 全体や `all_frames` は、確認の結果どうしても必要になったときだけ再検討 |

## 5. 次の一手

1. 人が実ブラウザ（ログインなし）で Buyee のヤフオク商品とメルカリ商品を2〜3件ずつ開き、2-1 の「未確認」3点を `docs/live-check-checklist.md` の形式で記録する（HTML は保存しない）。
2. Buyee の状態値（英語）とヤフオク・メルカリ標準6段階の対応表を作る。
3. ZenMarket の規約全文を人が読み、第1節の表を埋める。
4. Buyee 規約の第20条1項8号を弁護士確認の項目に加える。

## 参照 URL（すべて 2026-10-09 アクセス）

- Buyee 利用規約（英語版）: https://buyee.jp/help/common/terms
- Buyee robots.txt: https://buyee.jp/robots.txt
- Buyee 商品ページの例（構造確認のみ）: https://buyee.jp/item/jdirectitems/auction/v1247643714 、https://buyee.jp/mercari/item/m87341511730
- ZenMarket 規約（403で本文未確認）: https://zenmarket.jp/en/useragreement.aspx
- ZenMarket の責任範囲（検索の抜粋のみ）: https://zenmarket.jp/en/responsibility.aspx
- FromJapan robots.txt: https://www.fromjapan.co.jp/robots.txt
- Neokyo robots.txt: https://neokyo.com/robots.txt
- Jauce: https://jauce.com/robots.txt（TLS エラー）
