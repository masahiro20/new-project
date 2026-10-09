# プライバシーポリシー・利用規約の修正案（2026-10-09）

> **これは弁護士ではないライターが作った「案」です。** 公開前に、必ず専門家（弁護士など）の確認を受けてください。
> 対象：`content/legal/privacy.ts`、`content/legal/terms.ts`（日英）。テスト：`tests/legal.test.ts`。
> 特商法の表記（`product.config.ts` の `legal` の【要記入】）は触っていない。

## 0. 印「【要専門家確認】」の運用
- 追加・変更した段落の先頭に `【要専門家確認】` を付けた（定数 `REVIEW_MARK`、`content/legal/types.ts`）。**画面にもそのまま出る。** レビュー中であることを読み手に示すためで、意図したもの。
- **公開前にすべて外す。** 外し方：専門家の確認が済んだ段落から `${R}` を消す。残りは `grep -rn 'REVIEW_MARK\|\${R}' content/legal` で探す。すべて消えたら、`types.ts` の `REVIEW_MARK` と `tests/legal.test.ts` の印のテスト（「review marks and language parity」の `toContain(REVIEW_MARK)`）も消す。
- 本文の「（要確認）」「to be confirmed」は、事実が未確定の箇所。公開前に、確定した値に置き換える（§3）。

## 1. 事実の出典（コードと docs）
| 事実 | 出典 |
|---|---|
| トークン・Slack URL・Vercel webhook の秘密は AES-256-GCM で暗号化。AAD は接続 ID（Slack は `${acct}:slack`、webhook は `${id}:webhook`） | `lib/guard/crypto.ts`、`lib/guard/store.ts`、`lib/guard/service.ts` |
| 伏せ字は先頭4文字＋末尾4文字（Slack は `hooks.slack.com/…` ＋末尾4文字） | `maskSecret`（crypto.ts）、`setSlackUrl`（service.ts） |
| 接続の削除で、接続（暗号化トークン・webhook の秘密を含む）、状態、所有者の索引、スナップショット、cron の作業リストから消す。**アクティビティログの記録は消さない** | `removeConnection`（store.ts）、`DELETE /api/app/connections/[id]` |
| Slack URL は利用者が「remove」で消す。接続の削除では消えない | `app/api/app/slack/route.ts`、`setSlackUrl(…, null)` |
| Vercel webhook の秘密は「webhook-secret / remove」または接続の削除で消える | `app/api/app/connections/[id]/route.ts` |
| ログは最新50件（`LOG_SIZE`）、スナップショットは接続ごとに最新1件で上書き。どちらも TTL なし | store.ts（`mergeLog`、`saveSnapshot`） |
| Vercel webhook の重複防止キーは 40 日、接続ロックは 120 秒の TTL（個人データは含まない） | store.ts（`claimHookEvent`、`withConnLock`） |
| 回数制限のキーに IP を含み、TTL は 10 分 | `lib/ratelimit.ts`、各 API ルート |
| デモの購入記録（メール・末尾4桁）は未払い1時間、支払い済み90日の TTL | `lib/payments/demo.ts` |
| 契約終了後の自動削除はない（監視だけ止まる）。アカウント全体の削除機能はなく、手作業 | `lib/guard/service.ts`（`monitored`）、docs/trial-onboarding.md §3.3・§5 |
| デモの権利（`source: "demo"`）はデモモードの間だけ監視される | service.ts の `monitored` |
| デモモードでも、本物のトークンで利用額の読み取り・停止は実際に行える | `lib/guard/demo.ts`（`demoTokensAllowed` は demo トークンの許可だけ）、docs/trial-onboarding.md §0・§2.3 |
| 接続はすべてテストモードで始まる。live には一覧の確認・署名付き確認・ラベル入力 | store.ts（`stopMode: "test"`）、`lib/guard/stop.ts`、README |
| 確認間隔は 50 接続まで 1 時間、最長 12 時間。検知の遅れは最大「間隔＋約30分」 | `lib/guard/schedule.ts`、docs/deploy-cloudflare.md §7.1 |
| 各社のコストは日単位で遅れあり（遅れの大きさは未確認）。OpenAI の上限は即時でない。Vercel の pause は本番のみ。Anthropic の Priority Tier は数えられない | docs/lp.md、README「公式ドキュメントで確認できなかったこと」 |
| 試用は1週間の想定、削除期限の案は依頼から7日（どちらも本部の承認待ち） | docs/trial-onboarding.md §1・§2.2 |

## 2. 変更点の一覧
略号：法＝個人情報の保護に関する法律、規則＝同法施行規則、消契法＝消費者契約法。条文は e-Gov 法令検索（法 https://laws.e-gov.go.jp/law/415AC0000000057 、規則 https://laws.e-gov.go.jp/law/428M60020000003 、消契法 https://laws.e-gov.go.jp/law/412AC0000000061 ）。消契法8条・8条の2・10条と規則17条は、2026-10-09 に e-Gov の API で本文を確認した。

### 2.1 プライバシーポリシー
| 箇所 | 旧 | 新（要旨） | 理由 | 根拠条文・出典 | 専門家に確認すべき問い |
|---|---|---|---|---|---|
| 取得する情報（2段落目を追加） | 待機リスト・購入情報・ライセンスキーのみ | API トークン（暗号化・伏せ字のみ表示）、Slack の webhook URL、Vercel webhook の秘密、利用額のデータ（スナップショット・アクティビティログ）、ラベル・対象 ID・予算・停止設定 | 実際に保存している情報が書かれていなかった（trial-onboarding.md §2.1 の指摘） | 法21条（取得に際しての利用目的の通知等）、法32条（保有個人データに関する事項の公表等） | API トークンや webhook URL それ自体は個人情報に当たるか。メールアドレスと結び付いて保存されるので、個人データとして扱う前提でよいか |
| 利用目的（2段落目を追加） | 提供・送付・問い合わせ・告知 | トークンは利用額の読み取りと停止にだけ使う、など項目ごと | 新しい項目の利用目的を特定する | 法17条1項、法21条 | 目的の書き方は特定として十分か |
| 保存期間と削除（新設） | なし | 項目ごとの保存期間と削除の方法。ログは最新50件、接続削除でトークンも削除、Slack URL は登録解除まで、IP は最長10分、デモ記録は1時間／90日。終了後の保存期間と削除の期限は（要確認） | コードの事実を書き、未定の点を明示 | 法22条（データ内容の正確性の確保等。不要になったら遅滞なく消去する努力義務）、法32条 | 契約終了後の保存期間を何日にするか。アカウント削除の期限（案は依頼から7日）。削除した接続のログが残る点を書くだけでよいか、ログも消す実装が要るか |
| 暗号化と安全管理（新設） | なし | AES-256-GCM、接続への束縛、鍵は別保管、再表示しない。ログ等はアプリでは暗号化しない。保存先での暗号化は（要確認） | 安全管理措置の公表 | 法23条、法32条1項4号・施行令10条1号（安全管理措置を本人の知り得る状態に置く） | 公表する安全管理措置の粒度はこれでよいか。外的環境の把握（保存先の国）の記載が要るか |
| 決済情報（2段落目を追加） | Stripe が管理 | デモではカード番号を外に送らず末尾4桁だけ保存 | デモの事実（demo-payments.md） | — | — |
| 外部サービス（2段落目を追加） | Upstash・Resend・ホスティング | 各社 API へのトークン送信、Slack への通知、本番課金後の Stripe | 送信先の漏れ | 法27条、法28条 | 利用者自身のアカウント（各社 API・自分の Slack）への送信は「第三者提供」に当たるか、本人の指示による送信として扱えるか |
| 外国にある第三者への提供（新設） | 「国外に所在する場合があります」のみ | 移転先ごとに事業者名・所在国・制度情報の参照先（個人情報保護委員会の調査）・相手先の措置 | 法28条2項・規則17条2項の情報提供 | 法28条、規則17条2項（外国の名称・制度の情報・相手先の措置）・3項（国が特定できない場合）。ガイドライン（外国にある第三者への提供編） https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/ 。制度情報 https://www.ppc.go.jp/personalinfo/legal/kaiseihogohou/ （「外国における個人情報の保護に関する制度等の調査」、米国連邦 https://www.ppc.go.jp/files/pdf/USA_report.pdf ）。Q&A https://www.ppc.go.jp/personalinfo/faq/APPI_QA/ （Q7-53・7-54・10-25・12-3・12-4。回答本文は未読） | ①Upstash・Cloudflare/Vercel・Resend は「委託」か、Q&A 7-53 の「個人データを取り扱わない」クラウドで「提供」に当たらないか。当たらない場合は28条ではなく安全管理措置（外的環境の把握）の記載になるか ②28条1項の根拠を「本人の同意」と「基準適合体制（規則16条）」のどちらにするか。同意なら取得の方法 ③事業者の所在国（米国）とデータの保存先（Upstash のリージョン）のどちらを「外国の名称」とすべきか ④Slack（アイルランド＝EU）は28条1項の「外国」から除かれるので、情報提供は不要でよいか ⑤相手先の措置を各社の公表情報で書いてよいか |

**移転先ごとの確認結果（2026-10-09）**
| 移転先 | 事業者名 | 所在国 | 相手先の措置（公表情報） | 出典 | 未確認 |
|---|---|---|---|---|---|
| データ保存 | Upstash, Inc.（Delaware 法人） | 米国。保存先はデプロイ時に選んだリージョン（docs/deploy-cloudflare.md §5.1 に記入） | DPF 認証、委託先と SCC 等の移転契約 | https://upstash.com/trust/privacy.pdf （2025年4月版）、DPA https://upstash.com/trust/dpa.pdf （法人名は検索結果での確認） | 本社所在地。保存時の暗号化。リージョンの国名 |
| ホスティング（Cloudflare） | Cloudflare, Inc. | 米国（101 Townsend St., San Francisco） | Global CBPR・PRP、DPF、SCC | https://www.cloudflare.com/privacypolicy/ | 処理を行う国（グローバルネットワーク） |
| ホスティング（Vercel） | Vercel Inc. | 米国（Covina, CA） | DPF、必要に応じ SCC 等 | https://vercel.com/legal/privacy-policy | — |
| メール | Plus Five Five, Inc.（Resend） | 米国に移転して処理すると記載 | 「適切な管理」とのみ記載。DPF・SCC の記載なし | https://resend.com/legal/privacy-policy | 設立国・所在地、具体的な移転措置（DPA を要確認） |
| 決済（本番のみ） | Stripe, Inc. ほか（日本の契約主体は未確認） | 米国 | APEC CBPR・PRP、DPF、日本の居住者について書面契約 | https://stripe.com/jp/privacy | 日本の利用者の契約主体・管理者 |
| Slack 通知 | Slack Technologies Limited | アイルランド（米国・カナダ以外のワークスペース） | SCC、APEC CBPR・PRP | https://slack.com/trust/privacy/privacy-policy | 利用者自身の Slack への送信が提供に当たるか |
| 各社 API | Vercel Inc.／OpenAI OpCo, LLC／Anthropic PBC | いずれも米国 | 各社のプライバシーポリシー | https://www.anthropic.com/legal/privacy （Anthropic PBC、548 Market St, San Francisco）。OpenAI は公式ページが 403 で読めず、法人名は過去版の検索結果による | OpenAI の日本向けの管理者と所在地。各社の措置 |

### 2.2 利用規約
| 箇所 | 旧 | 新（要旨） | 理由 | 根拠条文・出典 | 専門家に確認すべき問い |
|---|---|---|---|---|---|
| 停止アクションの性質（新設） | なし | ベストエフォート。日単位のデータと遅れ、毎時（最長12時間）の確認と最大「間隔＋約30分」の遅れ、月1回、OpenAI の上限は即時でない、Vercel は本番のみ、Anthropic Priority Tier は対象外、失敗時は記録・通知・再試行。戻す操作は利用者。責任は「責任の制限」に従う | 停止が保証でないことを、LP・docs の事実の範囲で明示 | 出典：docs/lp.md（FAQ・Worth knowing）、docs/deploy-cloudflare.md §7.1、README、OpenAI https://developers.openai.com/api/docs/guides/spend-limits 、Vercel https://vercel.com/docs/spend-management | 「保証しない」の書き方が、消契法8条2項（契約不適合責任の免除）や10条に触れないか。説明義務（消契法3条1項の努力義務）としてこの程度で足りるか |
| 免責 → 責任の制限（見出しと本文を変更） | 「現状有姿で提供」「故意または重過失の場合を除き、損害発生前12か月間に購入者が支払った金額を上限」 | ①目的適合性・停止の実行を保証しない ②故意・重過失は法令どおり賠償し、上限を適用しない ③軽過失（重大な過失を除く過失）に限り、通常の損害で、直近12か月に受け取った利用料金の総額を上限。無償利用の上限額は（要確認） | 消契法8条3項は、一部免除の条項が「重大な過失を除く過失による行為にのみ適用されることを明らかにしていない」と無効とする。旧文は「除き」で読めるが、軽過失に限ることを明示した。「一切責任を負わない」は使わない | 消契法8条1項1〜4号・3項、10条 | ①**無償（デモ・試用）では上限が0円になり、消費者に対しては「全部免除」（8条1項1号・3号）となって無効になるおそれ。** 無償時の下限額をいくらにするか ②「通常の損害」に限ることは8条3項・10条との関係で有効か ③B2B（事業者）の利用者と消費者で条項を分けるべきか（消契法は事業者間には適用されない。事業者向けには軽過失の全部免除や間接損害の除外を残す選択もある）。利用者の大半は開発者・事業者と想定されるが、個人の開発者は消費者に当たりうる ④英語版を一般的な Limitation of liability にした場合、日本法準拠のもとで日英の解釈がずれないか |
| デモと試用（新設） | なし | デモでは料金を請求しない（カードにも請求しない）が、各社への読み取り・停止は本物。試用期間は（要確認）、終了後は監視が止まり、データの保存期間は（要確認）。テストモードから始まる。捨ててよいプロジェクトと専用キーで試すことを推奨。live への切り替えは利用者の判断で、設定どおりの停止の影響は利用者の責任。当方の故意・過失による誤作動は「責任の制限」による | デモ・試用の条件が規約になかった | docs/demo-payments.md §1、docs/trial-onboarding.md §0〜3、`lib/guard/store.ts`（`stopMode: "test"`） | ①「設定どおりの停止の影響は利用者の責任」が10条（一方的に不利益）に当たらないか ②無償の試用に本規約全体を適用できるか（同意の取り方。購入画面を通るデモ購入で足りるか） ③試用の終了・データ削除の期限を規約に書くか、案内文（trial-onboarding.md §3）に書くか |
| 8条の2 | — | 解除権を放棄させる条項は置いていない（変更なし） | 確認のため | 消契法8条の2 | 「サービスの変更・終了」「返金」（`product.config.ts`）に、解除権の制限と読まれる箇所がないか |

## 3. 公開前のチェックリスト
- [ ] 専門家の確認を受け、§2 の問いに回答をもらう。
- [ ] `【要専門家確認】` をすべて外す（§0 の手順）。`grep -rn '【要専門家確認】\|\${R}' content/legal` が何も返さないこと。
- [ ] 本文の「（要確認）」「to be confirmed」をすべて確定値に置き換える：
  - [ ] Upstash のリージョンの国名（docs/deploy-cloudflare.md §5.1 を埋める）
  - [ ] 契約・試用の終了後の保存期間、アカウント削除の期限（日数）
  - [ ] 試用の期間
  - [ ] 無償利用時の責任の上限額
  - [ ] Resend・Stripe・OpenAI の法人名・所在国・措置、Cloudflare の処理国、保存時の暗号化
- [ ] 事業者名を入れる（`product.config.ts` の `legal.sellerName` など特商法の【要記入】。規約の「当方」に使われる）。
- [ ] お問い合わせ先 `links.supportEmail` を実在のアドレスにする（`support@example.com` のまま）。
- [ ] 制定日（`legal.effectiveDate`）を公開日に合わせる。改定なら改定日の表示を足す。
- [ ] 外国移転の根拠を「同意」にする場合は、購入・接続の画面で同意を取る仕組みを作る（現在はない）。
- [ ] アカウント削除を手作業で行う手順（消すキーの一覧。trial-onboarding.md §5）を確定する。ポリシーの記載と合わせる。
- [ ] ホスティングを変えたら再ビルドする（ポリシーのホスティング名はビルド時に決まる。`BUDGET_GUARD_HOSTING`）。
- [ ] `npm run typecheck && npm test && npm run build`、および Cloudflare 版は `npm run build:cf` でホスティング名を確認する。
- [ ] 日英で内容が一致しているか、最終版で読み合わせる。
