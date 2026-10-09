# P2 Budget Guard QA 報告 — 2026-10-09（Vega さん・ピーター向け）

**担当：** Ren（P4、本部の依頼で応援）
**対象：** `peter/p2-signal-lab` の `a972716`（`signal-lab/budget-guard/` と `bg/`）。
**方法：** `npm ci` → typecheck・test・`next build`（demo と stripe の2種類）→ `next start`。**外部サービスには一切接続していません。** Node 側は localhost 以外への fetch・DNS を遮断して記録し、ブラウザ側もローカル以外を遮断しました。Upstash はローカルの互換モックで代用しました。
**パッチ：** `fixes.patch`（15ファイル）。`a972716` に適用でき、適用後は typecheck OK、テスト 232/232 を5回連続で合格、build は両モードで OK、デモの E2E 39項目もすべて合格。

## 結論
- **デモの主な流れ（購入→接続→予算→通知→停止）は最後まで動きます**（39項目すべて合格、外部通信0件）。
- **R1-11 は効いています。** 本番設定（stripe／自動 demo）で、`demo` トークンとデモ用の Slack URL はすべての入口で拒否されました。デモの ID・ライセンスも stripe モードでは全部拒否。抜け道は見つかりませんでした。
- **重大な不一致（高）2件：決定記録の R3-03 と R2-05 が実装されていません。**
  - R3-03「Vercel の 100% 通知だけでは止めない（オプトイン・初期値オフ）」→ 現状は署名付きの 100% 通知だけで limit になり、live なら停止する。
  - R2-05「Stripe の有効な権利のメール索引を上書きしない」→ 同じメールで2回目の購入をすると索引が新しい方に移る。
  - どちらもパッチで修正（R3-03 は判定のみ。接続ごとのオプトインの設定画面は Vega さん側で作る必要あり）。
- **テストは HEAD のままだと 230件中1件失敗**（12分の1ほどの確率で落ちる不安定なテスト。docs には「すべて通過」とある）。パッチで修正。

## 指摘一覧
| 重要度 | 場所 | 問題 | 対応 |
|---|---|---|---|
| 高 | Vercel webhook（lib/guard/service.ts:381, 390） | R3-03 が未実装。予算 $100・実額 $42.5 でも、100% 通知で limit（live なら停止） | 修正済み：`stopOnVercelAlert === true` のときだけ。**設定画面は未作成** |
| 高 | メールの索引（lib/entitlements.ts:125-127） | R2-05 が未実装（demo のときだけ確認している） | 修正済み・テスト追加 |
| 中 | LP・bg/・docs/lp.md・README・停止ページ | 「At 100%, if your stop is armed, it runs」が R3-03 と矛盾（決定では lp.md と bg/ も直すとされている） | 修正済み。規約③の「Vercel webhook の受信で実行」は法務文書なので提案のみ |
| 中 | bg/index.html・lp.md・README・trial-onboarding | トークンの伏せ字を「先頭4文字＋末尾4文字」と説明（R1-07 後は「公開の接頭辞＋末尾4文字」） | 修正済み |
| 中 | 料金ページ（app/globals.css:99） | 停止ページ用の CSS が料金カードにも効き、375px で単語の途中で改行 | 修正済み |
| 中 | 本番 API（app/api/app/connections/[id]/route.ts:62, 74） | 保存済みの demo 接続で test-stop・stop-now を押すと 500 | 修正済み：502 `plan-failed` |
| 低 | テスト（tests/key-invalid.test.ts:135） | 約1/12 で失敗（接続 ID で確認の枠が変わる） | 修正済み |
| 低 | 375px（/legal/privacy、/app/c） | 長い URL で横スクロール | 修正済み |
| 低 | ダッシュボード（app/(product)/app/page.tsx:7） | 自動 demo の本番で「Type "demo" to try offline」と出るが、サーバーは拒否する | 修正済み |
| 低 | 本番の Slack（notify-channels.ts:160） | 保存済みの Slack URL `demo` が本番でも「送信成功」（外部送信はなし） | 提案：本番では失敗として扱う |
| 低 | 運営者のログ（service.ts:257-264） | demo の拒否が「cannot open token」と記録され、鍵の喪失（R1-01）と見分けがつかない | 提案：別の文言にする |
| 低 | ライセンスでのログイン（lib/payments/index.ts:107-108） | Stripe に届かないと 500。間違ったキーのたびに Stripe 検索が走る | 提案：401／503 を返す |
| 低 | レート制限（lib/ratelimit.ts:13） | 自前ホストの `next start` では `x-forwarded-for` を変えて回避できる（Vercel・CF では影響なし） | 提案：README に注意書き |
| 低 | LP「Hourly checks」 | 実装は接続数に応じて最長12時間に延びる（規約には書いてある） | 提案：「hourly (up to 12h at high load)」 |
| 低 | 料金「Two months free」 | 年額 $79 と月額 $9×12 の差 $29 は約3.2か月分 | 提案：「Save $29」など |
| 情報 | 特商法（product.config.ts:86） | 解約方法の「Billing」が実際のボタン名「Manage billing」と違う | 法務文書なので提案のみ |
| 情報 | プライバシーポリシー | 「ライセンスキーは残さない」とあるが、Stripe の customer metadata に残る | **専門家確認へ** |
| 情報 | 応答ヘッダー（next.config.ts） | CSP・frame-ancestors がなく、停止ページを iframe に埋め込める | 提案：`frame-ancestors 'none'` など |
| 情報 | デモの portal | 解約すると即時に使えなくなる（規約は「期間末日まで」） | 試用なので許容 |

## 問題がなかったもの
- 価格（$9/月、$79/年）、接続3件まで、80% でメール、Slack 通知、各社の停止と戻し方、テストモードから始まる、停止は月1回。
- 購入記録の7年保存（Stripe のみ、日時・金額・プラン・請求書番号）、終了後30日で削除、ログ50件、IP は最長10分、llms.txt。
- Atlas の修正の抜き取り確認：cron の認証、admin の比較、Vercel の HMAC と再送防止、Slack の URL 検査とリダイレクト拒否、レート制限、本番のメールログは件名のみ、Upstash のエラーの伏せ字、サインアウトでのセッション失効。
- Cloudflare 経路の `NODE_ENV=production` はコードで確認（workerd での実行は未確認）。
- axe：重大な違反なし（nav の名前、見出しの順番、空の表見出しなどの軽微なもののみ）。375px はパッチ後に横スクロール0件。
