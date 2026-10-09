# Cloudflare Workers（無料プラン）へのデプロイ

OpenNext（`@opennextjs/cloudflare`）で Next.js 16 アプリを 1 つの Worker にして動かす。Vercel 用の設定（`vercel.json`、`npm run build`）はそのまま残してあり、どちらにも出せる。
**この文書の手順はまだ実行していない**（Cloudflare へのログイン・デプロイは未実施）。ローカルの workerd での確認だけ済んでいる（§6）。

**方針：無料プラン（CPU 10 ms/リクエスト）で動かす。** そのために次の構成にした（§2.1）。
- ログイン不要のページはすべてビルド時に静的生成（○）する。Worker 上では Next.js を起動せず、キャッシュから返す。
- ダッシュボードと購入フローは「静的な殻＋ブラウザで描画」にする。データは小さな JSON API から取る。

## 1. 前提
- Node.js 22、`npm install` 済み（`@opennextjs/cloudflare` 1.20.9、`wrangler` 4.149.0 は devDependencies）
- Cloudflare アカウント（Workers Free で可）。デプロイするときだけ `npx wrangler login` が必要
- Upstash Redis（無料枠で可）。**デモでも本番では使うことを強く勧める**（§5）

## 2. 追加・変更したファイル
| ファイル | 内容 |
|---|---|
| `app/api/app/*`、`app/api/access/{license,magic,signout}`、`app/api/checkout/{demo,demo/portal,complete}` | ダッシュボードと購入フローの JSON API（Server Actions の置き換え。§2.1） |
| `lib/api.ts` | API 共通処理：Origin チェック（CSRF）、Cookie（jose）→ アカウント、JSON 応答 |
| `lib/guard/views.ts`・`lib/guard/schemas.ts` | API が返す JSON の形と入力検証（トークンや秘密は返さない） |
| `components/client/*` | `/app`・`/app/c`・`/access`・`/success`・`/checkout/demo`・ポータルのクライアント描画 |
| `lib/payments/mode.ts`・`next.config.ts` | デモバナーをビルド時に決める（`BUDGET_GUARD_BUILD_PAYMENTS_MODE`）。実行時のモードと食い違えば決済を止める |
| `lib/guard/cron.ts` | cron を分割して実行する（時間ごとの作業リスト、項目ごとの claim、接続ごとのロック、失敗時の再試行）。§7 |
| `scripts/measure-cpu.mjs` | ルートごとの CPU 時間をローカル workerd で計測（`npm run cf:cpu`。§8.1） |
| `wrangler.jsonc` | Worker 名 `budget-guard`、`nodejs_compat`、`compatibility_date` 2026-09-01、静的アセット（`ASSETS`）、毎分の cron（`* * * * *`）、`CRON_BATCH_SIZE=2`（§7） |
| `open-next.config.ts` | OpenNext の設定。読み取り専用の static-assets キャッシュ（R2/KV 不要）＋ `enableCacheInterception` |
| `cf-worker.ts` | Worker の入口。OpenNext が生成した `.open-next/worker.js` を包み、次を足す：`scheduled()`（cron の 1 スライスを Next を通さずに実行。§7）、Next サーバーの起動時読み込み（§8.2）、`x-forwarded-for` を `cf-connecting-ip` に固定（レート制限の回避防止） |
| `scripts/patch-opennext.mjs` | OpenNext 1.20.9 が Next 16.4 の `preview-props.json` を読めない不具合の回避（`build:cf` で自動実行。§9） |
| `.dev.vars.example` | ローカル用のダミー値。`.dev.vars` にコピーして使う |
| `scripts/gen-og.tsx` + `app/*.png` | OG 画像と favicon を静的 PNG にした（`npm run og` で再生成） |
| `proxy.ts`（削除） | §4 を参照。`/app` は API が 401 を返し、ブラウザが `/access` へ移る |
| 削除：`app/actions/access.ts`、`app/(product)/app/actions.ts`、`app/checkout/demo/actions.ts`、`app/(product)/app/c/[id]/page.tsx`、`lib/session.ts` | Server Actions と動的ページを API＋静的な殻に置き換えた。停止ページの URL は `/app/c?id=conn_…` |
| `lib/payments/stripe.ts` | Stripe SDK を fetch ベースの HTTP クライアントに固定 |
| `app/api/stripe/webhook/route.ts` | 署名検証を `constructEventAsync` に変更 |

`package.json` のスクリプト：

| コマンド | 内容 |
|---|---|
| `npm run build:cf` | OpenNext ビルド（`.open-next/` を生成） |
| `npm run preview` | ビルドして workerd でローカル実行（http://localhost:8787） |
| `npm run preview:cron` | 同上＋ `--test-scheduled`（`/__scheduled` や `/cdn-cgi/handler/scheduled?cron=…&time=<ms>` で cron を試せる） |
| `npm run cf:size` | ビルドしてバンドルサイズを表示（`wrangler deploy --dry-run`。アップロードしない） |
| `npm run deploy` / `npm run upload` | ビルドしてデプロイ／新しいバージョンをアップロードだけ（オーナーが実行） |
| `npm run cf:cpu` | ルートごとの CPU 時間を計測（先に `build:cf`。Linux のみ） |
| `npm run cf-typegen` | `cloudflare-env.d.ts` を生成（任意） |

### 2.1 構成（無料プランの 10 ms に収めるため）
| 種類 | ルート | Worker 上の処理 |
|---|---|---|
| 静的アセット | `/_next/static/*`、`/favicon` など | Workers Static Assets が返す。**Worker は起動しない**（CPU 0、リクエスト数にも数えない） |
| 静的ページ（○） | `/`、`/pricing`、`/legal/*`、`/access`、`/app`、`/app/c`、`/checkout/demo`、`/checkout/demo/portal`、`/success`、`robots.txt`、`sitemap.xml`、`llms.txt`、OG 画像 | OpenNext のキャッシュ横取り（`enableCacheInterception`）が、ビルド時の HTML・RSC をアセットから返す（応答ヘッダ `x-opennext-cache: HIT`）。**Next.js のサーバーも React の描画も動かない**。クライアント遷移の RSC・セグメントのプリフェッチも同じ経路 |
| 動的 API（ƒ） | `/api/*` | Next.js の Route Handler。小さな JSON を返す |

- `npm run build` の出力で、ページはすべて `○ (Static)`、`ƒ` は `/api/*` だけ（2026-10-09 確認）。
- `?canceled=1`・`?token=…`・`?session_id=…`・`?id=…` はブラウザで読む。そのため、ページは静的なままにできる。
- **ダッシュボード（`/app`、`/app/c?id=`）**：殻は静的。データは `GET /api/app/state`・`GET /api/app/connections/{id}` から取る。操作は `POST/DELETE /api/app/…` で行う。
- **購入フロー**：
  - `/checkout/demo` は `GET/POST /api/checkout/demo` を使う。
  - `/success` は `POST /api/checkout/complete` で入金を確認し、権利を発行する。
  - 「アプリを開く」は従来どおり `/api/access/verify` へのフォーム POST。
  - ログインは `/api/access/{license,magic}`。
- **守っている性質**
  - **アクセス確認**：すべての `/api/app/*` が毎回、署名付き Cookie（jose HS256）と有効な権利を確認する。失敗は 401。接続はアカウントごとに分かれ、他人の接続 ID は 404。
  - **CSRF**：
    - Cookie は従来どおり `SameSite=Lax`・`HttpOnly`。
    - 状態を変える API はすべて `Origin` がこのサイトと一致することを要求する。`Origin` がない、`null`、他サイト、`Sec-Fetch-Site: cross-site` のいずれかなら 403。
    - JSON の本文はクロスオリジンでは CORS のプリフライトになり、応答しない。
    - ログイン系（license・verify・magic）にも同じチェックを入れて、ログイン CSRF を防ぐ。
    - `/api/checkout`・`/api/portal` にも入れた。
  - **停止の確認**：入力したラベルと、HMAC 署名付きチャレンジ（5 分、接続・操作・計画の指紋に束縛）の両方が必要。チャレンジは `GET /api/app/connections/{id}` が毎回発行する。無効化（test・off）は確認なし。
  - **レート制限**：license 10、magic 5、verify 20、checkout 10、デモ支払い 20、complete 30（いずれも 10 分あたり・IP ごと）。Cloudflare では `cf-connecting-ip` を IP として使う（`cf-worker.ts`）。
  - **カード情報**：デモのカードはブラウザとサーバーで検証し、保存するのは末尾 4 桁だけ。ログにも応答にも出さない（テストで確認）。
  - **秘密を返さない**：API はトークンや Slack URL の暗号文・平文を返さない。返すのは伏せ字だけ（テストで確認）。

### 2.2 デモバナー（ビルド時に決定）
- 静的ページのバナーは、**`next build` 時の `PAYMENTS_MODE`** で決まる。
  - `next.config.ts` が `resolveBuildPaymentsMode()` の結果を `BUDGET_GUARD_BUILD_PAYMENTS_MODE` として埋め込む。
  - 明示した `PAYMENTS_MODE` が優先される。なければ、ビルド環境に `STRIPE_SECRET_KEY` があるかで決まる。
- **Cloudflare では secret がビルド時に見えない**ので、ビルドするときに必ず `PAYMENTS_MODE=demo`（または `stripe`）を明示する（§10）。
- **stripe モードでバナーを出さない保証**：実行時のモード（secret から決まる）がビルド時と違う場合は、次のように止まる。
  - `getPaymentProvider()` が `PaymentsConfigError` を投げ、`/api/checkout` が 503 を返す。
  - デモの支払い API・ポータル API も拒否する（`demoCheckoutEnabled()`）。
  - 起動時のログにもエラーを出す。

  そのため「請求なし」のバナーが出ているページで本物の課金が始まることはなく、逆にバナーのないページでデモ決済が動くこともない。モードを切り替えるときは**再ビルドして再デプロイ**する。
- デモのトークン `demo`（外部 API を呼ばない）は、開発時に加えて **`PAYMENTS_MODE=demo` を明示した本番**でも使えるようにした（デモ公開で、訪問者がダッシュボードを試せるように）。stripe モードや自動判定の本番では、従来どおり拒否する。

## 3. 環境変数・シークレット
Worker の `process.env` には、wrangler の vars と secrets がリクエストごとに入る。**秘密の値はすべて `wrangler secret put`** で入れる（`wrangler.jsonc` には書かない）。
ローカルは `.dev.vars`（git 対象外）。`.env*` ファイルはビルド時に Worker へ埋め込まれることがあるので、CF 用ビルドでは秘密を `.env` に置かない。

| 変数 | 必須 | 入れ方 | 備考 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ★ | **ビルド時**の環境変数 | 例 `NEXT_PUBLIC_SITE_URL=https://budget-guard.<sub>.workers.dev npm run deploy`。未設定だとメールのリンクが `http://localhost:3000` になる |
| `PAYMENTS_MODE` | ★ | `wrangler secret put` **と、ビルド時の環境変数の両方** | 当面 `demo`。静的ページのバナーはビルド時の値で決まる。実行時と違うと決済が止まる（§2.2） |
| `ACCESS_SECRET` | ★ | secret | 32文字以上（`openssl rand -base64 32`） |
| `TOKEN_ENCRYPTION_KEY` | ★ | secret | 32バイトの base64。本番（NODE_ENV=production）で未設定ならエラー |
| `CRON_SECRET` | ★ | secret | `/api/cron/check`（Vercel の cron、手動実行）の認証。Cloudflare の `scheduled()` はルートを通らないので使わない |
| `CRON_BATCH_SIZE` | — | `wrangler.jsonc` の vars（`2`） | 1 回の cron で調べる接続数。**Vercel では設定しない**（未設定なら 1 回で全件。Vercel の cron は毎時 1 回だけなので） |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | ★（推奨） | secret | 未設定ならメモリ上の KV（`PAYMENTS_MODE=demo` のときだけ許可。§5） |
| `RESEND_API_KEY` / `MAIL_FROM` | 任意 | secret | 未設定ならメールはログに出るだけ |
| `ADMIN_TOKEN` | 任意 | secret | `/api/admin/stats` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | stripe 時 | secret | 入れると（`PAYMENTS_MODE` 未設定なら）stripe モードになる |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 任意 | ビルド時 | Worker 1 つなので通常は不要 |

```bash
npx wrangler secret put PAYMENTS_MODE        # demo
npx wrangler secret put ACCESS_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put CRON_SECRET
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

## 4. バンドルサイズ（2026-10-09 計測、`npm run cf:size`）
| 状態 | Total Upload（非圧縮） | gzip |
|---|---|---|
| 最初の状態（`proxy.ts` あり、OG を `ImageResponse` で生成） | 14,002.72 KiB（13.7 MiB） | 3,139.71 KiB（3.07 MiB） |
| OG・favicon を静的 PNG に | 13,159.67 KiB | 2,947.29 KiB |
| さらに `proxy.ts` を削除 | 8,091.88 KiB（7.9 MiB） | 1,618.78 KiB（1.58 MiB） |
| 静的化・API 化の後 | 7,926.47 KiB（7.7 MiB） | 1,599.53 KiB（1.56 MiB） |
| **現在**（cron の分割後。cron 用のコードを Next の外にも持つ） | **8,964.08 KiB（8.8 MiB）** | **1,769.23 KiB（1.73 MiB）** |

- **上限**：Cloudflare の公式ドキュメント（Limits、2026-10-08 更新、2026-10-09 に確認）では、Worker のサイズ上限は Free・Paid とも **非圧縮 64 MiB**。「圧縮後の上限はなく、gzip の値は参考」と書かれている。以前の「無料プランは gzip 3 MiB」という上限は今は載っていない。念のため、現在の値はその古い上限も下回っている。
- 起動時間の上限は 1 秒。`wrangler check startup` のローカル計測では、起動時の CPU は約 150 ms（Next サーバーを起動時に読み込む前は約 63 ms、cron 分割の前は約 125 ms。§8.2）。
- **削った内容**
  - **`proxy.ts`**：Next 16 の proxy は Node.js ランタイムで動く。OpenNext は「Node.js middleware は実験的で、公式には保守していない」と警告を出す。さらに proxy 用の別ハンドラ（約 3 MB、`@vercel/og` と resvg.wasm を含む）がバンドルされていた。proxy は Cookie があるかを見るだけの楽観的なチェックだった。本当の検証は API 側で毎回行う（§2.1）。
  - **OG / favicon**：`next/og` の wasm とフォント（約 2 MB）がサーバーに入らないように、`npm run og` で PNG に書き出した。出力は元のルートと同じバイト列。`product.config.ts` の og / brand を変えたら `npm run og` を再実行する（`tests/og-static.test.ts` が alt テキストのずれを検出する）。

## 5. ストレージ（KV）の注意
- Upstash は HTTP（fetch）で通信するので、Workers でもそのまま動く。
- **Upstash がない場合のメモリ上の KV は、isolate ごとの変数にすぎない。** Workers ではリクエストがどの isolate やデータセンターに届くか決まっておらず、isolate はいつでも捨てられる。そのため本番では、デモの購入・ライセンス・接続が突然消えたり、リクエストごとに見えたり見えなかったりする。「永続しない・共有されない」と考えること。
  - ローカルの `wrangler dev` は isolate が 1 つなので、リロードしても状態は残る（確認済み）。
  - **デモでも本番は Upstash を使う**（無料枠で足りる）。Cloudflare KV のアダプタは作らなかった。KV は結果整合性で、`GETDEL` や `INCR` をアトミックに実行できず、無料枠の書き込みは 1,000 回/日しかない。そのため、使い切りトークンやレート制限の動作が変わってしまうから。

## 6. ローカル確認（workerd）
```bash
cp .dev.vars.example .dev.vars    # ダミー値。PAYMENTS_MODE=demo、Upstash なし
npm run preview:cron              # http://localhost:8787
curl -i localhost:8787/api/cron/check                                              # 401
curl -i -H "Authorization: Bearer local-dummy-cron-secret" localhost:8787/api/cron/check   # 200
curl "localhost:8787/__scheduled?cron=*+*+*+*+*"                                   # scheduled() → 1 スライス
curl "localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*&time=1893456001000"  # 時刻を指定（別の「時」を試す）
```
2026-10-09 の結果（静的化・API 化の後。Playwright＋Chromium、`PAYMENTS_MODE=demo` でビルド）：21 項目すべて PASS。
- **静的ページ**：`/` の HTML にバナーが入っている（ビルド時に決定）。`/pricing?canceled=1` のお知らせはブラウザで表示される。
- **未ログイン**：`/app` を開くと、API が 401 を返し、`/access` へ移る。
- **購入**：
  - `/pricing` → 購入 → `/checkout/demo`（バナーあり）
  - 不正なカード（4242…4241）はブラウザで止まる
  - 4242 4242 4242 4242 で支払うと `/success` に移り、ライセンスキー・デモ購入・バナーが表示される
  - 「アプリを開く」→ `/app` に「Plan: Monthly · active（デモ / demo）」が表示される
- **ダッシュボード**：
  - OpenAI の接続をトークン `demo` で追加し、Check now を押すと `$85.00 / $100.00 85% · checked …` とアクティビティが表示される
  - 停止ページで誤ったラベルを入れると拒否され（TEST のまま）、正しいラベルで LIVE になり、Disarm で TEST に戻る
- **デモポータル**：active と表示される。
- **状態の保持**：再読み込みしても接続が残る（同じ isolate）。ページと console のエラーなし（想定どおりの 401・400 を除く）。
- **CSRF（curl）**：
  - 他サイトの Origin で `/api/checkout` → 403
  - Origin なしで `/api/app/slack` → 403
  - 同じ Origin で Cookie なし → 401
- cron：
  - 秘密なし・誤った秘密は 401、正しい秘密は 200 `{"ok":true,...}`
  - scheduled を呼ぶと、ログに `[cron] * * * * * {"hour":"…","initialized":true,"checked":1,…}` が出る（分割後。Next を通さずに実行）
- `after()`（ライセンスメールの送信）が動作した。
- AES-256-GCM（AAD の束縛）、停止チャレンジの HMAC、Vercel webhook の HMAC-SHA1 が workerd 上で正しく動いた。
- Stripe webhook（ダミーの秘密で署名）：正しい署名は 200、不正な署名は 400。
- 注意：`wrangler dev` はリダイレクト先のホストを `localhost` にするので、ブラウザでは `127.0.0.1` ではなく `http://localhost:8787` を開く（Cookie が別ホスト扱いになるため）。

## 7. cron（無料プランで接続 100 件まで）
**目標**：1 回の起動で CPU 10 ms 以内、サブリクエスト 50 未満。接続 100 件を毎時調べる。

**方式**：KV 上の「時間ごとの作業リスト」を、毎分の cron が 2 件ずつ処理する（`lib/guard/cron.ts`）。
- **作業リスト**：
  - 全接続の索引 `bg:allconns`（`acct|connId` の集合）を、接続の追加・削除のたびに更新する。
  - その時間（UTC）の最初の実行が、索引を `bg:cron:{時}:pending` にコピーする（`SMEMBERS` 1 回）。
  - 途中で追加された接続は、次の時間から対象になる。
- **1 回の実行**：pending から順不同に取り、次を行う。
  1. `SET item running NX EX 300` で claim する（同じ項目を同時に 2 つの実行が持たない）
  2. 権利を確認し、その接続だけを調べる
  3. `item=done` にして、pending から外す
- **1 回の実行で処理する量**：上限は `CRON_BATCH_SIZE=2` 件。KV へのリクエスト数も数え、約 34 回を超えそうなら次の項目に進まない。残りは次の分の実行が処理する。
- **起動回数**：`* * * * *` で 1 時間に 60 回。60 回 × 2 件で、1 時間に約 118 件（時間の最初の 1 回は 1 件）。100 件は約 50 回で終わる。
- **Next を通さない**：`scheduled()` は `runCronSlice()` を直接呼ぶ。Next のリクエスト処理の固定費（約 4〜5 ms）と、isolate で最初の API 呼び出し（約 170 ms）を避けるため。モジュールは起動時に評価される。`/api/cron/check` も同じ関数を呼ぶ（Vercel と手動実行用）。
- **二重実行の防止**：
  - 項目の claim で、cron どうしが同じ接続を同時に処理しない。
  - さらに、どの経路（cron、「Check now」、Vercel webhook）でも、1 接続の判定は接続ごとのロック（`bg:lock:{connId}`、`SET NX EX 120`）の中で行う。状態を読み、停止し、状態を書くまでを、同時に 1 つだけにするため。
  - ロックが取れないときの動き：
    - cron：claim を外して、後の実行に回す
    - 「Check now」：409「チェック中」を返す
    - webhook：5 秒おきに最大 4 回待つ
- **通知と停止は月 1 回**：従来どおり、接続ごとの状態（`evaluate.ts` の `warnedAt`・`limitNotifiedAt`・`stoppedAt`）で決まる。ロックの中でしか状態を読み書きしないので、重なっても 2 回目は出ない。
- **失敗と再試行**：
  - プロバイダ API の失敗：従来どおり状態に記録し、次の時間に再試行する。停止の失敗は `stoppedAt` を書かないので、次の時間に再試行される。
  - 例外：同じ時間のうちに後の実行で再試行する。3 回失敗したらその時間はあきらめ、次の時間に新しく試す。
  - 実行の途中で落ちた（CPU 超過など）場合：claim が 5 分で切れ、後の実行が拾う。
  - 落ちた位置が「停止を送った後、状態を書く前」だと、停止をもう一度送ることがある。pause や上限の再設定は何度送っても結果は同じ。
- **Vercel**：`vercel.json` の毎時 1 回の cron は変更していない。`CRON_BATCH_SIZE` が未設定なので、1 回の呼び出しで全件を処理する（`maxDuration` 300 秒）。
- **無料枠（公式ドキュメント、2026-10-09 確認）**：
  - Cron Trigger はアカウント全体で 5 個まで。これは 1 個使う。
  - cron 1 回の CPU は 10 ms、サブリクエストは 50。
  - 毎分の実行は 1 日 1,440 回で、リクエスト上限（10 万/日）に対して小さい。
  - 追加・変更が全体に反映されるまで最大 15 分かかる。
- **検討して採らなかった案**：
  - **Cloudflare Queues**：無料プランでも使える（1 日 10,000 操作、保持 24 時間。1 メッセージ約 3 操作）。100 接続 × 24 時間 = 7,200 操作で、再試行の余裕が少ない。また Vercel 版と別の仕組みになる。
  - **自分自身への fetch**：Service binding 経由の呼び出しの CPU の数え方を確認できなかった。
- **118 件を超える場合**：
  - `CRON_BATCH_SIZE` は上げない（サブリクエストが 50 を超える）。
  - 代わりに、分をずらした trigger を足す（例：`* * * * *` に加えて、もう 1 つの式）。同じ式を 2 つ置けるかは未確認。
  - または Workers Paid にする。

**テスト**（`tests/cron.test.ts`）：
- 100 接続：60 回の実行の中で各接続がちょうど 1 回調べられ（状態の書き込みが接続ごとに 1 回）、1 回のサブリクエストが 50 未満（KV 28 回＋プロバイダ 2 回＋通知。実測で最大 32）
- 4 つの実行を同時に 10 分間続けても、二重の判定がない
- 次の時間に再び調べるが、通知と停止は月 1 回
- 例外は後の実行で再試行され、3 回であきらめる
- claim の期限切れで拾い直す
- 「Check now」がロックを持っている間は待つ
- 権利が切れたアカウントは飛ばす
- 索引ができる前のデータを移行する
- 「Check now」が 409 を返すこと（`tests/api-routes.test.ts`）

## 8. 無料プランの制限と懸念

### 8.1 ルートごとの CPU 時間（ローカル workerd、2026-10-09。cron の行は分割後に計測し直した）
**計測方法**（`npm run cf:cpu` = `scripts/measure-cpu.mjs`）：
1. `opennextjs-cloudflare preview`（workerd）を V8 インスペクタ付きで起動する。
2. Worker の isolate に CPU プロファイラ（サンプリング間隔 100 µs）をかけたまま、リクエストを 1 本ずつ間隔を空けて送る。
3. 「(idle)」と「(program)」以外のサンプル時間を、リクエストごとに合計する。GC は含む。

**この方法の限界**：
- 計測したのはこの開発機の CPU で、Cloudflare の CPU ではない。プロファイラ自体の負荷も乗るので、**やや多めに出る見積もり**として扱う。
- 次の時間は含まない：
  - wrangler の開発用プロキシ・ルーター（本番では Cloudflare 側の処理で、課金されない）
  - V8 のネイティブなパース・コンパイル（「(program)」に入る）
- 壁時計の時間は使えない。workerd は JS の実行中に `Date`・`performance.now` を止めるので、Worker 内で時間差を測っても CPU 時間にならない。
- I/O を使っていない。KV はメモリ上で、Upstash はなし。プロバイダ API はデモ用の偽物。本番の Upstash や API の待ち時間は CPU に数えないが、応答の JSON をパースする分は増える。

**列の意味**：
- 「cold」：その isolate でそのルートを初めて呼んだとき。最初の行は isolate そのものの最初のリクエスト。
- 「warm」：その後 15 回の中央値と最大値。

| ルート | 種類 | cold ms | warm 中央値 / 最大 ms | ≤10 ms? |
|---|---|---|---|---|
| `/_next/static/*`（JS・CSS） | 静的アセット | 0（Worker 起動なし） | 0 / 0 | ✅ |
| isolate の最初のリクエスト（`GET /`） | 静的ページ | 13.1 | — | ⚠️（isolate ごとに 1 回） |
| `/`、`/pricing`、`/legal/*`、`/access` | 静的ページ（キャッシュ横取り） | 2.6〜4.8 | 2.8〜3.3 / 4.2〜6.3 | ✅ |
| `/app`、`/app/c`、`/checkout/demo`、`/success` | 静的ページ（殻） | 2.1〜3.7 | 2.9〜3.2 / 3.7〜5.5 | ✅ |
| `robots.txt`、`sitemap.xml`、`llms.txt`、OG 画像 | 静的ページ | 2.0〜3.2 | 2.7〜2.9 / 3.5〜3.9 | ✅ |
| `/pricing` のクライアント遷移（RSC） | 静的ページ | 3.7 | 3.1 / 5.7 | ✅ |
| `POST /api/checkout`（isolate で最初の API） | 動的 API | **168** | 5.9 / 9.8 | ❌ cold／✅ warm |
| `GET /api/checkout/demo` | 動的 API | 38.6 | 6.0 / 12.4 | ❌ cold／⚠️ |
| `POST /api/checkout/demo`（支払い） | 動的 API | 5.1 | 6.8 / 8.6 | ✅ |
| `POST /api/checkout/complete` | 動的 API | 28.2 | 5.5 / 9.2 | ❌ cold／✅ |
| `POST /api/access/verify`（Cookie 署名） | 動的 API | 12.8 | 6.0 / 8.8 | ⚠️ cold／✅ |
| `GET /api/app/state`（401、Cookie なし） | 動的 API | 14.4 | 4.6 / 5.7 | ⚠️ cold／✅ |
| `GET /api/app/state` | 動的 API | 7.0 | 5.0 / 6.5 | ✅ |
| `POST /api/app/connections`（追加。AES-256-GCM で暗号化） | 動的 API | 21.6 | 6.7 / 9.9 | ❌ cold／✅ |
| `GET /api/app/connections/{id}`（復号＋計画＋HMAC 2 回） | 動的 API | 9.0 | 6.4 / 9.7 | ✅ |
| `POST …/{id}` confirm（ラベル違い。HMAC 検証） | 動的 API | 9.3 | 6.2 / **17.6** | ⚠️ まれに超過 |
| `POST …/{id}` confirm arm-live（HMAC 検証） | 動的 API | 6.1 | 6.2 / 11.4 | ⚠️ まれに超過 |
| `POST …/{id}` test-stop | 動的 API | 6.5 | 5.9 / 11.8 | ⚠️ まれに超過 |
| `POST …/{id}` check（復号＋利用額取得） | 動的 API | 9.2 | 6.1 / 10.4 | ⚠️ まれに超過 |
| `POST /api/app/connections`（他サイトの Origin → 403） | 動的 API | 4.6 | 5.0 / 6.9 | ✅ |
| `GET /api/checkout/demo/portal` | 動的 API | 6.8 | 4.9 / 8.1 | ✅ |
| `GET /api/cron/check`（401） | 動的 API | 9.7 | 4.4 / 5.1 | ✅ |
| `GET /api/cron/check`（秘密あり、手動実行。Vercel の cron と同じ経路） | 動的 API | 6.9 | 4.1 / 11.7 | ⚠️ まれ（Cloudflare の cron はこの経路を通らない） |
| **cron** `scheduled()`、1 スライス：接続 1 件（その時間の最初の実行） | cron | 4.6 | — | ✅ |
| **cron** `scheduled()`、接続 10 件：処理した実行（6 回で完了） | cron | 1.7 | 2.4 / 5.4 | ✅ |
| **cron** `scheduled()`、接続 100 件：その時間の最初の実行（作業リスト作成） | cron | 3.6 | — | ✅ |
| **cron** `scheduled()`、接続 100 件：処理した実行（50 回で完了、各 2 件） | cron | 3.6 | 2.7 / 4.1 | ✅ |
| **cron** `scheduled()`、残りなしの分（空振り） | cron | 0.4〜1.6 | — | ✅ |

- **暗号処理そのものは小さい**：
  - AES-GCM・HMAC は Node 互換の `crypto`（ネイティブ）で 1 回 1 ms 未満。
  - 確認 API の 6 ms の大部分は、Next の Route Handler の固定費（約 4〜5 ms。401 を返すだけの API でも 4.4 ms）。
  - warm の最大値がときどき 10 ms を超えるのは GC。1 リクエストで最大 6 ms を観測した。

**10 ms を超えるものと対策**：
- **isolate で最初の API 呼び出し（168 ms）、各ルートの初回（13〜39 ms）**
  - 原因：Next.js サーバーの初期化と、ルートのモジュールの遅延評価（Turbopack の `instantiateModule` など）。
  - 対策（実施済み）：`cf-worker.ts` で Next サーバーのモジュールを isolate の起動時に評価する（§8.2）。最初の API は 228 → 168 ms に減った。
  - 公式ドキュメントに「isolate ごとに、まれな超過は許容する」とある。対象は isolate ごとに 1 回の初回だけで、それ以外は 10 ms 以内。
  - それでも本番で Error 1102（`exceededCpu`）が続くなら、Workers Paid（$5/月）にする。
- **warm 時のまれな超過（GC）**：許容範囲内の見込み。ダッシュボードの Metrics → Errors で `Exceeded CPU` を監視する。
- **cron**：分割したので、接続の数によらず 1 回あたり CPU 約 2〜5 ms（測定値）、サブリクエスト約 32（テストで数えた値）。100 件で確認した（§7）。
  - 計測は `npm run cf:cpu` の最後で行う。`/cdn-cgi/handler/scheduled?time=` で「時」をずらし、接続 1・10・100 件で 1 時間を分ごとに再現する。
  - プロバイダ API は偽物で、I/O の待ちはない。本番では応答の JSON パースの分だけ増える。

### 8.2 起動時に Next サーバーを読み込む
- `cf-worker.ts` は `.open-next/server-functions/default/handler.mjs` を静的に import している。
- これで、Next サーバーのモジュールの評価が「最初の動的リクエストの CPU（上限 10 ms）」から「isolate の起動時間（上限 1 秒）」に移る。
- 実測：
  - 起動時の CPU：63 → 125 ms
  - 最初の API：228 → 168 ms
- 静的ページだけの訪問者にも起動時のコストはかかる。ただし起動時間の上限 1 秒に対して十分小さい。

### 8.3 制限の一覧
| 制限（Free） | 値 | この app への影響 |
|---|---|---|
| CPU 時間 | **10 ms / リクエスト**（cron も 10 ms） | §8.1 を参照。<br>・静的ページ：約 3 ms<br>・API（warm）：約 5〜7 ms<br>・cron：1 回 2〜5 ms（分割済み）<br>・超えるのは isolate ごとの初回の API。<br>以前（layout で `connection()` を呼び、全ページを毎回描画していたとき）は 1 ページ 27〜35 ms だった |
| サブリクエスト | 50 / リクエスト | cron は 1 回 2 件に分割した。KV 約 28 回＋プロバイダ API＋通知で約 32（§7）。Vercel の停止はプロジェクトの数だけ POST するので、20 プロジェクトを一度に止める接続が重なると上限に近づく |
| リクエスト | 100,000 / 日 | 試作には十分 |
| Worker サイズ | 非圧縮 64 MiB | 8.8 MiB で余裕あり |
| 起動時間 | 1 秒 | ローカルで約 150 ms（§8.2） |
| 静的アセット | 20,000 ファイル | 44 ファイル（静的アセットへのリクエストは Worker を起動しない） |

## 9. 既知の問題・Vercel との違い
- **OpenNext 1.20.9 × Next 16.4**：`preview-props.json` を Worker に埋め込まないので、全リクエストが 500（`Unexpected loadManifest(...preview-props.json)`）になる。`scripts/patch-opennext.mjs` が `node_modules` 内の glob に 1 語足して回避している（冪等）。OpenNext の更新で直ったら、このスクリプトと `build:cf` の呼び出しを消す。パターンが見つからないときはビルドを止める。
- `maxDuration`（cron ルートの 300 秒）は Workers では無視される。上限は CPU 時間とサブリクエストで決まる。
- `after()` は `ctx.waitUntil` で動く。応答後の待ち時間は最大 30 秒。
- メモリ上の KV は Vercel 以上に不安定（§5）。
- `proxy.ts` の削除、OG の静的化、ページの静的化と API 化は、Vercel 版にも適用される。`vercel.json` は変更していない。
  - Vercel では、ビルド時と実行時に同じ環境変数が使われる。ビルド時のモードは自動で一致する。
  - モード（Stripe キー）を変えたら、再デプロイが必要。
- 静的ページの応答には `Cache-Control: s-maxage=31536000` が付く。ただし Workers の応答は CDN に自動ではキャッシュされない。中身は全員に共通の殻で、アカウントごとのデータは API（`no-store`）からしか出ない。
- Next のイメージ最適化（`next/image`）は使っていないので、Images バインディングは設定していない。

## 10. デプロイ手順（オーナー向け・未実行）
```bash
npx wrangler login
# §3 の secret を入れる（Worker がまだなければ wrangler が作成を提案する）
# PAYMENTS_MODE はビルドにも必要（静的ページのバナーがビルド時に決まる。§2.2）。secret と同じ値にする
PAYMENTS_MODE=demo NEXT_PUBLIC_SITE_URL=https://budget-guard.<your-subdomain>.workers.dev npm run deploy
npx wrangler tail budget-guard     # ログを見る
```
- 確認：
  - `/` に「デモ：実際の請求はありません」が出る
  - `/api/cron/check` は秘密なしで 401
  - 静的ページの応答ヘッダに `x-opennext-cache: HIT` が付いている
  - ダッシュボードの Metrics で、CPU time の p99 と `Exceeded CPU` のエラーを確認する
  - ダッシュボードの Triggers に `* * * * *` が表示され、Cron Events に毎分の結果（`[cron] {…"checked":…}`）が出る
  - 1 時間のうちに、各接続のダッシュボードの「checked」時刻が更新される
- 独自ドメインは、ダッシュボードの Worker → Settings → Domains & Routes で設定する。その後 `NEXT_PUBLIC_SITE_URL` を変えて、もう一度デプロイする。

## 11. ロールバック
- `npx wrangler deployments list` で履歴を見て、`npx wrangler rollback [<version-id>]` で以前のバージョンに戻す。secret は戻らないので、変えていたら入れ直す。
- Cloudflare をやめる場合：`npx wrangler delete budget-guard`（Worker と cron が消える）。Vercel 側はそのまま使える。
