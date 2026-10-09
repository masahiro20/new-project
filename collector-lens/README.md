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
test/                  node:test + jsdom のテスト
test/fixtures/         自作の模擬 HTML（実サイトのコピーではない）
scripts/               辞書生成・辞書チェック・dist 出力・アイコン生成
```

## 使い方（開発者のみ）

```bash
cd collector-lens
npm install          # jsdom（テスト用）のみ
npm test             # 辞書の鮮度チェック → 辞書品質ゲート → テスト
npm run package      # dist/ を作る
```

Chrome で `chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」→ `collector-lens/dist` を選択。

## 辞書の運用

- 原本は `data/glossary.json`。1語ごとに `ja`（表記ゆれ）、`en`、`explain`、`genre`、`category`、`risk`、`reviewed`。
- `reviewed: true` は人の目で意味と危険度を確認済みという印。`npm test` はカメラ・時計の確認済み語が100語未満だと失敗します。
- 編集後は `npm run build:data` で `src/glossary-data.js` を再生成。

## 既知の制約

- 実サイトの HTML を保存しない方針のため、抽出は「商品の状態」「返品」「商品説明」などの**見出しラベル**を手がかりにしています。実ページでの手動確認がまだです（次の一手）。
- 否定表現（「カビなし」）は欠陥カテゴリの語だけを対象に、同じ文の直後を見る簡易ルールです。
- 「相場より極端に安い」の判定は相場データが必要なため未実装（自動収集はしない方針）。
