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
| パッチなしで修正した | 12 | R3-02、R2-04（R3-09 を含む）、R1-07、R1-09、R1-10、R2-07、R3-11、R1-11、R1-12、R1-13、R3-08（一部）、ACCESS_SECRET の fail-closed（R1-04 の続き。§8-4） |
| 以前の作業ですでに直っていた | 2 | R1-03、R2-09 |
| 問題なし（レビューの判定どおり） | 2 | R3-13、R3-14 |
| 見送り | 11 | R3-03、R3-04、R3-06、R1-08、R1-14、R2-05、R2-06、R2-08、R2-10、R3-10、R3-12 |

- 「ACCESS_SECRET の fail-closed」は、レビューの §8-4 にある残りの課題で、37 件とは別に数えている。表の件数の合計は 37＋1。
- **見送りは 11 件。** そのうち、仕様の判断が必要なものが 2 件（R3-03、R2-05）、実際のデータか外部 API の確認が必要なものが 2 件（R3-06、R3-10）。
- 一部だけ直したもの：R3-08（ログの件数の上限は残した）、R2-01（ライセンスキーの再発行は未実装）、R1-02（再暗号化のスクリプトは未作成）。
- 確認の結果：`npm run typecheck`、`npm test`（20 ファイル・230 件、すべて通過）、`npm run build`、`npm run build:cf` がすべて通る。workerd（`wrangler dev --test-scheduled`）でも、ページ、cron、マジックリンクの API が動くことを確かめた。

## 2. 37 件の対応一覧

対応の欄の意味：取り込み＝パッチをそのまま当てた。書き直し＝パッチの方針で、今のコードに合わせて作り直した。修正＝パッチは無く、こちらで直した。見送り＝直していない（理由を書いた）。

| ID | 重大度 | 内容 | 対応 | 何をしたか・理由 | テスト |
|---|---|---|---|---|---|
| R3-01 | high | test の dry run が `stoppedAt` を立て、live にしたその月は自動停止が走らない | 書き直し（0001） | dry run の記録は `stopTestedAt` に分けた（0001 のまま）。**0001 の「arm-live で今月の `stoppedAt` を消す」は採らなかった。** live で停止 → test → live と切り替えると、同じ月に 2 回目の停止が走るため（月 1 回の方針に反する）。既存のデータは、読むときに直す（§3） | security-regressions、security-poc |
| R3-02 | high | demo の接続や失効したアカウントの接続まで数えるので、全利用者の確認間隔が最大 12 時間に延びる | 修正（§4 の方針） | demo のトークンの接続は `bg:democonns` に分け、間隔の計算に入れない。12 時間ごと、1 時間に 2 件まで確認する。失効したアカウントと削除済みの接続は、cron が見つけたときに索引から外す。再開した（active に戻った）ら `setStatus` が戻す。デモ購入は全体で 1 日 50 件まで。**「arm 済みの接続は毎時確認する」は採らなかった**（§4） | cron、security-regressions |
| R1-01 | medium | トークンを復号できないと、監視が誰にも知らせずに止まる | 書き直し（0005＋追加） | 0005 の `console.error`（接続 ID と理由だけ）を取り込んだ。追加：cron の結果に `tokenErrors` を数え、1 件でもあれば Cloudflare の cron は失敗として扱い、Vercel の `/api/cron/check` は 500 を返す。どちらも運営者のログに出る。起動時に止める案（fail-fast）は採らなかった。Workers では起動時の処理（instrumentation）が動いていないため（§8-1） | security-regressions、security-poc |
| R1-02 | medium | 暗号鍵をローテーションできない | 取り込み（0004） | `TOKEN_ENCRYPTION_KEY_PREVIOUS` で以前の鍵でも復号できる。新しい保存には今の鍵を使う。全件を再暗号化するスクリプトは作っていない（接続を作り直せば新しい鍵になる） | security-regressions |
| R1-03 | medium | 解約後もトークンを期限なく保持している | 以前の作業で対応済み | 終了から 30 日後の自動削除、アカウント削除の依頼、プライバシーポリシーへの記載を、前の作業（consent と 30 日削除）で入れた | consent-retention |
| R2-01 | medium | チェックアウト ID があれば、何日後でもライセンスキーを取り出せる | 取り込み（0007）＋補強 | 購入から 24 時間を過ぎたら返さない。補強：KV が消えて作り直したとき、`createdAt` をプロバイダーの購入時刻（Stripe は `session.created`、デモは支払い時刻）にした。こうしないと 24 時間の窓が開き直る。ライセンスキーの再発行は未実装 | security-regressions、security-poc |
| R2-02 | medium | ログアウトしても、サーバー側でセッションが失効しない | 書き直し（0008） | 0008 は entitlement に `sessionsValidAfter` を書く方式で、Stripe webhook の `setStatus` と読み書きが競合する（最悪、解約が active に戻る）。別のキー `sess-after:{id}` に書き換えた。Cookie の寿命＋1 日で消える。読むのは、権利と同じ `MGET`（コマンド数は増えない。最悪の数え方では 1 増える。§5） | security-regressions、security-poc |
| R2-03 | medium | 他人のメールアドレスでデモ購入すると、その人のマジックリンクを自分のアカウントに向けられる | 取り込み（0009）＋補強 | 索引を書き換えるのは、空のときか、指す先が終わった demo のときだけ。補強：status が active のままでも試用（30 日）が終わったもの、削除済みのものは「終わった」とみなす | security-regressions、security-poc |
| R3-03 | medium | Vercel の 100% 通知で、Budget Guard の予算と関係なく停止する | 見送り | docs/lp.md の仕様どおりの動作で、変えるかどうかは仕様の判断が要る。レビューの案は (a) 自前の取得額と通知額の大きい方で判定する、(b) 接続ごとのオプトインにする。リプレイの危険（R2-04）は別に直した | security-poc（10 月の停止は仕様どおりに起きる） |
| R3-04 | medium | webhook の重複排除を先に確定するので、後続が失敗すると 100% の停止が失われる | 見送り | 200 を返した後は Vercel が再送しないので、確定を後に回しても取り戻せない。`after()` と `waitUntil` の打ち切りの条件も未確認。失われても、毎時（または間隔ごと）の cron が自前の取得額で判定するので、停止は遅れるだけで失われない | — |
| R3-05 | medium | プロバイダーと Slack への fetch にタイムアウトが無く、リダイレクトにも従う | 書き直し（0010） | 0010 の `providerFetch`（`redirect: "manual"`、3xx はエラー）を、すでにあった `fetchWithTimeout`（20 秒）に統合した。タイムアウトは既存の `PROVIDER_TIMEOUT_MS` を使う。Slack は 0010 の 10 秒と `redirect: "manual"` | security-regressions |
| R3-06 | medium | Vercel の支出をチーム全体・全カテゴリで合計している | 見送り | `Usage` だけに絞ると、実データの内訳を確かめないまま少なく数える恐れがあり、止めるべきときに止まらない。多く数える今のほうが安全側。実データで請求額と合うかを確かめてから決める | — |
| R2-04（＋R3-09） | low | Vercel webhook を翌月に再送すると強制停止が起きる | 修正 | 本文に時刻が無く、署名は本文に対してだけなので、同じ本文はいつまでも正しい。本文のハッシュを 400 日覚え、同じ本文は「重複」にする。新しい月の本物の通知は金額が違うので通る | security-poc |
| R1-04 | low | 開発用の固定鍵に切り替わるのを止めるのが production のときだけ | 取り込み（0003） | NODE_ENV が development・test のときだけ固定鍵を使う。同じ考え方で `ACCESS_SECRET` も直した（表の外の 1 件。§8-4） | security-regressions、security-poc |
| R1-05 | low | プロバイダーのエラー本文が、そのままメール・Slack・画面に出る | 取り込み（0006） | 鍵のような文字列、Bearer、token 欄を伏せる | security-regressions |
| R1-06 | low | GCM のタグ長と IV 長を固定していない | 取り込み（0002） | タグ 16 バイト、IV 12 バイト以外は拒否。既存の暗号文はそのまま読める | security-regressions、security-poc |
| R1-07 | low | tokenHint にトークンの先頭 4 文字と末尾 4 文字が残る | 修正 | 公開されている接頭辞（`sk-admin-` など）と末尾 4 文字だけにした。16 文字未満は `••••`。既存の接続の hint はそのまま（接続を作り直すと新しい形になる）。**プライバシーポリシーの書き換えが必要**（§7） | guard、service |
| R1-08 | low | 接続一覧の更新が原子的でなく、削除した接続が復活しうる | 見送り | 直すには Lua スクリプトか WATCH が要り、コマンド数も増える。起きるのは、同じ利用者が同時に 2 つの操作をしたときだけ | — |
| R1-09 | low | 接続を削除しても、ログと hook のキーが残る | 修正 | 接続の削除で、その接続のログも消す。hook のキーは個人情報を含まず、期限（40 日、本文のハッシュは 400 日）で消える。**プライバシーポリシーの書き換えが必要**（§7） | security-regressions |
| R1-10 | low | 接続追加の API がトークンの有効性を試す手段になり、レート制限も無い | 修正 | アカウントごとに 1 時間 10 回、IP ごとに 10 分 10 回まで。プロバイダーを呼ぶ前に判定する。IP は 10 分で消える（ポリシーの「最長 10 分」のまま） | security-regressions |
| R2-05 | low | Stripe モードでも、メールの索引は最後の購入で上書きされる | 見送り | 根本対策はメールアドレスの所有確認で、購入の流れの仕様変更になる。Stripe の購入は実際の支払いが要るので、悪用の費用が高い | — |
| R2-06 | low | Stripe のキーが無いと、本番でも自動で demo になる | 見送り（仕様どおり） | 意図した動作で、全ページにデモの表示が出る。docs/demo-payments.md に書いてある | — |
| R2-07 | low | 宛先ごとのメール送信の上限が無い | 修正 | 宛先（メールアドレスのハッシュ）ごとに 10 分 3 通まで。超えても同じ応答を返し、送らないだけ（アドレスの有無を推測されない） | security-regressions |
| R3-07 | low | 支出が NaN だと「ok」と判定される | 取り込み（0011） | 数値でなければ取得の失敗として扱う | security-regressions、security-poc |
| R3-08 | low | 監査ログが 50 件しか残らず、モード変更が stop-test 扱い | 一部修正 | モード変更と arm を `info` で記録するようにした。50 件の上限は残した。ログはアカウントごとに 1 キーで、ダッシュボードと cron が毎回読み書きする。増やすと保存量と転送量が増える | — |
| R3-10 | low | OpenAI の停止で、既存の上限が上書きされる | 見送り | OpenAI の API の実際の挙動（既存の上限の読み方と上書き）を確かめていない。確かめずに読む処理を足すと、停止そのものが失敗しうる | — |
| R3-11 | low | 停止に失敗すると毎時やり直して毎回通知する。手動停止はロックを取らない | 修正 | 失敗は毎回やり直すが、通知はその月の最初の 1 回だけ（`stopFailedAt`）。手動停止は接続のロックの中で行い、成功したら `stoppedAt` を書く（同じ月に自動停止が重ならない）。ロック中は 409 | security-regressions |
| R3-12 | low | 開発用の vitest 3.2.7 に勧告が出ている | 見送り | `npm audit` で確認した（moderate 1、critical 2。いずれも vitest とその依存）。直すには vitest 5 へのメジャー更新が要り、別の作業にする。本番の依存には影響しない。テストは自分たちのファイルだけを手元で実行する | — |
| R1-11 | info | Cloudflare の cron 経路での NODE_ENV の値 | 修正 | 確認した結果、**Worker の実行時には NODE_ENV が設定されない**（OpenNext はビルド時に文字どおりの `process.env.NODE_ENV` を置き換えるだけ）。変数経由で読む `demoTokensAllowed()` などが「開発環境」と判断し、本番でも demo のトークンが通る状態だった。`wrangler.jsonc` の vars に `NODE_ENV=production` を入れ、`cf-worker.ts` でも未設定なら `production` にした | wrangler dry-run で確認 |
| R1-12 | info | Upstash のエラーメッセージに値が入る可能性 | 修正 | 確認した結果、@upstash/redis はエラーに「command was: …」としてコマンド全体（キーと値）を入れる。キーにはメールアドレスを含むものがある。Upstash のアダプターで包み、メソッド名と Upstash の理由だけを残す | security-regressions |
| R1-13 | info | `.dev.vars.example` の鍵が全ゼロでも検証を通る | 修正 | 1 種類のバイトだけの鍵と、例の `ACCESS_SECRET` は、development・test 以外ではエラー。ただし `PAYMENTS_MODE=demo` では警告だけにした（`npm run preview` が例の値を使うため）。demo を公開する前には必ず生成した値にする（docs/deploy-cloudflare.md §3） | security-regressions |
| R1-14 | info | AAD が接続 ID だけ | 見送り | 形式を変えると、保存済みの暗号文をすべて移す必要がある。暗号文を差し替えるには DB への書き込み権限が要り、その時点で他の手段もある | — |
| R2-08 | info | Cookie に `__Host-` 接頭辞が無い | 見送り | 名前を変えると全員がログアウトされる。HttpOnly・Secure・SameSite=Lax はすでに付いている。公開前に名前を変えるなら、そのときにまとめてやる | — |
| R2-09 | info | admin/stats が多バイト文字のヘッダーで 500 を返す | 以前の作業で対応済み（0012 は当てない） | 43de116 で、SHA-256 のダイジェストを一定時間で比べる `adminAuthorized` にしたので、長さの違いで例外にならない。0012 は当たらず、不要。回帰テストは残した | security-regressions |
| R2-10 | info | 停止の確認 challenge を 5 分間は何度でも使える | 見送り | 使うにはログイン中のセッションとラベルの入力が要る。使い切りにするには KV への書き込みが毎回要る | — |
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

1. **起動時のチェックが動いていない（前からあった問題）：** Cloudflare の Worker では、起動時のチェック（`instrumentation.ts`）が `__filename is not defined` で読み込みに失敗している。HEAD（a4b9f30）のビルドでも同じことを確かめたので、今回の変更が原因ではない。決済の設定ミスを起動時に知らせる仕組みが Workers では効いていない（各ルートの判定は効いている）。別の作業で直す。
2. **仕様の判断が必要なもの：** R3-03（Vercel の 100% での停止）、R2-05（メールアドレスの所有確認）。
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
- 暗号と秘密の値：`lib/guard/crypto.ts`、`lib/dummy-secrets.ts`（新規）、`lib/guard/redact.ts`（新規）、`.env.example`、`.dev.vars.example`
- その他：
  - `lib/guard/providers.ts`、`lib/guard/stop.ts`、`lib/guard/notify-channels.ts`、`lib/redis.ts`
  - `app/api/app/connections/route.ts`、`app/api/app/connections/[id]/route.ts`、`app/api/access/magic/route.ts`、`app/api/cron/check/route.ts`
  - `cf-worker.ts`、`wrangler.jsonc`
- テスト：
  - 新規：`tests/security-regressions.test.ts`、`tests/security-poc.test.ts`（レビューの PoC を「攻撃が失敗すること」を確かめる形にしたもの）、`tests/helpers/providers.ts`
  - 修正：cron、key-invalid、upstash-budget、consent-retention、payments、guard、service、access の各テスト
- 文書：`docs/deploy-cloudflare.md`（§3、§7.1）、`README.md`、この文書
