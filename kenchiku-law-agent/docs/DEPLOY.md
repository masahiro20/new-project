# デプロイ手順と運用（Vercel）

## 現在の状態（2026-10-18）

| 項目 | 値 |
|---|---|
| 本番 URL | https://kenchiku-law-agent.vercel.app |
| Vercel プロジェクト | `kenchiku-law-agent`（prj_xPSU7KH3v6sNzhB0GEPN6OlI5xAb） |
| 環境変数 | `ACCESS_PASSWORD`（設定済み・sensitive）、`LAW_AGENT_MODEL=claude-opus-5-5`、`CONSULT_RATE_LIMIT=20`、`NEXT_PUBLIC_SITE_URL` |
| 未設定 | **`ANTHROPIC_API_KEY`**（これを入れるまでエージェント回答は動きません。即時チェック・条文表示は動きます） |

## 初回に必要な作業（1回だけ）

1. Vercel ダッシュボード → `kenchiku-law-agent` → Settings → Environment Variables で `ANTHROPIC_API_KEY` を Production / Preview に追加（値は https://console.anthropic.com で発行）。追加後、Deployments から最新を Redeploy。
2. GitHub に空のリポジトリ `kenchiku-law-agent` を作成（Private）。
3. Vercel → Settings → Git → Connect Git Repository で `masahiro20/kenchiku-law-agent` を接続し、Settings → General → Root Directory を空にする（移行前は `kenchiku-law-agent` サブディレクトリを指している）。
4. 以降は `main` への push で自動デプロイ。

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
