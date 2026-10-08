<!-- Vega（P2 リーダー）の設計書。セッション間メッセージで受領し、本部で保存（元コミット 111ef15） -->
# P2 Signal Lab 48時間ローンチテンプレート 設計書

- 前提：Next.js 16.3.x / React 19.x / stripe ^23 / zod 4 / TypeScript 5.9 / Node.js 20.9 以上
- 状態：設計のみ（コードは未着手）

## 1. 結論
`product.config.ts` を1ファイル書き換えるだけで、LP・決済・OGP・待機リスト・法務ページ・アクセス制御までが揃う Next.js 16 のテンプレートを作る。

- **決済：** Stripe Checkout（ホスト型）＋ Webhook。買い切りとサブスクを設定で切り替える。
- **データ：** 購入状態の正は Stripe。アプリ側は Upstash Redis 1つだけ（待機リスト、ライセンスキーの逆引き、集計）で、RDB は使わない。
- **認証：** 認証基盤は入れない。ライセンスキー、署名付き Cookie、メールのマジックリンクで済ませる。
- **1ローンチの流れ：** GitHub の「Use this template」で作成し、config と .env を埋めて Vercel にデプロイする。

## 2. スコープ
| 含める | 含めない |
|---|---|
| LP（ヒーロー、課題、機能、価格、FAQ、CTA） | 本格的なユーザー管理 |
| Stripe Checkout、Webhook、カスタマーポータル | 自前の請求・税計算 |
| 動的 OGP（`opengraph-image.tsx`） | 管理画面（Stripe と Upstash のコンソールで代用） |
| 待機リスト＋自動返信1通 | メールマガジン機能 |
| 簡易アナリティクス（PV、CTA、購入） | ファネル分析・A/B 基盤 |
| `robots.ts`、`sitemap.ts`、`llms.txt` | 本格的な多言語化（en と ja の切替のみ） |
| 特商法表記、プライバシー、規約（雛形） | 弁護士レビュー済みの規約 |
| ライセンスキーとマジックリンク | |

本体機能は `app/(product)/app/` 以下にだけ置く。

## 3. ディレクトリ構成
```
signal-lab-template/
├── product.config.ts            # ★ ローンチごとに変えるのはここだけ
├── proxy.ts                     # /app 配下の楽観的チェック（Cookie の有無だけ）
├── next.config.ts
├── .env.example
├── content/legal/               # 規約の雛形（ja / en）
├── app/
│   ├── layout.tsx  page.tsx  opengraph-image.tsx  twitter-image.tsx  icon.tsx
│   ├── robots.ts  sitemap.ts  llms.txt/route.ts
│   ├── pricing/page.tsx  success/page.tsx  access/page.tsx
│   ├── legal/{tokushoho,privacy,terms}/page.tsx
│   ├── (product)/app/{layout.tsx,page.tsx}   # layout で requireAccess()
│   ├── actions/{waitlist.ts,access.ts}
│   └── api/{checkout,portal,stripe/webhook,access/verify,track}/route.ts
├── components/{landing/*,WaitlistForm.tsx,BuyButton.tsx,Track.tsx}
└── lib/{config,site,stripe,entitlements,access,license,redis,mail,ratelimit,analytics}.ts
```
- `app/` と `lib/` は config を読むだけで、値を直書きしない。
- Redis と Resend が未設定でも `next dev` が動くよう、フォールバックを用意する。

## 4. `product.config.ts`
`lib/config.ts` が zod で検証し、不正ならビルドを失敗させる。項目は次のとおり。

- `slug`、`name`、`tagline`、`locale`（en / ja）、`brand`、`links`
- `launch.mode`（waitlist / presale / live）
- `pricing`（currency と plans：id、label、amount〔最小通貨単位〕、mode：payment / subscription、interval、features）
- `access`（gate：none / license、magicLink、sessionDays）
- `landing`（hero、problem、features、faq、socialProof）
- `og`
- `legal`（販売者名など。「【要記入】」が残ったまま本番ビルドすると警告）

運用の方針：
- Stripe 側では商品を事前に作らない。`price_data` をインラインで指定し、`metadata` に product と plan を付ける。昇格したら `lookup_key` 方式に切り替える。
- 文言は多言語化しない。固定 UI の文言だけを en / ja で切り替える。

## 5. 機能ごとの設計

### 5.1 LP
- Server Component で静的生成する。`launch.mode` に応じて CTA を切り替える。
- JSON-LD（SoftwareApplication、FAQPage）を入れる。

### 5.2 決済
- **`POST /api/checkout`：**
  - zod で検証し、plan に応じた Checkout Session を作る。
  - 設定：`customer_creation: "always"`、metadata、`success_url` に `{CHECKOUT_SESSION_ID}` を渡す、`allow_promotion_codes`。
- **`/success`：**
  - `cs_` の形式を確認し、retrieve して支払い済みかを確かめる。Webhook を待たずに確定できる。
  - Server Component では Cookie を設定できないため、Server Action か `/api/access/verify` で Cookie を付けて `/app` へ移す。
- **Webhook：**
  - `await request.text()` で生のボディを受け取り、`constructEvent` で署名を検証する。
  - Node ランタイムのままにする（runtime は指定しない）。
  - 重複処理を防ぐため、`event.id` を `SET NX EX 7d` で記録する。
  - 重い処理は `after()` に回す。

| イベント | 処理 |
|---|---|
| checkout.session.completed | entitlement を作成、キーをメール送信、purchase を+1 |
| customer.subscription.updated | status を反映 |
| customer.subscription.deleted | canceled にする |
| invoice.payment_failed | ログのみ |
| charge.refunded | refunded にする |

- **`POST /api/portal`：** Stripe カスタマーポータルを開く（サブスクの解約導線）。
- **MoR（Lemon Squeezy / Polar）：** `lib/payments/` で境界だけ切っておき、当面は Stripe のみで動かす。

### 5.3 アクセス制御
1. **ライセンスキー：** `SLAB-XXXX-XXXX-XXXX`（Crockford Base32）。Redis に保存する。
2. **アクセス Cookie：** jose で HS256 署名。httpOnly、secure、sameSite=lax。
3. **マジックリンク：** 15分有効・1回限り。未登録のメールにも同じ応答を返し、登録の有無を推測させない。

- **楽観的チェック：** `proxy.ts` は `/app` で Cookie の有無だけを見る。
- **本検証：** layout、Server Action、Route Handler で毎回 `requireAccess()` を呼ぶ。
- **購入状態の確認：** Redis を見て、なければ Stripe を確認する。

### 5.4 待機リスト
- 入力は useActionState、処理は Server Action で行う。
- 処理の順序：zod で検証 → レート制限 → Redis に保存 → `after()` で確認メールを送る。
- ボット対策は honeypot のみ。ステージゲートの「待機リスト20件」は、この件数で測る。

### 5.5 OGP
- `ImageResponse` で 1200×630 の画像を作る。同梱物は500KBまでで、日本語はサブセット化したフォントが必要。
- 動的ルートでは `await params` を使う。

### 5.6 簡易アナリティクス
- sendBeacon で `/api/track` に送り、`HINCRBY stats:{slug}:{日付}` で数える。個人は識別しない。
- 見る指標：pageview → cta_click → checkout_start → purchase、それに signup。

### 5.7 robots / sitemap / llms.txt
- 既存の減算ゼロから流用する。`/api/`、`/app/`、`/success`、`/access` は disallow にする。

### 5.8 法務
- **特商法ページ：** 既存の ROWS 方式を使う。サブスクなら自動更新と解約方法の行を足す。
- **最終確認画面の表示義務（改正特商法）：** 購入ボタンの直上に、価格、支払時期、提供時期、自動更新、解約方法、返金条件を表示する。
- **英語版：** 英語ページでも特商法ページは日本語で出す。

## 6. データ保存
| データ | 置き場所 |
|---|---|
| 支払い・サブスク・顧客メール | Stripe（正） |
| entitlement キャッシュ、ライセンスキーの逆引き（Stripe の metadata にも保存） | Upstash Redis |
| 待機リスト、トークン、処理済み event.id、集計 | Upstash Redis（TTL 付きのものを含む） |
| 本体ツールのデータ | 原則持たない（ブラウザ内） |

Upstash の DB は1つにまとめ、`{slug}:` の接頭辞で共有する。昇格したら専用 DB に分ける。

## 7. 環境変数
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ACCESS_SECRET`
- `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`、`MAIL_FROM`
- `ADMIN_TOKEN`（任意）
- `PAYMENT_DISABLED`（任意）
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`（任意）

価格と商品名は環境変数にしない（config に置く）。

## 8. 減算ゼロから流用するもの
- `lib/site.ts` の `siteUrl()`
- `lib/stripe.ts` の `getStripe()`、`paymentDisabled()`、`createCheckoutUrl()`（mode と recurring に対応させる）、`isPaidFor()`
- `app/api/checkout/route.ts` の構造
- `lib/form.ts` の zod の書き方
- `lib/ratelimit.ts`
- `app/layout.tsx`
- `robots`、`sitemap`、`llms.txt`
- `app/legal/page.tsx`、`app/privacy/page.tsx`
- `.env.example` の書き方
- `typecheck` スクリプト

## 9. Next.js 16 の変更点（node_modules/next/dist/docs/ で確認済み）
1. `middleware` は `proxy`（`proxy.ts`）に改名された。Proxy は Node ランタイム固定で、runtime の指定はエラーになる。
2. Server Function は Proxy の matcher 外になりうるので、認可は各 Server Function 内で確認する。
3. Edge Runtime と `preferredRegion` は非推奨。OGP にも `runtime = 'edge'` を書かない。
4. `cookies()`、`headers()`、`params`、`searchParams` は必ず await する。型は `PageProps<'/x'>` と `RouteContext<'/x'>` を使う。
5. OGP・icon 関数の `params` と `id`、sitemap の `id` が Promise になった。
6. robots、sitemap、生成画像は、リクエスト時の API を使わなければビルド時に静的生成される。robots の `other` は v16.3.0 で追加された。
7. `ImageResponse` は500KBまで、フォントは ttf / otf / woff のみ。
8. `cacheComponents` が新設された。テンプレートでは無効のままにする。
9. 従来モデルでは fetch も GET Route Handler もデフォルトで動的。
10. `'use cache'` の中では `cookies()` や `headers()` を呼べない。
11. `revalidateTag` は第2引数が必須になった。Server Action 用に `updateTag` が追加された。
12. `serverRuntimeConfig` は削除された。`NEXT_PUBLIC_` はビルド時に埋め込まれる。
13. `cookies().set()` は Server Function か Route Handler でのみ使える。
14. Server Action は公開エンドポイントとして扱う（ボディは1MBまで、action ID は変わりうる）。
15. フォームは useActionState、送信後の処理は `after()`、Webhook は `request.text()` を使う。
16. 認証は stateless session（jose）＋ Proxy での楽観的チェック＋ DAL での本検証。
17. Turbopack が既定になった。`next lint` は削除され、build でも lint は走らない。
18. Node 20.9 以上、TypeScript 5.1 以上が必要。
19. dev の出力は `.next/dev` に分かれた。同じプロジェクトで dev を2つ立てない。
20. Parallel Routes には `default.js` が必須。`next/image` の既定値も変わった。

## 10. 48時間チェックリスト
- **事前：**
  - Stripe の本人確認
  - Upstash と Resend のドメイン設定
  - Vercel の準備、テンプレートのリポジトリ作成
  - 特商法の情報
- **0〜4h：**
  - ネタを選ぶ
  - 価格を決める
  - リポジトリを作り config を書く
  - ドメイン
  - 待機リストの LP をデプロイ
  - X で「作ります」と投稿
  - 仕様を1画面に絞る
- **4〜20h：**
  - 本体を実装（ビルダーを並列）
  - 途中経過を X に投稿
  - LP の文言を書き直す
  - 睡眠
- **20〜32h：**
  - presale / live に切り替える
  - テスト：
    - 買い切りの購入
    - サブスクの解約
    - マジックリンク
    - 法務ページ
    - OGP
    - robots
  - セキュリティの見直し
  - `tsc` と `next build`
  - 睡眠
- **32〜40h：**
  - 本番キーと Webhook を設定
  - 本番で購入して返金
  - プロモコード作成
  - 投稿の準備
- **40〜48h：**
  - 待機リストにメール送信
  - X でローンチ
  - 対応
  - 数字を記録して本部に報告

## 11. オーナーに用意してもらうもの
- Stripe アカウント
- ドメイン
- X アカウント（投稿の最終承認者）
- 特商法表記の情報
- 送信用メールのドメイン（SPF / DKIM）
- Vercel と Upstash
- サポート窓口のメール
- 規約の確認
- 各ローンチの価格の承認

## 12. 未決事項
1. 共通ドメインのサブドメイン運用にするか、ローンチごとに独自ドメインを取るか
2. 既定の通貨を USD と JPY のどちらにするか
3. 海外売上の税務（Stripe Tax か MoR か）
4. 本体で AI API を使う回の原価管理
