# デモ決済（PAYMENTS_MODE）— 減算ゼロ版

本物の課金を始めるまでは、決済を **demo** で動かす。demo ではお金は動かず、決済のために外部を呼ばない。
Stripe のキーを環境変数に入れるだけで、コードを変えずに本物の課金（stripe）に切り替わる。
Budget Guard（`peter/p2-signal-lab` の `signal-lab/budget-guard/docs/demo-payments.md`）の設計を、サーバーに何も保存しない P0 向けに縮めたもの。

## 1. モードの決まり方

| `PAYMENTS_MODE` | `STRIPE_SECRET_KEY` | 動作 |
|---|---|---|
| 未設定 | 未設定 | **demo** |
| 未設定 | 設定あり | **stripe** |
| `demo` | どちらでも | **demo**（本番でも動く） |
| `stripe` | 設定あり | **stripe** |
| `stripe` | 未設定 | **エラー**（購入 API は失敗する） |
| その他の値 | — | **エラー** |

- 判定は `lib/payments/mode.ts` の `getPaymentsMode(env)` だけで行う（import なしの純粋関数）。
- `LAUNCH_MODE=free` のときは、モードに関係なく購入画面そのものを出さない（無料公開モードが優先）。
- 旧 `PAYMENT_DISABLED` は廃止した。
- ページはビルド時に静的生成するので、モードを変えたら**再ビルド**する（バナーの有無もビルド時に決まる）。

## 2. 画面と表示

| 状態 | 表示 |
|---|---|
| demo（`LAUNCH_MODE` 未設定） | 全ページの先頭に「デモ：実際の請求はありません」。購入確認の表示も「デモ決済」になる。特商法ページとリンクは出さず、利用規約・プライバシーは「減算ゼロ運営事務局／連絡先：準備中」 |
| stripe | バナーなし。特商法ページを表示（【要記入】を埋めてから切り替える） |
| `LAUNCH_MODE=free` | 購入の導線なし（従来どおり） |

## 3. demo の購入フロー

### AI のキーがあるサーバー環境（Vercel・Cloudflare Workers）
1. `/generate` で「全書類セットを作る」を押す。`/api/checkout` が署名付きトークン `demo_<payload>.<署名>` を作り、`/checkout/demo?token=…` に移る。
   - payload は `{h: 入力内容のハッシュ, p: 0, t: 発行時刻}`。署名は `DEMO_SIGNING_SECRET` による HMAC-SHA256（Web Crypto なので Node と Workers の両方で動く）。
   - 未払いのトークンは1時間で失効する。
2. カード番号・有効期限・CVC・名義を入力する。テストカードは `4242 4242 4242 4242`。
   - **カード情報はブラウザの中で形式を確認するだけで、サーバーには送らない。** 入力欄は `autocomplete="off"`、送信後に空にする。
3. 「デモで支払う」を押すと、`/api/checkout/demo` がトークンを「支払い済み（p: 1、7日間有効）」に署名し直し、`/generate?session_id=…` に戻す。
4. `/api/generate` は、選ばれたプロバイダでトークンを確認する（署名、期限、支払い済み、入力内容のハッシュが一致するか）。そのうえで3セットを作成する。
   - demo の作成は無料でできてしまうため、IP ごとに1時間6回（2セット分）までに制限している。

### 静的ホスティング（GitHub Pages など。サーバーも AI もない）
- トップページの料金欄に「デモで購入を体験する」を出し、`/checkout/demo` に移る。
- カードの形式確認まではブラウザ内で行い、完了画面で「デモ購入が完了しました（請求はありません）」と表示して、書類サンプルへ案内する。通信は一切しない。

## 4. 安全のための決まり

- **demo ではお金が動かず、Stripe には一切つながない。**
- **stripe モードでは demo のトークンをすべて拒否する**（`lib/payments/index.ts` の `isPaid`）。`/api/checkout/demo` も demo モード以外では 404 を返す。
- 本番で `DEMO_SIGNING_SECRET` が未設定のとき、demo のトークン作成・確認は失敗する（購入 API が 502、生成 API が 402）。開発環境（`NODE_ENV` が production 以外）だけ、固定の開発用の値を使う。
- 署名鍵を変えると、発行済みの demo トークンはすべて無効になる。

## 5. ファイル

| ファイル | 役割 |
|---|---|
| `lib/payments/mode.ts` | `getPaymentsMode` / `isDemoMode` / `DEMO_BANNER` |
| `lib/payments/card.ts` | カード検証（Luhn・未来の有効期限・3〜4桁の CVC・名義）。Budget Guard からそのまま移植 |
| `lib/payments/demo.ts` | 署名付きトークンの作成・支払い・確認 |
| `lib/payments/index.ts` | `createCheckout(inputHash)` / `isPaid(id, inputHash)`。プロバイダを選ぶ唯一の場所 |
| `lib/stripe.ts` | stripe 実装（従来どおり） |
| `lib/launch.ts` | `salesEnabled`（購入の導線を出すか）、`liveBilling`（本物の課金か）、`demoPurchase` |
| `app/checkout/demo/` | デモ決済の画面 |
| `app/api/checkout/demo/route.ts` | demo トークンを支払い済みにする |
| `tests/payments.test.mjs` | モード判定の表、カード検証、トークンの改ざん・入力ハッシュ不一致の拒否（`npm test`） |

## 6. Stripe へ切り替える

1. 特商法ページ（`app/legal/page.tsx`）、利用規約、プライバシーポリシーの【要記入】を埋める。
2. Stripe のテストモードでキーを発行し、`STRIPE_SECRET_KEY=sk_test_…` を設定する。
3. `PAYMENTS_MODE` は**未設定のまま**にするか、`stripe` にする。`demo` が残っていると、キーがあっても demo のまま。
4. 再ビルド・再デプロイする。バナーが消え、特商法ページが表示される。テストカードで決済の往復を確認する。
5. live キー（`sk_live_…`）に替えるときも、変えるのは環境変数だけ。
