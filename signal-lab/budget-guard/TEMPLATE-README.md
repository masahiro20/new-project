# Signal Lab 48時間ローンチテンプレート

`product.config.ts` を1ファイル書き換えるだけで、LP・Stripe 決済・OGP・待機リスト・法務ページ・アクセス制御までが揃う Next.js 16 テンプレートです。本体の機能は `app/(product)/app/` にだけ書きます。

- Next.js 16（App Router / Turbopack / `proxy.ts`）、React 19、stripe 23、zod 4、jose、Upstash Redis、Resend（REST）
- 環境変数がひとつもなくても `npm run dev` と `npm run build` が通ります（下記「開発用フォールバック」）

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # next typegen && tsc --noEmit
npm test           # vitest
npm run build
```

## 1ローンチの流れ

1. このディレクトリをコピー（または GitHub の「Use this template」）して新しいリポジトリを作る
2. `product.config.ts` を書く（下記）。不正な値があると `next build` が失敗します
3. まずは `launch.mode: "waitlist"` で LP をデプロイし、待機リストを集める
4. 本体を `app/(product)/app/` に実装する
5. `.env` を本番用に埋めて Vercel にデプロイし、Stripe の Webhook を登録する
6. `launch.mode` を `"presale"` か `"live"` に切り替える

## ローンチごとに変えるもの

| 変えるもの | 場所 |
|---|---|
| 製品名・説明・LP の文言・FAQ | `product.config.ts` の `name` / `tagline` / `landing` |
| 価格・プラン（買い切り／サブスク） | `product.config.ts` の `pricing`（金額は最小通貨単位。JPY は円、USD はセント） |
| 公開状態 | `launch.mode`：`waitlist`（待機リストのみ）／`presale`（先行販売）／`live` |
| アクセス制御 | `access.gate`：`license`（購入者のみ）／`none`（誰でも）。`sessionDays` は Cookie の有効日数 |
| OGP 画像の文字 | `og.title` / `og.subtitle`（**英数字のみ**。下記） |
| 特商法表記・返金・解約 | `product.config.ts` の `legal`。`【要記入】` のまま本番ビルドすると警告が出ます |
| 規約・プライバシーの本文 | `content/legal/terms.ts` / `privacy.ts`（雛形。製品に合わせて調整） |
| ブランドカラー | `brand.color` |
| 本体 | `app/(product)/app/` 以下 |
| 環境変数 | `.env.local`（ローカル）／Vercel の Environment Variables |

`app/` と `lib/` は config を読むだけなので、通常は触る必要はありません。固定 UI の文言（ボタン、エラーなど）は `lib/i18n.ts` で `locale`（`ja` / `en`）に応じて切り替わります。製品の文言は翻訳しません。特商法ページは英語版でも日本語で表示します。

## 環境変数

`.env.example` を `.env.local` にコピーして使います。

| 変数 | 必須 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 本番 | 公開 URL。Stripe の戻り先、OGP、sitemap に使用（ビルド時に埋め込み） |
| `STRIPE_SECRET_KEY` | 本番 | Stripe のシークレットキー |
| `STRIPE_WEBHOOK_SECRET` | 本番 | Webhook 署名シークレット |
| `ACCESS_SECRET` | 本番 | アクセス Cookie（JWT HS256）の署名鍵。32文字以上 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 本番 | KV（待機リスト、entitlement、トークン、集計） |
| `RESEND_API_KEY` / `MAIL_FROM` | 推奨 | ライセンスキー、マジックリンク、待機リストの確認メール |
| `ADMIN_TOKEN` | 任意 | `GET /api/admin/stats`（`Authorization: Bearer …`）で14日分の集計と待機リスト件数を返す |
| `PAYMENT_DISABLED` | 任意 | `true` で Stripe キーがあっても開発用チェックアウトを使う（本番では無視） |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 任意 | 複数インスタンス間で Server Action の暗号鍵を固定 |

価格と商品名は環境変数にしません（config に置きます）。

## 開発用フォールバック

| 未設定のもの | 開発時の動き | 本番（`NODE_ENV=production`）では |
|---|---|---|
| Upstash | メモリ上の KV（`createMemoryKV`）。再起動で消えます | リクエスト時にエラー（ビルドは通る） |
| Resend | メールをコンソールに出力し、直近20通を `devOutbox` に保持 | 警告を出してコンソール出力のみ |
| Stripe（または `PAYMENT_DISABLED=true`） | **開発用チェックアウト**：Stripe を通さずに購入完了→ライセンス発行→`/app` まで進む。料金ページに「開発モード」と表示 | 無効。Stripe キーが必須 |
| `ACCESS_SECRET` | 固定の開発用シークレット（警告を表示） | エラー |

## 仕組み

### 決済（`lib/stripe.ts`, `lib/payments/`）
- `POST /api/checkout` が Checkout Session を作成。Stripe 側で商品を事前に作らず `price_data` をインライン指定し、`metadata` に `product`（slug）と `plan` を付けます。買い切りは `customer_creation: "always"`、サブスクは `recurring`。`allow_promotion_codes` 有効
- `/success` は `cs_…` を retrieve して支払い済みを確認し、Webhook を待たずに entitlement を作成してライセンスキーを表示。「アプリを開く」で `/api/access/verify` に POST して Cookie を付けます（購入後24時間まで）
- `POST /api/stripe/webhook`：`request.text()` → `constructEvent` で署名検証 → `event.id` を `SET NX EX 7d` で重複排除。entitlement の更新は同期で行い、メール送信などは `after()` に回します。失敗時は event.id の記録を消して 500 を返すので、Stripe の再送で再処理されます

  | イベント | 処理 |
  |---|---|
  | `checkout.session.completed`（`async_payment_succeeded` も） | entitlement 作成、キーをメール送信、purchase +1 |
  | `customer.subscription.updated` | status を反映 |
  | `customer.subscription.deleted` | canceled |
  | `invoice.payment_failed` | ログのみ |
  | `charge.refunded` | 全額返金なら refunded（一部返金はアクセス維持） |

- `POST /api/portal`：Stripe カスタマーポータル（サブスクの解約・カード変更）。`/app` の「お支払い管理」から
- `lib/payments/types.ts` の `PaymentProvider` が決済事業者との境界です。MoR（Lemon Squeezy / Polar）に切り替えるときはこれを実装し、Webhook ルートを追加します

ローカルで Stripe を試す場合：`stripe listen --forward-to localhost:3000/api/stripe/webhook` で表示される `whsec_…` を `STRIPE_WEBHOOK_SECRET` に設定します。

### アクセス制御（`lib/access.ts`, `lib/session.ts`, `proxy.ts`）
- **ライセンスキー**：`SLAB-XXXX-XXXX-XXXX`（Crockford Base32、60ビット）。入力は大文字小文字・ハイフン・`O/I/L` の取り違えを吸収します。KV に逆引きを保存し、Stripe の Customer metadata（`{slug}_license`）にも保存するので、KV が消えても Stripe から復元できます
- **アクセス Cookie**：`{slug}_access`。jose の HS256 JWT（`aud` = slug）。httpOnly、本番は secure、sameSite=lax
- **マジックリンク**：15分有効・1回限り（KV にはトークンのハッシュだけを保存し `GETDEL` で消費）。未登録のメールにも同じ応答を返し、検索とメール送信は `after()` で行うので応答時間からも推測できません。リンクは `/access?token=…` に着地し、ボタンを押して初めて消費されます（メールのリンクスキャナ対策）
- **楽観的チェック**：`proxy.ts` は `/app` で Cookie の有無だけを見ます
- **本検証**：`requireAccess()` が署名と entitlement の状態（active / trialing / past_due）を毎回確認します。KV になければ Stripe を確認して再キャッシュします

### 待機リスト・集計
- 待機リストは `useActionState` ＋ Server Action（zod → レート制限 → `SADD {slug}:waitlist` → `after()` で確認メール）。ボット対策は honeypot（`company` 欄）のみ。既登録でも同じ応答
- 集計は `sendBeacon` → `/api/track` → `HINCRBY stats:{slug}:{YYYY-MM-DD}`。ブラウザから送れるのは `pageview` と `cta_click` だけで、`checkout_start` / `purchase` / `signup` はサーバー側で数えます。個人は識別しません

### OGP
`app/opengraph-image.tsx` / `twitter-image.tsx` / `icon.tsx` は `ImageResponse` でビルド時に静的生成します（`runtime = "edge"` は書かない）。**日本語フォントを同梱していないため、`og.title` / `og.subtitle` は英数字のみ**（config の検証で弾きます）。日本語にしたい場合は、サブセット化した `.ttf/.otf/.woff` を `lib/og.tsx` で `readFile` して `fonts` に渡し、`lib/config.ts` の `latin()` 検証を外してください（同梱物は500KBまで）。

### 法務
- `/legal/tokushoho`：ROWS 方式。サブスクのプランがあれば「契約の自動更新」「解約方法」の行が自動で増えます
- 料金ページの購入ボタンの直上に、改正特商法の最終確認表示（価格、支払時期、提供時期、自動更新、解約方法、返金条件）を出します（`components/PurchaseConfirm.tsx`）
- 規約・プライバシーは雛形です。公開前に必ず確認してください

## 本体（プロダクト）の書き方

```tsx
// app/(product)/app/page.tsx — layout で requireAccess() 済み
import { requireAccess } from "@/lib/session";
export default async function Page() {
  const access = await requireAccess(); // リクエスト内でキャッシュされるので何度呼んでもよい
  return <p>{access.gated ? access.plan : "open"}</p>;
}
```

**Server Action と Route Handler は proxy や layout を通らないことがある**ので、必ず各関数の先頭で確認します。

```ts
"use server";
import { requireAccess } from "@/lib/session";
export async function save(formData: FormData) {
  const access = await requireAccess(); // 未購入なら /access へリダイレクト
  // ...
}
```

```ts
// app/api/xxx/route.ts — リダイレクトではなく 401 を返したい場合
import { getAccess } from "@/lib/session";
export async function POST() {
  const access = await getAccess();
  if (!access) return Response.json({ error: "unauthorized" }, { status: 401 });
  // ...
}
```

プランで機能を分けるときは `access.plan`（config の plan id）を見ます。データを保存したい場合は `getKV()` と `key("…")` を使えば `{slug}:` 接頭辞付きで同じ Upstash DB に保存できます（開発時はメモリ）。

```ts
import { getKV, key, getJSON, setJSON } from "@/lib/redis";
const kv = getKV();
await setJSON(kv, key("notes", access.entitlement.id), { text: "…" }, { ex: 86400 });
```

## ディレクトリ

```
product.config.ts        ★ ローンチごとに変える
proxy.ts                 /app の Cookie 有無チェック
app/
  page.tsx               LP（静的生成、JSON-LD 付き）
  pricing/ success/ access/
  legal/{tokushoho,privacy,terms}/
  (product)/app/         ★ 本体（layout で requireAccess）
  actions/{waitlist,access}.ts
  api/{checkout,portal,stripe/webhook,access/verify,track,admin/stats}/
  opengraph-image.tsx twitter-image.tsx icon.tsx robots.ts sitemap.ts llms.txt/
components/              landing/*, WaitlistForm, BuyButton, PurchaseConfirm, PlanCard, Track, AccessForms
content/legal/           規約・プライバシーの雛形（ja / en）
lib/
  config.ts              config の zod 検証
  redis.ts               KV インターフェース（Upstash / メモリ）
  access.ts              JWT・マジックリンク（Next 非依存、テスト可能）
  session.ts             requireAccess / getAccess / grantAccess（next/headers を使う）
  entitlements.ts license.ts mail.ts ratelimit.ts analytics.ts i18n.ts site.ts stripe.ts og.tsx
  payments/              PaymentProvider 境界、開発用チェックアウト、Webhook 処理
tests/                   vitest
```

## 注意（Next.js 16）
- `middleware` ではなく `proxy.ts`。runtime 指定は不可
- `cookies()` / `headers()` / `params` / `searchParams` は await。ページの型は `PageProps<"/x">`（`next typegen` で生成）
- Cookie の設定は Server Action か Route Handler でのみ可能
- 同じディレクトリで `next dev` を2つ同時に立てない
- `cacheComponents` は無効のまま
