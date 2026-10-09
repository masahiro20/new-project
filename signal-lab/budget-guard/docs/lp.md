# Budget Guard — landing page copy (EN)

> Status: draft for owner/HQ review. Not published. Pricing is **draft, pending approval**.
> Source of truth for claims: `README.md`, `product.config.ts`, `lib/guard/info.ts`, `docs/provider-apis.md`.
> Rules followed: no traction numbers, no user counts, no testimonials, no logos. Features that are not built are listed only under "Coming later".

## オーナー向け要約（日本語）

この節はオーナー向けの説明で、LP には載せない。LP の本文（英語）は海外の顧客向けなので英語のまま。

- **ステータス：** オーナー／本部レビュー用の下書き。未公開。
- **価格は案：** 下の Pricing の金額（Monthly $9／月）は **案で、承認待ち**。確定ではない。Yearly は「年払いは準備中」で、購入できない（Stripe での年払いを一度も確かめていないため。2026-10-09 のピーターの判断）。
- **出典：** 主張の根拠は `README.md`、`product.config.ts`、`lib/guard/info.ts`、`docs/provider-apis.md`。
- **守ったルール：** 実績の数字・ユーザー数・推薦文・ロゴは出さない。未実装の機能は「Coming later」にだけ書く。

各セクションの要旨：

| セクション | 要旨 |
|---|---|
| Hero | 「通知は知らせるだけ。Budget Guard は止める。」Vercel・OpenAI・Anthropic の利用額に予算をひとつ。毎時チェックし、80% でメール、100% で事前に設定・テストした停止を実行する。停止は元に戻せる。接続はすべてテストモードから始まる。 |
| The problem | 暴走ループや AI クローラーで一晩に高額請求になりうる。多くのサービスは通知するだけ。プロバイダごとに仕組みが違い、見る場所が増える。Hacker News の公開報告を 2 件引用（他人の報告で、自社データではないと明記）。 |
| How it works | 3 ステップ：① 専用トークンで接続（保存前に支出の読み取りで検証、暗号化して保存）② 月の予算と停止対象を選ぶ（まずテストモード）③ 準備ができたらライブにする。通知と停止は月 1 回で、月が変わると再武装。 |
| Three integrations | 3 社それぞれの「読むもの／100% での停止／戻し方」の表。Vercel はプロジェクトを一時停止、OpenAI はプロジェクトに予算額のハード上限、Anthropic はワークスペースの API キーを inactive。取り消せない操作はしない。各社の注意点（Vercel は本番のみ、OpenAI の上限は即時でない、Anthropic の Priority Tier は対象外）。 |
| Safety | テストモードが既定。ライブ化には 3 つの確認（リクエスト一覧・5 分で切れる署名付き確認・ラベル入力）。戻すのはワンクリック。失敗は記録・通知・再試行。トークンは AES-256-GCM で暗号化。最小権限の発行手順を案内。正直な注意：どの社にも読み取り専用のコストキーはない。 |
| How it compares | 各社の標準機能との比較表。1 社だけなら標準の上限から始めるべきと明記。Budget Guard の違いは、複数社の一元表示、事前にテストできる停止、細かい対象指定。標準機能の方が優れる点（プロバイダ側で強制、毎時より速い、第三者に管理キーを渡さない）も書いている。 |
| Alerts | 80% でメール（接続ごとに月 1 回）、Slack の incoming webhook、Vercel Spend Management の webhook で即時チェック。Vercel の通知だけでは止めず、その場で利用額を取り直して Budget Guard の予算で判定する。Vercel の 100% 通知だけで止めたい人は、接続ごとのオプトイン「Vercel の 100% 通知でも止める」をオンにする（初期値はオフ。オンにするには live への切り替えと同じ確認が要る）。 |
| Pricing | **案・承認待ち。** Monthly $9／月（監視接続 3 つまで、全利用者の接続数の合計に応じて 1〜12 時間ごとに確認（合計 50 接続までは毎時）、80% 通知と 100% 停止、テストモード）。Yearly は「年払いは準備中」で購入できない。いつでも解約でき、支払済み期間の終わりまで使える。 |
| FAQ | 必要なキー、管理者キーが要る理由、データの鮮度（日単位・途中集計）、100% で即止まるわけではないこと、通知だけの使い方、テストモードの中身、停止の戻し方（ユーザー自身が操作、ワンクリック復旧は未実装）、月替わりの動作、保存するデータと削除、標準機能の代わりではないこと。 |
| Coming later | 未実装：ワンクリック復旧、利用状況グラフ、Slack 以外の汎用 webhook、対応プロバイダの追加（例：Cloudflare、GCP。範囲は未定）。 |
| Final CTA | 次の想定外の請求の前に、ハードな停止を。初期段階の製品なので、ウェイトリストに登録してもらい、準備ができたら招待する。使い捨てのプロジェクトでテストモードから試せる。 |
| Alt headlines / Meta description | 見出しの別案 5 つと、検索結果用の説明文。それぞれ和訳を添えた。 |

---

## Hero

**Alerts tell you. Budget Guard stops it.**

One budget for your Vercel, OpenAI and Anthropic spend. Budget Guard checks every hour and emails you at 80%. At 100% it runs the stop you set up and tested ahead of time: it pauses a Vercel project, caps an OpenAI project, or deactivates Anthropic keys. You can undo each stop.

**[Join the waitlist]** · *Every connection starts in test mode. Nothing gets stopped until you switch it to live.*

---

## The problem

**A runaway loop or an AI crawler can run up a large bill overnight.**

- **Most usage-billed platforms only alert you.** You set a threshold, get an email, and the meter keeps running while you sleep.
- **Each provider works differently.** Every one has its own dashboard, its own units and its own idea of a "limit". If you use three of them, you're watching three places.
- **The alert often arrives after the damage.** On Hacker News, one developer described [a $4,000 bill from AI crawlers](https://news.ycombinator.com/item?id=49950441). Another discussion asks for [default hard budget caps](https://news.ycombinator.com/item?id=49949235) across cloud platforms. *(Both are public reports from other people. They are not our data.)*

---

## How it works

1. **Connect a provider.** Paste a dedicated token for Vercel, OpenAI or Anthropic. Before saving it, Budget Guard checks it by reading your current spend. The token is stored encrypted and never shown again.
2. **Set a monthly budget and pick what to stop.** Choose the Vercel project, the OpenAI project or the Anthropic workspace. The stop starts in **test mode**: when you hit 100%, Budget Guard records the exact requests it *would* send and doesn't send them.
3. **Go live when you're ready.** Review the request list, type the connection's label to confirm, and arm the stop. From then on, the hourly check emails you at 80% and runs the stop at 100%. Alerts and stops fire once per month and re-arm when a new month starts.

---

## Three integrations, and what "stop" means for each

| Provider | What Budget Guard reads | What "stop" does at 100% | How to undo it |
|---|---|---|---|
| **Vercel** | Billing charges for your team (daily) | **Pauses the projects you selected.** Production deployments return `503 DEPLOYMENT_PAUSED` to visitors. | **Unpause.** Vercel says production comes back within minutes, with no redeploy needed. |
| **OpenAI** | Organization costs (daily) | **Sets a hard monthly spend limit on the project, equal to your budget.** Once the limit is enforced, new requests fail with `429`. | **Delete the limit**, or raise it. |
| **Anthropic** | Cost report (daily) | **Sets the active API keys in the workspace you name to `inactive`.** You can exclude specific keys. | **Set them back to `active`.** Budget Guard lists the IDs of the keys it changed. |

**Budget Guard never takes an action you can't undo.** After every stop, it shows the exact undo steps on the stop page and in the activity log.

It doesn't archive OpenAI projects, delete OpenAI keys, or archive Anthropic keys or workspaces.

**Worth knowing:**
- **Vercel:** pausing affects production deployments only. AI Gateway and v0 usage are not paused ([Vercel docs](https://vercel.com/docs/spend-management)).
- **OpenAI:** OpenAI says the limit is "not instantaneous". Recorded spend can go slightly over the amount you set ([OpenAI docs](https://developers.openai.com/api/docs/guides/spend-limits)).
- **Anthropic:** Priority Tier costs are not included in Anthropic's cost report, so Budget Guard can't count them.

---

## Safety

You're giving a tool the power to stop production, so here's how we keep it from surprising you.

- **Test mode by default.** Every new connection starts in test mode. At 100% it logs the exact requests it would send and changes nothing.
- **Typed confirmation to go live.** Switching a stop to live, or pressing "stop now", needs all three of these:
  - You see the full list of requests it will send.
  - A signed confirmation that expires after 5 minutes. It stops working if the plan changes in the meantime.
  - You type the connection's label exactly.
- **Backing out is always one click.** Switching back to test mode or turning the stop off needs no confirmation.
- **Failures are reported.** If a stop fails, we log it, notify you, and retry on the next hourly check.
- **Encrypted tokens.** Tokens are encrypted with AES-256-GCM and bound to their connection. We keep only the encrypted value and a masked hint (the provider's public key prefix, such as sk-admin-, and the last 4 characters). The token is never displayed again. Deleting a connection deletes its token.
- **Least privilege, as far as each provider allows.** The setup screen tells you how to issue the narrowest token each provider allows:
  - **Vercel:** a token scoped to one team, ideally from a Member-role user, with an expiry date.
  - **OpenAI and Anthropic:** a dedicated Admin key just for Budget Guard, which you can revoke at any time.

  Budget Guard only touches the projects and workspace you name.
- **The honest caveat:** **none of the three providers offers a read-only key for cost data** (per their official docs as of 2026-10-08). The key that reads your spend is the same key that can pause, cap or deactivate. That's why we recommend a dedicated, revocable key and test mode first. It's also why you should only connect Budget Guard if you're comfortable with that trade-off.

---

## How it compares with the built-in tools

The providers' own controls are good, and they're free. If you only use one provider, start with its native limit. Budget Guard is for people who use several providers and want one budget view, a stop they can test first, and finer targeting where the native tool is coarse.

| | Built-in tool | What it does well | Where Budget Guard differs |
|---|---|---|---|
| **Vercel** | [Spend Management](https://vercel.com/docs/spend-management) (Pro, and Enterprise on Flex Commitment) | On-demand budget with notifications at 50/75/100%, webhooks, and an option to pause production. Vercel checks spend every few minutes, which is faster than our hourly poll. | Vercel's pause option pauses production for **every project on the team**. Budget Guard pauses only the projects you pick, and you can rehearse it in test mode. Budget Guard can also listen to Vercel's own Spend Management webhook, so it reacts as soon as Vercel reports 50/75/100% (see below). |
| **OpenAI** | [Project and organization spend limits](https://developers.openai.com/api/docs/guides/spend-limits) | Real hard limits, set in the dashboard or via API, plus separate spend alerts. | Budget Guard's OpenAI stop **uses this same native limit**: at 100% it sets the project's hard limit for you. What it adds is the 80% email, test mode, one view alongside Vercel and Anthropic, and written undo steps. If you're fine setting the limit yourself, you don't need us for OpenAI. |
| **Anthropic** | [Console spend limits](https://platform.claude.com/docs/api/rate-limits) (organization and workspace) | Monthly spend limits per organization and per workspace in the Console. Setting them through the API is in early access. | Budget Guard deactivates the keys in one workspace when your **own** budget is hit, lets you exclude keys, and lists the key IDs so you can set them back to active. It also shows the result next to your Vercel and OpenAI spend. |

**Where the native tools are better:** they enforce limits on the provider's side, often faster than an hourly poll, and they don't need a third party holding an admin token. We'd rather you know that before you sign up.

---

## Alerts

- **Email** at 80% of your monthly budget, once per month per connection.
- **Slack** alerts through a Slack incoming webhook you paste in.
- **Vercel Spend Management webhook:** add Budget Guard's webhook URL to your Vercel budget. When Vercel reports 50%, 75% or 100%, Budget Guard checks your spend right away instead of waiting for the next hour. Vercel's alert alone doesn't stop anything: your stop runs only if that check shows your Budget Guard budget is reached, because the budget you set in Vercel is a separate number. If you want Vercel's 100% alert to run your armed stop by itself, turn on "Stop on Vercel's 100% alert" for that connection (off by default; turning it on needs the same confirmation as arming). Each webhook is verified with a per-connection signing secret.

---

## Pricing — *draft, pending approval*

| Plan | Price | Includes |
|---|---|---|
| **Monthly** | **$9 / month** | Up to 3 monitored connections · Checked every 1–12 hours depending on total load (hourly up to 50 connections across all users) · 80% alert + 100% stop action · Test mode for every stop |
| **Yearly** | *Annual billing coming soon* | Everything in Monthly (not for sale yet) |

Cancel anytime from Manage billing. You keep access until the end of the paid period.

<!-- The check-frequency phrase is checkCadence() in lib/guard/schedule.ts (built from CHECK_INTERVAL_TIERS); tests/pricing.test.ts fails if this copy differs. -->

---

## FAQ

**Which keys do you need?**
A Vercel access token scoped to your team, an OpenAI Admin key, and an Anthropic Admin key (`sk-ant-admin…`). A normal OpenAI project key can't read costs. Create dedicated keys for Budget Guard so you can revoke them at any time.

**Why do you need admin-level keys just to read spend?**
None of the three providers offers a read-only cost key. The same key reads spend and runs the stop. We limit what Budget Guard touches to the projects and workspace you name, and every stop starts in test mode.

**How fresh is the data?**
All three providers report cost per day. Budget Guard checks every hour, so what you see for today is a partial total, and it can lag the provider by a few hours. On Vercel, connecting the Spend Management webhook triggers an extra check as soon as Vercel reports 50/75/100%.

**Will a stop fire the instant I cross 100%?**
No. A stop runs on the first check that sees you at or over 100%: the hourly check, or a Vercel webhook. Providers also report cost with a delay, and OpenAI notes that its own limit can be exceeded slightly. Treat Budget Guard as a backstop that limits the damage. It can't guarantee you'll never go over.

**Can I just get alerts?**
Yes. Leave the stop off, or keep it in test mode, and you'll only get alerts.

**What exactly happens in test mode?**
When you reach 100%, Budget Guard records the requests it would have sent: which project it would pause, which limit it would set, which keys it would deactivate. It doesn't send them. Use it to check that the right things would be stopped.

**How do I undo a stop?**
- **Vercel:** unpause the project.
- **OpenAI:** delete the spend limit or raise it.
- **Anthropic:** set the keys back to active.

After a stop, Budget Guard shows these steps with the exact project or key IDs. You run the undo yourself, in the provider's dashboard or API. A one-click undo inside Budget Guard is not built yet.

**What happens at the start of a new month?**
Alerts and stops fire at most once per month per connection. They re-arm automatically when the month changes. Undoing a stop is your call. It doesn't happen automatically.

**What do you store, and how do I delete it?**
For each connection we store the encrypted token, a masked hint, your budget and stop settings, and spend readings. Delete the connection and its token is deleted with it. You should also revoke the key at the provider.

**Is this a replacement for the providers' own limits?**
No. Where a native hard limit exists, it's a good first line of defence. Budget Guard adds one view across providers, an 80% warning, and a stop you've rehearsed.

---

## Coming later

These are not built yet:

- One-click undo inside Budget Guard
- Usage graphs
- Generic outbound webhooks (beyond Slack)
- More providers (for example Cloudflare or GCP), not yet scoped

---

## Final CTA

**Put a hard stop on usage-billed services before the next surprise bill.**

Budget Guard is an early product. Join the waitlist and we'll invite you when it's ready to try. You can start in test mode with a throwaway project.

**[Join the waitlist]**

---

## Alt headlines (5)

1. Hard spend caps for Vercel, OpenAI and Anthropic.
   - 和訳：Vercel・OpenAI・Anthropic の支出に、ハードな上限を。
2. Your alert email won't stop the bill. This will.
   - 和訳：通知メールでは請求は止まらない。これなら止まる。
3. One budget, three providers, a stop you tested first.
   - 和訳：予算はひとつ、プロバイダは 3 社、停止は事前にテスト済み。
4. Set a monthly budget. Rehearse the stop. Sleep.
   - 和訳：月の予算を決める。停止をリハーサルする。あとは眠る。
5. Pause the project before the invoice, not after.
   - 和訳：請求書が来る前に、プロジェクトを止める。来てからではなく。

## Meta description (≤155 chars)

> Hourly spend checks for Vercel, OpenAI and Anthropic. Email at 80%, a reversible stop at 100%, tested first in test mode.

(122 characters)

和訳：Vercel・OpenAI・Anthropic の支出を毎時チェック。80% でメール、100% で元に戻せる停止。まずテストモードで試してから。
