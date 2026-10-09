# 有料版を出す手順（1枚）— オーナー作業 約30分

**仕組み**：解説などの情報ページは、今の GitHub Pages のまま。購入と AI 生成だけを、Cloudflare Workers（無料プラン）の別の Worker「gensan-zero-api」が受け持つ。Pages 側の購入ボタンは、この Worker の URL を設定して書き出したときだけ表示される（スイッチは1つ）。

```
利用者のブラウザ ──(ページ)──▶ GitHub Pages  https://masahiro20.github.io/new-project/
        └────(購入・生成 API)──▶ Cloudflare Worker  https://gensan-zero-api.<サブドメイン>.workers.dev
                                   ├─ Stripe（決済）   ├─ Anthropic（AI 生成）
```

デモ決済（お金は動かない）と AI のモックで、購入 → 3セットの生成 → Word 保存までを workerd で通しで確認済み（下の「確認済みのこと」）。

> **重要（セキュリティ確認 2026-10-09、Atlas）**：Worker に `ANTHROPIC_API_KEY` を入れてよいのは、セキュリティパッチ 0001〜0005（デモ購入では AI を使わない、Turnstile 必須、レート制限の fail-closed、デモ署名の鍵、PAYMENTS_MODE の明示）が入ったコード（コミット `9ac55da` より後で、このページにこの注意がある版）をデプロイしてからにする。入れる順番は、Turnstile と Upstash の Secret → Anthropic の月額上限 → 本物の決済への切り替えと同時にキー。

## オーナーがやること

| # | 作業 | どこで | 時間 | 入れるもの・控えるもの |
|---|---|---|---|---|
| 1 | Cloudflare のアカウントを作り、Workers のサブドメインを決める | https://dash.cloudflare.com/sign-up → 左メニュー「Workers & Pages」 | 5分 | サブドメイン（例 `genzan`）→ 本部へ |
| 2 | API の Worker を GitHub から作る | 「Workers & Pages」→ Create → **Import a repository** → `masahiro20/new-project` | 5分 | 下の「Worker の設定値」をそのまま入力 |
| 3 | デモ用の署名鍵を入れる | 作った Worker → **Settings → Variables and Secrets** → Add → 種類 **Secret** | 2分 | `DEMO_SIGNING_SECRET` = 長いランダム文字列（パスワード生成機能で32文字以上） |
| 4 | Stripe の準備（テストモード） | https://dashboard.stripe.com → 本人確認 → 開発者 → API キー | 10分 | **テスト用**シークレットキー `sk_test_…` を手順3と同じ場所に Secret `STRIPE_SECRET_KEY` で入れる。設定 → メール → **支払い成功時の領収書メール**をオン |
| 5 | ロボット対策と共通のレート制限を入れる（**必須**。AI のキーより先に） | Cloudflare → Turnstile（サイトのホスト名 `masahiro20.github.io`）／ https://console.upstash.com → Redis（無料枠）→ REST API | 10分 | Worker の Secret `TURNSTILE_SECRET_KEY`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。Turnstile のサイトキーは本部へ（Pages の書き出しで `NEXT_PUBLIC_TURNSTILE_SITE_KEY` に使う）。Upstash の **使用量アラート**もオンにする |
| 5b | AI の月額上限を決めて設定する（キーはまだ入れない） | https://console.anthropic.com → Settings → **Limits**（月の上限）と使用量の通知 | 3分 | 上限額（例：最初の月は 1万円相当）→ 本部へ。キー `ANTHROPIC_API_KEY` は本部の手順4（本物の決済への切り替え）と**同時に**入れる（本部の決定 d17）。入れたら本部が品質チェック（docs/quality.md）を回す |
| 6 | 販売者情報を本部に渡す | — | 3分 | 販売事業者名、運営責任者、所在地（または「請求があれば遅滞なく開示」）、連絡先メール。特商法の表記・利用規約・プライバシーポリシーに入る |

**Worker の設定値**（手順2）

| 項目 | 値 |
|---|---|
| Project name | `gensan-zero-api` |
| Production branch | 公開に使うブランチ（本部が指定。例 `main`） |
| Build command | 空欄 |
| Deploy command | `npx wrangler deploy -c worker/wrangler.jsonc` |
| Root directory | 空欄 |

**本部・Mina がやること**（オーナーの作業のあと）

1. Worker の URL（`https://gensan-zero-api.<サブドメイン>.workers.dev`）を確認し、`/api/preview` に OPTIONS を送って 204 が返ることを見る。
2. Pages をデモ決済で書き出し直す：
   `NEXT_PUBLIC_PAID_API_URL=https://gensan-zero-api.<サブドメイン>.workers.dev npm run export:pages` → gh-pages に公開。
   全ページに「デモ：実際の請求はありません」が出て、テストカード `4242 4242 4242 4242` で購入から生成まで通ることを確認する。
3. 手順6の販売者情報を `app/legal/page.tsx`・`app/terms/page.tsx`・`app/privacy/page.tsx` に入れる（Mina）。
4. **本物の決済に切り替える**（スイッチ。AI のキーはここで初めて入れる）：
   - 先に手順5（Turnstile・Upstash）と手順5b（Anthropic の月額上限）が済んでいることを確かめる。どれかが無いと、キーを入れたあと無料お試しは 403/429 で止まる（費用を守るための仕様）。
   - `worker/wrangler.jsonc` の `"PAYMENTS_MODE": "demo"` を `"stripe"` にしてプッシュ（Worker が自動で再デプロイ）し、**同時に** Secret `ANTHROPIC_API_KEY` を入れる。`PAYMENTS_MODE` は消さない（未設定だと Worker はすべて 503 を返す）。`DEMO_ALLOW_REAL_AI` は `"0"` のまま。
   - Pages を `NEXT_PUBLIC_PAID_API_URL=… NEXT_PUBLIC_PAYMENTS_MODE=stripe NEXT_PUBLIC_TURNSTILE_SITE_KEY=… npm run export:pages` で書き出し直す（バナーが消え、特商法の表記が公開される）。
   - **2つの PAYMENTS_MODE は必ずそろえる**（Pages がデモ表示なのに Worker が本物の決済、を防ぐ）。
   - Stripe のテストカードで1回購入し、領収書メールと生成を確認 → 問題なければ `STRIPE_SECRET_KEY` を本番キー `sk_live_…` に差し替える。

## 判断が必要なこと（お金）

- **Workers の無料プランの CPU 上限（1リクエスト10ms）**：AI の長い出力を受け取る処理が上限を超えるおそれがある（docs/deploy-cloudflare.md）。本物の AI で生成するときは、**Workers Paid（月5ドル）** への切り替えを推奨。超えた場合は Worker のログに「Exceeded CPU Limit」と出る。
- **デモ決済のまま AI のキーを入れない**：デモ決済はカードの確認をしないので、curl だけで誰でも購入扱いにできる。キーがあっても、デモ購入の生成はモック出力になり AI は使わない（`DEMO_ALLOW_REAL_AI=1` にしたときだけ本物の AI。使わないこと）。ただし無料お試しはキーがあれば本物の AI を使うので、キーを入れるのは本物の決済に切り替えるときにする。
- **無料お試しの費用の上限**：IP ごと（IPv6 は /64 ごと）に1時間3回、サイト全体で1日 `PREVIEW_PER_DAY` 回（既定 300）。全体の上限に達すると、その日はほかの利用者も無料お試しを使えない（費用を優先した設計）。最後の砦は Anthropic Console の月額上限。
- **1回の購入あたりの AI 費用**：1つの購入で作成できるのは、3セット合わせて**合計15回**（最初の3回を含む、7日間）。超えると「上限に達しました」と表示して止める（本部の決定 d30、セキュリティ確認 SEC-07）。回数は Upstash で数えるので、本物の AI を使うときは Upstash が必須。Upstash に届かないときは「一時的に混み合っています…（書類の作成は行われていません）」と表示して断る（上限とは別の表示。503）。

## 任意（あとからでよい）

| 名前 | 場所 | 内容 |
|---|---|---|
| `PREVIEW_PER_DAY` | `worker/wrangler.jsonc` | 無料お試しのサイト全体の1日の上限（既定 300） |
| `TURNSTILE_EXPECTED_HOSTNAMES` | `worker/wrangler.jsonc` | Turnstile を解いたホスト名の許可リスト（既定 `masahiro20.github.io`）。独自ドメインに移したら変える |
| `PRICE_JPY` | `worker/wrangler.jsonc` | 価格（既定 2980） |
| `ALLOWED_ORIGINS` | `worker/wrangler.jsonc` | API を呼べるサイト（既定 `https://masahiro20.github.io`）。独自ドメインに移したら変える |

## 確認済みのこと（2026-10-09、Mina）

- workerd（`npm run api:dev`）でデモ決済＋AI モック（`AI_MOCK=1`）にした Worker と、`NEXT_PUBLIC_PAID_API_URL` を付けて書き出した静的サイトを、ブラウザで操作した：
  無料お試し（生成）→ 購入 → デモ決済ページ（テストカード）→ 3セットの生成 → Word 保存（.docx として開ける）→ 再読み込みで再生成せずに表示、のすべてが成功。API は 6回とも 200、ブラウザのエラー 0件。
- CORS：許可したサイト以外からの呼び出しは 403。
- Worker のサイズ：圧縮後 約340KiB（無料プランの上限内）。
- `NEXT_PUBLIC_PAID_API_URL` を付けずに書き出すと、従来どおり無料公開モード（購入ボタンなし）。

## 開発者向け

```bash
# API Worker をローカルで（デモ決済＋モック）
npx wrangler dev -c worker/wrangler.jsonc --var PAYMENTS_MODE:demo --var AI_MOCK:1 \
  --var DEMO_SIGNING_SECRET:dev --var ALLOWED_ORIGINS:http://localhost:8099 \
  --var NEXT_PUBLIC_SITE_URL:http://localhost:8099/new-project
# その API を使う静的サイト
NEXT_PUBLIC_PAID_API_URL=http://127.0.0.1:8787 NEXT_PUBLIC_SITE_URL=http://localhost:8099/new-project npm run export:pages
npm run api:check   # サイズ確認（アップロードしない）
```

- API の処理は `lib/api/handlers.ts` にまとめ、Next.js の `app/api/*` と Worker（`worker/src/index.ts`）の両方から使う。
- AI のモック（`lib/ai-mock.ts`）は `AI_MOCK=1` かつ `ANTHROPIC_API_KEY` が未設定のとき、またはデモ購入の生成（`DEMO_ALLOW_REAL_AI=1` でないとき）に動き、出力の先頭に「テスト用のモック出力です」と出る。
- 本物のキーでローカル確認するときは、Turnstile のテスト用キー（常に成功）を使い、Upstash が無ければ `RATE_LIMIT_ALLOW_MEMORY=1` を付ける（付けないと無料お試しは 429）。
- `DEMO_SIGNING_SECRET` の固定の代わりの鍵は `NODE_ENV` が `development` か `test` のときだけ使われる。それ以外（`wrangler deploy` は `production` を埋め込む）で Secret が無いと、デモ決済は 502 になる。
- セキュリティの回帰テスト：`tests/security.test.mjs`（`npm test` に含まれる）。
