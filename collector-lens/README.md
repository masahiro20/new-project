# Tanuki Scout（仮の名前）— Listing Decoder 試作

> 2026-10-09 本部決定で仮の名前を「Collector Lens」から「Tanuki Scout」に変更（`docs/naming.md`）。ディレクトリ名 `collector-lens/` と内部の名前空間 `CollectorLens` はそのまま。

> **仮称です。** 商標調査（USPTO・J-PlatPat の9類・42類）が済むまで正式名称を決めません。
> **外部非公開の試作です。** Chrome Web Store への公開、LP、告知はしていません。

日本の出品ページ（ヤフオク → メルカリ → ラクマ → まんだらけ の優先順）を開くと、
右下に英語のパネルを出す Chrome 拡張（Manifest V3）です。カメラと時計を最優先にしています。

- **Condition** — 「目立った傷や汚れなし」などの状態表記を英語で解説
- **Grade** — ショップのランク（S / A / AB / B …）や輸出業者式（Exc+++、Mint など）を解説
- **Returns** — 「返品不可」「ノークレームノーリターン」などの返品条件を解説
- **Warnings** — ルールに基づく危険信号（ジャンク、動作未確認、真贋不明・コピー品、カビ・くもり、リダン 等）
- **Seller states** — 安心材料（動作確認済み、OH済み、「カビ・くもりなし」のような否定表現）
- **Estimated total** — 海外の自宅に届くまでの総額の目安（v1.1・試作。パネルの最後に、閉じた状態で表示）

## 設計上の約束（規約・プライバシー）

| 約束 | どう守っているか |
|---|---|
| 開いているページの DOM だけを読む | `src/content.js` は `document` を読むだけ。`fetch` / `XMLHttpRequest` / 他タブへのアクセスは一切なし |
| サーバーを持たない | 外部通信なし。辞書と料金表は拡張に同梱（`src/glossary-data.js`、`src/rates-data.js`） |
| 自動収集をしない | 他ページを開かない・巡回しない。出品の内容や URL は保存しない |
| 権限は最小 | `permissions` は `["storage"]` だけ（総額欄の設定を端末内に保存するため。2026-10-09 本部承認）。`host_permissions` と `content_scripts.matches` は対象4ドメインのみ（`page.auctions.yahoo.co.jp`、`jp.mercari.com`、`item.fril.jp`、`order.mandarake.co.jp`） |
| 保存は設定だけ | `chrome.storage.local` を使うのは `src/estimate-settings.js` だけ。保存するのは利用者が選んだ設定（宛先国・配送方法・代行業者・国内送料の帯・通貨ごとの為替レート）を1つのキーにまとめたものだけ。出品の文字・価格・入札額・重量・URL は保存しない。`storage.sync` は使わない（テストで確認） |
| ページの見た目を変えない | 閉じた Shadow DOM の中にパネルを追加するだけ。元の要素は書き換えない（ヤフオク規約8.3「改変」の論点への配慮。解釈は弁護士確認待ち） |
| ページ由来の文字列を安全に扱う | すべて `textContent` で描画（`innerHTML` 不使用） |

メルカリは SPA のため `jp.mercari.com/*` 全体にマッチさせ、スクリプト内で `/item/`・`/shops/product/` のときだけ動かします。

## ファイル構成

```
manifest.json          MV3 マニフェスト
data/glossary.json     用語辞書（原本。ここを編集する）
src/glossary-data.js   辞書から自動生成（npm run build:data）
src/analyzer.js        解析（純粋関数：用語検出・否定表現・ランク・ルール）
src/sites.js           サイト判定と出品情報の抽出（ラベル文字列ベース）
src/overlay.js         Shadow DOM のパネル
src/content.js         エントリポイント（SPA の再描画にも追従）
src/landed-cost.js     総額計算エンジン（v1.1・純粋関数）
src/rates-data.js      料金表から自動生成（npm run build:data）
src/features.js        機能フラグ（landedCost: true / proBilling: false）
src/estimate-section.js  パネルの「Estimated total」欄
src/estimate-settings.js 総額欄の設定の保存（storage を使う唯一のファイル）
data/rates/            総額計算の料金表（雛形のみ。数値はすべて null＝要確認）
test/                  node:test + jsdom のテスト
test/fixtures/         自作の模擬 HTML（実サイトのコピーではない）
test/fixtures/rates/   架空の料金表（テストとデモ専用。実在の業者・料金・税率ではない）
scripts/               辞書生成・辞書チェック・料金表チェック・dist 出力・アイコン生成
```

## 使い方（開発者のみ）

```bash
cd collector-lens
npm install          # jsdom（テスト用）のみ
npm test             # 辞書の鮮度チェック → 辞書品質ゲート → 料金表スキーマ検査 → テスト
npm run package      # dist/ を作る
```

Chrome で `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」→ `collector-lens/dist` を選択。

## Firefox 版

同じソースから Firefox（AMO）用の zip を作れます。提出はしていません。

```bash
npm run package:firefox   # store/tanuki-scout-firefox-<version>.zip
```

- manifest に `browser_specific_settings.gecko`（ID、最低バージョン 142、データ収集なしの宣言）を加え、`minimum_chrome_version` を外します。
- コードが使う `chrome.*` API は `chrome.storage.local` の get／set だけで、Firefox の MV3 でもそのまま動きます。ほかの `chrome.*` を使っていないことはテストで確認しています。
- `addons-linter` でエラー・警告0件。実機の Firefox での表示確認はまだです（作業環境に Firefox がないため）。

## 辞書の運用

- 原本は `data/glossary.json`。1語ごとに `ja`（表記ゆれ）、`en`、`explain`、`genre`、`category`、`risk`、`reviewed`。
- `reviewed: true` は人の目で意味と危険度を確認済みという印。`npm test` はカメラ・時計の確認済み語が100語未満だと失敗します。
- 編集後は `npm run build:data` で `src/glossary-data.js` を再生成（料金表の `src/rates-data.js` も同時に再生成されます）。

## 総額計算（v1.1・試作中）

設計は `docs/v1.1-total-cost-design.md`。実装状況は同書 §11。

- `src/landed-cost.js` の `CollectorLens.landedCost(input, tables, today)` が、商品価格・国内送料・代行手数料・国際送料・輸入税を**幅（low〜high）**で返します。各行に状態（ok / stale / unknown / user）、確認日、出典が付きます。
- 料金表は `data/rates/`（meta・proxies・shipping・destinations）。**今は構造だけで、数値はすべて null（要確認）です。** 公式の公開情報で人が確認してから埋めます。`npm run check:rates`（`npm test` にも含む）が、型、ISO 日付、通貨コード、部品の種類、端数処理、「値があれば確認日と出典が必須」を検査します。`meta.status` が `placeholder` の間は、値を1つでも入れると失敗します。
- テストとデモは `test/fixtures/rates/` の**架空の**料金表（Proxy A / Proxy B）だけを使います。
- デモ（`npm run build:demo`）の下部に「Estimated total (preview)」欄があります。架空の料金表であることを画面に明記しています。

### パネルの「Estimated total」欄（2026-10-09）

- パネルの最後に、**閉じた状態で**表示します。開くと、上限入札額（または価格）、国内送料の帯、代行業者、配送方法、宛先国、重量、為替レートを入力でき、合計の幅と、内訳（各行の状態・確認日・出典）と警告を出します。
- 料金表は `data/rates/` から `src/rates-data.js` を生成して同梱します（`npm run build:data`。`npm test` が古さを検査）。**今は値がすべて null のため、商品価格と国内送料以外の行は「Not confirmed yet — excluded」になり、合計に入りません。** 代行業者は料金表にあるものだけを出します（規約の確認が済んでいない業者は料金表に入れない。Buyee は法務確認まで出さない）。
- 価格：`sites.js` はまだ価格を読み取らないため、上限入札額の欄は空で始まります。空のままなら合計は出ず、入力をうながします（読み取れるようになれば、その価格を「現在価格」として使い、警告を出す作り）。
- 重量はジャンル別の初期値（入力欄の薄い文字）を使い、上書きはその出品だけ（保存しない）。為替レートは同梱の参考レートがあれば使い、なければ利用者が入力します（外部通信なし）。
- 画面には「Rough estimate. Fees, shipping and taxes change; check with your proxy and carrier.」と明記します。
- 入力欄のキー操作（keydown／keyup／keypress／beforeinput／input）はパネルで止め、マーケットのショートカットが反応しないようにしています。ただし、ページ側が capture で受け取るキーは止められません（実ページで確認が必要）。
- 選んだ設定（宛先国・配送方法・代行業者・国内送料の帯・通貨ごとの為替レート）だけを `chrome.storage.local` の1つのキー（`tanukiScout.estimateSettings.v1`）に保存します。storage がない環境（jsdom など）では保存せずに動きます。

### 機能フラグ（`src/features.js`）

```js
CollectorLens.FEATURES = { landedCost: true, proBilling: false }
```

- `landedCost`：`false` にすると総額欄を出しません。
- `proBilling`：**`false` のまま（2026-10-09 本部決定）。** 何も課金で制限せず、決済のコード（ExtensionPay など）も入れていません。`true` にしても今は何も変わりません。課金を入れるときは、オーナー承認のうえで、通信・権限・プライバシー表記の変更とあわせて別の作業として行います。

## 既知の制約

- 実サイトの HTML を保存しない方針のため、抽出は「商品の状態」「返品」「商品説明」などの**見出しラベル**を手がかりにしています。実ページでの手動確認がまだです（次の一手）。
- 否定表現（「カビなし」）は欠陥カテゴリの語だけを対象に、同じ文の直後を見る簡易ルールです。
- 「相場より極端に安い」の判定は相場データが必要なため未実装（自動収集はしない方針）。
