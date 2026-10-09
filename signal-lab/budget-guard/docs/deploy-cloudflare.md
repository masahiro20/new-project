# Cloudflare Workers（無料プラン）へのデプロイ

OpenNext（`@opennextjs/cloudflare`）で Next.js 16 アプリを 1 つの Worker にして動かす。Vercel 用の設定（`vercel.json`、`npm run build`）はそのまま残してあり、どちらにも出せる。
**この文書の手順はまだ実行していない**（Cloudflare へのログイン・デプロイは未実施）。ローカルの workerd での確認だけ済んでいる（§6）。

## 1. 前提
- Node.js 22、`npm install` 済み（`@opennextjs/cloudflare` 1.20.9、`wrangler` 4.149.0 は devDependencies）
- Cloudflare アカウント（Workers Free で可）。デプロイするときだけ `npx wrangler login` が必要
- Upstash Redis（無料枠で可）。**デモでも本番では使うことを強く勧める**（§5）

## 2. 追加・変更したファイル
| ファイル | 内容 |
|---|---|
| `wrangler.jsonc` | Worker 名 `budget-guard`、`nodejs_compat`、`compatibility_date` 2026-09-01、静的アセット（`ASSETS`）、毎時 cron |
| `open-next.config.ts` | OpenNext の設定。ISR を使わないので、読み取り専用の static-assets キャッシュ（R2/KV 不要） |
| `cf-worker.ts` | Worker の入口。OpenNext が生成した `.open-next/worker.js` をそのまま使い、`scheduled()`（cron）を足す |
| `scripts/patch-opennext.mjs` | OpenNext 1.20.9 が Next 16.4 の `preview-props.json` を読めない不具合の回避（`build:cf` で自動実行。§9） |
| `.dev.vars.example` | ローカル用のダミー値。`.dev.vars` にコピーして使う |
| `scripts/gen-og.tsx` + `app/*.png` | OG 画像と favicon を静的 PNG にした（`npm run og` で再生成） |
| `proxy.ts`（削除） | §4 を参照。`/app` の layout の `requireAccess()` が同じリダイレクトを行う |
| `lib/payments/stripe.ts` | Stripe SDK を fetch ベースの HTTP クライアントに固定 |
| `app/api/stripe/webhook/route.ts` | 署名検証を `constructEventAsync` に変更 |

`package.json` のスクリプト：

| コマンド | 内容 |
|---|---|
| `npm run build:cf` | OpenNext ビルド（`.open-next/` を生成） |
| `npm run preview` | ビルドして workerd でローカル実行（http://localhost:8787） |
| `npm run preview:cron` | 同上＋ `--test-scheduled`（`/__scheduled` で cron を試せる） |
| `npm run cf:size` | ビルドしてバンドルサイズを表示（`wrangler deploy --dry-run`。アップロードしない） |
| `npm run deploy` / `npm run upload` | ビルドしてデプロイ／新しいバージョンをアップロードだけ（オーナーが実行） |
| `npm run cf-typegen` | `cloudflare-env.d.ts` を生成（任意） |

## 3. 環境変数・シークレット
Worker の `process.env` には、wrangler の vars と secrets がリクエストごとに入る。**秘密の値はすべて `wrangler secret put`** で入れる（`wrangler.jsonc` には書かない）。
ローカルは `.dev.vars`（git 対象外）。`.env*` ファイルはビルド時に Worker へ埋め込まれることがあるので、CF 用ビルドでは秘密を `.env` に置かない。

| 変数 | 必須 | 入れ方 | 備考 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ★ | **ビルド時**の環境変数 | 例 `NEXT_PUBLIC_SITE_URL=https://budget-guard.<sub>.workers.dev npm run deploy`。未設定だとメールのリンクが `http://localhost:3000` になる |
| `PAYMENTS_MODE` | ★ | `wrangler secret put`（または vars） | 当面 `demo`。全ページに「デモ：実際の請求はありません」が出る |
| `ACCESS_SECRET` | ★ | secret | 32文字以上（`openssl rand -base64 32`） |
| `TOKEN_ENCRYPTION_KEY` | ★ | secret | 32バイトの base64。本番（NODE_ENV=production）で未設定ならエラー |
| `CRON_SECRET` | ★ | secret | cron の認証。未設定だと scheduled は何もせずエラーを記録する |
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
| **現在**（さらに `proxy.ts` を削除） | **8,091.88 KiB（7.9 MiB）** | **1,618.78 KiB（1.58 MiB）** |

- **上限**：Cloudflare の公式ドキュメント（Limits、2026-10-08 更新、2026-10-09 に確認）では、Worker のサイズ上限は Free・Paid とも **非圧縮 64 MiB**。「圧縮後の上限はなく、gzip の値は参考」と書かれている。以前の「無料プランは gzip 3 MiB」という上限は今は載っていない。念のため、現在の値はその古い上限も下回っている。
- 起動時間の上限は 1 秒。`wrangler check startup` のローカル計測では、起動時の CPU は約 76 ms。
- **削った内容**
  - **`proxy.ts`**：Next 16 の proxy は Node.js ランタイムで動く。OpenNext は「Node.js middleware は実験的で、公式には保守していない」と警告を出す。さらに proxy 用の別ハンドラ（約 3 MB、`@vercel/og` と resvg.wasm を含む）がバンドルされていた。proxy は Cookie があるかを見るだけの楽観的なチェックで、本当の検証は `requireAccess()` が行う。そのため削除しても挙動は同じ（Cookie がなければ `/access` へ 307）。
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
curl "localhost:8787/__scheduled?cron=0+*+*+*+*"                                   # scheduled() → cron ルート
```
2026-10-09 の結果（Playwright＋Chromium）：
- すべて PASS：
  - `/` と `/pricing` が 200 でバナーあり
  - 購入 → `/checkout/demo`（カード 4242…）→ `/success`（バナーあり）→ `/app` に「Plan: Monthly · active（デモ / demo）」が表示され、リロードしても残る
  - ページの JS エラーなし
- cron：
  - 秘密なし・誤った秘密は 401、正しい秘密は 200 `{"ok":true,...}`
  - `/__scheduled` を呼ぶとログに `[cron] 0 * * * * → /api/cron/check 200` が出る
- `after()`（ライセンスメールの送信）が動作した。
- AES-256-GCM（AAD の束縛）、停止チャレンジの HMAC、Vercel webhook の HMAC-SHA1 が workerd 上で正しく動いた。
- Stripe webhook（ダミーの秘密で署名）：正しい署名は 200、不正な署名は 400。
- 注意：`wrangler dev` はリダイレクト先のホストを `localhost` にするので、ブラウザでは `127.0.0.1` ではなく `http://localhost:8787` を開く（Cookie が別ホスト扱いになるため）。

## 7. cron
- `wrangler.jsonc` の `triggers.crons: ["0 * * * *"]`（UTC、毎時）。`vercel.json` と同じ。
- `cf-worker.ts` の `scheduled()` が `/api/cron/check` をプロセス内で呼ぶ（`handler.fetch`。ネットワークを通らないので、サブリクエストに数えられず、公開ホスト名も不要）。`Authorization: Bearer $CRON_SECRET` を付けるので、ルート側の認証は Vercel のときと同じ。
- 失敗（200 以外）は例外にして、ダッシュボードの Cron Events に失敗として残す。
- 無料プランでは、**Cron Trigger はアカウント全体で 5 個まで**。他の Worker と合わせて数える。追加・変更が全体に反映されるまで最大 15 分かかる。

## 8. 無料プランの制限と懸念
| 制限（Free） | 値 | この app への影響 |
|---|---|---|
| CPU 時間 | **10 ms / リクエスト**（cron も 10 ms） | **最大のリスク。** layout が `connection()` を呼ぶので全ページが毎回 SSR になる。ローカルの workerd では、温まった状態でも 1 ページ約 27〜35 ms（I/O なし。ほぼ CPU）かかった。たまに超えるのは許容されるが、常に超えると Error 1102 になる。デモ公開ならまず試す価値はあるが、**本番は Workers Paid（$5/月、CPU 30 秒まで）を推奨**。cron の `/api/cron/check` は 0 件で約 8 ms。AES・HMAC は数 µs〜1 ms 未満なので問題にならない |
| サブリクエスト | 50 / リクエスト | cron は「Upstash 数回＋プロバイダ API 1〜3 回」を接続の数だけ行う。接続が増える（目安で 10 前後）と超える。超えたら Paid にするか、cron を分割する |
| リクエスト | 100,000 / 日 | 試作には十分 |
| Worker サイズ | 非圧縮 64 MiB | 7.9 MiB で余裕あり |
| 起動時間 | 1 秒 | ローカルで約 76 ms |
| 静的アセット | 20,000 ファイル | 56 ファイル |

## 9. 既知の問題・Vercel との違い
- **OpenNext 1.20.9 × Next 16.4**：`preview-props.json` を Worker に埋め込まないので、全リクエストが 500（`Unexpected loadManifest(...preview-props.json)`）になる。`scripts/patch-opennext.mjs` が `node_modules` 内の glob に 1 語足して回避している（冪等）。OpenNext の更新で直ったら、このスクリプトと `build:cf` の呼び出しを消す。パターンが見つからないときはビルドを止める。
- `maxDuration`（cron ルートの 300 秒）は Workers では無視される。上限は CPU 時間とサブリクエストで決まる。
- `after()` は `ctx.waitUntil` で動く。応答後の待ち時間は最大 30 秒。
- メモリ上の KV は Vercel 以上に不安定（§5）。
- `proxy.ts` の削除と OG の静的化は Vercel 版にも適用される（挙動は同じ）。`vercel.json` と `npm run build` は変更していない。
- Next のイメージ最適化（`next/image`）は使っていないので、Images バインディングは設定していない。

## 10. デプロイ手順（オーナー向け・未実行）
```bash
npx wrangler login
# §3 の secret を入れる（Worker がまだなければ wrangler が作成を提案する）
NEXT_PUBLIC_SITE_URL=https://budget-guard.<your-subdomain>.workers.dev npm run deploy
npx wrangler tail budget-guard     # ログを見る
```
- 確認：
  - `/` に「デモ：実際の請求はありません」が出る
  - `/api/cron/check` は秘密なしで 401
  - ダッシュボードの Triggers に cron が表示され、Cron Events に毎時の結果が出る
- 独自ドメインは、ダッシュボードの Worker → Settings → Domains & Routes で設定する。その後 `NEXT_PUBLIC_SITE_URL` を変えて、もう一度デプロイする。

## 11. ロールバック
- `npx wrangler deployments list` で履歴を見て、`npx wrangler rollback [<version-id>]` で以前のバージョンに戻す。secret は戻らないので、変えていたら入れ直す。
- Cloudflare をやめる場合：`npx wrangler delete budget-guard`（Worker と cron が消える）。Vercel 側はそのまま使える。
