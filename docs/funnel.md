# 診断から購入までの導線の計測（設計）

対象：減算ゼロ（P0）。計測は GoatCounter（Cookie なし、集計のみ。docs/analytics.md）。オーナーが GoatCounter のアカウントを作り、`NEXT_PUBLIC_GOATCOUNTER_CODE` を付けて書き出すと有効になる。**個人や事業所を特定できる情報、入力内容、診断の回答は送らない。** 送るのはページのパスとイベント名だけ。

## 1. 段階と数えるもの

| 段階 | 何を見るか | GoatCounter のパス（イベント名） | どこで送るか |
|---|---|---|---|
| ① 訪問 | 解説・トップを見た | 各ページのパス（`/guide/...`、`/`） | 画面遷移ごと（app/Analytics.tsx） |
| ② 行動のきっかけ | 解説の「無料診断」「無料テンプレート」「サンプル」を押した | `cta-check`／`cta-templates`／`cta-samples` | 解説ページのボタン（app/TrackedLink.tsx） |
| ③ 診断 | 診断を始めた・途中から再開した・結果を見た（1回の訪問で1回だけ数える） | `check-start`／`check-resume`／`check-complete` | app/check/CheckClient.tsx |
| ③→④ | 診断結果から無料テンプレートへ進んだ | `check-to-template` | 診断結果の「無料で作る：…」「無料テンプレートの一覧」 |
| ④ 無料で作る | テンプレート・サンプル・チェックリストを Word/PDF で保存した | `template-download-{committee,training,restraint}`、`sample-download-…`、`checklist-download-{pdf,docx}` | /templates、/samples、各所のチェックリスト |
| ⑤ 有料版を試す（AI が有効なとき） | 無料お試し（年間計画）を始めた・できた | `preview-start`／`preview-complete` | app/generate/GenerateClient.tsx |
| ⑥ 購入 | 購入ボタンを押した → 購入して戻ってきた | `checkout-start` → `purchase-complete` | 同上（`purchase-complete` は決済後に初めて戻ったときだけ） |
| ⑦ 提供 | 書類セットができた | `set-generated-{committee,training,restraint}` | 同上 |
| （デモ） | デモ購入が完了 | `demo-purchase-complete` | /checkout/demo（デモ表示のときだけ） |

**判断に使う率**（週ごとに見る）

| 率 | 計算 | 集客計画の目安・判断 |
|---|---|---|
| 診断の完了率 | `check-complete` ÷ `check-start` | 50%未満なら設問の文言・並びを見直す（`check-resume` が多ければ、途中で離れる人が多い） |
| 診断 → テンプレートへ | `check-to-template` ÷ `check-complete` | 結果の「無料で作る」ボタンが押されているか |
| 診断 → 無料で作る | （`template-download-*` 合計）÷ `check-complete` | 診断結果の「次にやること」が効いているか |
| 解説 → 行動 | （`cta-*` 合計）÷ 解説のページビュー | 解説の上下のボタンの文言・位置 |
| 無料お試し → 購入 | `checkout-start` ÷ `preview-complete`、`purchase-complete` ÷ `checkout-start` | 決済ページでの離脱 |
| 購入 → 提供 | `set-generated-*` ÷（`purchase-complete` × 3） | 1未満なら生成の失敗（品質チェック docs/quality.md） |

**有料化の判断基準（集客計画 §4）との対応**：「無料診断の完了が累計30件」は `check-complete` の累計で見る。「診断100件で購入0件なら導線を直す」は `check-complete` と `purchase-complete` で見る。

## 2. 見方（GoatCounter）

- ダッシュボードの「Pages」に、ページとイベントが並ぶ（イベントは名前の左に印が付く）。期間を「週」にして、上の表の数を拾う。
- 参照元（Referrers）で、検索・X・note などの流入元を見る。
- 広告ブロッカーを使う人の分は数えられない。率の比較に使い、絶対数は控えめに読む。

## 3. 数えないもの（決めたこと）

- 診断の回答内容、テンプレートの入力内容、事業所名：送らない（プライバシーと信頼のため）。
- 個人ごとの追跡（同じ人が何回来たか）：Cookie を使わないのでできない。率は「回数」の比で見る。
- 決済の金額：Stripe のダッシュボードで見る（`purchase-complete` は回数だけ）。

## 4. 実装メモ

- イベント名は `lib/analytics.ts` の `AnalyticsEvent` に列挙している。増やすときはこの表も更新する。
- 計測が無効（コード未設定）のときは何も読み込まず、`trackEvent` は何もしない。
