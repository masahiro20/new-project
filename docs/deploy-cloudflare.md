# Cloudflare Workers（無料プラン）への公開手順

対象：減算ゼロを、無料公開モード（`LAUNCH_MODE=free`）で Cloudflare Workers の無料プランに公開する。
作成：2026-10-08（Mina）。使用バージョン：`@opennextjs/cloudflare` 1.20.6、`wrangler` 4.136.3、Next.js 16.3.8。

## 1. 検証の結果

| 項目 | 結果 |
|---|---|
| Next.js 16 への対応 | **対応している。** OpenNext の公式ドキュメントに「Next.js 16（全マイナー・パッチ）」とある |
| ビルド | `npm run cf:build`（`opennextjs-cloudflare build`）が成功した |
| Worker のサイズ | 圧縮後 **1.70 MiB**（`wrangler deploy --dry-run` で計測）。OpenNext のドキュメントが示す無料プランの上限（圧縮後 3 MiB）に収まる |
| 静的ファイル | 24ファイル（無料プランの上限は 20,000 ファイル） |
| Workers ランタイムでの表示 | `opennextjs-cloudflare preview`（ローカルの workerd）で次を確認した。<br>・`/`、`/check`、`/generate`、`/guide`、各解説、`/samples`、`/terms`、`/privacy`、`/llms.txt`、`/robots.txt`、`/sitemap.xml` が 200<br>・`/legal` と存在しない URL が 404<br>・3つの API が 503（無料モードの想定どおり）<br>・セキュリティヘッダー（`nosniff`、`X-Frame-Options: DENY`）が付く |
| 1リクエストあたりの CPU 時間（無料プランは 10ms） | ページはすべてビルド時に静的生成しており、`/llms.txt` も今回静的生成に変えた。リクエストごとの処理は、キャッシュ済みの HTML を返すことと、無料モードの API が 503 を返すことだけで、ローカル計測では 10〜50ms（待ち時間を含む）。**実際の CPU 時間は本番に公開しないと測れない** |
| 起動時の CPU 時間 | ローカルでは確認できない。上限を超えた場合はデプロイの時点でエラー（`Script startup exceeded CPU time limit`）になり、サイトは公開されない。そのときは「4. うまくいかないとき」を参照 |

**結論：無料公開モードは、Cloudflare Workers の無料プランで動く見込みが高い。** 本番の CPU 時間だけは、公開後に Workers のログで確認する。

## 2. 動かない・注意が必要な機能と代替案

| 機能 | 状況 | 代替案 |
|---|---|---|
| AI 生成（`/api/preview`、`/api/generate`） | 無料モードでキーがなければ使わない。キーを入れた場合、通信の待ち時間は CPU 時間に数えないが、長い出力（最大32,000トークン）を受け取るときの処理が **10ms を超えるおそれがある** | 有料版を始めるときは **Workers Paid（月額5ドル。CPU は既定で30秒）** に切り替える。販売を始める時期に合わせればよい |
| Stripe 決済 | 無料モードでは使わない | Workers でも動く fetch 方式のクライアントに変更済み（`lib/stripe.ts`）。有料版を始める前に、テストキーで決済の往復を確認する |
| `maxDuration = 300` | Workers では無視される（HTTP リクエストの経過時間に上限はない） | 対応不要 |
| レート制限 | メモリ上の制限はインスタンスごと（Vercel と同じ） | AI を有効にするときは Upstash（無料枠）を設定する |
| ISR・再検証 | このサイトでは使っていない。今回の設定（静的ファイルのキャッシュ）は再検証に対応しない | 将来必要になったら R2 キャッシュに切り替える（R2 の有効化には支払い方法の登録が必要） |
| 環境変数の反映 | ページはビルド時に環境変数を読み込む。Workers Builds では、**ビルド用の変数**と**実行時の変数**を別々に設定する必要がある | 下の手順どおり、両方に設定する |

**商用利用について**：Vercel の無料プラン（Hobby）は、規約で商用利用を禁止しています。Cloudflare の規約（Self-Serve Subscription Agreement）では、無料プランの商用利用を禁止する記載は見つかりませんでした。ただし法的な確認はしていません。有料販売を始める前に、オーナーが規約を確認してください。

**参考**：Cloudflare は現在、新しい Next.js アプリには OpenNext ではなく vinext を推奨しています。既存のアプリには OpenNext の利用が引き続き案内されているので、今回は OpenNext を使いました。

## 3. 公開手順（オーナー向け・クリック中心）

所要時間は30分ほどです。Cloudflare のアカウント作成とデプロイはオーナーが行います。

### 3-1. Cloudflare のアカウントを用意する
1. https://dash.cloudflare.com/sign-up でアカウントを作る（無料。クレジットカードは不要）
2. 左のメニューから **Workers & Pages** を開く。初めて開くと `workers.dev` のサブドメイン（例：`yourname.workers.dev`）を決める画面が出るので、決める
   - 公開 URL は `https://gensan-zero.<サブドメイン>.workers.dev` になる

### 3-2. GitHub リポジトリをつなぐ
1. **Workers & Pages** → **Create**（作成）→ **Import a repository**（リポジトリをインポート）
2. **Connect GitHub** で GitHub と連携し、`masahiro20/new-project` へのアクセスを許可する
3. リポジトリ `new-project` を選ぶ

### 3-3. ビルドの設定（入力する値）

| 項目 | 値 |
|---|---|
| Project name（プロジェクト名） | `gensan-zero`（`wrangler.jsonc` の `name` と同じにする） |
| Production branch（本番ブランチ） | 公開に使うブランチ（例：`main`。本部がマージしてから。マージ前なら `peter/p0-genzan-zero`） |
| Build command（ビルドコマンド） | `npx opennextjs-cloudflare build` |
| Deploy command（デプロイコマンド） | `npx opennextjs-cloudflare deploy` |
| Root directory（ルートディレクトリ） | 空欄のまま |

**Build variables（ビルド用の変数）**：「Advanced settings」または、作成後の **Settings → Build → Build Variables and Secrets** で追加する。

| 名前 | 値 |
|---|---|
| `LAUNCH_MODE` | `free` |
| `NEXT_PUBLIC_SITE_URL` | `https://gensan-zero.<サブドメイン>.workers.dev`（独自ドメインを使うならそのURL） |

実行時の `LAUNCH_MODE=free` は `wrangler.jsonc` に書いてあるので、ダッシュボードでの設定は不要です。

### 3-4. デプロイして確認する
1. **Save and Deploy**（保存してデプロイ）を押す。ビルドには数分かかる
2. 完了したら、表示された URL を開いて次を確認する
   - トップ、無料診断、解説、書類サンプルが表示される
   - 書類サンプルの「Wordで保存」でファイルがダウンロードできる
   - フッターに「特定商取引法に基づく表記」がない
   - `/sitemap.xml` の URL が `https://gensan-zero.…workers.dev` になっている（`localhost` ではない）
3. `NEXT_PUBLIC_SITE_URL` を設定し忘れた場合や、サブドメインが後から決まった場合は、変数を追加して **Deployments → Retry build**（ビルドをやり直す）を押す

### 3-5. 公開後に確認すること
- **Workers & Pages → gensan-zero → Observability（ログ）** で、`Exceeded CPU Limit`（エラー 1102）が出ていないか、数日確認する
- Google Search Console に `https://gensan-zero.<サブドメイン>.workers.dev/sitemap.xml` を登録する

## 4. うまくいかないとき

| 症状 | 対処 |
|---|---|
| デプロイ時に `Script startup exceeded CPU time limit` | Workers Paid（月額5ドル）にする。お金をかけない方針を守るなら、無料モードのページだけを静的書き出し（`output: "export"`）して Workers の静的アセットだけで公開する案がある（API は使えなくなる。必要なら Mina が対応する） |
| ログに `Exceeded CPU Limit`（エラー 1102）が出る | 同上 |
| サイズ超過（`exceeded size limit`） | 現在は 1.70 MiB なので起きないはず。依存を増やしたときは `npx wrangler deploy --dry-run --outdir /tmp/cf` で圧縮後のサイズを確認する |
| 1日10万リクエストを超える | 無料プランの上限。超えた分はエラーになる。ここまで来たら Workers Paid を検討する |

## 5. 開発者向け（ローカルで確認する）

```bash
npm ci
LAUNCH_MODE=free NEXT_PUBLIC_SITE_URL=https://gensan-zero.example.workers.dev npm run cf:preview   # workerd で http://localhost:8787
npx wrangler deploy --dry-run --outdir /tmp/cf   # サイズの確認（ログイン不要、アップロードしない）
```

- 追加・変更したファイル：
  - `wrangler.jsonc`：Worker の設定
  - `open-next.config.ts`：静的ファイルのキャッシュ設定
  - `public/_headers`：`/_next/static` を長期間キャッシュする設定
  - `.dev.vars.example`
  - `package.json`：`cf:build`、`cf:preview`、`cf:deploy` を追加
  - `next.config.ts`：`initOpenNextCloudflareForDev` を追加
- Vercel にデプロイする場合も、これまでどおり `npm run build` で動きます（Cloudflare 用の設定は影響しません）

## 出典
- OpenNext Cloudflare：https://opennext.js.org/cloudflare 、https://opennext.js.org/cloudflare/get-started 、https://opennext.js.org/cloudflare/caching
- Cloudflare Workers の制限：https://developers.cloudflare.com/workers/platform/limits/
- Workers Builds の設定：https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Workers Builds の制限（無料プランは月3,000分、同時ビルド1、タイムアウト20分）：https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- ビルド環境（Node.js の既定は 24）：https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
- Cloudflare の OpenNext ガイド（vinext の推奨を含む）：https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
