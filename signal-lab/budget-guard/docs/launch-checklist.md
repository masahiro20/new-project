# Budget Guard 公開までのチェックリスト（オーナー向け）

> 作成日：2026-10-09。読む人：オーナー。
> 手順の詳細は既存の docs に任せ、ここでは「何を・誰が・いくらで・どこを見て・どう確かめるか」だけを書く。
> 事実は docs とコードにあるものだけを使った。根拠が見つからないものは「未確認」と書いた。
> **現状：A も B も未着手。** デプロイも、試用者への連絡もしていない（deploy-cloudflare.md 冒頭、trial-onboarding.md 冒頭）。

**オーナーにしかできないことの集約先：** Stripe など、オーナーにしかできない作業は、本部の「オーナーへのお願い①」（owner-asks.md）にまとめられる予定である。この文書のオーナー向けの項目も、そこに集約される。そのため、ここでは項目と確認方法だけを書き、手順は細かく書かない。owner-asks.md は本部のブランチにあり、こちらからは見られない。

---

## 0. 段階の全体像

| 段階 | 内容 | 始める条件 |
|---|---|---|
| A：デモ公開 | `PAYMENTS_MODE=demo`。お金は動かない。外部の試用者5人に使ってもらう（ステージゲート2） | A の項目がすべて完了し、trial-onboarding.md §2.3 の確認が通ること |
| B：有料化 | `PAYMENTS_MODE=stripe`。本物の課金を始める | A を終え、B の項目と legal-changes.md §3 のチェックリストがすべて完了すること |

- A が終わるまで、試用者への案内（trial-onboarding.md の段階 B）に進まない。
- 「お金」の欄は docs に書いてある範囲で書いた。金額が docs にないものは「未確認」とした。

---

## 1. A：デモ公開（PAYMENTS_MODE=demo、試用者5人）

| # | 項目 | 誰が | お金（無料枠で足りるか） | docs | 完了の確認 |
|---|---|---|---|---|---|
| A1 | Cloudflare のアカウント作成と `npx wrangler login` | オーナー | Workers Free で可。リクエスト10万/日、Cron Trigger はアカウントで5個（これで1個使う）。足りる見込み | deploy-cloudflare.md §1、§8.3 | `wrangler login` が通る |
| A2 | 秘密の値を作って入れる（下の §1.1） | オーナー | 無料 | deploy-cloudflare.md §3、§3.1、§3.2 | デプロイ後、`/` が 500 にならない。`npx wrangler tail` に `Server configuration refused` が出ない |
| A3 | Upstash Redis を作り、リージョンを選んで docs に書く（§1.2） | オーナー | 無料枠（月50万コマンド）で足りる。試用（最大15接続）は余裕がある | deploy-cloudflare.md §5、§5.1、§7.1 | §5.1 の表がすべて埋まっている。再読み込みしても接続が消えない |
| A4 | Resend の登録と、送信ドメインの追加・認証。`RESEND_API_KEY`・`MAIL_FROM` を secret に入れる | オーナー | Resend は無料プラン（月3,000通・1日100通）で足りる見込み。**ドメインを持っていなければ取得費用がかかる。金額は未確認** | deploy-cloudflare.md §3（`RESEND_API_KEY` の行）、trial-onboarding.md §2.1 | 自分のメールでデモ購入し、ライセンスキーのメールが届く。`wrangler tail` に `[mail:unsent]` が出ない |
| A5 | サポート用メールアドレスを決め、`product.config.ts` の `links.supportEmail` と `legal.email` を実在のアドレスにする（今は `support@example.com`） | オーナーが決める。コードの書き換えは担当者（未確認） | 未確認（アドレスの用意の費用） | trial-onboarding.md §2.1、legal-changes.md §3 | `grep -n example.com product.config.ts` が何も返さない |
| A6 | `NEXT_PUBLIC_SITE_URL` をビルド時に渡す | オーナー | workers.dev なら無料。独自ドメインの費用は未確認 | deploy-cloudflare.md §3、§10 | メールのリンクが `http://localhost:3000` ではなく公開 URL になっている |
| A7 | デプロイ。**ビルド時にも `PAYMENTS_MODE=demo` を付ける**（`PAYMENTS_MODE=demo NEXT_PUBLIC_SITE_URL=… npm run deploy`）。secret の `PAYMENTS_MODE` と同じ値にする | オーナー | 無料。CPU 超過（Error 1102）が続くときだけ Workers Paid（$5/月） | deploy-cloudflare.md §2.2、§10 | §10 の確認がすべて通る：`/` にデモのバナー、`/api/cron/check` が秘密なしで 401、`x-opennext-cache: HIT`、Triggers に `* * * * *`、Cron Events に毎分の結果 |
| A8 | `ADMIN_TOKEN` を入れる（試用の指標を見るため） | オーナー | 無料 | deploy-cloudflare.md §3、trial-onboarding.md §4.1 | `GET /api/admin/stats` が Bearer 付きで返る（誤ると 404） |
| A9 | CSP を実機のブラウザで確認する | オーナー | 無料 | deploy-cloudflare.md §10.1 | Console に `Refused to …` や `violates the following Content Security Policy directive` が0件。各ページに4つのヘッダーが付いている。`wrangler tail` に `[csp] …` が出ない |
| A10 | 【要専門家確認】の印をどうするか決める（§1.3） | オーナー | 専門家の費用は未確認 | legal-changes.md §0、§3 | 決めた内容が decisions.md に記録されている |
| A11 | デプロイ後の動作確認（自分で1接続を作る） | オーナー | 無料 | trial-onboarding.md §2.3 | §2.3 の7項目が通る。1時間以内に cron で「checked」時刻が更新される |
| A12 | 試用者の募集 | Midas | 無料（未確認） | user-recruiting-plan.md、trial-onboarding.md §1・§3 | 承認済みの候補に案内を送り、通話日か「自分で進める」の返事がある。送る前にオーナー／本部の承認が要る（user-recruiting-plan.md 冒頭） |

### 1.1 秘密の値（A2）

- **ローカル**：`npm run cf:dev-vars` で `.dev.vars` を作る。秘密の値は毎回ランダムで、`PAYMENTS_MODE=demo` が入る（README、deploy-cloudflare.md §6）。
- **本番**：docs の手順では `openssl rand -base64 32` で作り、`npx wrangler secret put` で入れる（§3、§3.1）。
  - 必須：`PAYMENTS_MODE`（demo）、`ACCESS_SECRET`、`TOKEN_ENCRYPTION_KEY`、`CRON_SECRET`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。
  - 試用では必須：`RESEND_API_KEY`、`MAIL_FROM`。指標を見るなら `ADMIN_TOKEN`。
  - 弱い値・例の値・空の値は起動時に拒否される。demo でも例外はない（§3.1）。
  - `NODE_ENV` は上書きしない（§3 の表）。
- **以前の例の鍵で動かしていた環境があれば**、§3.2 の移行（各社のキーの失効、接続の作り直し、全員の再ログイン）が要る。そうした環境があるかは未確認。

### 1.2 Upstash のリージョン（A3）

- リージョンはプライバシーポリシーの「外国にある第三者への提供」に書く国名になる（deploy-cloudflare.md §5.1）。
- データベースを作ったら、§5.1 の表（データベース名、プライマリ、リードリージョン、所在国、記入日・記入者）を埋める。
- ポリシー（`content/legal/privacy.ts`）の「（要確認）」をその国名に置き換える。privacy.ts はライターの担当なので、国名を決めたらライターに回す。
- リージョンを選ぶ基準は docs にない。どこを選ぶかはオーナーの判断である。

### 1.3 【要専門家確認】の印（A10）

- 今の運用（legal-changes.md §0）：
  - 変えた段落の先頭に `【要専門家確認】` を付けている。**画面にもそのまま出る**（意図したもの）。
  - 専門家の確認は、有料化の前にまとめて行う（ピーターの方針）。
  - 一方で「公開前にすべて外す」とも書いてある。
- **デモ公開（A）を「公開」に含めるかは、docs で決まっていない。** つまり、試用の間に印を表示したままにするか、外すかは未決定である。
- オーナーの判断事項として §4 に挙げた。選択肢は次の2つ。
  1. 表示したまま試用する（レビュー中であることを試用者に示す）。確認は B の前にまとめて行う。
  2. A の前に専門家の確認を受けて外す。

### 1.4 待機リストは作らない（ピーターの判断、2026-10-09）

- 待機リストは当面作らない。アカウントと個人情報の扱いが増えるため。
- そのため、このチェックリストには待機リストの受け付け先の項目を置かない。
- `/bg/` の公開に OK が出たら、ページには「公開の通知は X で」という一文だけを置く。
- 既存の docs には、まだ待機リストの文言が残っている（lp.md の「Join the waitlist」、demo-video.md の `[WAITLIST_URL]`、trial-onboarding.md §4.1 の「待機リストの人数」）。この文書では直していない。

---

## 2. B：有料化（Stripe）で追加するもの

| # | 項目 | 誰が | お金（無料枠で足りるか） | docs | 完了の確認 |
|---|---|---|---|---|---|
| B1 | Stripe アカウントを作り、まずテストモードのキーを発行する | オーナー | 手数料は未確認（docs に記載なし） | demo-payments.md §5 | `STRIPE_SECRET_KEY`（`sk_test_…`）が secret に入っている |
| B2 | Stripe の webhook を作る。送信先は `https://<host>/api/stripe/webhook`。イベントは `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.payment_failed`、**`invoice.paid`**（購入記録の7年保存に必要）、`charge.refunded` | オーナー | B1 と同じ | demo-payments.md §5、legal-changes.md §2.4 | `STRIPE_WEBHOOK_SECRET`（`whsec_…`）が secret に入っている。テスト購入で購入記録（`purchase:{請求書番号}`）ができる（確認の手順は未確認） |
| B3 | `PAYMENTS_MODE=stripe` を secret とビルド時の両方で明示し、再ビルド・再デプロイする | オーナー | — | demo-payments.md §1・§5、deploy-cloudflare.md §2.2 | 起動ログに `[payments] mode=stripe`。バナーが消える。モードが食い違うと `/api/checkout` が 503 になる |
| B4 | Cookie 名を `__Host-` 付きに変える（Atlas R2-08 の条件。**stripe に切り替える前に**）。`lib/config.ts` の `ACCESS_COOKIE` と `lib/access.ts` の `secure` | コードの変更は担当者、実施の判断はオーナー（未確認） | 無料 | demo-payments.md §5 の5、security-review-atlas.md（R2-08） | **全員がログアウトされる。** 利用者にライセンスキーかマジックリンクで入り直してもらう。ローカルの http で Secure の Cookie が使えるかも確かめる |
| B5 | 決算月を決め、`lib/payments/purchases.ts` の `PURCHASE_RETENTION.fiscalYearEndMonth` を合わせる（今は 12） | オーナーが決める。変更は担当者 | — | legal-changes.md §2.4 | 値が実際の決算月と一致している |
| B6 | 専門家（弁護士など）の確認を受け、`【要専門家確認】` をすべて外す | オーナーが依頼。外す作業はライター | 専門家の費用は未確認 | legal-changes.md §0、§2、§3 | `grep -rn '【要専門家確認】\|\${R}' content/legal` が何も返さない。`REVIEW_MARK` とその印のテストも消してある |
| B7 | 本文の「（要確認）」を確定値にする（Upstash の国名、消費者向けの責任の上限の「一定額」、Resend・Stripe・OpenAI の法人名など） | オーナーが決める。書き換えはライター | — | legal-changes.md §3 | 「（要確認）」「to be confirmed」が本文に残っていない |
| B8 | 特商法の【要記入】を埋める（`product.config.ts` の `legal.sellerName`・`representative`・`address`・`phone`）。`legal.effectiveDate` を公開日に合わせる | オーナー | — | legal-changes.md §3、`product.config.ts` | `grep -n '要記入' product.config.ts` が何も返さない |
| B9 | 事業者の区分（法人か個人か、青色か白色か、欠損金の繰越しの有無）を確かめ、購入記録の7年で足りるか確認する | オーナー＋専門家 | 未確認 | legal-changes.md §2.1（購入記録の保存期間の根拠）、§3 | 専門家の回答が記録されている |
| B10 | 公開する文言が決まったら `content/legal/version.ts` の `LEGAL_VERSIONS` を上げる（既存の利用者に再同意を求める） | 担当者（未確認） | — | legal-changes.md §2.3、§3 | ダッシュボードに再同意の画面が出る |
| B11 | 価格（$9/月）の承認 | オーナー | — | README「まだやっていないこと」 | decisions.md に記録されている |
| B12 | 年払いを再開するか決める。今は Yearly が「準備中」で購入できない（`comingSoon`） | オーナー | — | decisions.md（ピーター判断の行）、`product.config.ts` | 再開するなら、Stripe で年払いを端から端まで確かめた記録がある |
| B13 | テストキーで通したあと、live キー（`sk_live_…`）に替える | オーナー | 未確認 | demo-payments.md §5 の7 | 起動ログに `[payments] mode=stripe` |
| B14 | 切り替え後も CSP と動作を確認する | オーナー | 無料 | deploy-cloudflare.md §10.1 | 「Manage billing」が Stripe の請求ポータルに移る。CSP 違反が0件 |

**B に進むときの注意（docs の事実）**
- stripe モードでは、KV に残っている demo の権利は無効になる（demo-payments.md §4）。試用は、デモモードでなくなった時点で終わり、その30日後にデータが削除される（legal-changes.md §2.3）。試用者への事前の連絡の仕方は未確認。
- 管理用の削除 API は、Stripe で課金中のアカウントを `force: true` なしでは消さない。削除しても Stripe の課金は止まらないので、先に Stripe で解約する（legal-changes.md §2.3・§2.4）。

---

## 3. 定期的に見るもの（A・B 共通）

- Cloudflare の Metrics → Errors の `Exceeded CPU`（deploy-cloudflare.md §8.1）。
- Cron Events。cron が止まると、終了後30日の自動削除も止まる（legal-changes.md §3）。
- 本番で一度だけ確かめること：`wrangler deploy --dry-run` の Bindings に `NODE_ENV=production` が出る（security-review-atlas.md §8）。

---

## 4. オーナーの判断待ち

### 4.1 お金
- 送信ドメインの取得（持っていない場合）。金額は未確認。
- 独自ドメインを使うか。費用は未確認。workers.dev なら無料。
- 専門家（弁護士など）への依頼。費用は未確認。
- CPU 超過が続いたときの Workers Paid（$5/月）。
- 接続が272件を超えたときの Upstash の従量プラン（deploy-cloudflare.md §7.1）。金額は未確認。
- 価格 $9/月 の承認（README）。

### 4.2 アカウント
- Cloudflare、Upstash、Resend、Stripe のアカウントを誰の名義で作るか。未確認。
- サポート用メールアドレスと、`MAIL_FROM` の送信元アドレス。
- Upstash のリージョン。

### 4.3 法務
- 【要専門家確認】の印を、デモ公開の間は表示したままにするか、外すか（§1.3）。
- 専門家に確認を頼む時期。今の方針は「有料化の前にまとめて」。
- 特商法の【要記入】を、デモ公開で埋める必要があるか。未確認（trial-onboarding.md §2.1）。
- 消費者向けの責任の上限の「一定額」。
- 決算月と事業者の区分（購入記録の保存期間）。
- Stripe の customer metadata に残るライセンスキーの扱い（legal-changes.md §2.1）。

### 4.4 試用の運営
- 価格を通話で「案」として伝えてよいか（trial-onboarding.md §2.2）。
- オーナーが試用者の KV のデータを見てよい範囲（同上）。
- 年払いを再開するか。
- Cookie 名の切り替え（全員がログアウトされる）をいつ行うか。docs では「stripe に切り替える前、利用者が少ないうち」。

---

## 5. すでに決まったこと

決定の記録：[signal-lab/docs/decisions.md](../../docs/decisions.md)

- R3-03：Vercel の 100% 通知だけでは停止しない。接続ごとのオプトインあり（初期値オフ）。
- R2-05：有効な Stripe の権利を指すメールの索引は、新しい購入で上書きしない。
- 料金表：「Two months free」は削除。Yearly は「年払いは準備中」で購入できない。確認間隔の文言は段階表どおり。
- 試用期間30日、終了後30日で削除、依頼から7日以内に削除、対象は事業者・開発者の業務利用、外国移転は本人の同意による（ピーター、2026-10-09。legal-changes.md 冒頭）。
- 専門家の確認は、有料化の前にまとめて行う（ピーターの方針。legal-changes.md §0）。
- 本物の課金の購入記録は7年残す（d28、ピーター。legal-changes.md §2.4）。
- 待機リストは当面作らない。`/bg/` の公開に OK が出たら「公開の通知は X で」の一文だけを置く（ピーター、2026-10-09。コーディネーター経由で受けた。decisions.md への記録は未確認）。
- オーナーにしかできないことは、本部の「オーナーへのお願い①」（owner-asks.md）に集約する（同上）。
