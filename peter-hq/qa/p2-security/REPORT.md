# Budget Guard セキュリティレビュー（Atlas → Vega）

- **宛先：** P2 リーダー Vega
- **作成：** Atlas（P5、セキュリティ）、2026-10-09
- **対象：** `peter/p2-signal-lab` の `88cc595`、`signal-lab/budget-guard/`
- **方法：** 3つの観点（①トークンの保存・ログ・Worker の秘密情報、②認可・認証・Webhook、③SSRF・停止アクション・依存パッケージ）で、レビュアー3人が並行してレビューした。そのあと検証役が、high と medium を反証の立場で再確認し、パッチを1つの系列にまとめた。外部サービスには一度も接続していない。P2 のブランチには触っていない。
- **成果物（このディレクトリ）：** `REPORT.md`、`findings.json`（統合した37件）、`patches/`（0001〜0012 と README.md）、`poc-baseline.test.ts.txt`（修正前のコードで再現に使ったテスト）

## 1. 要約
- 指摘は **37件**（high 2、medium 10、low 16、info 9）。**critical は0件**。
- high と medium の12件を検証した結果は、CONFIRMED 9、PLAUSIBLE 3（R3-03、R3-04、R3-06）、REJECTED 0。PoC で再現したものは R3-01、R1-01、R2-01、R2-02、R2-03、R3-03。
- 土台は健全。トークンは AES-256-GCM で暗号化して保存し、応答には出さない。他人の接続を操作する経路（IDOR）は無い。SSRF も無い。CSRF 対策、cron と webhook の署名検証もある。
- **パッチは12本。** HEAD に 0001〜0012 を順に当てると、型チェックはエラー0件、テストは **170件すべて通過**（元は149件、回帰テストを21件追加）。Atlas 側でも、別のコピーで当てて 170/170 を再確認した。

### すぐやるべき3つ
1. **0001（R3-01）を当て、本番で今月の `stoppedAt` を移行する。** 今は、test モードで予算を超えた接続を同じ月に live にしても、自動停止が一度も走らない。画面には「ARMED (live)」と出るので、利用者は守られていると思い込む。
2. **demo 構成の本番で、確認の間隔が延びないようにする（R3-02、パッチなし）。** テストカードで誰でもアカウントと demo 接続を作れるので、約250接続で全利用者の確認間隔が12時間になり、停止が最大12時間遅れる。直すまでは `SCARD bg:allconns` を監視する。
3. **試用者を増やす前に 0007〜0009（R2-01〜R2-03）を当てる。** 今の公開 demo 構成では、次の3つが PoC で再現した。
   - チェックアウト ID が漏れると、ライセンスキーを永久に取られる。
   - ログアウトしてもセッションが失効しない。
   - 他人のメールアドレスでデモ購入すると、その人のマジックリンクを自分のアカウントに向けられる。

## 2. 一覧（重大度順）
判定：CONFIRMED は PoC で再現したか、コードから確定的に言えるもの。PLAUSIBLE は経路はあるが、環境や外部 API や利用者の設定に依存するもの。UNVERIFIED は判断できないもの。NO_ISSUE は問題が無いことを確かめたもの。

| ID | 重大度 | 検証 | 内容 | 場所 | パッチ |
|---|---|---|---|---|---|
| R3-01 | high | CONFIRMED（PoC） | test の dry run が `stoppedAt` を立て、live にしたその月は自動停止が走らない | lib/guard/check.ts:84-90、evaluate.ts:61 | 0001 |
| R3-02 | high | CONFIRMED（コード） | demo の接続や失効したアカウントの接続も数えるため、全利用者の確認間隔が最大12時間に延びる | lib/guard/cron.ts:110-116、store.ts:137-141 | なし |
| R1-01 | medium | CONFIRMED（PoC） | トークンを復号できないと、監視が誰にも知らせずに止まる | lib/guard/service.ts:232-237,111 | 0005（一部） |
| R1-02 | medium | CONFIRMED | 暗号鍵をローテーションできない | lib/guard/crypto.ts | 0004 |
| R1-03 | medium | CONFIRMED | 解約後もトークンを期限なく保持している。削除の手段も、プライバシーポリシーへの記載も無い | service.ts:215-218、content/legal/privacy.ts | なし |
| R2-01 | medium | CONFIRMED（PoC） | チェックアウト ID があれば、何日後でもライセンスキーを取り出せる | app/api/checkout/complete/route.ts:38 | 0007 |
| R2-02 | medium | CONFIRMED（PoC） | ログアウトしても、サーバー側でセッションが失効しない（30日有効の JWT） | app/api/access/signout/route.ts、lib/api.ts | 0008 |
| R2-03 | medium | CONFIRMED（PoC） | デモ購入で、他人のマジックリンクの行き先を変えられる | lib/entitlements.ts:79-80 | 0009 |
| R3-03 | medium | PLAUSIBLE（PoC あり、仕様どおり） | Vercel の 100% 通知で、Budget Guard 側の予算と関係なく停止する | check.ts:66、service.ts:316-329 | なし |
| R3-04 | medium | PLAUSIBLE | webhook の重複排除を先に確定させるので、後続が失敗すると停止が失われる | service.ts:306-329 | なし |
| R3-05 | medium | CONFIRMED（コード） | プロバイダーと Slack への fetch にタイムアウトが無く、リダイレクトにも従う | service.ts:41-45、notify-channels.ts:44 | 0010 |
| R3-06 | medium | PLAUSIBLE | Vercel の支出をチーム全体・全カテゴリで合計している（止めるのは選んだプロジェクトだけ） | providers.ts:63-75 | なし |
| R2-04（＋R3-09） | low | CONFIRMED（PoC） | Vercel webhook を翌月に再送すると、強制停止が起きる | service.ts:306 | なし |
| R1-04 | low | CONFIRMED（PoC） | 開発用の固定鍵に切り替わるのを止めるのが production のときだけ | crypto.ts:17-22 | 0003 |
| R1-05 | low | CONFIRMED | プロバイダーのエラー本文が、そのままメール・Slack・画面に出る | providers.ts:30、stop.ts:48 | 0006 |
| R1-06 | low | CONFIRMED（PoC） | GCM のタグ長と IV 長を固定していない（4バイトのタグでも復号が通る） | crypto.ts:36-38 | 0002 |
| R1-07 | low | CONFIRMED | tokenHint にトークンの先頭4文字と末尾4文字が平文で残る | crypto.ts:43-46 | なし |
| R1-08 | low | PLAUSIBLE | 接続一覧の更新が原子的でなく、削除した接続が復活しうる | store.ts:117-171 | なし |
| R1-09 | low | CONFIRMED | 接続を削除しても、ログと hook のキーが残る | store.ts:161-171 | なし |
| R1-10 | low | CONFIRMED | 接続追加 API がトークンの有効性を試す手段になり、レート制限も無い | app/api/app/connections/route.ts | なし |
| R2-05 | low | CONFIRMED | Stripe モードでも、メールの索引は最後の購入で上書きされる | entitlements.ts:79 | なし |
| R2-06 | low | CONFIRMED（仕様どおり） | Stripe のキーが無いと、本番でも自動で demo になる | payments/mode.ts:31 | なし |
| R2-07 | low | CONFIRMED | 宛先ごとのメール送信の上限が無い | access/magic/route.ts:20 | なし |
| R3-07 | low | CONFIRMED（PoC） | 支出が NaN だと「ok」と判定される | check.ts:48 | 0011 |
| R3-08 | low | CONFIRMED | 監査ログが50件しか残らない | store.ts:13 | なし |
| R3-10 | low | PLAUSIBLE | OpenAI の停止で、既存の上限が上書きされる | providers.ts:107-113 | なし |
| R3-11 | low | CONFIRMED | 停止に失敗すると毎時やり直して通知する。手動停止はロックを取らない | check.ts:94-97 | なし |
| R3-12 | low | PLAUSIBLE | 開発用の vitest 3.2.7 に勧告が出ている（テスト実行時だけの影響） | package-lock.json | なし |
| R1-13 | info | CONFIRMED | `.dev.vars.example` の鍵が全ゼロでも検証を通る | .dev.vars.example:12 | なし |
| R1-14 | info | CONFIRMED | AAD が接続 ID だけ | crypto.ts | なし |
| R2-08 | info | CONFIRMED | Cookie に `__Host-` 接頭辞が無い | lib/access.ts:50 | なし |
| R2-09 | info | CONFIRMED | admin/stats が多バイト文字のヘッダーで 500 を返す（認証の回避ではない） | admin/stats/route.ts:10 | 0012 |
| R2-10 | info | CONFIRMED | 停止の確認 challenge を5分間は何度でも使える | stop.ts:76 | なし |
| R1-11 | info | UNVERIFIED | Cloudflare の cron 経路での NODE_ENV の値 | cf-worker.ts | （鍵の側は 0003 で fail-closed にした） |
| R1-12 | info | UNVERIFIED | Upstash のエラーメッセージに値が入る可能性がある | lib/redis.ts | なし |
| R3-13 | info | NO_ISSUE | SSRF | schemas.ts | ― |
| R3-14 | info | NO_ISSUE | 依存関係の衛生 | package.json | ― |

## 3. 主な指摘の詳細

**R3-01（high）test の dry run が live の停止を塞ぐ**
- 流れ：接続は test モードで始まる → 予算に達すると dry run が `state.stoppedAt` を記録する → 利用者が arm-live しても state は残る → `evaluate` は `!state.stoppedAt` を停止の条件にしているので、その月は自動停止が走らない。
- PoC：$60/$50 の test で stop-test が出たあと、live の判定は `stop=undefined`、`notices=[]` だった。
- 修正（0001）：dry run は `stopTestedAt` に記録し、live のときだけ `stoppedAt` で重複を防ぐ。test または off から arm-live したときは、今月の `stoppedAt` を消す。
- **移行：** デプロイ後、live の接続のうち「今月の `stoppedAt` があり、その接続の `kind:"stopped"` が今月のログに無い」ものの `stoppedAt` を消す。

**R3-02（high、パッチなし）確認の間隔が延びる**
- demo モードの本番では、IP あたり 20回/10分までテストカードで購入できる。demo トークンは外部 API を呼ばずに検証を通る。3接続 × 84アカウント = 252接続で、`intervalFor` が12時間を返す。失効したアカウントの接続も、削除されるまで索引に残る。

**R1-01（medium）監視が知らせずに止まる**
- PoC：別の鍵で暗号化した接続は、status が checked のまま、メール0件、console.error 0回だった。
- 0005：接続 ID と理由だけを console.error に出す。残りは、起動時に鍵を確かめて落とす（fail-fast）こと、cron のエラー数への計上、CRON_SECRET が欠けたときの 401 の検知。

**R2-01（medium）ライセンスキーの取り出し**
- 流れ：`/success?session_id=cs_live_…` が履歴やログから漏れる → `POST /api/checkout/complete` でライセンスキーを得る → ログインして stop-now、接続の削除、監視の無効化ができる。
- PoC：購入から30日後でもライセンスキーが返った。
- 修正（0007）：24時間を過ぎたら返さない。残りは、KV から作り直すときに `createdAt` を Stripe の `session.created` にすることと、ライセンスキーの再発行。

**R2-02（medium）ログアウト**
- PoC：ログアウト後も、コピーした Cookie で 200 が返った。
- 修正（0008）：ログアウト時に entitlement へ `sessionsValidAfter` を書き、それより前に発行された JWT を拒否する（全端末ログアウト）。demo portal も同じ。
- 注意：entitlement の読み書きが Stripe webhook の `setStatus` と競合しうる（最悪、解約が active に戻る）。別のキーにするか Lua で原子的にする。

**R2-03（medium）デモ購入とメールの索引**
- PoC：active な demo のメールアドレスで別の人がデモ購入すると、索引が後の購入を指した。
- 修正（0009）：索引を書き換えるのは、空のときか、指す先が失効した demo のときだけにする。根本対策はメールアドレスの所有確認（R2-05 と共通）。

**R3-03（medium、PLAUSIBLE）Vercel 100% 通知での停止**
- PoC：予算 $1000、支出 $42.50 の live の接続が、Vercel 側の予算 $20 の 100% 通知で停止した。docs/lp.md の仕様どおりだが、2つの予算は別の数字なので、設定によっては誤作動になる。仕様の判断が必要。

## 4. パッチの無い high と medium の修正方針
- **R3-02：** demo の接続は別の集合（`bg:democonns`）に入れ、`intervalFor` には実際の接続数だけを使う。demo の接続は12時間に1回、1時間あたりの件数を絞って確認する（数えないだけでは Upstash のコマンド数の上限を使い切るため）。失効したアカウントの接続は索引から外す。arm 済みの接続は毎時確認する。デモ購入には、全体で1日あたりの上限を設ける。tests/cron.test.ts の約3件は、demo 以外のトークンと注入した fetch を使うように書き換える。
- **R1-03：** 解約・返金から30日後にデータを削除するジョブ、アカウント削除の API、プライバシーポリシーへの記載（トークンと Slack の URL を暗号化して保存すること、保存期間、削除の方法）。
- **R3-03：** (a)「自前で取得した支出と通知の支出の大きい方」を Budget Guard の予算と比べる、または (b)「Vercel の 100% で止める」を接続ごとのオプトインにする。(a) にすればリプレイ（R2-04）も同時に防げる。どちらにしても、2つの予算が別物であることを画面に書く。
- **R3-04：** 強制チェックが成功してから重複排除を確定させる。失敗したら記録を消して 5xx を返す。`pendingForceLimit` を記録して次の cron で拾い、ルートに `maxDuration` を明示する。
- **R3-06：** 合計を `ChargeCategory === "Usage"` の行に絞る。プロジェクトで絞る選択肢を作り、集計の範囲を画面に書く。実データで請求額と合うかを確かめる。

## 5. パッチの当て方と結果
```sh
cd <peter/p2-signal-lab の作業ツリーのルート>
for p in <このディレクトリ>/patches/00*.patch; do git apply --check "$p" && git apply "$p" || break; done
cd signal-lab/budget-guard && npm ci && npm run typecheck && npm test
```
- 順番は 0001 から 0012。`git am` でも当てられる。各パッチの先頭に日本語の説明がある。
- 一覧：0001 R3-01 ／ 0002 R1-06 ／ 0003 R1-04 ／ 0004 R1-02 ／ 0005 R1-01 ／ 0006 R1-05 ／ 0007 R2-01 ／ 0008 R2-02 ／ 0009 R2-03 ／ 0010 R3-05 ／ 0011 R3-07 ／ 0012 R2-09
- 結果：型チェックはエラー0件。テストは17ファイル170件すべて通過。1本当てるごとにも型チェックと全テストが通ることを確かめた。既存のテストを変えたのは `tests/access.test.ts` の1件だけ（0008 で戻り値に `iat` が加わったため）。
- 回帰テストは `tests/security-regressions.test.ts`（R3-01、R2-01、R2-02、R2-03、R1-06、R3-07、R1-04、R1-02、R1-01、R1-05、R3-05、R2-09）。
- 0010 では、リダイレクトを `redirect: "error"` ではなく `manual` にし、3xx をエラーとして扱った。Cloudflare Workers が `"error"` を受け付けない可能性があるため（未確認）。

## 6. 問題が無いことを確かめた点
- 接続の IDOR：すべての操作がログイン中のアカウントの範囲で接続を引く。接続 ID は64ビットの乱数。
- SSRF：接続先のホストはコードに固定されている。ID は正規表現と encodeURIComponent で守られている。Slack の URL は保存時と送信時の両方で検証している。Cloudflare では `global_fetch_strictly_public` が有効。
- CSRF：状態を変える POST・DELETE はすべて Origin を確認している。Cookie は SameSite=Lax で、GET に副作用は無い。オープンリダイレクトも無い。
- マジックリンク：256ビット、保存は sha256 のみ、使い切り、有効期限15分。
- cron：Bearer の比較は timingSafeEqual で、CRON_SECRET が無いと 401（fail-closed）。
- Stripe webhook：署名の検証、イベント ID での重複排除、product の metadata の確認がある。portal は本人の customerId しか使わない。
- Vercel webhook：接続ごとの secret で HMAC を timing-safe に検証し、teamId の一致も確かめている。
- 依存関係：本番の依存に既知の脆弱性は0件（`npm audit --package-lock-only --omit=dev`）。取得元は npm だけで、integrity もある。install スクリプトを持つのは開発用の依存だけ。

## 7. 確認できなかった点
- Next.js の `after()` が maxDuration で打ち切られるときの実際の挙動（node_modules/next/dist/docs は作業ツリーに無かった）。
- Cloudflare：waitUntil の上限、fetch の redirect と AbortSignal、バンドル後の NODE_ENV（R1-11）。
- 本番の設定：PAYMENTS_MODE、鍵がダミーでないか、CRON_SECRET、`bg:allconns` の件数、今月の `stoppedAt`。
- 外部 API の実際の応答：Vercel の ChargeCategory の内訳、OpenAI の spend_limit、各社の 401 の本文、Upstash のエラーの書式。

## 8. 残った課題
1. R3-01 の本番データの移行。
2. R3-02、R1-03、R3-03、R3-04（R2-04 を含む）、R3-06 の修正（§4）。
3. R1-01 の fail-fast とエラーの通知。
4. `accessSecret` の fail-closed、再暗号化のスクリプト、AAD の v2 形式。
5. 0008 の競合への対策。
6. R2-01 の `createdAt` とライセンスキーの再発行。
7. 未対応の low：R1-07、R1-10、R2-07、R2-08、R3-08、R3-11、R3-12。
