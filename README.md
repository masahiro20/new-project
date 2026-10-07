# 減算ゼロ

障害福祉サービス事業所向けに、虐待防止・身体拘束等適正化の年間書類をAIで作成するWebサービスです。
事業計画は [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) を参照してください。

## できること

- **無料**：減算リスク診断（`/check`）、年間実施計画の作成（AI・1時間3回まで）
- **有料（1回払い）**：3つの書類セットを同時に作成
  - 虐待防止委員会セット（年間計画・議事次第・議事録）
  - 虐待防止研修セット（研修資料・理解度テスト・実施記録）
  - 身体拘束等適正化セット（指針・委員会チェックリスト・記録様式）
- Word（.docx）保存、コピー、印刷
- 集客用の解説ページ（`/guide`）、AI検索向けの `llms.txt`、構造化データ、サイトマップ

## 仕組み

| 部分 | 使用技術 |
|---|---|
| 画面・サーバー | Next.js（App Router） |
| 書類生成 | Claude API（`claude-opus-5-5`、ストリーミング、拒否時は自動フォールバック） |
| 決済 | Stripe Checkout（支払い済みかつ入力内容が一致する場合のみ生成） |
| 保存 | なし（入力はブラウザ内のみ。サーバーに個人情報を残さない） |

## ローカルで動かす

```bash
npm install
cp .env.example .env.local   # キーを記入
npm run dev                  # http://localhost:3000
```

決済なしで有料フローを確認したいときは、`.env.local` に `PAYMENT_DISABLED=true` を設定します（本番ビルドでは無効になります）。

## 公開手順

1. **Anthropic**：https://console.anthropic.com で API キーを発行する
2. **Stripe**：アカウントを作り、本人確認を済ませてシークレットキーを取得する
3. **ホスティング**：Vercel などに GitHub リポジトリを接続する
   - 商用利用になるため、Vercel の場合は Pro プランが必要です
   - 環境変数 `ANTHROPIC_API_KEY`、`STRIPE_SECRET_KEY`、`NEXT_PUBLIC_SITE_URL`、`PRICE_JPY` を設定する
4. `app/legal/page.tsx` と `app/privacy/page.tsx` の【要記入】を埋める（特定商取引法の表記は販売前に必須）
5. Google Search Console にサイトマップ（`/sitemap.xml`）を登録する

## チェック

```bash
npm run typecheck
npm run build
```

---

## 同じリポジトリ内の別プロジェクト

- [`cat-lab/`](cat-lab/README.md)：主従研究所（猫様と下僕の主従関係診断。Next.js 製の独立したアプリ）
