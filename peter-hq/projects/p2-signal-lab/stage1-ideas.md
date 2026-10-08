<!-- Vega（P2 リーダー）のステージ1レポート。セッション間メッセージで受領し、本部で保存（元コミット 111ef15） -->
# P2 Signal Lab ステージ1：48時間ツール案 5つ（2026-10-08 / Vega）

調査対象：2026-09-08〜10-08 の Hacker News、X、Product Hunt（サブエージェント3体で並列調査）。

**調査の制約**
- X は直接読めなかった（402）。levelsio の投稿は levels.io の転載ページで確認した。
- Reddit と IndieHackers は読めなかった。
- HN のポイントは 10-08 時点の値。

## 案1. Budget Guard：API・クラウド費用の上限と停止スイッチ（★推奨）
- **対象と不満：** Vercel、Cloudflare、GCP、OpenAI、Anthropic の従量課金を使う開発者。上限がないので、AIクローラーや暴走ループで一晩に $4k〜$10k の請求が来る。アラートは届くが止めてはくれない。
- **出典：**
  - Simon Willison「default hard budget caps」HN 643pt / 311コメント https://news.ycombinator.com/item?id=49949235
  - AIクローラーで $4000 の請求 https://news.ycombinator.com/item?id=49950441
  - GCP の上限は4サービスのみ https://news.ycombinator.com/item?id=49949316
  - Cloudflare のハードキャップは Q4 に試作 https://news.ycombinator.com/item?id=49942987
  - Meta のボットで Vercel の請求が10倍 https://news.ycombinator.com/item?id=49732873
  - https://bex.co/blog/2026/09/25/vercel-renamed-meters-pricing-2024-2026
- **中核機能：** 各サービスの使用量を毎時取得し、上限と比べる。80%で通知し、100%で停止アクション（Vercel の一時停止、APIキーの無効化、webhook）を実行する。
- **課金：** $9/月（監視先3つまで）または $79 の年間買い切り。無料版は通知のみ。
- **48時間の分解：**

| 時間 | 作業 |
|---|---|
| 0–4h | LP とAPIの確認 |
| 4–16h | Vercel・OpenAI・Anthropic の3連携、毎時の cron、通知 |
| 16–24h | 停止アクション（確認手順とテストモード付き） |
| 24–32h | ダッシュボード、トークンの暗号化 |
| 32–40h | 決済、セキュリティの見直し |
| 40–48h | デモと投稿案 |

- **リスク：** Vercel 本体に Spend Management がある。差別化は「複数サービスを1か所で」「ネイティブで止められないものを止める」。他人のトークンを預かるので信頼が必要で、OSS 版を出す選択肢もある。

## 案2. AI Plan Watch：AIの料金・規約変更の監視
- **出典：**
  - Claude Code の週次上限の変更 https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-is-cutting-claude-codes-current-weekly-limits-by-17-percent/
  - Agent SDK のクレジット制移行 https://news.ycombinator.com/item?id=49997654
  - OpenAI Pro のプラン変更 https://news.ycombinator.com/item?id=49901067
  - https://news.ycombinator.com/item?id=49914891
- **中核機能：** 料金・プラン・規約のページを毎日取得し、差分を要約して通知する。
- **課金：** 無料は週1回のダイジェスト。$5/月で即時通知と変更履歴。

## 案3. Bot Bill Analyzer：ボットが生む請求の可視化と遮断ルールの生成
- **出典：**
  - https://news.ycombinator.com/item?id=49732873
  - https://news.ycombinator.com/item?id=49705724
  - https://news.ycombinator.com/item?id=49742353
- **中核機能：** ログをアップロードすると、ボット別の推定費用を出し、proxy.ts・WAF・robots.txt のルールを生成する。
- **課金：** 1回 $19。継続監視は $9/月。

## 案4. LLM Cost Audit：LLM API のムダの診断
- **出典：**
  - https://news.ycombinator.com/item?id=49975157
  - https://news.ycombinator.com/item?id=49864748
  - https://news.ycombinator.com/item?id=49691257
- **中核機能：** 利用ログから、キャッシュのヒット率、費用上位、削減できる額をレポートする。
- **課金：** 1回 $29。

## 案5. SaaS Replace Audit：「そのSaaS、自作で置き換えられる？」診断
- **出典：**
  - https://x.com/levelsio/status/2097692685775565031
  - https://levels.io/replaced-saas-with-vibe-coded-services
- **中核機能：** SaaS の契約一覧を入れると、置き換えやすさ、OSS の代替、仕様書を出す。
- **課金：** 3件まで無料、全件は $15。カード明細はブラウザ内だけで処理する。

## 推奨：最初の1本は Budget Guard
- 需要の証拠が最も強い。HN の議論が最大で、X と PH でも同じ不満が出ている。
- ベンダー側の対応が遅れている今が狙い目。
- 「$9/月で $4,000 の事故を防ぐ」と1行で説明できる。
- 自分たちの請求を守るのにも使える。

次点は AI Plan Watch。AI利用量のトラッカーは HN で混雑しているので避けた。
