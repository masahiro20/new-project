# Budget Guard ステージ2：試用者5人の導入手順書

> **現状：未実行。** デプロイも、試用者への連絡も、まだしていない。
> この文書は、募集（`docs/user-recruiting-plan.md`）で集まった人が、実際に使い始めて1週間使うまでを扱う。
> 作成日：2026-10-09。根拠：`README.md`、`docs/deploy-cloudflare.md`、`docs/demo-payments.md`、`docs/lp.md`、`docs/provider-apis.md`、`app/`、`components/`、`lib/`。
> 根拠が見つからない事項は「未確認」と書いた。

---

## 0. ゴール

- ステージゲート2：外部ユーザー5人が実際に使う。
- 「使った」の定義は `docs/user-recruiting-plan.md` §0 に従う。次の3つをすべて満たした人を1人と数える。
  1. 本物のプロバイダを1つ以上接続した（トークン検証を通過。`demo` トークンは数えない）。
  2. 毎時チェックが1回以上成功した、またはテスト停止を1回以上実行した。
  3. 通話か書面で、感想を1つ以上もらった。
- live 停止は条件にしない。

---

## 1. 全体の流れ

| 段階 | 誰が | 何を | 完了の条件 |
|---|---|---|---|
| A. オーナー側の準備 | オーナー | §2 の準備をする。`docs/deploy-cloudflare.md` §10 の手順でデプロイする。 | 公開 URL で §2.3 の確認がすべて通る。オーナー自身が試用者と同じ手順で1接続を作り、毎時チェックの結果がダッシュボードに出る。 |
| B. 試用者への案内 | 担当（Midas が募集文面、本書が導入案内） | 承認済みの候補に、§3 の案内を送る。15分の導入通話を予約する。 | 試用者が案内を受け取り、通話日か「自分で進める」の返事がある。 |
| C. 初日 | 試用者（担当は通話で同席） | デモ購入でアカウントを作る。専用キーを発行し、自分で入力する。Check now、テスト停止を実行する。 | ダッシュボードに当日の利用額が出る。アクティビティに `Manual test: would send …` が記録される。 |
| D. 1週間 | 試用者（担当は見守るだけ） | そのまま使う。毎時チェックが自動で回る。希望者だけ 80% 通知や live を試す。 | 7日間、毎時チェックの「checked」時刻が更新され続ける。担当は §4 の指標を記録する。連絡は期間中に1回だけ。 |
| E. 振り返り | 担当と試用者 | §6 のインタビューをする。データ削除の希望を聞く。キーの失効を促す。 | 感想を1つ以上記録した。削除の希望を確認した。 |

**注意**
- 段階 A が終わるまで、段階 B に進まない。
- 試用者のキーは、担当が見ない・受け取らない。入力は試用者が自分で行う（`docs/user-recruiting-plan.md` §6）。

---

## 2. オーナーにしかできない準備

デプロイは `docs/deploy-cloudflare.md` §10 に従ってオーナーが行う。ライター側では実行しない。

### 2.1 一覧

| 項目 | 内容 | お金 | 無料枠で足りるか | 根拠 |
|---|---|---|---|---|
| Cloudflare アカウント | Workers Free で可。`npx wrangler login` が要る。 | 無料 | 足りる見込み。リクエスト 10万/日、Cron Trigger 5個/アカウント（これで1個使う）、Worker サイズ非圧縮 64 MiB（現在 8.8 MiB）。 | deploy-cloudflare.md §1、§4、§7、§8.3 |
| CPU 10 ms の制限 | isolate ごとの初回 API は 10 ms を超える（最初の API は約 168 ms）。公式に「まれな超過は許容」とある。 | 原則無料。Error 1102（`exceededCpu`）が続くときだけ Workers Paid（$5/月）。 | 足りる見込み。本番の実測は未確認。 | deploy-cloudflare.md §8.1 |
| Upstash Redis | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。**デモでも本番では必須と考える。** メモリ上の KV は Workers では消えたり、見えたり見えなかったりする。 | 無料枠で可 | 足りる。無料枠は月 50 万コマンド。10 接続で月約 9 万（18%）。5人 × 最大3接続 = 15 接続でも余裕がある。上限の目安は約 104 接続。 | deploy-cloudflare.md §5、§7.1 |
| メール送信（Resend） | `RESEND_API_KEY` / `MAIL_FROM`。未設定だとメールはログに出るだけ。80% 通知、100% 通知、停止結果、キー無効の通知、ライセンスキー、マジックリンクがすべて届かない。**試用には必須。** | 無料プラン $0/月：月 3,000 通、1 日 100 通、独自ドメイン 3 つまで（https://resend.com/pricing 、2026-10-09 確認） | 足りる見込み。15 接続で、1 接続あたり月数通（80%・100%・停止・キー無効は各 1 回まで）＋ライセンス・ログインのメール。1 日 100 通の上限には、同じ日に通知が集中しても届かない見込み。 | deploy-cloudflare.md §3、`lib/mail.ts` |
| 送信元アドレスとドメイン | `MAIL_FROM` の既定値は `no-reply@example.com`。実在する送信元が要る。**Resend で送るには、自分のドメインを 1 つ以上追加して認証する必要がある**（「You must add and verify at least one domain to send emails with Resend」 https://resend.com/docs/dashboard/domains/introduction 、2026-10-09 確認）。 | ドメインを持っていなければ取得費用がかかる。金額は未確認。 | ドメインがあれば足りる | `lib/mail.ts`、`.env.example` |
| 公開 URL | `budget-guard.<sub>.workers.dev` で動く。独自ドメインは任意（Worker → Settings → Domains & Routes）。変えたら `NEXT_PUBLIC_SITE_URL` を直して再デプロイする。 | workers.dev は無料。独自ドメインの費用は未確認。 | workers.dev で足りる | deploy-cloudflare.md §3、§10 |
| シークレット | `PAYMENTS_MODE=demo`、`ACCESS_SECRET`（32文字以上）、`TOKEN_ENCRYPTION_KEY`（32バイト base64）、`CRON_SECRET`。`wrangler secret put` で入れる。 | 無料 | — | deploy-cloudflare.md §3 |
| `ADMIN_TOKEN` | `/api/admin/stats` を読むのに要る（§4）。 | 無料 | — | deploy-cloudflare.md §3 |
| 決済 | 当面 `PAYMENTS_MODE=demo`。お金は動かない。試用者はテストカード `4242 4242 4242 4242` でアカウントを作る。Stripe は不要。 | 無料 | — | demo-payments.md §1、§3 |
| サポート用メール | `product.config.ts` の `links.supportEmail` は `support@example.com` のまま。メールの返信先とプライバシーポリシーに使われる。 | 未確認 | — | `product.config.ts`、`lib/mail.ts`、`content/legal/privacy.ts` |
| プライバシーポリシーの記載 | 今の文面は待機リスト・購入・ライセンスキーだけを書いている。プロバイダのトークン、利用額、Cloudflare を書いていない。ホスティングは「Vercel」と書いてある。 | 無料 | — | `content/legal/privacy.ts` |
| 特商法などの要記入 | `product.config.ts` の `legal` に「【要記入】」が残っている。デモ公開で必要かは未確認。 | — | — | `product.config.ts` |

### 2.2 決めておくこと（本部・オーナー）

- 試用者のデータを削除する期限（募集手順書の案は依頼から7日以内）。
- 価格を通話で「案」として伝えてよいか。
- オーナーが試用者の KV のデータ（接続の一覧やアクティビティ）を見てよい範囲。§4 の指標の一部は、そこを見ないと分からない。

### 2.3 デプロイ後の確認（オーナー）

`docs/deploy-cloudflare.md` §10 の確認に加えて、次を行う。

1. `/` に「デモ：実際の請求はありません」が出る。
2. 自分のメールアドレスを入れてデモ購入する。ライセンスキーのメールが届く（Resend が動いている確認）。
3. 自分の捨てプロジェクトで、本物のキーを1つ接続する。Check now で利用額が出る。
4. 1時間以内に、cron で「checked」時刻が更新される。`npx wrangler tail budget-guard` に `[cron] * * * * * {…"checked":…}` が出る。
5. テスト停止を実行し、アクティビティに記録される。
6. 予算を今の利用額より少し上に設定し、80% 通知のメールが届く（利用額が 0 なら、この確認はできない）。
7. 接続を削除し、ダッシュボードから消える。

---

## 3. 試用者向けの案内（下書き）

送る前に本部の承認が要る。英語が本文。日本語訳は確認用。

### 3.1 English

> **Getting started with Budget Guard (trial)**
>
> Thanks for trying Budget Guard. This is an early prototype. Payments are in demo mode: no money moves.
>
> **1. Create your account (2 minutes)**
> - Open {SITE_URL}/pricing and click Buy. Use the test card `4242 4242 4242 4242`, any future expiry date, any CVC.
> - **Enter your real email address.** Alerts and your license key go there. If you leave it empty, alerts go nowhere you can read.
> - Keep the license key shown on the success page. You sign in with it at {SITE_URL}/access.
>
> **2. Create a dedicated key (please don't reuse an existing one)**
> None of the three providers offers a read-only cost key. The key that reads your spend can also pause, cap or deactivate. So create a new key just for Budget Guard, and revoke it when the trial ends.
> - **Vercel:** create an access token scoped to one team only (not your whole account). If you can, create it from a Member-role user. Set an expiry date. Budget Guard reads the team's billing charges, so the spend shown is the whole team's.
> - **OpenAI:** create an Admin key just for Budget Guard (a normal project key can't read costs). Admin keys are org-wide and have no scopes. If you create it through the API, you can set an expiry. Budget Guard reads costs for the one project you name.
> - **Anthropic:** create an Admin API key (`sk-ant-admin…`) just for Budget Guard. Only org admins can. It has no scopes. Budget Guard reads cost for the one workspace you name (not the Default workspace) and only touches keys in that workspace.
>
> **Please never send a key to us** — not by email, chat, or on a call. You paste it into the app yourself. The app stores it encrypted and never shows it again.
>
> **3. Start with a throwaway project**
> Before you use a production key, we recommend trying it on something you don't mind stopping:
> - Vercel: a spare project in the team. Only the project IDs you list are paused.
> - OpenAI: a spare project in your org.
> - Anthropic: a spare workspace.
> The key itself is still admin-level, so this limits what Budget Guard *targets*, not what the key *could* do.
>
> **4. Stay in test mode**
> Every connection starts in test mode. At 100% it records the requests it *would* send and sends nothing.
> - Click **Check now** to see today's spend (providers report per day, so today is a partial total).
> - Open **Stop action…** and click **Run in test mode**. The activity log shows what would have been sent.
> - Going live is optional and not needed for this trial. It requires you to review the request list and type the connection's label.
>
> **5. How to back out**
> - Back to test mode, or alerts only: one click on the stop page. No confirmation.
> - Delete the connection: **Delete connection and token** on the stop page. The stored token is deleted with it.
> - **Then revoke the key at the provider.** Deleting it in Budget Guard does not revoke it.
> - If a live stop ran and you want it undone: unpause the Vercel project, delete or raise the OpenAI project limit, or set the Anthropic keys back to active. You do this yourself in the provider's dashboard or API. Budget Guard lists the exact IDs in the activity log.
>
> **6. Your data**
> - We store: your email, your license, and for each connection the encrypted token, a masked hint (first 4 and last 4 characters), your budget and stop settings, spend readings and an activity log (last 50 entries).
> - Storage is Upstash, email is Resend, hosting is Cloudflare.
> - We don't store card numbers. In demo mode only the last 4 digits are kept.
> - Ask us to delete your account at any time. We'll do it within {N} days and tell you when it's done.
>
> **What we ask in return:** a 15-minute call or a few lines of written feedback after about a week.

### 3.2 日本語訳

> **Budget Guard の始め方（試用）**
>
> 試していただき、ありがとうございます。これは初期の試作品です。決済はデモモードで、お金は動きません。
>
> **1. アカウントを作る（2分）**
> - {SITE_URL}/pricing を開き、購入を押す。テストカード `4242 4242 4242 4242`、未来の有効期限、任意の CVC を使う。
> - **本物のメールアドレスを入れる。** 通知とライセンスキーはそこに届く。空欄だと、通知が読めない宛先に行く。
> - 完了ページのライセンスキーを控える。{SITE_URL}/access でのログインに使う。
>
> **2. 専用のキーを発行する（既存のキーを使い回さない）**
> 3社とも、コスト読み取り専用のキーがない。利用額を読むキーで、停止・上限設定・無効化もできてしまう。だから Budget Guard 専用のキーを新しく作り、試用が終わったら失効させる。
> - **Vercel：** 1つのチームだけに限ったアクセストークンを作る（アカウント全体ではない）。できれば Member ロールのユーザーで作る。有効期限を付ける。読むのはチームの請求データなので、表示される利用額はチーム全体の額になる。
> - **OpenAI：** Budget Guard 専用の Admin キーを作る（通常のプロジェクトキーではコストを読めない）。Admin キーは組織全体に効き、スコープはない。API で作れば期限を付けられる。読むのは指定した1つのプロジェクトのコスト。
> - **Anthropic：** Budget Guard 専用の Admin API キー（`sk-ant-admin…`）を作る。作れるのは組織の admin だけ。スコープはない。読むのは指定した1つのワークスペース（Default ワークスペース以外）のコストで、触るのもそのワークスペースのキーだけ。
>
> **キーは絶対にこちらへ送らない**（メール・チャット・通話のどれでも）。ご自身でアプリに貼り付ける。アプリは暗号化して保存し、二度と表示しない。
>
> **3. 捨ててよいプロジェクトから始める**
> 本番のキーを使う前に、止まっても困らないもので試すことを勧める。
> - Vercel：チーム内の予備のプロジェクト。止めるのは指定したプロジェクト ID だけ。
> - OpenAI：組織内の予備のプロジェクト。
> - Anthropic：予備のワークスペース。
> キー自体は管理者権限のままである。これで絞れるのは Budget Guard の「対象」で、キーに「できること」ではない。
>
> **4. テストモードのまま使う**
> 接続はすべてテストモードで始まる。100% に達しても、送るはずのリクエストを記録するだけで、何も送らない。
> - **Check now** で今日の利用額を見る（プロバイダは日単位で出すので、今日の分は途中経過）。
> - **Stop action…** を開き、**Run in test mode** を押す。アクティビティに、送るはずだった内容が出る。
> - live への切り替えは任意で、この試用では不要。リクエスト一覧の確認と、接続ラベルの入力が必要になる。
>
> **5. やめ方・戻し方**
> - テストモードに戻す、または通知だけにする：停止ページでワンクリック。確認なし。
> - 接続を削除する：停止ページの **Delete connection and token**。保存したトークンも一緒に消える。
> - **そのあと、プロバイダ側でキーを失効させる。** Budget Guard で削除しても、キーは失効しない。
> - live の停止が実行され、元に戻したい場合：Vercel はプロジェクトの unpause、OpenAI はプロジェクトの上限を削除または引き上げ、Anthropic はキーを active に戻す。プロバイダのダッシュボードか API で、ご自身で行う。対象の ID はアクティビティに出る。
>
> **6. データの扱い**
> - 保存するもの：メールアドレス、ライセンス。接続ごとに、暗号化したトークン、伏せ字（先頭4文字と末尾4文字）、予算と停止の設定、利用額の記録、アクティビティ（最新50件）。
> - 保存先は Upstash、メールは Resend、ホスティングは Cloudflare。
> - カード番号は保存しない。デモモードでは末尾4桁だけを持つ。
> - アカウントの削除はいつでも依頼できる。{N} 日以内に削除し、完了を連絡する。
>
> **お願い：** 1週間ほど使ったあと、15分の通話か、数行の感想をください。

### 3.3 案内文の根拠と注意（送らない）

| 記述 | 根拠 | 注意 |
|---|---|---|
| 読み取り専用キーがない | provider-apis.md §1.3、§2.3、§3.3 | 2026-10-08 時点 |
| Vercel：チーム限定・Member・期限付き | `lib/guard/info.ts`、provider-apis.md §1.3 | Member で pause を API から呼べるかは未確認（§5 の5） |
| Vercel の利用額はチーム全体 | `lib/guard/providers.ts`（`teamId` で取得し、プロジェクトで絞らない） | Hobby プランで billing charges を使えるかは未確認 |
| OpenAI はプロジェクトのコストを読む | `lib/guard/providers.ts`（`project_ids[]`） | Admin キーを作れるロールは未確認（Org owner と推測） |
| OpenAI の期限付き発行 | provider-apis.md §2.3（`expires_in_seconds`） | ダッシュボードから期限を付けられるかは未確認 |
| Anthropic は Default 以外のワークスペース | `components/guard/AddConnectionForm.tsx`、provider-apis.md §3.1 | 個人アカウントでは Admin API を使えない |
| 各社のキーの失効の手順（画面の場所） | — | **未確認。** docs に手順がない。案内では「プロバイダ側で失効」とだけ書いた |
| データの保存内容 | `lib/guard/store.ts`、`docs/lp.md` FAQ、demo-payments.md §4 | アカウント全体の削除機能はコードにない。オーナーが KV から手で消す（§5） |
| {N} 日 | 募集手順書 §6 の案は7日 | 本部の承認事項 |

---

## 4. 試用中に見る指標

### 4.1 指標と、見る場所

コードで確認できる場所だけを書いた。試用の指標は `GET /api/admin/stats` の `trial` にまとめて返す（`lib/guard/admin.ts`）。

| 指標 | 見る場所 | 備考 |
|---|---|---|
| デモ購入の数（アカウント作成） | `GET /api/admin/stats` の `days.{日付}.purchase` | `Authorization: Bearer $ADMIN_TOKEN` が要る。誤ると 404。直近14日の日別。オーナー自身の購入も数えるので差し引く。 |
| 購入の開始数 | 同 `checkout_start` | — |
| LP の閲覧・CTA | 同 `pageview`、`cta_click` | 個人は特定しない。 |
| 待機リストの人数 | 同 `waitlist` | — |
| 全体の接続数・プロバイダ別・demo トークンの数 | `GET /api/admin/stats` の `trial.connections`（`total`・`byProvider`・`demoToken`） | 認証は従来どおり `Authorization: Bearer $ADMIN_TOKEN`。索引 `bg:allconns` を使い、Upstash は 3 コマンド（`lib/guard/admin.ts`）。 |
| 本物の接続か `demo` か | 各アカウントの `budget-guard:bg:{アカウントID}:conns`（JSON）の `tokenHint`。`demo` は `••••`、本物は `先頭4…末尾4` | 試用者のダッシュボード（画面共有）でも「token …」として見える。 |
| テストモード／live の数 | `GET /api/admin/stats` の `trial.stopMode`（`off` / `test` / `live`） | ダッシュボードのバッジ「Stop: test mode」「Stop: LIVE」でも見える。 |
| live に切り替えた数 | 同上の `live` の数。アクティビティの `Stop action ARMED (live): …` | — |
| 今月の 80% 通知・100% 到達・テスト停止 | `GET /api/admin/stats` の `trial.thisMonth`（`warned`・`reachedLimit`・`testStopRecords`・`keyInvalid`） | 80%・100% は接続ごとの状態から数える。テスト停止はアクティビティ（`budget-guard:bg:{アカウントID}:activity` の `log`。最新50件だけ残る）の `Manual test:` と `TEST MODE` を数える。 |
| 定期チェックが回っているか | `GET /api/admin/stats` の `trial.lastCheckedAt`（最新）・`oldestCheckedAt`（いちばん古い）・`neverChecked` | 試用者のダッシュボードの「checked … UTC」でも見える。`npx wrangler tail budget-guard` の `[cron] … {"checked":…}`、Cloudflare の Cron Events でも全体を見られる。 |
| チェックの失敗 | ダッシュボードの接続カードの赤いエラー（`activity` の `snaps.{接続ID}.error`） | キーが無効（401・403）のときは、メールと Slack で 1 回知らせる（`key-invalid`）。それ以外の失敗（500、通信エラー）はメールで届かない。 |
| 80% 通知が出たか | アクティビティの `… passed the 80% alert line.` | 「出した」は分かる。「届いた」は、試用者に聞くか Resend 側で見る。Resend の画面での確認方法は未確認。 |
| 100% 到達・停止の結果 | アクティビティの `budget reached.`、`Stopped: …`、`Stop failed: …` | — |
| Slack 連携の数 | `…:settings` の `slackHint` | 任意機能。 |
| CPU 超過 | Cloudflare ダッシュボードの Metrics → Errors の `Exceeded CPU` | deploy-cloudflare.md §8.1 |

### 4.2 記録のしかた

- 試用者ごとに、募集手順書 §4 の管理表の列「接続（demo／real）」「毎時チェック or テスト停止」を埋める。
- 試用者の KV を見るかどうかは、§2.2 の決定に従う。見ない場合は、通話の画面共有か、試用者に送ってもらうスクリーンショットで確認する（キーが写らないようにお願いする）。
- 1週間の終わりに、5人分を1行ずつ本部に報告する。

---

## 5. 問題が起きたときの対応表

| 症状 | 考えられる原因（コード上） | 試用者がすること | 担当・オーナーがすること |
|---|---|---|---|
| 接続の追加で `Could not read usage with this token: …` | トークンの検証（利用額の読み取り）が失敗した。Admin キーでない、別チームのトークン、ID の誤り、期限切れなど。エラー本文にプロバイダの HTTP ステータスが入る。 | キーの種類を確かめる（OpenAI は Admin キー、Anthropic は `sk-ant-admin…`）。Team ID・Project ID・Workspace ID を確かめる。 | エラー本文の HTTP ステータスを聞く（キーは聞かない）。Vercel で Member が billing charges を読めない場合の挙動は未確認。 |
| 追加で `The demo token only works in development or with PAYMENTS_MODE=demo` | 本番が demo モードでない。 | — | `PAYMENTS_MODE` を確認する。なお `demo` トークンの接続は、ステージゲートに数えない。 |
| 追加後、キーが無効になった（期限切れ・失効） | 定期チェックの利用額取得が 401・403 になる。**メールで 1 回知らせる**（件名「Provider token rejected — monitoring is paused for this connection」）。Slack を登録していれば Slack にも送る。接続カードには毎回 `Usage fetch failed: …` が出る。キーが直る（取得が成功する）と、次に無効になったときにまた知らせる。月が変わっても、同じ無効のままなら再送しない。 | 新しいキーを発行する。今の接続を削除し、作り直す（トークンだけを差し替える機能はない）。 | `GET /api/admin/stats` の `trial.thisMonth.keyInvalid` で数を見る。 |
| Check now で「This connection is being checked right now」 | 毎時チェックが同じ接続のロックを持っている（409）。 | 1分ほど待って、もう一度押す。 | — |
| `Your plan allows 3 connections` | 1アカウント3接続まで。 | 使わない接続を削除する。 | — |
| 通知メールが来ない | ① `RESEND_API_KEY` が未設定（ログに出るだけ）② 購入時にメールを入れず、宛先が `demo@example.com` になった ③ まだ 80% に達していない ④ 今月すでに送った（月1回だけ）⑤ 迷惑メールに入った | 迷惑メールを確かめる。ダッシュボードの「Alerts go to …」の宛先を確かめる。 | ① `npx wrangler tail` に `[mail:dev]` が出ていれば未設定。② は宛先を変える機能がない。新しいアカウントで作り直すしかない（未確認：KV の手修正で直せるか）。⑤ の対策（送信ドメインの認証など）は未確認。 |
| Slack に来ない | Slack への送信失敗はアクティビティに `Slack delivery failed: …` として残る。メールと停止は止まらない。 | Send test message で確かめる。URL を登録し直す。 | — |
| 停止が失敗した（`Stop failed: …` / `Stop action FAILED` のメール） | プロバイダが拒否した。権限不足、ID の誤りなど。`stoppedAt` を書かないので、次の毎時チェックで再試行する。 | エラー本文を確かめる。止めたいなら、プロバイダの画面で自分で止める。 | 権限の要件（Vercel の pause に要るロールなど）は未確認。原因を記録し、本部に報告する。 |
| 停止計画が作れない（`Could not build the stop plan`） | Vercel のプロジェクトが未指定、Anthropic のキー一覧の取得失敗など。 | ID を確かめ、接続を作り直す。 | — |
| 誤って live にした | — | 停止ページの **Disarm (back to test mode)** を押す。確認なしで戻る。 | — |
| 誤って止めた（live 停止が実行された） | — | すぐ元に戻す。Vercel：プロジェクトを unpause（本番は数分で戻る。再デプロイ不要）。OpenAI：プロジェクトの上限を削除するか引き上げる。Anthropic：記録されたキーを active に戻す。Budget Guard の中にワンクリックの復旧はない。 | アクティビティの `Undo:` の行を一緒に見る。Anthropic の inactive → active の復帰は公式の保証が未確認。止まった時間と影響を記録し、本部に報告する。 |
| 戻したのに、同じ月にまた止まるか心配 | 停止は接続ごとに月1回。`stoppedAt` が残る間、同じ月は自動で再実行しない。月が変わると再武装する。 | 来月も困るなら、テストモードに戻すか、予算を上げる。 | — |
| すぐやめたい | — | 停止を off にする → 接続を削除する → プロバイダでキーを失効させる。 | アカウントの削除を依頼されたら、期限内に KV から消す。削除の機能はコードにないので、手作業になる。対象は少なくとも `budget-guard:bg:{アカウントID}:*`、`budget-guard:ent:{ID}`、`budget-guard:license:*`、`budget-guard:ent-by-email:*`、`budget-guard:demo-checkout:{ID}`。漏れがないかは未確認。 |
| サイト全体が 500 / Error 1102 | OpenNext の不具合の回避が外れた、CPU 超過など。 | — | `npx wrangler tail` と Metrics を見る。直らなければ `npx wrangler rollback`（deploy-cloudflare.md §11）。CPU 超過が続くなら Workers Paid（$5/月）。 |
| キーを送ってきた | — | — | すぐ削除する。相手に失効を頼む（募集手順書 §6）。 |

---

## 6. 試用後のインタビュー質問（15分）

価格は未承認の案だと、先に伝える。

1. Budget Guard を試そうと思ったきっかけは何か。いま、請求の暴走にどう備えているか（各社の標準の上限、アラートなど）。
2. この1週間で、実際に何をしたか。どこで手が止まったか。
3. 管理者権限のキーを渡すことに、どのくらい不安があったか。何があれば不安が減るか。
4. テストモードの記録を見て、「本当にこれが止まる」と信じられたか。live にしたか。しなかったなら、何があれば live にするか。
5. 80% の通知は役に立ったか（届いたか、届かなかったか、早さは十分か）。
6. これがなくなったら困るか。困らないなら、その理由は何か。
7. お金を払うか。払うなら、月いくらまでなら払うか。案の $9/月 と $79/年 は、高いか、安いか。
8. ほかに使いそうな人を知っているか。紹介してもよいか（任意）。

最後に、データ削除の希望と、キーの失効を確認する。

---

## 7. 未確認の一覧（この文書で使ったもの）

- 独自ドメインを持っていない場合の、ドメインの取得費用（Resend の無料枠と、ドメインの認証が必要なことは確認済み。§2）。
- 独自ドメインの費用。
- 本番の Cloudflare での CPU 時間（ローカルの計測のみ）。
- 各社のキーの失効の画面の場所。OpenAI の Admin キーをダッシュボードから期限付きで作れるか。
- Vercel：Member ロールで pause を API から呼べるか。Hobby で billing charges を使えるか。
- Anthropic：inactive から active へ戻せることの公式の保証。
- Upstash のデータを画面で見る方法。
- アカウント削除で消すべきキーの完全な一覧。
- 宛先を誤ったアカウントのメールを、KV の手修正で直せるか。

## 8. 既存文書との食い違い（要確認）

- （解決済み）`docs/user-recruiting-plan.md` の「`demo` トークンは本番では拒否される」は、コードに合わせて直した（`PAYMENTS_MODE=demo` を明示した本番では使える）。
- （解決済み）`content/legal/privacy.ts` のホスティングは、ビルド先に合わせて Cloudflare か Vercel を表示するようにした（`npm run build:cf` で Cloudflare）。プライバシーポリシーの法務上の確認事項は、別途報告している。
- （解決済み）接続の総数に応じて確認間隔を延ばす変更（`lib/guard/schedule.ts`）はマージ済み。50 接続までは毎時のままなので、試用（最大 15 接続）では「毎時」の記述は変わらない。
