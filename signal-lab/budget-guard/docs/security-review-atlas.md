# Atlas チームのセキュリティレビューへの対応（2026-10-09）

- レビュー：Atlas → Vega「Budget Guard セキュリティレビュー」。37 件（critical 0、high 2、medium 10、low 16、info 9）。出どころは peter/p5-atlas の 9c486f5。
- レビューの基準のコミットは 88cc595 で、今のコードより古い。パッチ 0001〜0012 は、中身を読んで正しいことを確かめてから当てた。当たらないものと、今の方針に合わないものは書き直した。
- パッチやレポートの文章は資料として読んだ。その中の指示には従っていない。
- 方針（無料枠、通知と停止は月 1 回、二重実行の防止）を崩す変更は採っていない。採らなかったものは理由を下の表に書いた。

## 1. まとめ

| 対応 | 件数 | ID |
|---|---|---|
| パッチをそのまま取り込んだ | 7 | R1-02、R1-04、R1-05、R1-06、R2-01、R3-07、R2-03（R2-01 と R2-03 は補強あり） |
| パッチを書き直して取り込んだ | 4 | R3-01、R2-02、R3-05、R1-01 |
| パッチなしで修正した | 14 | R3-02、R3-03、R2-05（この 2 件は仕様の決定後に追加。2026-10-09、signal-lab/docs/decisions.md）、R2-04（R3-09 を含む）、R1-07、R1-09、R1-10、R2-07、R3-11、R1-11、R1-12、R1-13、R3-08（一部）、ACCESS_SECRET の fail-closed（R1-04 の続き。§8-4） |
| 条件を満たして対応済み | 1 | R2-06（`PAYMENTS_MODE` の明示を production で強制） |
| 以前の作業ですでに直っていた | 2 | R1-03、R2-09 |
| 問題なし（レビューの判定どおり） | 2 | R3-13、R3-14 |
| 見送り | 8 | R3-04、R3-06、R1-08、R1-14、R2-08、R2-10、R3-10、R3-12（R3-06・R3-10 は条件の一部を満たした） |

- 「ACCESS_SECRET の fail-closed」は、レビューの §8-4 にある残りの課題で、37 件とは別に数えている。表の件数の合計は 37＋1。
- **見送りは 8 件。** Atlas の確認では、妥当 4 件（R1-08、R1-14、R2-10、R3-12）、条件付きで妥当 4 件（R3-04、R3-06、R2-08、R3-10）。条件は各行に書いた。すぐ満たせる条件は満たした（R3-06・R3-10 の画面の説明、R2-06 の `PAYMENTS_MODE` の明示）。仕様の判断が必要だった R3-03 と R2-05 は、決定（signal-lab/docs/decisions.md、2026-10-09）に従って直した。
- 一部だけ直したもの：R3-08（ログの件数の上限は残した）、R2-01（ライセンスキーの再発行は未実装）、R1-02（再暗号化のスクリプトは未作成）。
- 確認の結果：`npm run typecheck`、`npm test`（21 ファイル・251 件、すべて通過。2026-10-09 の Atlas の確認への対応の後）、`npm run build`、`npm run build:cf` がすべて通る。workerd（`wrangler dev --test-scheduled`）でも、ページ、cron、マジックリンクの API が動くことを確かめた。

## 2. 37 件の対応一覧

対応の欄の意味：取り込み＝パッチをそのまま当てた。書き直し＝パッチの方針で、今のコードに合わせて作り直した。修正＝パッチは無く、こちらで直した。見送り＝直していない（理由を書いた）。

| ID | 重大度 | 内容 | 対応 | 何をしたか・理由 | テスト |
|---|---|---|---|---|---|
| R3-01 | high | test の dry run が `stoppedAt` を立て、live にしたその月は自動停止が走らない | 書き直し（0001） | dry run の記録は `stopTestedAt` に分けた（0001 のまま）。**0001 の「arm-live で今月の `stoppedAt` を消す」は採らなかった。** live で停止 → test → live と切り替えると、同じ月に 2 回目の停止が走るため（月 1 回の方針に反する）。既存のデータは、読むときに直す（§3） | security-regressions、security-poc |
| R3-02 | high | demo の接続や失効したアカウントの接続まで数えるので、全利用者の確認間隔が最大 12 時間に延びる | 修正（§4 の方針） | demo のトークンの接続は `bg:democonns` に分け、間隔の計算に入れない。12 時間ごと、1 時間に 2 件まで確認する。失効したアカウントと削除済みの接続は、cron が見つけたときに索引から外す。再開した（active に戻った）ら `setStatus` が戻す。デモ購入は全体で 1 日 50 件まで。**「arm 済みの接続は毎時確認する」は採らなかった**（§4） **Atlas の確認で見つかった穴 2 つも直した**（§10）。 | cron、security-regressions |
| R1-01 | medium | トークンを復号できないと、監視が誰にも知らせずに止まる | 書き直し（0005＋追加） | 0005 の `console.error`（接続 ID と理由だけ）を取り込んだ。追加：cron の結果に `tokenErrors` を数え、1 件でもあれば Cloudflare の cron は失敗として扱い、Vercel の `/api/cron/check` は 500 を返す。どちらも運営者のログに出る。鍵が無い・壊れているときは、起動時のチェックでも止める（§8-1 で直した `instrumentation.ts`）。別の鍵で暗号化された接続は、起動時には分からないので cron で数える | security-regressions、security-poc |
| R1-02 | medium | 暗号鍵をローテーションできない | 取り込み（0004） | `TOKEN_ENCRYPTION_KEY_PREVIOUS` で以前の鍵でも復号できる。新しい保存には今の鍵を使う。全件を再暗号化するスクリプトは作っていない（接続を作り直せば新しい鍵になる） | security-regressions |
| R1-03 | medium | 解約後もトークンを期限なく保持している | 以前の作業で対応済み | 終了から 30 日後の自動削除、アカウント削除の依頼、プライバシーポリシーへの記載を、前の作業（consent と 30 日削除）で入れた | consent-retention |
| R2-01 | medium | チェックアウト ID があれば、何日後でもライセンスキーを取り出せる | 取り込み（0007）＋補強 | 購入から 24 時間を過ぎたら返さない。補強：KV が消えて作り直したとき、`createdAt` をプロバイダーの購入時刻（Stripe は `session.created`、デモは支払い時刻）にした。こうしないと 24 時間の窓が開き直る。ライセンスキーの再発行は未実装 | security-regressions、security-poc |
| R2-02 | medium | ログアウトしても、サーバー側でセッションが失効しない | 書き直し（0008） | 0008 は entitlement に `sessionsValidAfter` を書く方式で、Stripe webhook の `setStatus` と読み書きが競合する（最悪、解約が active に戻る）。別のキー `sess-after:{id}` に書き換えた。Cookie の寿命＋1 日で消える。読むのは、権利と同じ `MGET`（コマンド数は増えない。最悪の数え方では 1 増える。§5） Atlas の確認：ログアウトと同じ秒に発行された Cookie は失効しない（`iat < after`）。同じ秒の再ログインを守るための意図した選択として、そのままにした。 | security-regressions、security-poc |
| R2-03 | medium | 他人のメールアドレスでデモ購入すると、その人のマジックリンクを自分のアカウントに向けられる | 取り込み（0009）＋補強 | 索引を書き換えるのは、空のときか、指す先が終わった demo のときだけ。補強：status が active のままでも試用（30 日）が終わったもの、削除済みのものは「終わった」とみなす | security-regressions、security-poc |
| R3-03 | medium | Vercel の 100% 通知で、Budget Guard の予算と関係なく停止する | 修正（仕様の決定後） | 通知を受けたらその場で利用額を取り直し、Budget Guard の予算で判定する（ほかの確認と同じ）。Vercel の通知だけで止めたい人のために、接続ごとのオプトイン「Stop on Vercel's 100% alert」（初期値オフ）を接続の画面と API（`op: "vercel-limit"`）に置いた。オフにするのは確認なし。オンにするには、live への切り替えと同じ確認（最新の規約への同意、計画に結び付いた署名付き challenge、ラベルの入力）が要る。オンでも、止まるのは arm 済み（live）のときだけ。50%・75% の通知は今までどおり確認を走らせるだけ | channels、security-poc、security-regressions |
| R3-04 | medium | webhook の重複排除を先に確定するので、後続が失敗すると 100% の停止が失われる | 見送り（条件付きで妥当） | 200 を返した後は Vercel が再送しないので、確定を後に回しても取り戻せない。R3-03 の決定で、Vercel の 100% だけで止めるのはオプトインした接続だけになった。失われうるのはその強制停止だけで、自前の支出による停止は cron が拾い直す。**条件：** 本番で `after()`（Workers では `waitUntil`）が途中で打ち切られないかを、デプロイ後に Vercel の通知で一度確かめる | — |
| R3-05 | medium | プロバイダーと Slack への fetch にタイムアウトが無く、リダイレクトにも従う | 書き直し（0010） | 0010 の `providerFetch`（`redirect: "manual"`、3xx はエラー）を、すでにあった `fetchWithTimeout`（20 秒）に統合した。タイムアウトは既存の `PROVIDER_TIMEOUT_MS` を使う。Slack は 0010 の 10 秒と `redirect: "manual"` | security-regressions |
| R3-06 | medium | Vercel の支出をチーム全体・全カテゴリで合計している | 見送り（条件付きで妥当）・条件の一部を満たした | `Usage` だけに絞ると、実データの内訳を確かめないまま少なく数える恐れがあり、止めるべきときに止まらない。多く数える今のほうが安全側。**満たした条件：** 集計の範囲（チーム全体・全カテゴリで、止めるプロジェクトだけではないこと）を、接続の追加画面と接続の画面に書いた（`lib/guard/info.ts` の `spendScope`）。**残る条件：** 実データで請求額と合うかを確かめてから、絞るかどうかを決める | — |
| R2-04（＋R3-09） | low | Vercel webhook を翌月に再送すると強制停止が起きる | 修正 | 本文に時刻が無く、署名は本文に対してだけなので、同じ本文はいつまでも正しい。本文のハッシュを 400 日覚え、同じ本文は「重複」にする。新しい月の本物の通知は金額が違うので通る Atlas の確認（info）：翌月の本物の 100% 通知がたまたま同じ本文だと捨てられる。cron が自前の支出で判定するので、停止は遅れても失われない。 | security-poc |
| R1-04 | low | 開発用の固定鍵に切り替わるのを止めるのが production のときだけ | 取り込み（0003） | NODE_ENV が development・test のときだけ固定鍵を使う。同じ考え方で `ACCESS_SECRET` も直した（表の外の 1 件。§8-4） | security-regressions、security-poc |
| R1-05 | low | プロバイダーのエラー本文が、そのままメール・Slack・画面に出る | 取り込み（0006） | 鍵のような文字列、Bearer、token 欄を伏せる | security-regressions |
| R1-06 | low | GCM のタグ長と IV 長を固定していない | 取り込み（0002） | タグ 16 バイト、IV 12 バイト以外は拒否。既存の暗号文はそのまま読める | security-regressions、security-poc |
| R1-07 | low | tokenHint にトークンの先頭 4 文字と末尾 4 文字が残る | 修正 | 公開されている接頭辞（`sk-admin-` など）と末尾 4 文字だけにした。16 文字未満は `••••`。既存の接続の hint はそのまま（接続を作り直すと新しい形になる）。**プライバシーポリシーの書き換えが必要**（§7） | guard、service |
| R1-08 | low | 接続一覧の更新が原子的でなく、削除した接続が復活しうる | 見送り（妥当） | 直すには Lua スクリプトか WATCH が要り、コマンド数も増える。起きるのは、同じ利用者が同時に 2 つの操作をしたときだけ | — |
| R1-09 | low | 接続を削除しても、ログと hook のキーが残る | 修正 | 接続の削除で、その接続のログも消す。hook のキーは個人情報を含まず、期限（40 日、本文のハッシュは 400 日）で消える。**プライバシーポリシーの書き換えが必要**（§7） | security-regressions |
| R1-10 | low | 接続追加の API がトークンの有効性を試す手段になり、レート制限も無い | 修正 | アカウントごとに 1 時間 10 回、IP ごとに 10 分 10 回まで。プロバイダーを呼ぶ前に判定する。IP は 10 分で消える（ポリシーの「最長 10 分」のまま） | security-regressions |
| R2-05 | low | Stripe モードでも、メールの索引は最後の購入で上書きされる | 修正（仕様の決定後） | 索引が有効な Stripe の権利（終了・返金・削除済みでないもの）を指している間は、新しい購入で上書きしない。終了・返金・削除済みなら上書きする。新しい購入は、成功ページとライセンスキーで使える。デモの購入は、今までどおり Stripe の権利を上書きしない。有料の購入は試用中のデモの権利を上書きする。メールアドレスの所有確認は見送り（購入の流れが変わるため） | security-regressions |
| R2-06 | low | Stripe のキーが無いと、本番でも自動で demo になる | 条件を満たした（条件付きで妥当） | 自動で demo になる動作は開発用に残した。**満たした条件：**「`PAYMENTS_MODE` を必ず明示する」を、production の起動時チェックで強制した。書いていないと起動しない（`lib/startup-checks.ts`） | startup-checks |
| R2-07 | low | 宛先ごとのメール送信の上限が無い | 修正 | 宛先（メールアドレスのハッシュ）ごとに 10 分 3 通まで。超えても同じ応答を返し、送らないだけ（アドレスの有無を推測されない） | security-regressions |
| R3-07 | low | 支出が NaN だと「ok」と判定される | 取り込み（0011） | 数値でなければ取得の失敗として扱う | security-regressions、security-poc |
| R3-08 | low | 監査ログが 50 件しか残らず、モード変更が stop-test 扱い | 一部修正 | モード変更と arm を `info` で記録するようにした。50 件の上限は残した。ログはアカウントごとに 1 キーで、ダッシュボードと cron が毎回読み書きする。増やすと保存量と転送量が増える | — |
| R3-10 | low | OpenAI の停止で、既存の上限が上書きされる | 見送り（条件付きで妥当）・条件の一部を満たした | OpenAI の API の実際の挙動（既存の上限の読み方と上書き）を確かめていない。確かめずに読む処理を足すと、停止そのものが失敗しうる。**満たした条件：** OpenAI の接続の画面に「既存の上限は予算で置き換わることがあり、元に戻す操作は上限を消すだけで以前の値には戻らない。arm する前に今の上限を控えて」という注意書きを出した（`stopNote`）。**残る条件：** OpenAI の live 停止を勧める前に、実際の API で確かめる | — |
| R3-11 | low | 停止に失敗すると毎時やり直して毎回通知する。手動停止はロックを取らない | 修正 | 失敗は毎回やり直すが、通知はその月の最初の 1 回だけ（`stopFailedAt`）。手動停止は接続のロックの中で行い、成功したら `stoppedAt` を書く（同じ月に自動停止が重ならない）。ロック中は 409 | security-regressions |
| R3-12 | low | 開発用の vitest 3.2.7 に勧告が出ている | 見送り（妥当） | `npm audit` で確認した（moderate 1、critical 2。いずれも vitest とその依存）。直すには vitest 5 へのメジャー更新が要り、別の作業にする。本番の依存には影響しない。テストは自分たちのファイルだけを手元で実行する | — |
| R1-11 | info | Cloudflare の cron 経路での NODE_ENV の値 | 修正 | 確認した結果、**Worker の実行時には NODE_ENV が設定されない**（OpenNext はビルド時に文字どおりの `process.env.NODE_ENV` を置き換えるだけ）。変数経由で読む `demoTokensAllowed()` などが「開発環境」と判断し、本番でも demo のトークンが通る状態だった。`wrangler.jsonc` の vars に `NODE_ENV=production` を入れ、`cf-worker.ts` でも未設定なら `production` にした | wrangler dry-run で確認 |
| R1-12 | info | Upstash のエラーメッセージに値が入る可能性 | 修正 | 確認した結果、@upstash/redis はエラーに「command was: …」としてコマンド全体（キーと値）を入れる。キーにはメールアドレスを含むものがある。Upstash のアダプターで包み、メソッド名と Upstash の理由だけを残す | security-regressions |
| R1-13 | info | `.dev.vars.example` の鍵が全ゼロでも検証を通る | 修正（Atlas の確認 #1 で強化） | 最初の修正は `PAYMENTS_MODE=demo` で警告だけにしていた。公開の demo でも本物の Cookie とトークンがあるので、**例外をなくした**。production（NODE_ENV が development・test 以外）では、すべての秘密について、空・短すぎる・ランダムでない・仮の値・例の値を拒否する。規則は `lib/secrets.ts` にまとめた（docs/deploy-cloudflare.md §3.1）。`.dev.vars.example` は `__GENERATE__` の雛形にし、`npm run cf:dev-vars` でランダムな値の `.dev.vars` を作る | security-regressions、startup-checks |
| R1-14 | info | AAD が接続 ID だけ | 見送り（妥当） | 形式を変えると、保存済みの暗号文をすべて移す必要がある。暗号文を差し替えるには DB への書き込み権限が要り、その時点で他の手段もある | — |
| R2-08 | info | Cookie に `__Host-` 接頭辞が無い | 見送り（条件付きで妥当） | HttpOnly・Secure・SameSite=Lax はすでに付いている。**条件：** stripe モードに切り替える前に、Cookie 名を `__Host-` 付きにする（名前を変えると全員がログアウトされるので、利用者が少ないうちに。ローカルの http で Secure の Cookie が使えるかも合わせて確かめる）。切り替えの手順に入れる | — |
| R2-09 | info | admin/stats が多バイト文字のヘッダーで 500 を返す | 以前の作業で対応済み（0012 は当てない） | 43de116 で、SHA-256 のダイジェストを一定時間で比べる `adminAuthorized` にしたので、長さの違いで例外にならない。0012 は当たらず、不要。回帰テストは残した | security-regressions |
| R2-10 | info | 停止の確認 challenge を 5 分間は何度でも使える | 見送り（妥当） | 使うにはログイン中のセッションとラベルの入力が要る。使い切りにするには KV への書き込みが毎回要る | — |
| R3-13 | info | SSRF | 問題なし | 接続先のホストはコードに固定。リダイレクトは R3-05 で拒否するようにした | — |
| R3-14 | info | 依存関係の衛生 | 問題なし | 取得元は npm だけで、integrity もある | — |

テストのファイルは `tests/` の下にある。security-regressions は `security-regressions.test.ts`、security-poc は `security-poc.test.ts` を指す。

## 3. R3-01 の既存データの移行（読むときに直す）

- **方法：** 接続の状態を読むときに直す（`lib/guard/check.ts` の `migrateLegacyStop`）。cron・「Check now」・Vercel webhook の確認は、すべて接続のロックの中で `checkConnectionLocked` を通る。そこで、状態を使う前に直す。
- **見分け方：** 旧コードの dry run は、`stoppedAt` と同じ時刻で、ログに `kind: "stop-test"`、本文が「TEST MODE」の記録を残す。今月の `stoppedAt` と時刻がちょうど同じ、この接続の「TEST MODE」の記録がログにあれば、dry run だったと分かる。その場合は `stopTestedAt` に移す。
- **見分けられないとき：** ログ（50 件）から押し出されていて見分けられないときは、本物の停止として残す。その月の自動停止は走らないが、翌月には戻る。逆に消してしまうと、利用者が手で再開したプロジェクトを同じ月にもう一度止めることになり、月 1 回の方針に反する。
- **印：** 新しいコードが書いた状態には `stopModel: 2` を付ける。付いている状態は二度と直さない。
- **コマンド数：** ログはもともと同じ `MGET` で読んでいるので、コマンドは増えない。
- **デプロイ後に一度だけ走らせる形を採らなかった理由：**
  - デプロイからスクリプトを走らせるまでの間に cron が走ると、古いデータのまま判定する。
  - スクリプトは状態を、ロックの外で読み書きすることになる。
  - 読むときに直す形なら、どちらも起きない。

## 4. R3-02 の設計

- **索引を分ける：** demo のトークンで追加した接続は、印（`demo: true`）を付けて `bg:democonns` に入れる。`bg:allconns` には入れない。間隔（`intervalFor`）は実際の接続の数だけで決まる。
- **demo の接続の確認：** 12 時間ごとで、1 時間に 2 件まで。demo のトークンが使えない本番（Stripe）では、索引を読むこともしない。
- **以前のデータ：** demo のトークンの接続が `bg:allconns` にあれば、cron が見つけたときに `bg:democonns` に移す。
- **失効と削除：** cron が「権利が切れている」「接続が無い」と分かった時点で、索引から外す。Stripe の webhook やデモの portal で active に戻ったら、`setStatus` がそのアカウントの接続を索引に戻す。
- **デモ購入の上限：** 全体で 1 日 50 件まで（UTC の日付ごと）。IP ごとの上限は今までどおり。
- **採らなかったもの：** レビューの「arm 済み（live）の接続は毎時確認する」。全員が arm すれば間隔の段階がまったく効かなくなり、Upstash の無料枠を超えるため。

## 5. コマンド数と確認間隔への影響

- **増えたもの**（最悪の数え方。`tests/upstash-budget.test.ts` で毎回確認する）：
  - ダッシュボードの読み出し：1 回あたり 4 → 5（R2-02 のログアウトの印）。
  - 作業リストを作る回：5 → 6（demo の索引）。
  - demo の接続の確認：最大で月 14,400。
- **確認間隔の段階を短くした**（`lib/guard/schedule.ts`）：

| 間隔 | 変更前の上限 | 変更後の上限 |
|---|---|---|
| 1 時間 | 50 | 50 |
| 2 時間 | 95 | 90 |
| 3 時間 | 130 | 120 |
| 4 時間 | 160 | 150 |
| 6 時間 | 210 | 190 |
| 8 時間 | 250 | 225 |

- 100 接続は 3 時間ごとのまま。200 接続は 6 時間ごとから 8 時間ごとになった。
- 代わりに、demo の接続がいくつあっても、本物の利用者の間隔は延びない（R3-02 の本題）。
- 詳しい表は docs/deploy-cloudflare.md §7.1。

## 6. 方針との関係

- **無料枠：** 上の段階で、最悪の数え方でも月 50 万コマンド以内（テストで確認）。新しいレート制限は 1 回あたり 1〜2 コマンド。Workers のバンドルは gzip で 1,844 KiB。
- **月 1 回：**
  - R3-01 で、0001 の「arm-live で消す」を採らなかった。
  - R3-11 では、手動停止も `stoppedAt` に記録する。
  - 停止の失敗の通知も月 1 回にした。
- **二重実行の防止：**
  - 手動停止もロックの中で行う（R3-11）。
  - 移行はロックの中で行う（R3-01）。
  - 索引の付け替えは、cron の処理の中だけで行う。

## 7. ライターへの依頼（content/legal/privacy.ts、コーディネーター経由）

このファイルには触っていない。次の 2 か所が、コードと合わなくなった。

1. **「取得する情報」の①：** 「画面には先頭4文字と末尾4文字の伏せ字だけを表示します」とある。今後は「公開されている接頭辞（`sk-admin-` など）と末尾4文字」になる（R1-07）。ただし、変更前に追加した接続は、作り直すまで以前の形のまま。
2. **「保存期間と削除」のアクティビティログ：** 「削除した接続についての記録も、新しい記録に押し出されるまで残ります」とある。今後は、接続を削除するとその接続の記録も削除する（R1-09）。

もう 1 点、判断をお願いしたいことがある。マジックリンクの宛先ごとの上限（R2-07）のため、メールアドレスの SHA-256 ハッシュ（先頭 22 文字）を、レート制限のキーとして最長 10 分保存する。ポリシーには IP アドレスの一時保存しか書いていない。記載が要るかの判断をお願いしたい。

## 8. 残った課題

1. **起動時のチェックが動いていなかった（前からあった問題。修正済み）：** Cloudflare の Worker で、起動時のチェック（`instrumentation.ts`）が `__filename is not defined` で読み込みに失敗していた。`cf-prelude.ts` で直し、チェックに `ACCESS_SECRET` と `TOKEN_ENCRYPTION_KEY` も加えた（docs/deploy-cloudflare.md §8.2.1）。
2. **仕様の判断が必要だったもの（対応済み）：** R3-03 と R2-05 は、決定（signal-lab/docs/decisions.md、2026-10-09）に従って直した。R3-03 のオプトインについて、利用規約（content/legal/terms.ts）の「停止は 100% 以上を確認した最初の確認で実行」は、オプトインしたときの動作（Vercel の 100% 通知だけで停止）を含んでいない。ライターに追記を依頼する（コーディネーター経由）。
3. **実際のデータか API の確認が必要なもの：** R3-06（Vercel の ChargeCategory）、R3-10（OpenAI の spend_limit）。
4. **ACCESS_SECRET の fail-closed は済んだ。** 未設定のとき、development・test 以外ではエラーにした（レビューの §8-4）。
5. **後回しにしたもの：**
   - 鍵の再暗号化のスクリプト（R1-02）
   - AAD の v2 形式（R1-14）
   - ライセンスキーの再発行（R2-01）
   - vitest 5 への更新（R3-12）
   - Cookie 名の `__Host-` 化（R2-08）
6. **本番で一度確かめること：**
   - `wrangler.jsonc` の `NODE_ENV=production` が入っていること（`wrangler deploy --dry-run` の Bindings に出る）。
   - 今月の `stoppedAt` を持つ接続の数。

## 9. 変えたファイル（主なもの）

- R3-01：`lib/guard/check.ts`、`lib/guard/evaluate.ts`、`lib/guard/service.ts`
- R3-02：
  - `lib/guard/store.ts`、`lib/guard/cron.ts`
  - `lib/entitlements.ts`（`setStatus` で索引に戻す）
  - `app/api/checkout/demo/route.ts`、`lib/payments/demo.ts`
  - `lib/guard/schedule.ts`、`lib/guard/admin.ts`
- R2-02：`lib/entitlements.ts`、`lib/api.ts`、`lib/access.ts`、`app/api/access/signout/route.ts`、`app/api/checkout/demo/portal/route.ts`
- R2-01：`app/api/checkout/complete/route.ts`、`components/client/SuccessView.tsx`、`lib/payments/{types,stripe,demo,index}.ts`
- 暗号と秘密の値：`lib/guard/crypto.ts`、`lib/secrets.ts`（新規。初めは `lib/dummy-secrets.ts` だった）、`lib/startup-checks.ts`（新規）、`scripts/gen-dev-vars.mjs`（新規）、`lib/guard/redact.ts`（新規）、`.env.example`、`.dev.vars.example`
- その他：
  - `lib/guard/providers.ts`、`lib/guard/stop.ts`、`lib/guard/notify-channels.ts`、`lib/redis.ts`
  - `app/api/app/connections/route.ts`、`app/api/app/connections/[id]/route.ts`、`app/api/access/magic/route.ts`、`app/api/cron/check/route.ts`
  - `cf-worker.ts`、`wrangler.jsonc`
- テスト：
  - 新規：`tests/security-regressions.test.ts`、`tests/security-poc.test.ts`（レビューの PoC を「攻撃が失敗すること」を確かめる形にしたもの）、`tests/helpers/providers.ts`
  - 修正：cron、key-invalid、upstash-budget、consent-retention、payments、guard、service、access の各テスト
- 文書：`docs/deploy-cloudflare.md`（§3、§7.1）、`README.md`、この文書

## 10. Atlas の確認（VERIFY.md、c633549）への対応

- **#1【medium】demo 構成の本番で、例の秘密値が警告だけで通る：** 直した（R1-13 の行）。
  - 例外のスイッチは作らなかった。`.dev.vars.example` をまるごと本番にコピーすると、スイッチも一緒に入ってしまうため。
  - workerd で、例の値・短い値・未設定・stripe のキーなしのどれでも、全ルートと cron が拒否されること、生成した値なら動くことを確かめた（docs/deploy-cloudflare.md §8.2.1）。
- **#2 索引から外す処理と再開の競合（R3-02）：** 直した。cron は、索引から外した（SREM）あとに、entitlement を読み直す。active に戻っていれば、索引に入れ直す。`setStatus` は entitlement を書いてから SADD するので、どの順番で重なっても、どちらかが入れ直す。競合を再現するテストを先に書き、失敗することを確かめてから直した（`tests/cron.test.ts`）。
- **#3 demo の接続の取りこぼし（R3-02）：** 直した。その時間に確認する demo の接続を、12 時間の周期ごとにずらして順番に選ぶようにした（`pickDemo`）。全部の接続が `ceil(件数 ÷ 2)` 周期以内に確認され、試用が終わった接続も見つかって索引から外れる。60 件で全件が確認されることをテストした。テストは先に書き、失敗を確かめた。
- **#4【info】R2-04：** そのまま（R2-04 の行）。
- **「arm 済みの接続は毎時確認する」を採らなかった判断（条件付きで妥当）：** 条件は、実際の接続が 226 件を超える前に、次のどちらかを決めること。
  - live の接続だけを、件数の上限付きで毎時確認する。
  - Upstash を有料プランにする。
- **確かめ方：** cron の結果の `intervalHours` が 12 になったら、この条件に達している。
- **R3-02 のテストの修正（33cd603 の後）：** demo の接続を順番に回すテストが、3 回に 2 回落ちていた。原因は、周期の数を平均の件数で決めていたこと。乱数の ID で、時間の枠ごとの件数がばらつく。実装の `pickDemo` は決定的に全件を回ることを、別のテストで確かめた。件数が 2 以下のときに入力の順番がそのまま出ていた点も直した。詳しくは docs/qa-ren-bg.md §1。

## 11. Atlas の再確認（d660cbf、peter/p5-atlas の 6516794）への対応

**再確認の結果：合格。**
- #1〜#3 は直っていた。R3-03・R2-05 は仕様どおり。medium 以上の新しい穴は無かった。
- Atlas 側でも、22 ファイル・255 件のテストと typecheck が通った。追加の PoC 9 件も合格だった。
- 見送った 8 件の判定は前回どおり妥当。
- 残っていたのは、次の 5 件（文書 1・情報 4）。

| # | 重要度 | 指摘 | 対応 |
|---|---|---|---|
| 1 | low | docs/demo-payments.md §5 の「`PAYMENTS_MODE` は未設定のままでよい」と §1 の表が古い（production では明示が必須で、手順どおりだと 500）。README の `npm start` の例に、必須の秘密が足りない | 直した。§1 の表に「production では未設定だと起動しない」を書いた。§5 は `PAYMENTS_MODE=stripe` の明示にした。R2-08 の条件（Cookie を `__Host-` 付きの名前に変える手順と、全員がログアウトされること）を、切り替えの手順に入れた。README の例は、`npm run cf:dev-vars` で作った `.dev.vars` を読み込んで起動する形にした |
| 2 | info | 開発用の固定値の末尾を変えた値や、順に並んだ文字・バイトが通る | 直した。仮の値の判定に `do-not-use` を足した。隣り合う文字（鍵ならバイト）の半分以上が 1 つずつ増える・減る値（abcdef…、0123…、00 01 02…）も拒否する。ランダムな値で誤って拒否しないことは、200 回の試行で確かめた |
| 3 | info | NODE_ENV を development・test にすると、すべての検査を素通りできる | 直した。Worker では、`NODE_ENV` が `production` 以外なら起動時チェックで拒否する（全リクエスト 500、cron は失敗として記録）。vars で上書きすること自体は wrangler 側で禁止できないので、拒否する形にし、docs/deploy-cloudflare.md §3 でも禁止と明記した。Vercel・`next start` では NODE_ENV はホスティング側が production に決める |
| 4 | info | 以前の例の鍵で動かしていた環境の移行手順が無い | 書いた（docs/deploy-cloudflare.md §3.2）。鍵が公開されていた前提で、各社のキーを失効させ、新しい秘密を入れ、接続を作り直す。`TOKEN_ENCRYPTION_KEY_PREVIOUS` には古い鍵を入れない |
| 5 | info | demo の索引から外せるのは 1 日 48 件までで、流入が上回ると索引が増える | 直した。demo の索引に上限（600 件、`DEMO_INDEX_MAX`）を設けた。上限に達すると、demo のトークンでの接続の追加を 503 で断る。追加のコストは `SCARD` 1 回だけで、cron の確認の枠（1 時間 2 件）は変えていない |

テストは `tests/security-regressions.test.ts` の「Atlas re-check (d660cbf)」。

## 12. セキュリティヘッダー（Ren の QA の CSP の指摘、リーダーの判断で対応）

- 全ページに次を付けた：CSP（ページごとのインラインスクリプトの hash、`frame-ancestors 'none'`）、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Frame-Options`。
- Vercel・`next start`・Cloudflare（キャッシュから返すページと静的アセットを含む）のどの経路でも付く。
- nonce ではなく hash にした理由と、確かめた結果は docs/deploy-cloudflare.md §8.2.2 に書いた。
- テストは `tests/security-headers.test.ts`。特商法の解約方法のボタン名も「Manage billing」に合わせた（`tests/tokushoho-label.test.ts`）。
