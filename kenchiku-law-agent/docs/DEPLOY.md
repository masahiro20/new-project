# デプロイ手順と運用（Vercel）

## 現在の状態（2026-10-18）

| 項目 | 値 |
|---|---|
| 本番 URL | https://kenchiku-law-agent.vercel.app |
| Vercel プロジェクト | `kenchiku-law-agent`（prj_xPSU7KH3v6sNzhB0GEPN6OlI5xAb） |
| 環境変数 | `ACCESS_PASSWORD`（設定済み・sensitive）、`LAW_AGENT_MODEL=claude-opus-5-5`、`CONSULT_RATE_LIMIT=20`、`NEXT_PUBLIC_SITE_URL` |
| 未設定 | **`ANTHROPIC_API_KEY`**（エージェント回答に必要）、**`REINFOLIB_API_KEY`**（住所からの用途地域・災害区域の自動取得に必要。無料・申請制） |

## なぜ API キーが2つ要るのか

- `ANTHROPIC_API_KEY`：デプロイしたサーバーが Claude を呼ぶための鍵です。claude.ai の個人契約（ブラウザのログイン）は Web アプリからは使えないため、API 用の鍵が別に必要です。従量課金で、1回の法令チェックは概ね数十円（条文取得と Web 検索込み）です。
- `REINFOLIB_API_KEY`：国土交通省 不動産情報ライブラリの GIS データ（用途地域・区域区分・防火指定・災害区域）を取得する鍵です。無料ですが利用申請が必要で、発行に数営業日かかります。

## 初回に必要な作業（1回だけ）

1. Anthropic Console（https://console.anthropic.com）で API キーを発行し、Vercel → `kenchiku-law-agent` → Settings → Environment Variables に `ANTHROPIC_API_KEY` を Production / Preview で追加。
2. 不動産情報ライブラリ（https://www.reinfolib.mlit.go.jp/）右上の「API利用申請」から申請し、届いたキーを `REINFOLIB_API_KEY` として同様に追加。
3. 追加後、Deployments から最新を Redeploy。
4. GitHub に空のリポジトリ `kenchiku-law-agent` を作成（Private）。コードの移行は Claude 側で行います。
5. Vercel → Settings → Git → Connect Git Repository で `masahiro20/kenchiku-law-agent` を接続し、Settings → General → Root Directory を空にする（移行前は `kenchiku-law-agent` サブディレクトリを指している）。
6. 以降は `main` への push で自動デプロイ。

## 日常の運用

- 社内メンバーには URL とアクセスキー（`ACCESS_PASSWORD` の値）を共有。キーを変えるときは Vercel の環境変数を更新して Redeploy。
- 月1回、ローカルで `npm run verify-sources -- --check` を実行。`FAIL` または `CHG` が出たら `lib/knowledge.ts` の該当ルールを確認して更新し、`npm run verify-sources` でスナップショットを更新して push。
- Vercel の Deployment Protection（Vercel Authentication）を有効にすると、アクセスキーに加えて Vercel アカウントでの認証も要求でき、より確実に社内限定にできます。

## ローカル確認

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を記入
npm run dev
```
