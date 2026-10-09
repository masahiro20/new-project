# Budget Guard — demo video script and storyboard

> Status: draft for owner/HQ review. Not published.
> Product truth: `docs/lp.md` (claims), `README.md`, `docs/demo-payments.md`. What we record: the interactive demo `demo/index.html`. Its UI is Japanese, it uses only fictional data, and it never calls an external service.
> Two cuts: **A. 60-second English cut** for X / Product Hunt (4:5, works muted). **B. 2:56 walkthrough** (16:9, English voice-over, English and Japanese subtitles).

---

## 0. Rules for both cuts (read before editing)

| Rule | How this script follows it |
|---|---|
| No traction numbers, user counts, testimonials or logos | None appear. The only dollar amounts on screen are the demo's fictional spend and budgets. |
| No claims beyond `lp.md` | Every caption and VO line maps to a sentence in `lp.md`. Unbuilt features are mentioned only as "coming later": **usage graphs** and **one-click undo**. |
| Fictional-data disclaimer on screen | A burned-in line stays on screen for the whole video: **"Demo · fictional data · no real charges"**. The page's own banner (`デモ：実際の請求はありません`) also stays visible. |
| Say "test mode first" | Cut A: S5, S7, S9. Cut B: W4, W6, W10, W14. |
| Say "you can undo every stop" | Cut A: S8, S9. Cut B: W11, W14. Always followed by the qualifier that **you** run the undo in the provider's dashboard or API, using steps Budget Guard shows. |
| Pricing is a draft | No price is said or shown. Blur the price elements in the billing panel (see §C). |
| Hacker News references | Cut B (W2) only, and only as "public reports from other developers". No amounts, no links on screen. |
| Tone | Plain and specific. No "never", "instantly", "guaranteed", "bulletproof", "peace of mind". |

**Do not say or caption:** "prevents overspending", "stops instantly" or "in real time", "one-click undo", "usage graphs" as a current feature, "read-only key", any price or "free plan", "trusted by…".

**Two things in the demo UI go beyond `lp.md`. Keep them out of focus:**
1. The step 4 callout `いまは無料プラン(通知のみ)です。製品版では停止の実行に有料プランが必要です…` describes plan gating that `lp.md` doesn't state. Zoom past it to "確認 1", or blur it.
2. The free-plan text in the billing panel (`無料`, `80%のメール・Slack通知だけが届きます。停止の実行は有料プランで使えます。`). Blur it along with the prices.

### UI glossary (Japanese UI → English labels for captions and callouts)

| On screen | English label to use |
|---|---|
| デモ：実際の請求はありません | Demo: no real charges |
| 支出を見る / 予算を設定 / 時間を進める / 停止の確認 / 元に戻す | See spend / Set budget / Advance time / Confirm stop / Undo |
| スパイクを起こす | Simulate a spike |
| メール + Slack #alerts(モック) | Email + Slack (mock) |
| 送信していません | Not sent |
| 確認を発行 | Issue confirmation |
| テストモードで実行(送信しません) | Run in test mode (sends nothing) |
| ライブに切り替え | Switch to live (disabled in demo) |
| 戻したことを記録(デモ) | Log that I undid it (demo) |
| デモで支払う | Pay (demo) |

---

## A. 60-second cut: X / Product Hunt (EN, 4:5, muted-first)

**Format:** 1080×1350 (4:5), 30 fps, H.264. Captions are burned in, and the story must work with the sound off. The VO column is optional: use it only if the post autoplays with sound.

**Safe area (1080×1350 canvas):**
```
 y=0    ┌──────────────────────────┐
        │ unsafe (platform UI)     │  0–120: keep text out
 y=120  ├──────────────────────────┤
        │ disclaimer line 130–180  │  "Demo · fictional data · no real charges"
        │                          │
        │  ACTION AREA             │  the element being clicked must sit
        │  x 60–1020, y 190–940    │  inside this box (scroll/pan to it)
        │                          │
 y=960  ├──────────────────────────┤
        │ CAPTION BAND 960–1150    │  max 2 lines, ≥48 px, white on 80% black
 y=1170 ├──────────────────────────┤
        │ unsafe (player controls) │  1170–1350: keep text out
 y=1350 └──────────────────────────┘
```
The demo's toasts appear at the **bottom right**. For S4 and S5 (toast shots), move the caption band to **y 190–370** so it doesn't cover them.

### Shot table: Cut A (total 1:00)

| # | Time | Screen: page, element, action | On-screen caption (burned in) | Voice-over (optional) | Notes |
|---|---|---|---|---|---|
| S1 | 0:00–0:04 | `demo/index.html` reset state, top of page, step 1. Static. | **Alerts tell you. Budget Guard stops it.** | "Alerts tell you. Budget Guard stops it." | Title text over a 40% dimmed frame. The disclaimer line starts here and stays to the end. Cut in on beat. |
| S2 | 0:04–0:10 | Connection strip (`#strip`) and the three cards (`#cards`). Slow scroll from strip to cards. | **One budget for Vercel, OpenAI and Anthropic. Checked every hour.** | "One budget for your Vercel, OpenAI and Anthropic spend, checked every hour." | Push in 110% on the strip. Cursor hidden. |
| S3 | 0:10–0:16 | Click stepper **2 予算を設定**. Show the three budget rows (`#budget-form`). Click into the vercel-acme-web field and hover only. Don't edit in this cut. | **80% → email. 100% → the stop you chose.** | "At 80% it emails you. At 100% it runs the stop you set up." | Cursor highlight ring (yellow, 40 px). Hard cut. |
| S4 | 0:16–0:24 | Click stepper **3 時間を進める**. Check that `#spike-target` = openai-prod. Click **スパイクを起こす** once. The 80% toast appears. | **Simulated spike → 80% alert, once a month.** (caption band at TOP) | "Simulate a runaway loop. Past 80%, you get one alert for the month." | Zoom 130% onto the toast "メール + Slack #alerts(モック)". Small label next to toast: "Email + Slack (mock)". |
| S5 | 0:24–0:32 | Click **スパイクを起こす** again. The 100% red callout appears, and the activity log gets a "テスト" entry. Pan to the log entry with `送信予定: POST …/spend_limit`. | **100% in test mode: the request is recorded, not sent.** (caption band at TOP) | "At 100%, test mode records the exact request it would send, and sends nothing." | Single column at this width, so the log is below main: smooth scroll down to it. Highlight box on `送信していません` with label "Not sent". |
| S6 | 0:32–0:44 | Click **手順4: 停止の確認へ**. Frame "確認 1" (request list). Click **確認を発行** (the timer starts at 5:00). Click the label field and type `openai-prod`. All three checks turn green. | **To go live, you need: ① the full request list ② a signed confirmation that expires in 5 min ③ the label, typed exactly** | "Going live takes three checks: the full request list, a signed confirmation that expires in five minutes, and the label typed exactly." | Start the frame below the free-plan callout (see §0). Speed-ramp the typing to 2×. Zoom 120% on the timer as it starts. |
| S7 | 0:44–0:50 | Click **テストモードで実行(送信しません)**. The green callout `テストモードで実行しました。送信していません。` appears. | **Test mode first. Nothing was sent.** | "Every connection starts in test mode. Nothing was sent." | Highlight box on the green callout. 4-frame flash transition. |
| S8 | 0:50–0:56 | Click **手順5: 戻し方を見る**. Frame the OpenAI undo card (`DELETE …/spend_limit`), then scroll to the Anthropic card with its key IDs. | **You can undo every stop. Budget Guard shows the exact steps and IDs.** | "You can undo every stop. Budget Guard shows the exact steps and IDs to run." | Slow pan. Don't click "戻したことを記録" in this cut. |
| S9 | 0:56–1:00 | End card over a blurred frame of step 5. | **Budget Guard** · **Test mode first. You can undo every stop.** · **Join the waitlist** | "Test mode first. Join the waitlist." | Waitlist URL: `[WAITLIST_URL]`, to be filled in by the owner. Hold the last frame 0.5 s. |

Check: 4 + 6 + 6 + 8 + 8 + 12 + 6 + 6 + 4 = **60 s**.

### Storyboard: Cut A (4:5 frames)

```
S1 0:00          S2 0:04          S3 0:10          S4 0:16
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│Demo·fict.. │   │Demo·fict.. │   │Demo·fict.. │   │[80% alert,]│
│            │   │vercel  60% │   │ 2 予算を設定│   │[1x/month ] │
│  Alerts    │   │▓▓▓▓▓░░░░░  │   │vercel [300]│   │ スパイク    │
│  tell you. │   │openai  61% │   │openai [500]│   │[スパイクを  │
│  Budget    │   │▓▓▓▓▓▓░░░░  │   │anthr. [400]│   │ 起こす] ◎   │
│  Guard     │   │anthr.  57% │   │      ◎     │   │  ┌────────┐│
│  stops it. │   │▓▓▓▓▓░░░░░  │   │            │   │  │Email+  ││
│────────────│   │────────────│   │────────────│   │  │Slack80%││
│            │   │One budget… │   │80%→email   │   │  └────────┘│
└────────────┘   └────────────┘   └────────────┘   └────────────┘

S5 0:24          S6 0:32          S8 0:50          S9 0:56
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│[100% test: ]│  │Demo·fict.. │   │Demo·fict.. │   │Demo·fict.. │
│[recorded,  ]│  │確認1 POST… │   │OpenAI undo │   │            │
│ log:       │   │確認2 [発行]│   │DELETE …/   │   │ Budget     │
│ テスト      │   │   ⏱ 4:58  │   │ spend_limit│   │ Guard      │
│ POST …/    │   │確認3 [open │   │Anthropic   │   │ Test mode  │
│ spend_limit│   │  ai-prod▌] │   │apikey_01De…│   │ first.     │
│┌[送信して   ┐│   │✓ ✓ ✓      │   │→ active    │   │ Undo every │
││ いません] ││   │────────────│   │────────────│   │ stop.      │
│└──Not sent┘│   │3 checks…   │   │Undo every… │   │ Waitlist → │
└────────────┘   └────────────┘   └────────────┘   └────────────┘
 (S7 0:44 reuses the S6 framing: green callout "Nothing was sent.")
```

---

## B. Walkthrough: 2:56 (EN VO, EN + JA subtitles, 16:9)

**Format:** 1920×1080, 30 fps. English VO, about 150 words per minute. Ship two subtitle files (`_en.srt`, `_ja.srt`). Burn in the JA version for Japanese channels. Subtitles go bottom-center, max 2 lines. In W5 and W6 a toast sits bottom-right, so move the subtitles bottom-left (x ≤ 1280) for those shots.
The disclaimer line "Demo · fictional data · no real charges" stays top-left (x 48, y 48, 28 px) for the whole video.

### Shot table: Cut B (total 2:56)

| # | Time | Screen: page, element, action | On-screen caption | Voice-over (EN) | JA subtitle | Notes |
|---|---|---|---|---|---|---|
| W1 | 0:00–0:08 | Reset state. Full page, step 1, log sidebar visible. Static. | **Budget Guard: demo walkthrough** | "This is Budget Guard: one monthly budget for Vercel, OpenAI and Anthropic, with a stop you test first." | Budget Guard：Vercel・OpenAI・Anthropic の利用額に、月の予算をひとつ。停止は、まずテストしてから。 | Title lower-third. Fade in from black, 12 frames. |
| W2 | 0:08–0:20 | Hover over the yellow banner (`デモデータです…`), then over `#strip`. | **Most usage-billed platforms only alert you.** · small: *Public reports from other developers, not our data.* | "Most usage-billed platforms only send an alert, and the meter keeps running. Public reports from other developers describe large bills run up overnight by runaway usage and AI crawlers." | 多くの従量課金サービスは通知するだけで、メーターは止まりません。ほかの開発者の公開報告では、暴走した利用やAIクローラーで、一晩で高額請求になった例があります。 | Point at the banner first, so viewers see the data is fictional. |
| W3 | 0:20–0:34 | Step 1. Click tabs **Vercel → OpenAI → Anthropic → 合計** about 2 s apart. End on the note `グラフはこのデモ用の表示です…`. | **Month-to-date spend, checked hourly.** · small: *This chart is only in the demo. Usage graphs are coming later.* | "Budget Guard reads each provider's cost data every hour. Providers report cost by day, so today's figure is a partial total. This chart exists only in the demo; usage graphs aren't built yet." | Budget Guard は各社のコストを1時間ごとに取得します。コストは日単位で報告されるため、今日の値は途中集計です。このグラフはデモ専用で、利用状況グラフは今後提供予定です。 | Zoom 115% on the chart. Highlight box on the note at the end. |
| W4 | 0:34–0:48 | Click **次へ: 予算を設定**. In the vercel-acme-web field, select all, type `280`, press **Enter**. The preview reads `80%は $224.00`, and a `設定` entry appears in the log. | **Set a monthly budget per connection.** · **80% → email (and Slack) · 100% → your stop** | "Set a monthly budget for each connection. At 80%, Budget Guard emails you, and can post to Slack. At 100%, it runs the stop you chose. Every new connection starts in test mode." | 接続ごとに月の予算を設定します。80%でメール（Slackにも送れます）、100%で選んだ停止を実行します。新しい接続は必ずテストモードから始まります。 | Cursor highlight. Don't edit openai-prod, because the spike math depends on its $500 budget. |
| W5 | 0:48–1:02 | Click **次へ: 時間を進める**. Check that `#spike-target` = openai-prod. Click **スパイクを起こす** once. The amber toast and amber callout appear, and a `通知` entry shows in the log. | **Simulated spike: +25% of budget, then the hourly check runs.** → **80% alert (mock email + Slack)** | "Let's simulate a runaway loop on the OpenAI connection. The demo adds a quarter of the budget, and the next hourly check runs. It's past 80%, so you get one alert, by email and Slack. That alert fires once a month." | OpenAI の接続で暴走ループを再現します。予算の25%分を加えて、次の毎時チェックを実行。80%を超えたので、メールとSlackに1回だけ通知します（月1回）。 | Zoom 125% on the toast, then pan to the log entry. Subtitles go bottom-left. |
| W6 | 1:02–1:14 | Click **スパイクを起こす** again. The red callout `openai-prod が100%に達しました` appears. Zoom into the log entry `テスト` → `送信予定: POST https://api.openai.com/…/spend_limit`. | **100%, test mode: recorded, not sent.** | "Spike again, and it crosses 100%. This connection is in test mode, so nothing stops. Budget Guard records the exact request it would have sent." | もう一度スパイク。100%を超えました。テストモードなので何も止めず、送るはずだったリクエストをそのまま記録します。 | Highlight box on `送信していません` with the label "Not sent". Subtitles go bottom-left. |
| W7 | 1:14–1:30 | Click **手順4: 停止の確認へ**. Frame "確認 1" (skip the free-plan callout). Then use the `#stop-conn` dropdown to switch to **vercel-acme-web** (`POST …/pause`), then to **anthropic-main** (4 × `POST …/api_keys/… {"status":"inactive"}`). | **What "stop" means:** Vercel → pause chosen projects · OpenAI → hard monthly limit = your budget · Anthropic → workspace keys set to inactive | "Each provider stops differently. For OpenAI, it sets a hard monthly limit on the project, equal to your budget. For Vercel, it pauses only the projects you picked. For Anthropic, it sets the workspace's API keys to inactive." | 停止の中身はプロバイダごとに違います。OpenAI はプロジェクトに予算額のハード上限を設定。Vercel は選んだプロジェクトだけを一時停止。Anthropic はワークスペースのAPIキーを inactive にします。 | Zoom 130% on the request list. The three-row caption builds one row per provider. |
| W8 | 1:30–1:40 | Still on anthropic-main: tick **oncall-break-glass** (the list drops to 3). Click **確認を発行**. Untick the key. The status changes to `リクエスト一覧が発行後に変わったため、この確認は無効です。` | **Exclude keys you need to keep.** · **If the request list changes, the confirmation is void.** | "You can exclude keys, like a break-glass key. And if the request list changes after you issue a confirmation, that confirmation stops working." | 残したいキーは除外できます。確認を発行したあとにリクエスト一覧が変わると、その確認は無効になります。 | Highlight box on the status line. |
| W9 | 1:40–1:56 | Switch `#stop-conn` back to **openai-prod**. Click **確認を発行** (timer 5:00). In the label field type `OpenAI-prod` → the mismatch message appears. Fix it to `openai-prod` → `ラベルが一致しました。`. All three checks turn green. | **Going live needs all three:** ① full request list ② signed confirmation, expires in 5 min ③ label typed exactly | "Going live, or pressing stop now, needs three things: you've seen the full request list, a signed confirmation that expires after five minutes, and the connection's label typed exactly. Case counts." | ライブへの切り替えや「今すぐ停止」には3つが必要です。送信するリクエストの一覧、5分で期限が切れる署名付きの確認、そして接続ラベルの正確な入力。大文字・小文字も区別します。 | Zoom on the timer, then on the field. Pause 0.5 s on the mismatch message. |
| W10 | 1:56–2:06 | Click **テストモードで実行(送信しません)**. The green callout appears and the log gets a `テスト` entry. Hover over the disabled **ライブに切り替え** button. | **Test mode first. Nothing was sent.** · small: *Backing out is one click, with no confirmation.* | "In this demo it runs in test mode, so nothing is sent. Backing out is always one click: switching to test mode or turning a stop off needs no confirmation." | このデモではテストモードで実行するので、何も送信しません。テストモードに戻す、停止をオフにする操作は確認なしで、いつでもワンクリックです。 | Callout on the disabled button: "Live switch is disabled in the demo." |
| W11 | 2:06–2:22 | Click **手順5: 戻し方を見る**. Frame the OpenAI card (`DELETE …/spend_limit`), then scroll to Vercel (`POST …/unpause`) and Anthropic (key IDs → `active`). On the OpenAI card, click **戻したことを記録(デモ)**. A `復旧` entry appears in the log. | **You can undo every stop.** · Budget Guard shows the exact steps and IDs, and you run them in the provider's dashboard or API. · small: *One-click undo: coming later.* | "You can undo every stop. Budget Guard shows the exact steps and IDs: unpause, delete the limit, or set keys back to active. You run them in the provider's dashboard or API. One-click undo is coming later." | 停止はすべて元に戻せます。Budget Guard は戻し方を対象IDつきで表示します（一時停止の解除、上限の削除、キーを active に戻す）。操作はプロバイダのダッシュボードかAPIで行います。ワンクリック復旧は今後提供予定です。 | Slow pan. Small label on the log: "Logged only. Nothing sent to the provider." |
| W12 | 2:22–2:36 | Click the header chip **プラン 無料**. The billing panel opens. **Prices are blurred.** Click **購入** on Monthly. Enter `4242 4242 4242 4242`, `12/28`, `123`, `DEMO USER`. Click **デモで支払う**. The success callout appears. | **Demo checkout: no real charges.** · small: *Pricing is a draft and isn't shown.* | "The checkout is a demo too. No charge is made, and the card details never leave the page. Pricing isn't final, so we've left it out." | 決済もデモです。実際の請求はなく、カード情報はページの外に出ません。料金は確定前のため、この動画では表示しません。 | Blur boxes from §C on every frame of this shot. Keep `デモ：実際の請求はありません` and `料金は案・承認待ち` unblurred. |
| W13 | 2:36–2:48 | Scroll back to the top: `#strip` and log. Static. | **A backstop, not a guarantee.** · Checks run hourly · providers report cost daily · no provider offers a read-only cost key | "A stop runs on the first check that sees you at or over 100%, and providers report cost with a delay. Treat it as a backstop that limits the damage. And since no provider offers a read-only cost key, use a dedicated key you can revoke." | 停止は、100%以上を検知した最初のチェックで実行されます。コストの報告には遅れがあります。被害を抑える最後の砦として使ってください。読み取り専用のコストキーはどの社にもないため、いつでも失効できる専用キーを使ってください。 | Plain text card on the right third. Bullets appear one by one. |
| W14 | 2:48–2:56 | End card over a blurred frame of step 1. | **Budget Guard** · **Test mode first. You can undo every stop.** · **Join the waitlist** `[WAITLIST_URL]` | "Start in test mode, with a throwaway project. Join the waitlist, and we'll invite you when it's ready." | まずはテストモードで、使い捨てのプロジェクトから。ウェイトリストに登録いただくと、準備ができしだいご招待します。 | Fade to black over the last 12 frames. |

Check: 8 + 12 + 14 + 14 + 14 + 12 + 16 + 10 + 16 + 10 + 16 + 14 + 12 + 8 = **176 s = 2:56**.

### Storyboard: Cut B (16:9 frames)

```
W1 0:00                                W3 0:20
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│Demo·fictional·no real charges    │   │Demo·fictional·no real charges    │
│[デモ：実際の請求はありません]      │   │[合計][Vercel][OpenAI][Anthropic] │
│ Budget Guard   ⏱2026-10-18 14:00│   │   ___----‾‾‾  - - 予算 - -   │log│
│ [vercel 60%][openai 61%][anth 57%]│   │ _/            ... 80% ...   │   │
│ 1支出 2予算 3時間 4停止 5戻す  │log│   │ demo-only chart (graphs later) │   │
│ ┌ Budget Guard: demo walkthrough┐│   │──────────────────────────────────│
│ └───────────────────────────────┘│   │ Month-to-date spend, checked hourly│
└──────────────────────────────────┘   └──────────────────────────────────┘

W5 0:48                                W6 1:02
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ 3. 時間と支出を進める          │log│   │ ■ openai-prod が100%に達しました │log│
│ スパイク: [openai-prod ▾]      │通知│   │   [手順4: 停止の確認へ]        │テスト│
│ [スパイクを起こす] ◎           │   │   │                    ┌─────────┐│POST│
│ ▲ openai-prod 80%通知済み ┌────────┐│   │                    │送信して  ││…/  │
│                          │Email+  ││   │                    │いません ←Not sent
│ Simulated spike…  (BL)   │Slack 80%││   │ 100%, test mode: recorded, not sent│
└──────────────────────────┴────────┘┘   └──────────────────────────────────┘

W9 1:40                                W10 1:56
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ 確認1 POST …/spend_limit         │   │ [テストモードで実行(送信しません)]◎ │
│       {"threshold_amount":50000…}│   │ [ライブに切り替え] (disabled)    │
│ 確認2 [確認を発行]  ⏱ 4:57       │   │ ┌ テストモードで実行しました。   ┐│
│ 確認3 [openai-prod▌] ✓一致       │   │ │ 送信していません。             ││
│ ✓リクエスト一覧 ✓確認5分 ✓ラベル │   │ └──────────────────────────────┘│
│ Going live needs all three…      │   │ Test mode first. Nothing was sent.│
└──────────────────────────────────┘   └──────────────────────────────────┘

W11 2:06                               W12 2:22
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ 5. 元に戻す                      │   │ プランと購入 [料金は案・承認待ち] │
│ OpenAI · openai-prod  [テスト済] │   │ [▒▒▒▒] [▒▒▒▒ 購入◎] [▒▒▒▒ 購入]  │
│  1. DELETE …/spend_limit         │   │ カード [4242 4242 4242 4242]     │
│ Anthropic · apikey_01DemoA7xQ…   │   │ 12/28  •••  DEMO USER            │
│  → {"status":"active"}           │   │ [デモで支払う]  ▒=blur prices    │
│ You can undo every stop. (later: │   │ Demo checkout: no real charges.  │
│  one-click undo)                 │   │                                  │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

---

## C. Recording checklist

### Setup
- [ ] **Serve the page locally** so no file path shows anywhere: `cd signal-lab/budget-guard/demo && python3 -m http.server 8000`, then open `http://localhost:8000/`. The page makes no network requests and loads no web fonts.
- [ ] **Browser:** Chrome in a fresh Guest profile (no extensions, bookmarks, avatar or autofill). Hide the browser chrome with full-screen (F11) or crop it in post.
- [ ] **Cut B (16:9):** a 1920×1080 display at browser zoom **150%**, which gives a 1280×720 CSS viewport. At ≥1000 px CSS width the log sidebar shows on the right.
- [ ] **Cut A (4:5):** a window whose inner size is **1080×1350** at zoom **150%** (720×900 CSS; single column with the log below main). This needs a display at least 1440 px tall or in portrait. Fallback: record at 720×900 and zoom 100%, then upscale 1.5×. Text gets slightly softer.
- [ ] **Theme:** click the header button **テーマ: 自動** once so it reads **テーマ: ライト**. Use light for both cuts.
- [ ] **OS:** Do Not Disturb on, system clock and menu bar hidden or cropped, cursor size large. Turn on click highlight in the recorder (e.g. Screen Studio, OBS with a cursor plugin).
- [ ] **Reduced motion:** off, so the toast slide-in shows.

### Reset state (check before every take)
State lives only in memory: **reloading the page is a full reset**. The **デモをリセット** button at the bottom of step 5 also resets.
- [ ] Clock reads `2026-10-18 14:00`. Chip `全接続 テストモード`. Plan chip `プラン 無料`.
- [ ] Strip: vercel-acme-web $181.40 / $300, openai-prod $304.60 / $500, anthropic-main $229.80 / $400. All below 80%.
- [ ] Log has 4 seed entries, newest `毎時チェック完了: 3接続とも80%未満。`
- [ ] Step 3 `#spike-target` shows **openai-prod (OpenAI)** (the default).
- [ ] No toasts on screen.

### Button order

**Reaching 80% and 100% quickly (スパイクを起こす):** each click adds 25% of openai-prod's budget ($125) and runs one hourly check. Starting from 61%:
1. **1st click** → about 86% → amber 80% toast plus a `通知` log entry.
2. **2nd click** → over 100% → red toast, red callout, and a `テスト` log entry with `送信予定: POST …/spend_limit`.
Toasts close themselves after 9 s; to clear one early, click **×**. Don't touch **1日進める**: it advances 24 checks and puts unrelated log noise on screen.

**Cut A:**
1. Reset → hold for S1 → scroll the strip and cards (S2).
2. Stepper **2 予算を設定** → hover only (S3).
3. Stepper **3 時間を進める** → **スパイクを起こす** (S4) → **スパイクを起こす** (S5) → scroll to the log.
4. **手順4: 停止の確認へ** → **確認を発行** → type `openai-prod` (S6).
5. **テストモードで実行(送信しません)** (S7).
6. **手順5: 戻し方を見る** → pan the OpenAI and Anthropic cards (S8).

**Cut B:**
1. Reset → W1/W2 → tabs **Vercel, OpenAI, Anthropic, 合計** (W3).
2. **次へ: 予算を設定** → vercel-acme-web `280` + Enter (W4).
3. **次へ: 時間を進める** → **スパイクを起こす** ×1 (W5) → ×1 (W6).
4. **手順4: 停止の確認へ** → dropdown vercel-acme-web → anthropic-main (W7).
5. Tick oncall-break-glass → **確認を発行** → untick (W8).
6. Dropdown openai-prod → **確認を発行** → type `OpenAI-prod`, then correct to `openai-prod` (W9).
7. **テストモードで実行(送信しません)** → hover **ライブに切り替え** (W10).
8. **手順5: 戻し方を見る** → **戻したことを記録(デモ)** on OpenAI (W11).
9. Header **プラン 無料** → **購入** (Monthly) → card `4242 4242 4242 4242`, `12/28`, `123`, `DEMO USER` → **デモで支払う** (W12).
10. Scroll to the top (W13).

The 5-minute timer runs in real time. Finish W8–W10 within 5 minutes of clicking **確認を発行**, or issue it again.

### What to blur or crop
Nothing real should exist on this page. Confirm that, and remove the draft pricing:
- [ ] **Blur prices:** the `.price` values on all three plan cards, the Yearly feature line `2か月分お得`, the checkout summary `Monthly プラン · 月額 $9…`, and `(月額 $9)` in the current-plan header after purchase.
- [ ] **Blur or crop the plan-gating text** that isn't in `lp.md`: the free card text, `#bill-current` (`停止の実行は有料プランで使えます`), and the step 4 callout `いまは無料プラン(通知のみ)です…`.
- [ ] **Confirm all IDs are fictional.** Every ID should contain `demo`/`Demo`: `prj_demoA1b2C3d4`, `team_demo7Kq2`, `proj_demo8fK2LmQx`, `wrkspc_demo3TnV9`, `apikey_01Demo…`. The license key and the card's last 4 digits after purchase are demo values too.
- [ ] **Check for anything real on screen:** no email address anywhere (the demo has no email field), no real card number (only `4242…`), no real name (`DEMO USER`), no address bar or file path, no OS notifications, no autofill pop-ups, no other tabs, no Slack or email client.
- [ ] Spend and budget dollar figures can stay. They're fictional and covered by the disclaimer.

### File naming
```
raw takes     bg-demo_raw_{cutA|cutB}_{shot}_t{nn}.mov     e.g. bg-demo_raw_cutB_W09_t02.mov
edit project  bg-demo_{cutA-60s|cutB-walkthrough}_v{nn}.{prproj|fcpbundle}
masters       budget-guard_demo-60s_1080x1350_en_v{nn}_{YYYYMMDD}.mp4
              budget-guard_walkthrough_1920x1080_en_v{nn}_{YYYYMMDD}.mp4
              budget-guard_walkthrough_1920x1080_ja-burned_v{nn}_{YYYYMMDD}.mp4
subtitles     budget-guard_walkthrough_en_v{nn}.srt / budget-guard_walkthrough_ja_v{nn}.srt
              budget-guard_demo-60s_en_v{nn}.srt (source for the burned-in captions)
```

### Final QA before export
- [ ] The disclaimer line is visible in every frame of both cuts.
- [ ] No price is said, shown or left unblurred, in any frame.
- [ ] "Test mode first" and "you can undo every stop" both appear in each cut.
- [ ] Usage graphs and one-click undo appear only as "coming later".
- [ ] No traction numbers, testimonials or logos. HN is mentioned only in W2, as "public reports from other developers".
- [ ] Cut A plays muted and still makes sense. Captions sit inside the 4:5 safe area, and no caption covers a toast.
- [ ] Timecodes match: Cut A 1:00, Cut B 2:56.
