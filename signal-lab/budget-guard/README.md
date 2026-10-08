# Budget Guard（P2 Signal Lab / ステージ2 試作・非公開）

Vercel・OpenAI・Anthropic の利用額を毎時取得し、月の予算の **80% でメール**、**100% で停止アクション**を実行するツール。
`signal-lab/template/` の48時間ローンチテンプレートをコピーして作った（テンプレート部分の説明は [TEMPLATE-README.md](TEMPLATE-README.md)）。

## 動かす
```bash
npm install
npm run dev        # 環境変数なしで動く。/pricing → 開発用チェックアウト → /app
npm run typecheck && npm test && npm run build
```
連携追加でトークンに `demo` と入れると、外部APIを呼ばずに固定データで動く（開発時のみ。本番では拒否）。

## 構成（テンプレートに足したもの）
| ファイル | 役割 |
|---|---|
| `lib/guard/providers.ts` | 3社の利用額取得と停止計画（エンドポイントは `docs/provider-apis.md`） |
| `lib/guard/evaluate.ts` | 80% / 100% の判定。通知・停止は月に1回だけ。月が変わると再武装 |
| `lib/guard/stop.ts` | 停止の実行（off / test / live）と確認チャレンジ（HMAC 署名・5分・計画の指紋・ラベルの入力） |
| `lib/guard/check.ts` | 1接続ぶんの毎時処理（取得 → 判定 → 通知 → 停止） |
| `lib/guard/crypto.ts` | トークンの AES-256-GCM 暗号化（接続IDを AAD に束縛） |
| `lib/guard/store.ts` / `service.ts` | KV への保存、メール、cron 全体の処理 |
| `app/(product)/app/` | ダッシュボード、停止設定ページ（`c/[id]`）、Server Actions |
| `app/api/cron/check` + `vercel.json` | 毎時 cron（`CRON_SECRET` で認証） |

## 停止アクション
| 連携 | 停止 | 元に戻す |
|---|---|---|
| Vercel | 指定プロジェクトを pause | unpause |
| OpenAI | プロジェクトに予算額のハード上限（月次）を設定 | 上限を DELETE |
| Anthropic | 指定ワークスペースの有効な API キーを inactive に（除外キー指定可） | active に戻す |

取り消せない操作（OpenAI のプロジェクトのアーカイブやキー削除、Anthropic の archived）は使わない。

**安全策**
- 新しい接続は必ず **テストモード** で始まる。100% に達しても、送るはずのリクエストを記録するだけで実際には送らない。
- **live にする**ときと **今すぐ停止**するときは、次をすべて満たす必要がある：
  - 実際に送るリクエストの一覧を表示する。
  - 署名付きチャレンジを使う（5分有効、計画が変わったら無効になる）。
  - ユーザーが接続ラベルを正確に入力する。
- テストモードへ戻す（disarm）・停止を off にする操作は、確認なしでできる。
- 停止に失敗したら記録して通知し、次の毎時処理で再試行する。

## トークンと権限
- トークンは検証（読み取り専用の利用額取得）に成功したときだけ保存する。暗号文と伏せ字（先頭4文字＋末尾4文字）だけを持ち、画面には二度と出さない。接続を削除するとトークンも消える。
- **3社とも、コスト取得専用の読み取りキーはない**（2026-10-08 時点の公式ドキュメント）。利用額の読み取りと停止は同じキーで行うことになる。対策は次のとおり：
  - 最小範囲の発行をUIで案内する（Vercel はチーム限定・Member ロール・有効期限付き、OpenAI / Anthropic は Budget Guard 専用の Admin キー）。
  - 停止の対象は、ユーザーが指定したプロジェクトとワークスペースに限る。

## 公式ドキュメントで確認できなかったこと（詳細は docs/provider-apis.md §5）
- Vercel：`/v1/billing/charges` のデータの反映遅延。合計額と Spend Management の予算（Pro のクレジット超過分）の関係。プロジェクト単位のトークンで呼べるか。pause を API で呼ぶのに必要なロール。
- OpenAI：Costs のデータの鮮度。現在の利用額より低い上限を設定したとき、すぐに止まるか。
- Anthropic：inactive から active へ確実に戻せる保証。Priority Tier は cost_report に含まれない。
- 3社ともコストは日単位でしか出ない。毎時の取得は当日の途中経過になる。

## まだやっていないこと
- 実アカウントでの疎通確認（本番キーは未使用。デモ用のフェッチとユニットテストのみ）
- Vercel Spend Management の webhook 受信（より早く検知するための補助）
- 通知先の追加（Slack・Webhook）、使用量のグラフ
- 価格（$9/月・$79/年）はオーナーの承認待ち。ステージ1案の「$79 年間買い切り」は、テンプレートの買い切りが無期限になるため、年額サブスクに置き換えた。
