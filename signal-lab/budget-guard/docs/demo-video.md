# Budget Guard — デモ動画の台本と絵コンテ

> **要約（オーナー向け）**
> - Budget Guard のデモ動画を 2 本作るための台本。素材は対話デモ `demo/index.html`（架空データのみ、外部サービスは呼ばない）を画面収録したもの。
> - **カット A**：60 秒、英語、4:5。X／Product Hunt 用。音なしで伝わる作り。
> - **カット B**：2 分 56 秒、英語ナレーション、英語・日本語字幕、16:9。機能の通し説明。
> - 守ること：実績の数字・推薦文・ロゴは出さない。`lp.md` にない主張はしない。価格は出さない（ぼかす）。「まずテストモード」「停止はすべて元に戻せる」を必ず言う。画面に架空データの注記を出し続ける。
> - 未定：ウェイトリストの URL（`[WAITLIST_URL]`）はオーナーが埋める。
> - 英語のキャプション・ナレーションは海外の顧客向けなので英語のまま。各ショットに和訳を並べてある。

> 状態：オーナー／本部レビュー用の下書き。未公開。
> 事実の根拠：`docs/lp.md`（主張）、`README.md`、`docs/demo-payments.md`。収録するもの：対話デモ `demo/index.html`。UI は日本語で、架空データだけを使い、外部サービスは一切呼ばない。
> 2 本のカット：**A. 60 秒の英語カット**（X／Product Hunt 用、4:5、音なしで成立）。**B. 2:56 の通し説明**（16:9、英語ナレーション、英語・日本語字幕）。

---

## 0. 両カット共通のルール（編集前に読む）

| ルール | この台本での守り方 |
|---|---|
| 実績の数字・ユーザー数・推薦文・ロゴは出さない | どれも出てこない。画面に出る金額は、デモの架空の支出と予算だけ。 |
| `lp.md` を超える主張はしない | キャプションとナレーションの各行は、`lp.md` のどこかの文に対応している。未実装の機能は「今後提供予定（coming later）」としてだけ触れる：**利用状況グラフ** と **ワンクリック復旧**。 |
| 架空データの注記を画面に出す | 焼き込みの 1 行 **"Demo · fictional data · no real charges"**（デモ・架空データ・実際の請求なし）を動画の最初から最後まで出し続ける。ページ自身のバナー（`デモ：実際の請求はありません`）も見える状態を保つ。 |
| 「まずテストモード」と言う | カット A：S5、S7、S9。カット B：W4、W6、W10、W14。 |
| 「停止はすべて元に戻せる」と言う | カット A：S8、S9。カット B：W11、W14。必ず「戻す操作は **ユーザー自身** がプロバイダのダッシュボードか API で行う（手順は Budget Guard が表示する）」という但し書きを続ける。 |
| 価格は案の段階 | 価格は言わない・見せない。決済パネルの価格要素はぼかす（§C 参照）。 |
| Hacker News への言及 | カット B（W2）だけ。しかも「ほかの開発者の公開報告（public reports from other developers）」としてだけ。金額もリンクも画面に出さない。 |
| トーン | 平易で具体的に。"never"（決して）、"instantly"（即座に）、"guaranteed"（保証）、"bulletproof"（鉄壁）、"peace of mind"（安心）は使わない。 |

**言わない・キャプションにしない表現：** "prevents overspending"（使いすぎを防ぐ）、"stops instantly" や "in real time"（即座に／リアルタイムで止める）、"one-click undo"（ワンクリック復旧）、現在の機能としての "usage graphs"（利用状況グラフ）、"read-only key"（読み取り専用キー）、価格や "free plan"（無料プラン）、"trusted by…"（〜に信頼されている）。

**デモ UI には `lp.md` を超える箇所が 2 つある。ピントを合わせないこと：**
1. 手順 4 の注意書き `いまは無料プラン(通知のみ)です。製品版では停止の実行に有料プランが必要です…` は、`lp.md` に書いていないプランの制限を説明している。ここはズームで通り過ぎて「確認 1」へ行くか、ぼかす。
2. 決済パネルの無料プランの文言（`無料`、`80%のメール・Slack通知だけが届きます。停止の実行は有料プランで使えます。`）。価格と一緒にぼかす。

### UI 用語集（日本語 UI → キャプション・吹き出しで使う英語ラベル）

| 画面上の表記 | 使う英語ラベル |
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

## A. 60 秒カット：X／Product Hunt（英語、4:5、音なし前提）

**形式：** 1080×1350（4:5）、30 fps、H.264。キャプションは焼き込みで、音なしでも話が通じること。ナレーション列は任意：投稿が音ありで自動再生される場合だけ使う。

**セーフエリア（1080×1350 のキャンバス）：**
```
 y=0    ┌──────────────────────────┐
        │ unsafe (platform UI)     │  0–120：文字を置かない（SNS の UI が重なる）
 y=120  ├──────────────────────────┤
        │ disclaimer line 130–180  │  注記の行 "Demo · fictional data · no real charges"
        │                          │
        │  ACTION AREA             │  操作する要素はこの枠の中に入れる
        │  x 60–1020, y 190–940    │  （スクロールかパンで寄せる）
        │                          │
 y=960  ├──────────────────────────┤
        │ CAPTION BAND 960–1150    │  キャプション帯：最大 2 行、48 px 以上、80% 黒地に白文字
 y=1170 ├──────────────────────────┤
        │ unsafe (player controls) │  1170–1350：文字を置かない（再生コントロールが重なる）
 y=1350 └──────────────────────────┘
```
デモのトーストは **右下** に出る。S4 と S5（トーストのショット）では、トーストを隠さないようにキャプション帯を **y 190–370** に移す。

### ショット表：カット A（合計 1:00）

| # | 時間 | 画面：ページ・要素・操作 | 画面キャプション（焼き込み・英語） | ナレーション（任意・英語） | 和訳（キャプション／ナレーション） | メモ |
|---|---|---|---|---|---|---|
| S1 | 0:00–0:04 | `demo/index.html` のリセット状態。ページ上部、手順 1。静止。 | **Alerts tell you. Budget Guard stops it.** | "Alerts tell you. Budget Guard stops it." | 通知は知らせるだけ。Budget Guard は止める。 | 40% 暗くした画面にタイトル文字。注記の行はここから最後まで出す。拍に合わせてカットイン。 |
| S2 | 0:04–0:10 | 接続ストリップ（`#strip`）と 3 枚のカード（`#cards`）。ストリップからカードへゆっくりスクロール。 | **One budget for Vercel, OpenAI and Anthropic. Checked every hour.** | "One budget for your Vercel, OpenAI and Anthropic spend, checked every hour." | Vercel・OpenAI・Anthropic の利用額に、予算をひとつ。1 時間ごとにチェック。 | ストリップに 110% でプッシュイン。カーソルは隠す。 |
| S3 | 0:10–0:16 | ステッパーの **2 予算を設定** をクリック。予算の 3 行（`#budget-form`）を見せる。vercel-acme-web の欄をクリックしてホバーだけ。このカットでは編集しない。 | **80% → email. 100% → the stop you chose.** | "At 80% it emails you. At 100% it runs the stop you set up." | 80% でメール。100% で選んだ停止を実行。 | カーソルの強調リング（黄色、40 px）。ハードカット。 |
| S4 | 0:16–0:24 | ステッパーの **3 時間を進める** をクリック。`#spike-target` が openai-prod であることを確認。**スパイクを起こす** を 1 回クリック。80% のトーストが出る。 | **Simulated spike → 80% alert, once a month.**（キャプション帯は上） | "Simulate a runaway loop. Past 80%, you get one alert for the month." | スパイクを再現 → 80% で通知（月 1 回）。／暴走ループを再現。80% を超えると、その月に 1 回だけ通知が届く。 | トースト「メール + Slack #alerts(モック)」に 130% ズーム。トーストの横に小さなラベル "Email + Slack (mock)"。 |
| S5 | 0:24–0:32 | もう一度 **スパイクを起こす** をクリック。100% の赤い注意書きが出て、アクティビティログに「テスト」の行が増える。`送信予定: POST …/spend_limit` のログ行までパン。 | **100% in test mode: the request is recorded, not sent.**（キャプション帯は上） | "At 100%, test mode records the exact request it would send, and sends nothing." | 100% でもテストモードなら、リクエストは記録するだけで送らない。／100% になると、テストモードは送るはずのリクエストをそのまま記録し、何も送らない。 | この幅では 1 カラムで、ログはメインの下にある。ログまでなめらかに下へスクロール。`送信していません` に強調枠とラベル "Not sent"。 |
| S6 | 0:32–0:44 | **手順4: 停止の確認へ** をクリック。「確認 1」（リクエスト一覧）を映す。**確認を発行** をクリック（タイマーが 5:00 から始まる）。ラベル欄をクリックして `openai-prod` と入力。3 つのチェックがすべて緑になる。 | **To go live, you need: ① the full request list ② a signed confirmation that expires in 5 min ③ the label, typed exactly** | "Going live takes three checks: the full request list, a signed confirmation that expires in five minutes, and the label typed exactly." | ライブにするには 3 つが必要：① リクエストの全一覧 ② 5 分で期限が切れる署名付きの確認 ③ ラベルの正確な入力 | 無料プランの注意書きより下から映し始める（§0 参照）。入力部分は 2 倍速。タイマーが動き出すところを 120% ズーム。 |
| S7 | 0:44–0:50 | **テストモードで実行(送信しません)** をクリック。緑の注意書き `テストモードで実行しました。送信していません。` が出る。 | **Test mode first. Nothing was sent.** | "Every connection starts in test mode. Nothing was sent." | まずテストモード。何も送っていない。／接続はすべてテストモードから始まる。何も送っていない。 | 緑の注意書きに強調枠。4 フレームのフラッシュ転換。 |
| S8 | 0:50–0:56 | **手順5: 戻し方を見る** をクリック。OpenAI の復旧カード（`DELETE …/spend_limit`）を映し、キー ID の並ぶ Anthropic のカードまでスクロール。 | **You can undo every stop. Budget Guard shows the exact steps and IDs.** | "You can undo every stop. Budget Guard shows the exact steps and IDs to run." | 停止はすべて元に戻せる。手順と対象 ID は Budget Guard が表示する。 | ゆっくりパン。このカットでは「戻したことを記録」は押さない。 |
| S9 | 0:56–1:00 | 手順 5 をぼかした画面の上にエンドカード。 | **Budget Guard** · **Test mode first. You can undo every stop.** · **Join the waitlist** | "Test mode first. Join the waitlist." | まずテストモード。停止はすべて元に戻せる。ウェイトリストに登録を。／まずテストモードで。ウェイトリストに登録を。 | ウェイトリストの URL：`[WAITLIST_URL]`（オーナーが記入）。最後のフレームを 0.5 秒止める。 |

検算：4 + 6 + 6 + 8 + 8 + 12 + 6 + 6 + 4 = **60 秒**。

### 絵コンテ：カット A（4:5 のフレーム）

下の図の英語は、画面に焼き込むキャプション（上の表の和訳を参照）。

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
```
（S7 0:44 は S6 と同じ構図を使い、緑の注意書きに "Nothing was sent."（何も送っていない）を重ねる。）

---

## B. 通し説明：2:56（英語ナレーション、英語・日本語字幕、16:9）

**形式：** 1920×1080、30 fps。英語ナレーションは 1 分あたり約 150 語。字幕ファイルは 2 つ納品する（`_en.srt`、`_ja.srt`）。日本語チャンネル向けには日本語版を焼き込む。字幕は下中央、最大 2 行。W5 と W6 ではトーストが右下に出るので、そのショットだけ字幕を左下（x ≤ 1280）に寄せる。
注記の行 "Demo · fictional data · no real charges" は、動画全体を通して左上（x 48、y 48、28 px）に出す。

### ショット表：カット B（合計 2:56）

「日本語字幕」列はナレーションの訳（`_ja.srt` に入れる）。「キャプション和訳」列は、画面キャプションのオーナー向けの訳。

| # | 時間 | 画面：ページ・要素・操作 | 画面キャプション（英語） | キャプション和訳 | ナレーション（英語） | 日本語字幕 | メモ |
|---|---|---|---|---|---|---|---|
| W1 | 0:00–0:08 | リセット状態。ページ全体、手順 1、ログのサイドバーが見える状態。静止。 | **Budget Guard: demo walkthrough** | Budget Guard：デモの通し説明 | "This is Budget Guard: one monthly budget for Vercel, OpenAI and Anthropic, with a stop you test first." | Budget Guard：Vercel・OpenAI・Anthropic の利用額に、月の予算をひとつ。停止は、まずテストしてから。 | タイトルはローワーサード。黒から 12 フレームでフェードイン。 |
| W2 | 0:08–0:20 | 黄色いバナー（`デモデータです…`）にホバーし、次に `#strip` にホバー。 | **Most usage-billed platforms only alert you.** · 小：*Public reports from other developers, not our data.* | 従量課金サービスの多くは通知するだけ。・小：ほかの開発者の公開報告であり、自社のデータではない。 | "Most usage-billed platforms only send an alert, and the meter keeps running. Public reports from other developers describe large bills run up overnight by runaway usage and AI crawlers." | 多くの従量課金サービスは通知するだけで、メーターは止まりません。ほかの開発者の公開報告では、暴走した利用やAIクローラーで、一晩で高額請求になった例があります。 | 先にバナーを指して、データが架空だと見せる。 |
| W3 | 0:20–0:34 | 手順 1。タブ **Vercel → OpenAI → Anthropic → 合計** を約 2 秒おきにクリック。最後に注記 `グラフはこのデモ用の表示です…` で止める。 | **Month-to-date spend, checked hourly.** · 小：*This chart is only in the demo. Usage graphs are coming later.* | 今月の累計支出を 1 時間ごとにチェック。・小：このグラフはデモ専用。利用状況グラフは今後提供予定。 | "Budget Guard reads each provider's cost data every hour. Providers report cost by day, so today's figure is a partial total. This chart exists only in the demo; usage graphs aren't built yet." | Budget Guard は各社のコストを1時間ごとに取得します。コストは日単位で報告されるため、今日の値は途中集計です。このグラフはデモ専用で、利用状況グラフは今後提供予定です。 | グラフに 115% ズーム。最後に注記へ強調枠。 |
| W4 | 0:34–0:48 | **次へ: 予算を設定** をクリック。vercel-acme-web の欄で全選択し、`280` と入力して **Enter**。プレビューが `80%は $224.00` になり、ログに `設定` の行が出る。 | **Set a monthly budget per connection.** · **80% → email (and Slack) · 100% → your stop** | 接続ごとに月の予算を設定。・80% → メール（と Slack）・100% → 選んだ停止 | "Set a monthly budget for each connection. At 80%, Budget Guard emails you, and can post to Slack. At 100%, it runs the stop you chose. Every new connection starts in test mode." | 接続ごとに月の予算を設定します。80%でメール（Slackにも送れます）、100%で選んだ停止を実行します。新しい接続は必ずテストモードから始まります。 | カーソル強調。openai-prod は編集しない。スパイクの計算が $500 の予算を前提にしているため。 |
| W5 | 0:48–1:02 | **次へ: 時間を進める** をクリック。`#spike-target` が openai-prod であることを確認。**スパイクを起こす** を 1 回クリック。琥珀色のトーストと注意書きが出て、ログに `通知` の行が出る。 | **Simulated spike: +25% of budget, then the hourly check runs.** → **80% alert (mock email + Slack)** | スパイクを再現：予算の 25% を加え、毎時チェックを実行。→ 80% で通知（メールと Slack はモック） | "Let's simulate a runaway loop on the OpenAI connection. The demo adds a quarter of the budget, and the next hourly check runs. It's past 80%, so you get one alert, by email and Slack. That alert fires once a month." | OpenAI の接続で暴走ループを再現します。予算の25%分を加えて、次の毎時チェックを実行。80%を超えたので、メールとSlackに1回だけ通知します（月1回）。 | トーストに 125% ズームし、ログの行へパン。字幕は左下。 |
| W6 | 1:02–1:14 | もう一度 **スパイクを起こす** をクリック。赤い注意書き `openai-prod が100%に達しました` が出る。ログの `テスト` → `送信予定: POST https://api.openai.com/…/spend_limit` にズーム。 | **100%, test mode: recorded, not sent.** | 100%、テストモード：記録のみで送信なし。 | "Spike again, and it crosses 100%. This connection is in test mode, so nothing stops. Budget Guard records the exact request it would have sent." | もう一度スパイク。100%を超えました。テストモードなので何も止めず、送るはずだったリクエストをそのまま記録します。 | `送信していません` に強調枠とラベル "Not sent"。字幕は左下。 |
| W7 | 1:14–1:30 | **手順4: 停止の確認へ** をクリック。「確認 1」を映す（無料プランの注意書きは飛ばす）。次に `#stop-conn` のドロップダウンで **vercel-acme-web**（`POST …/pause`）に切り替え、さらに **anthropic-main**（`POST …/api_keys/… {"status":"inactive"}` × 4）に切り替える。 | **What "stop" means:** Vercel → pause chosen projects · OpenAI → hard monthly limit = your budget · Anthropic → workspace keys set to inactive | 「停止」の中身：Vercel → 選んだプロジェクトを一時停止・OpenAI → 予算額の月次ハード上限・Anthropic → ワークスペースのキーを inactive に | "Each provider stops differently. For OpenAI, it sets a hard monthly limit on the project, equal to your budget. For Vercel, it pauses only the projects you picked. For Anthropic, it sets the workspace's API keys to inactive." | 停止の中身はプロバイダごとに違います。OpenAI はプロジェクトに予算額のハード上限を設定。Vercel は選んだプロジェクトだけを一時停止。Anthropic はワークスペースのAPIキーを inactive にします。 | リクエスト一覧に 130% ズーム。3 行のキャプションは、プロバイダごとに 1 行ずつ出す。 |
| W8 | 1:30–1:40 | anthropic-main のまま **oncall-break-glass** にチェック（一覧が 3 件に減る）。**確認を発行** をクリック。キーのチェックを外す。状態表示が `リクエスト一覧が発行後に変わったため、この確認は無効です。` に変わる。 | **Exclude keys you need to keep.** · **If the request list changes, the confirmation is void.** | 残したいキーは除外できる。・リクエスト一覧が変わると、確認は無効になる。 | "You can exclude keys, like a break-glass key. And if the request list changes after you issue a confirmation, that confirmation stops working." | 残したいキーは除外できます。確認を発行したあとにリクエスト一覧が変わると、その確認は無効になります。 | 状態表示の行に強調枠。 |
| W9 | 1:40–1:56 | `#stop-conn` を **openai-prod** に戻す。**確認を発行** をクリック（タイマー 5:00）。ラベル欄に `OpenAI-prod` と入力 → 不一致のメッセージが出る。`openai-prod` に直す → `ラベルが一致しました。`。3 つのチェックがすべて緑になる。 | **Going live needs all three:** ① full request list ② signed confirmation, expires in 5 min ③ label typed exactly | ライブには 3 つすべてが必要：① リクエストの全一覧 ② 5 分で期限が切れる署名付きの確認 ③ ラベルの正確な入力 | "Going live, or pressing stop now, needs three things: you've seen the full request list, a signed confirmation that expires after five minutes, and the connection's label typed exactly. Case counts." | ライブへの切り替えや「今すぐ停止」には3つが必要です。送信するリクエストの一覧、5分で期限が切れる署名付きの確認、そして接続ラベルの正確な入力。大文字・小文字も区別します。 | タイマー、次に入力欄にズーム。不一致のメッセージで 0.5 秒止める。 |
| W10 | 1:56–2:06 | **テストモードで実行(送信しません)** をクリック。緑の注意書きが出て、ログに `テスト` の行が増える。無効になっている **ライブに切り替え** ボタンにホバー。 | **Test mode first. Nothing was sent.** · 小：*Backing out is one click, with no confirmation.* | まずテストモード。何も送っていない。・小：やめるのはワンクリックで、確認は不要。 | "In this demo it runs in test mode, so nothing is sent. Backing out is always one click: switching to test mode or turning a stop off needs no confirmation." | このデモではテストモードで実行するので、何も送信しません。テストモードに戻す、停止をオフにする操作は確認なしで、いつでもワンクリックです。 | 無効のボタンに吹き出し："Live switch is disabled in the demo."（デモではライブ切り替えは無効） |
| W11 | 2:06–2:22 | **手順5: 戻し方を見る** をクリック。OpenAI のカード（`DELETE …/spend_limit`）を映し、Vercel（`POST …/unpause`）と Anthropic（キー ID → `active`）へスクロール。OpenAI のカードで **戻したことを記録(デモ)** をクリック。ログに `復旧` の行が出る。 | **You can undo every stop.** · Budget Guard shows the exact steps and IDs, and you run them in the provider's dashboard or API. · 小：*One-click undo: coming later.* | 停止はすべて元に戻せる。・手順と対象 ID は Budget Guard が表示し、操作はプロバイダのダッシュボードか API で行う。・小：ワンクリック復旧は今後提供予定。 | "You can undo every stop. Budget Guard shows the exact steps and IDs: unpause, delete the limit, or set keys back to active. You run them in the provider's dashboard or API. One-click undo is coming later." | 停止はすべて元に戻せます。Budget Guard は戻し方を対象IDつきで表示します（一時停止の解除、上限の削除、キーを active に戻す）。操作はプロバイダのダッシュボードかAPIで行います。ワンクリック復旧は今後提供予定です。 | ゆっくりパン。ログに小さなラベル："Logged only. Nothing sent to the provider."（記録のみ。プロバイダには何も送っていない） |
| W12 | 2:22–2:36 | ヘッダーのチップ **プラン 無料** をクリック。決済パネルが開く。**価格はぼかす。** Monthly の **購入** をクリック。`4242 4242 4242 4242`、`12/28`、`123`、`DEMO USER` を入力。**デモで支払う** をクリック。成功の注意書きが出る。 | **Demo checkout: no real charges.** · 小：*Pricing is a draft and isn't shown.* | デモ決済：実際の請求はない。・小：価格は案の段階のため表示しない。 | "The checkout is a demo too. No charge is made, and the card details never leave the page. Pricing isn't final, so we've left it out." | 決済もデモです。実際の請求はなく、カード情報はページの外に出ません。料金は確定前のため、この動画では表示しません。 | このショットの全フレームに §C のぼかしを入れる。`デモ：実際の請求はありません` と `料金は案・承認待ち` はぼかさない。 |
| W13 | 2:36–2:48 | 上までスクロールして戻る：`#strip` とログ。静止。 | **A backstop, not a guarantee.** · Checks run hourly · providers report cost daily · no provider offers a read-only cost key | 保証ではなく、最後の砦。・チェックは 1 時間ごと・コストの報告は日単位・読み取り専用のコストキーはどの社にもない | "A stop runs on the first check that sees you at or over 100%, and providers report cost with a delay. Treat it as a backstop that limits the damage. And since no provider offers a read-only cost key, use a dedicated key you can revoke." | 停止は、100%以上を検知した最初のチェックで実行されます。コストの報告には遅れがあります。被害を抑える最後の砦として使ってください。読み取り専用のコストキーはどの社にもないため、いつでも失効できる専用キーを使ってください。 | 右 3 分の 1 に文字だけのカード。箇条書きを 1 つずつ出す。 |
| W14 | 2:48–2:56 | 手順 1 をぼかした画面の上にエンドカード。 | **Budget Guard** · **Test mode first. You can undo every stop.** · **Join the waitlist** `[WAITLIST_URL]` | まずテストモード。停止はすべて元に戻せる。・ウェイトリストに登録を。 | "Start in test mode, with a throwaway project. Join the waitlist, and we'll invite you when it's ready." | まずはテストモードで、使い捨てのプロジェクトから。ウェイトリストに登録いただくと、準備ができしだいご招待します。 | 最後の 12 フレームで黒にフェードアウト。 |

検算：8 + 12 + 14 + 14 + 14 + 12 + 16 + 10 + 16 + 10 + 16 + 14 + 12 + 8 = **176 秒 = 2:56**。

### 絵コンテ：カット B（16:9 のフレーム）

下の図の英語は画面キャプション（上の表の「キャプション和訳」を参照）。"(BL)" は字幕を左下に置くこと、"▒=blur prices" は価格をぼかす箇所を示す。

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

## C. 収録チェックリスト

### 準備
- [ ] **ページはローカルで配信する。** ファイルパスがどこにも映らないようにするため：`cd signal-lab/budget-guard/demo && python3 -m http.server 8000` を実行し、`http://localhost:8000/` を開く。このページは通信をせず、Web フォントも読み込まない。
- [ ] **ブラウザ：** Chrome の新しいゲストプロファイル（拡張機能・ブックマーク・アバター・自動入力なし）。ブラウザの枠は全画面（F11）で隠すか、編集で切り取る。
- [ ] **カット B（16:9）：** 1920×1080 のディスプレイで、ブラウザのズームを **150%** にする。CSS 上のビューポートが 1280×720 になる。CSS 幅が 1000 px 以上なら、ログのサイドバーが右に出る。
- [ ] **カット A（4:5）：** ウィンドウの内寸を **1080×1350**、ズームを **150%** にする（CSS で 720×900。1 カラムで、ログはメインの下）。高さ 1440 px 以上のディスプレイか、縦置きのディスプレイが必要。代替案：720×900、ズーム 100% で収録し、1.5 倍に拡大する。文字が少しぼやける。
- [ ] **テーマ：** ヘッダーのボタン **テーマ: 自動** を 1 回クリックして **テーマ: ライト** にする。両カットともライトで撮る。
- [ ] **OS：** おやすみモードをオン、時計とメニューバーは隠すか切り取る、カーソルは大きく。収録ソフトでクリックの強調をオンにする（例：Screen Studio、カーソルプラグイン付きの OBS）。
- [ ] **視差効果を減らす設定：** オフにする。トーストがスライドインする動きを見せるため。

### リセット状態（毎テイク前に確認）
状態はメモリ上にしかない。**ページを再読み込みすれば完全にリセットされる。** 手順 5 の下にある **デモをリセット** ボタンでもリセットできる。
- [ ] 時計が `2026-10-18 14:00`。チップが `全接続 テストモード`。プランのチップが `プラン 無料`。
- [ ] ストリップ：vercel-acme-web $181.40 / $300、openai-prod $304.60 / $500、anthropic-main $229.80 / $400。すべて 80% 未満。
- [ ] ログに最初からある行が 4 つ。最新が `毎時チェック完了: 3接続とも80%未満。`
- [ ] 手順 3 の `#spike-target` が **openai-prod (OpenAI)**（初期値）。
- [ ] 画面にトーストが出ていない。

### ボタンを押す順番

**80% と 100% に早く到達させる（スパイクを起こす）：** 1 回クリックするごとに、openai-prod の予算の 25%（$125）を加え、毎時チェックを 1 回実行する。61% から始めると：
1. **1 回目** → 約 86% → 琥珀色の 80% トーストと、ログに `通知` の行。
2. **2 回目** → 100% 超え → 赤いトースト、赤い注意書き、ログに `送信予定: POST …/spend_limit` 付きの `テスト` の行。
トーストは 9 秒で自動的に閉じる。早く消したいときは **×** をクリック。**1日進める** には触らない。チェックが 24 回進み、関係ないログが画面に出てしまう。

**カット A：**
1. リセット → S1 のぶん待つ → ストリップとカードをスクロール（S2）。
2. ステッパー **2 予算を設定** → ホバーだけ（S3）。
3. ステッパー **3 時間を進める** → **スパイクを起こす**（S4）→ **スパイクを起こす**（S5）→ ログまでスクロール。
4. **手順4: 停止の確認へ** → **確認を発行** → `openai-prod` と入力（S6）。
5. **テストモードで実行(送信しません)**（S7）。
6. **手順5: 戻し方を見る** → OpenAI と Anthropic のカードをパン（S8）。

**カット B：**
1. リセット → W1／W2 → タブ **Vercel、OpenAI、Anthropic、合計**（W3）。
2. **次へ: 予算を設定** → vercel-acme-web に `280` と入力して Enter（W4）。
3. **次へ: 時間を進める** → **スパイクを起こす** ×1（W5）→ ×1（W6）。
4. **手順4: 停止の確認へ** → ドロップダウンで vercel-acme-web → anthropic-main（W7）。
5. oncall-break-glass にチェック → **確認を発行** → チェックを外す（W8）。
6. ドロップダウンで openai-prod → **確認を発行** → `OpenAI-prod` と入力し、`openai-prod` に直す（W9）。
7. **テストモードで実行(送信しません)** → **ライブに切り替え** にホバー（W10）。
8. **手順5: 戻し方を見る** → OpenAI の **戻したことを記録(デモ)**（W11）。
9. ヘッダーの **プラン 無料** → **購入**（Monthly）→ カード `4242 4242 4242 4242`、`12/28`、`123`、`DEMO USER` → **デモで支払う**（W12）。
10. 上までスクロール（W13）。

5 分のタイマーは実時間で進む。**確認を発行** を押してから 5 分以内に W8–W10 を撮り終えるか、もう一度発行する。

### ぼかす・切り取るもの
このページには本物の情報は何もないはず。それを確認し、案の段階の価格を消す：
- [ ] **価格をぼかす：** プランカードの `.price` の値（Yearly のカードは「年払いは準備中」で価格は出ない）、決済の概要 `Monthly プラン · 月額 $9…`、購入後の現在プラン見出しの `(月額 $9)`。
- [ ] **`lp.md` にないプラン制限の文言をぼかすか切り取る：** 無料カードの文言、`#bill-current`（`停止の実行は有料プランで使えます`）、手順 4 の注意書き `いまは無料プラン(通知のみ)です…`。
- [ ] **ID がすべて架空であることを確認する。** どの ID にも `demo`／`Demo` が入っているはず：`prj_demoA1b2C3d4`、`team_demo7Kq2`、`proj_demo8fK2LmQx`、`wrkspc_demo3TnV9`、`apikey_01Demo…`。購入後のライセンスキーとカード末尾 4 桁もデモの値。
- [ ] **本物の情報が映っていないか確認する：** メールアドレスはどこにもない（デモにメール欄はない）、本物のカード番号はない（`4242…` だけ）、本名はない（`DEMO USER`）、アドレスバーやファイルパスはない、OS の通知はない、自動入力のポップアップはない、ほかのタブはない、Slack やメールクライアントは映っていない。
- [ ] 支出と予算のドル金額は残してよい。架空の数字で、注記の対象になっているため。

### ファイル名の付け方
```
raw takes     bg-demo_raw_{cutA|cutB}_{shot}_t{nn}.mov     e.g. bg-demo_raw_cutB_W09_t02.mov
edit project  bg-demo_{cutA-60s|cutB-walkthrough}_v{nn}.{prproj|fcpbundle}
masters       budget-guard_demo-60s_1080x1350_en_v{nn}_{YYYYMMDD}.mp4
              budget-guard_walkthrough_1920x1080_en_v{nn}_{YYYYMMDD}.mp4
              budget-guard_walkthrough_1920x1080_ja-burned_v{nn}_{YYYYMMDD}.mp4
subtitles     budget-guard_walkthrough_en_v{nn}.srt / budget-guard_walkthrough_ja_v{nn}.srt
              budget-guard_demo-60s_en_v{nn}.srt (source for the burned-in captions)
```
- raw takes：収録した生素材。edit project：編集プロジェクト。masters：書き出した完成版（`ja-burned` は日本語字幕の焼き込み版）。subtitles：字幕ファイル（`demo-60s_en` は焼き込みキャプションの元データ）。

### 書き出し前の最終チェック
- [ ] 両カットの全フレームで注記の行が見える。
- [ ] どのフレームでも、価格を言っていない・見せていない・ぼかし漏れがない。
- [ ] 各カットに "Test mode first"（まずテストモード）と "you can undo every stop"（停止はすべて元に戻せる）の両方が入っている。
- [ ] 利用状況グラフとワンクリック復旧は「今後提供予定（coming later）」としてだけ出ている。
- [ ] 実績の数字・推薦文・ロゴがない。HN への言及は W2 だけで、「ほかの開発者の公開報告」としてだけ。
- [ ] カット A は音なしで再生しても意味が通じる。キャプションは 4:5 のセーフエリア内にあり、トーストを隠していない。
- [ ] タイムコードが合っている：カット A 1:00、カット B 2:56。
