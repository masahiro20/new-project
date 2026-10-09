# デモ決済（PAYMENTS_MODE）

本物の課金を始めるまでは、決済を **demo プロバイダ** で動かす。demo ではお金は動かず、外部サービスも呼ばない。
Stripe のキーを環境変数に入れるだけで、コードを変えずに本物の課金（stripe）に切り替わる。

## 1. PAYMENTS_MODE

| `PAYMENTS_MODE` | `STRIPE_SECRET_KEY` | 動作 |
|---|---|---|
| 未設定 | 未設定 | **demo** |
| 未設定 | 設定あり | **stripe** |
| `demo` | どちらでも | **demo**（`NODE_ENV=production` でも動く） |
| `stripe` | 設定あり | **stripe** |
| `stripe` | 未設定 | **エラー**。起動時（`instrumentation.ts`）にエラーを記録し、以後すべてのリクエストが 500 になる（フェイルクローズ。プロセス自体は終了しない） |
| その他の値 | — | **エラー** |

- 判定は `lib/payments/mode.ts` の `getPaymentsMode(env)` だけで行う。env を引数で受け取る純粋関数なので、単体テストできる。
- 旧 `dev` プロバイダと `PAYMENT_DISABLED` は廃止した。キーがあっても demo にしたいときは `PAYMENTS_MODE=demo` を使う。
- demo の間は、全ページの先頭に「**デモ：実際の請求はありません** / Demo mode: no real charges」を表示する。カード入力ページと購入完了ページにも表示する。
  - 静的ページのバナーは**ビルド時の `PAYMENTS_MODE`** で決まる。実行時のモードがビルド時と違えば、決済（`/api/checkout`、デモの支払い・ポータル）を止める。そのため、古いバナーが本物の課金の上に残ることはない。モードを変えたら再ビルドする（docs/deploy-cloudflare.md §2.2）。

## 2. PaymentProvider

`lib/payments/types.ts` で定義する。実装は2つだけ。

```ts
interface PaymentProvider {
  name: "demo" | "stripe";            // Entitlement.source にもなる
  ownsCheckoutId(id): boolean;        // demo_… / cs_…
  createCheckout(plan, {email}): Promise<string>;     // 遷移先URL
  getCompletedCheckout(id): Promise<CompletedCheckout | null>;
  createPortalUrl(entitlement): Promise<string>;
  findCheckoutIdByLicense(key): Promise<string | null>;
  saveLicense(entitlement): Promise<void>;
}
```

| ファイル | 役割 |
|---|---|
| `lib/payments/mode.ts` | `getPaymentsMode` / `isDemoMode` / `showDemoBanner`（import なし） |
| `lib/payments/index.ts` | `getPaymentProvider()`（新規購入の唯一の選択点）、`providerForCheckout(id)`、`fulfillCheckout`、`resolveEntitlement` |
| `lib/payments/demo.ts` | demo 実装（KV に保留中のチェックアウトを保存し、支払い済みにする） |
| `lib/payments/card.ts` | カード検証（Luhn・未来の有効期限・3〜4桁の CVC・名義）。ブラウザとサーバーの両方で使う |
| `lib/payments/stripe.ts` | stripe 実装（従来のコードをそのまま移動）。当面はテストモードのキーを想定 |
| `lib/payments/stripe-webhook.ts` | Stripe webhook の処理（変更なし。`stripeProvider` を明示して渡す） |
| `instrumentation.ts` | 起動時に `lib/startup-checks.ts` を実行する（`getPaymentsMode` と、`ACCESS_SECRET`・`TOKEN_ENCRYPTION_KEY` の確認）。設定ミスならエラーにする（全リクエストが 500）。Cloudflare Workers でも動く（docs/deploy-cloudflare.md §8.2.1） |

## 3. demo の購入フロー

1. `/pricing` で「Buy now（購入）」を押す。`/api/checkout` が `demo_` + 24文字の ID を作り、KV に保存する（未払いのまま1時間で失効）。
2. `/checkout/demo?id=demo_…` でカード番号・有効期限・CVC・名義を入力する。メールアドレスは任意。
   - テストカードは `4242 4242 4242 4242` で、プレースホルダーにも表示している。
3. 「デモで支払う」を押すと、`POST /api/checkout/demo` がもう一度検証してから支払い済みにする（Origin チェック・レート制限あり）。保存するのは末尾4桁だけ。`/success` は `POST /api/checkout/complete` で権利を発行する。
4. `/success?session_id=demo_…` で `fulfillCheckout` が権利（`source: "demo"`）とライセンスキーを発行する。
5. 「Open the app」を押すと `/app` に移り、上部に「Plan: Monthly · active（デモ / demo）」と表示される。
6. 「Manage billing」を押すと `/checkout/demo/portal` に移る。ここでデモプランを解約・再開できる（Stripe の請求ポータルの代わり）。

## 4. 安全のための決まり

- **demo ではお金が動かず、決済のために外部を呼ばない。** Stripe には一切つながない。
  - ライセンスメールは `RESEND_API_KEY` が未設定ならログに出すだけ。
  - demo の間は `cs_…` の照会も Stripe に投げない。
- **カード情報は保存もログ出力もしない。**
  - 入力欄は `autocomplete="off"` で、送信後にフォームは空になる。
  - KV に残すのは `last4` だけ。テストで、保存したレコードに全桁・有効期限・名義が含まれないことを確認している。
- **stripe モードでは demo の ID をすべて拒否する。** 次の箇所が対象：
  - `providerForCheckout`
  - `/checkout/demo`
  - 支払いとポータルの API（`/api/checkout/demo`、`/api/checkout/demo/portal`）
  - `/api/access/verify`
  - KV に残っている `source: "demo"` の権利も、stripe モードでは無効として扱う（`entitlementUsable`）。
  - 課金を始めたあとに、無料の権利が残ることはない。
- `PAYMENTS_MODE=demo` を**明示したとき**に限り、本番でも Upstash なし（メモリ上の KV）で起動できる。
  - プレビュー用の措置。インスタンス間で共有されず、再起動すると消える。
  - Vercel で複数のインスタンスが動く場合は、Upstash を設定する。
  - 自動判定で demo になった場合（キーなし）は、従来どおり Upstash が必須。
- 本番でキーがなく自動で demo になったときは、警告ログを出す。バナーも表示される。

## 5. Stripe へ切り替える

1. Stripe のテストモードでキーを発行する。
2. 環境変数を設定する。
   - `STRIPE_SECRET_KEY=sk_test_…`
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
     - Webhook の送信先は `https://<host>/api/stripe/webhook`。
     - 受け取るイベントは `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_failed`、`invoice.paid`（購入記録の7年保存に必要。docs/legal-changes.md §2.4）、`charge.refunded`。
   - `PAYMENTS_MODE` は**未設定のまま**にするか、`stripe` にする。`demo` が残っていると、キーがあっても demo のまま。
3. **価格IDは使わない。** `lib/payments/stripe.ts` が `product.config.ts` の `pricing.plans`（`amount` / `mode` / `interval`）から `price_data` をその場で作る。Stripe 側で商品を作る必要はない。
4. 本番では、次も必須（従来どおり）。
   - `NEXT_PUBLIC_SITE_URL`
   - `ACCESS_SECRET`
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
   - `TOKEN_ENCRYPTION_KEY`
   - `CRON_SECRET`
5. 再デプロイすると、起動ログに `[payments] mode=stripe` と出る。バナーは消える。
6. live キー（`sk_live_…`）に替えるときも、変えるのは環境変数だけ。

## 6. ほかのプロジェクトへ移す（例：リポジトリ直下の P0「減算ゼロ」）

P0 の現状：
- `lib/stripe.ts`（`createCheckoutUrl` / `isPaidFor` / `paymentDisabled`）
- `app/api/checkout/route.ts`
- `app/api/generate/route.ts`（`isPaidFor` で支払いを確認）
- `app/generate/GenerateClient.tsx`（`session_id` を受け取る）
- `.env.example`（`PAYMENT_DISABLED`）

**KV がなく、サーバーに何も保存しない**設計である。

1. **コピーする**（そのまま使える）
   - `lib/payments/mode.ts`
   - `lib/payments/card.ts`
   - `lib/payments/types.ts`。`PaymentProvider` は P0 用に縮める。P0 に必要なのは `createCheckout(inputHash)` と `isPaid(id, inputHash)` だけ。
2. **stripe 実装**：P0 の `lib/stripe.ts` を `lib/payments/stripe.ts` に移し、`ownsCheckoutId`（`cs_…`）を加える。
3. **demo 実装**：P0 には KV がないので、保留中の記録は持たない。
   - チェックアウトIDを **HMAC 署名付きトークン** にする（例：`demo_<base64url{inputHash, paid, iat}>.<sig>`）。
   - 支払いの Server Action で `paid: true` のトークンを署名し直して、`/generate?session_id=…` に戻す。
   - 署名鍵の環境変数を1つ追加する（例：`DEMO_SIGNING_SECRET`）。
4. **選択点**：`lib/payments/index.ts` に `getPaymentProvider()` と `providerForCheckout(id)` を置く。
   - `app/api/checkout/route.ts` の `paymentDisabled()` 分岐をこれに置き換える。
   - `app/api/generate/route.ts` の `isPaidFor` も、ここで選んだプロバイダ経由で確認する。
5. **画面**
   - `app/checkout/demo/page.tsx` と、カード入力のクライアントコンポーネントをコピーする。プラン表示は P0 の価格（`PRICE_JPY`）に差し替える。
   - `components/DemoBanner.tsx` を `app/layout.tsx` に入れる。
6. **起動時チェック**：`instrumentation.ts` と `lib/startup-checks.ts` をコピーする。
7. **環境変数**：`.env.example` の `PAYMENT_DISABLED` を削除し、`PAYMENTS_MODE=` を追加する。
8. **テスト**：`tests/payments.test.ts` のうち、モード判定の表・カード検証・stripe モードで demo の ID を拒否する部分を移す。
