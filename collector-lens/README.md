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

## 設計上の約束（規約・プライバシー）

| 約束 | どう守っているか |
|---|---|
| 開いているページの DOM だけを読む | `src/content.js` は `document` を読むだけ。`fetch` / `XMLHttpRequest` / 他タブへのアクセスは一切なし |
| サーバーを持たない | 外部通信なし。辞書は拡張に同梱（`src/glossary-data.js`） |
| 自動収集をしない | 他ページを開かない・巡回しない・保存しない |
| 権限は最小 | `permissions` は空。`host_permissions` と `content_scripts.matches` は対象4ドメインのみ（`page.auctions.yahoo.co.jp`、`jp.mercari.com`、`item.fril.jp`、`order.mandarake.co.jp`） |
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
src/landed-cost.js     総額計算エンジン（v1.1・純粋関数。拡張にはまだ組み込んでいない）
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
- コードは `chrome.*` API を使っていないため、変更は不要です（テストで確認）。
- `addons-linter` でエラー・警告0件。実機の Firefox での表示確認はまだです（作業環境に Firefox がないため）。

## 辞書の運用

- 原本は `data/glossary.json`。1語ごとに `ja`（表記ゆれ）、`en`、`explain`、`genre`、`category`、`risk`、`reviewed`。
- `reviewed: true` は人の目で意味と危険度を確認済みという印。`npm test` はカメラ・時計の確認済み語が100語未満だと失敗します。
- 編集後は `npm run build:data` で `src/glossary-data.js` を再生成。

## 総額計算（v1.1・試作中）

設計は `docs/v1.1-total-cost-design.md`。実装状況は同書 §11。

- `src/landed-cost.js` の `CollectorLens.landedCost(input, tables, today)` が、商品価格・国内送料・代行手数料・国際送料・輸入税を**幅（low〜high）**で返します。各行に状態（ok / stale / unknown / user）、確認日、出典が付きます。
- 料金表は `data/rates/`（meta・proxies・shipping・destinations）。**今は構造だけで、数値はすべて null（要確認）です。** 公式の公開情報で人が確認してから埋めます。`npm run check:rates`（`npm test` にも含む）が、型、ISO 日付、通貨コード、部品の種類、端数処理、「値があれば確認日と出典が必須」を検査します。`meta.status` が `placeholder` の間は、値を1つでも入れると失敗します。
- テストとデモは `test/fixtures/rates/` の**架空の**料金表（Proxy A / Proxy B）だけを使います。
- デモ（`npm run build:demo`）の下部に「Estimated total (preview)」欄があります。架空の料金表であることを画面に明記しています。
- **拡張本体（manifest の content_scripts）にはまだ入れていません。** パネルに出すには、選択内容を保存する `storage` 権限の追加と、Pro（課金）の扱いについてオーナー承認が必要なためです（設計書 §8・§9）。manifest・権限・通信は変えていません。

## 既知の制約

- 実サイトの HTML を保存しない方針のため、抽出は「商品の状態」「返品」「商品説明」などの**見出しラベル**を手がかりにしています。実ページでの手動確認がまだです（次の一手）。
- 否定表現（「カビなし」）は欠陥カテゴリの語だけを対象に、同じ文の直後を見る簡易ルールです。
- 「相場より極端に安い」の判定は相場データが必要なため未実装（自動収集はしない方針）。
