# P0 有料版 API Worker のセキュリティ修正（統合パッチ）

対象：`peter/p0-genzan-zero` の `9ac55da`。2人のレビュアー（A：a-1〜a-6、B：b-01〜b-05）のパッチを、検証してから1つの系列にまとめたもの。ID は `../findings.json` の SEC-xx。

## 当て方

作業ツリーのルートで、番号順に当てる（`git am` ではなく `git apply`。各ファイルの先頭は日本語の説明で、`git apply` は読み飛ばす）。

```bash
for p in peter-hq/qa/p0-security/patches/0*.patch; do git apply --check "$p" && git apply "$p"; done
npx tsc --noEmit   # 元からある app/hero.svg のエラー1件だけが残る
npm run lint
npm test           # 23件（既存 8件＋tests/security.test.mjs 15件）
```

## 系列

| # | ファイル | 直すもの（統合元） | 変更するファイル |
|---|---|---|---|
| 0001 | `0001-sec01-demo-no-real-ai.patch` | SEC-01 デモ購入は本物の AI を使わない。`DEMO_ALLOW_REAL_AI=1` のときだけ（A-01、B-01） | lib/api/handlers.ts |
| 0002 | `0002-sec02-turnstile-fail-closed.patch` | SEC-02 キーがあるのに Turnstile 未設定なら 403、SEC-14 hostname を確認（B-02、B-08） | lib/turnstile.ts |
| 0003 | `0003-sec03-ratelimit-ipv6-fail-closed.patch` | SEC-03 IPv6 /64、fail-closed、全体の1日上限、SEC-06 multi-exec＋TTL の修復（A-02、A-03、A-04、B-03、B-10） | lib/ratelimit.ts、lib/api/handlers.ts |
| 0004 | `0004-sec05-demo-signing.patch` | SEC-05 署名鍵のフォールバックは development/test だけ、subtle.verify（A-05、A-06） | lib/payments/demo.ts |
| 0005 | `0005-sec04-payments-mode-required.patch` | SEC-04 Worker は PAYMENTS_MODE 未設定なら 503、SEC-11 例外は CORS 付き 500（A-07、A-08） | worker/src/index.ts、lib/payments/mode.ts |
| 0006 | `0006-sec10-checkout-ratelimit.patch` | SEC-10 /api/checkout を IP ごと 20回/時（A-09） | lib/api/handlers.ts |
| 0007 | `0007-sec09-stream-cancel.patch` | SEC-09 切断で上流を abort、お試しの max_tokens 4000（B-05） | lib/claude.ts |
| 0008 | `0008-sec08-prompt-data-tags.patch` | SEC-08 入力を `<facility_input>` で囲む、`< >` は全角に（B-06） | lib/prompts.ts |
| 0009 | `0009-config-and-runbook.patch` | wrangler.jsonc の var、docs/paid-launch.md の手順 | worker/wrangler.jsonc、docs/paid-launch.md |
| 0010 | `0010-security-tests.patch` | 回帰テスト 15件と npm test への追加 | tests/security.test.mjs、package.json |

## 統合で決めたこと

- フラグ名は `DEMO_ALLOW_REAL_AI` に統一（B 案の `DEMO_REAL_AI` は使わない）。
- デモ購入で本物の AI を使わないときは、503（A 案）ではなくモック出力（B 案）を返す。キーを入れた状態でもデモの通し確認ができる。
- fail-closed の条件は B 案（本物のキーがあり、Redis が「無い」か「失敗した」とき。`RATE_LIMIT_ALLOW_MEMORY=1` で緩和）。A 案は「設定済みで失敗」だけだった。デモ購入の `demo-generate` は、本物の AI を使うとき（`DEMO_ALLOW_REAL_AI=1`）だけ fail-closed。
- IPv6 の丸めは A 案（`rateLimitSubject`、IPv4-mapped 対応）に B 案のゾーン ID の除去を足した。
- Upstash は A 案の multi-exec に加えて PTTL を読み、-1 なら PEXPIRE（B-10 の案）。
- b-05 のタグ除去は入れ子で回避できたため、`< >` の全角化に変更。

## 運用で必要になること（0009 の docs のとおり）

- `ANTHROPIC_API_KEY` は `PAYMENTS_MODE=stripe` への切り替えと同時に入れる。
- 先に Turnstile（`TURNSTILE_SECRET_KEY`、Pages の `NEXT_PUBLIC_TURNSTILE_SITE_KEY`）と Upstash（`UPSTASH_REDIS_REST_URL` / `_TOKEN`）を入れる。無いと、キーを入れたあと無料お試しは 403/429 になる。
- Anthropic Console の Limits で月の上限を設定する。
- `PAYMENTS_MODE` は消さない（消すと Worker は 503）。
- お試しの `max_tokens` 4000 は、公開前に本物の出力で切れないことを確かめる。

## 確認したこと（2026-10-09）

`$SP/p0` を新しくコピーし（.git を消して `git init`）、`npm ci --ignore-scripts` のあと、0001〜0010 を順に `git apply --check` → `git apply`：すべて成功。`tsc --noEmit` は hero.svg の1件だけ、`npm run lint` はエラーなし、`npm test` は 23/23、`npm run api:check` は圧縮後 339.56 KiB。新しいテスト 15件は、修正前のコードでは 12件が失敗する。
