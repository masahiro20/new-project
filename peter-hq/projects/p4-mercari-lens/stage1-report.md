<!-- Ren（P4 リーダー）のステージ1レポート。セッション記録から本部で保存 -->
# P4 ステージ1（検証）レポート：ピーター宛て

**From: Ren（P4リーダー） / 2026-10-08**

**結論：条件付きで続行を推奨します。** ただし、当初の企画から位置づけを変える必要があります。

- メルカリが自社で海外向けアプリ「Mercari Global App」を出しました。米国では2026年6月に開始しています。翻訳、ドル表示、関税込みの総額表示を自前で提供しており、当初案のうちメルカリ向けの機能はほぼ重なります。
- そこで、「出品の状態表記を読み解き、偽物・リスクを警告する」機能を中心に据え直します。対象は、メルカリ公式が手を付けていないヤフオクと中古ショップです。
- 需要の証拠はまだ揃っていません。ステージ2に進む条件（待機リスト20件など）は未達で、次は告知ページ（LP）で待機リストを集める段階です。

## 1. 規約：どのサイトを対象にするか

**原則：拡張機能は、ユーザーが今開いているページを本人のブラウザ内で加工するだけにします。** サーバーで他の出品を自動収集したり、落札価格のデータベースを作ったりはしません。

| サイト | 表示加工のリスク | 自動収集のリスク | MVPでの扱い | 主な根拠 |
|---|---|---|---|---|
| メルカリ | 低 | 高 | 対象にする | 利用者を「日本在住の個人」と定義（[規約 第2条](https://static.jp.mercari.com/tos)）。自動収集を明示的に禁じる条項はなし |
| ヤフオク／Yahoo!フリマ | 低〜中 | **高** | 表示加工のみ対象 | LY規約8.3が「改変」を禁止、15(5)がBOTを禁止（[LY利用規約](https://www.lycorp.co.jp/ja/company/terms/)）。過去の落札検索（`/closedsearch`）は robots.txt で収集禁止。EEA・英国からの利用は2022年に終了（[告知](https://privacy.yahoo.co.jp/notice/globalaccess.html)） |
| ラクマ | 低 | 高 | 対象にする | 日本に住んでいない人は登録を拒否されうる（[規約 第3条](https://fril.jp/info/policy)） |
| まんだらけ | 低 | 中〜高 | 対象にする | 海外へ直接発送している（[告知](https://earth.mandarake.co.jp/info/updates/en/)） |
| オフモール | 低 | 高 | 対象にする | 商品ページへの機械アクセスを robots.txt で強く拒否 |
| 駿河屋 | 低〜中 | 高 | **後回し** | Cloudflareのボット対策に阻まれ、規約本文を確認できなかった。メルカリと資本業務提携（[記事](https://ecnomikata.com/ecnews/ec_site_operation/49091/)） |
| Amazon JP | 低 | 高 | **除外** | ターゲット層からずれ、規約リスクもある |

- **最大の未解決点**は、ヤフオクの規約8.3にある「改変」がブラウザ上の表示加工まで含むかどうかです。ローンチ前に弁護士の確認が必要です。
- 落札価格は自前で集めません。公式ページかオークファンへのリンクで代替します。

## 2. 競合

| 競合 | 何をしているか | 弱点 |
|---|---|---|
| **Mercari Global App**（[記事](https://www.digitalcommerce360.com/2026/06/19/mercari-launches-us-app/)） | AI翻訳、ドル表示、関税込み総額（Zonos）、検品。駿河屋の在庫も扱う | メルカリと駿河屋の商品に限られる。オークション、真贋鑑定は「今後対応」 |
| Buyee 公式拡張「Add to Buyee」 | 約7万ユーザー、評価**2.7★**（[ストア](https://chromewebstore.google.com/detail/add-to-buyee/ocjpgibbldacmpedgjgmcdcikjeopnpb)） | Buyeeのカートに入れるボタンにすぎない |
| その他の拡張（Japan Shopping Assistant、Mercari JP Finder、AliPrice） | いずれも数人〜数百ユーザー | 小規模か日本語のみ |
| 代行業者（Buyee、ZenMarket、Neokyo、Remambo、Japan Rabbit など） | 手数料は1件あたり概ね¥300〜500。Buyeeは2026年4月に¥500へ値上げ（[比較記事](https://blog.dejapan.com/2026/08/dejapan-tutorials/comparing-japanese-proxy-services-which-has-the-best-value/)） | 手数料が何層にも重なる |

**誰も手を付けていない領域：**
- 出品文の状態表記（ジャンク、美品、動作未確認、ノークレームノーリターン など）を、機械翻訳ではなく専門家の目線で解説すること。
- 偽物・詐欺の注意喚起。
- ヤフオクと中古ショップへの対応。
- 代行業者をまたいだ総額比較。

## 3. 需要の証拠

**制約：** Redditは調査ツールからアクセスを拒否され（403）、投稿を確認できませんでした。以下は主に海外フォーラムからの証拠です。

| 種類 | 証拠 |
|---|---|
| 市場規模 | メルカリの越境取引額は年¥1,122億、4年で19倍（[メルカリ発表](https://about.mercari.com/en/press/news/articles/20260917_impactreport/)） |
| 市場規模 | Buyeeの利用者は約600万人 |
| 市場規模 | 米国消費者の日本からの越境EC購入は約1.6兆円（[経産省](https://www.meti.go.jp/press/2025/08/20250826005/20250826005.html)） |
| 最多の悩み：総額が分からない | 「5ドルのラジカセが150〜200ドルになる」（[Boomboxery](https://boomboxery.com/forum/threads/have-you-used-yahoo-jp-auction-what-was-your-experience-usa-user-but-from-anywhere-id-like-to-he.21902)） |
| 最多の悩み：総額が分からない | 「10〜15ポンドの品が50ポンドに」（[UKVAC](https://www.ukvac.com/forum/threads/any-experience-using-japanese-proxy-buying-buyee-etc.76111/)） |
| 最多の悩み：総額が分からない | 米国の少額輸入免税（800ドル以下）が2025年8月に廃止され、悩みは悪化している |
| 2番目の悩み：状態・真贋 | 時計：「ヤフオクは文字盤を塗り直した品と寄せ集めの時計だらけ」（[WatchUSeek](https://www.watchuseek.com/threads/heaven-help-me-i-discovered-yahoo-japan-auctions-buyee.5066733/)） |
| 2番目の悩み：状態・真贋 | 時計：組織的な詐欺への警告（[TheWatchSite](https://thewatchsite.com/21-japanese-watch-discussion-forum/307801-warning-coordinated-scam-yahoo-japan-auctions.html)） |
| 2番目の悩み：状態・真贋 | カメラ：「ほぼ完璧」と書かれていたのに実物は違った（[RFF](https://rangefinderforum.com/threads/yahoo-auctions-japan-is-terrible.123458/)）、カビ・くもりの誤表記（[DPReview](https://www.dpreview.com/forums/threads/buying-lenses-from-japan.4488355/)） |
| 2番目の悩み：状態・真贋 | フィギュア：数年続く代行業者スレッドがある（[MFC 41ページ](https://myfigurecollection.net/thread/9432)） |

**最初に狙う層：ヤフオクで買う、ヴィンテージカメラと時計のコレクター**を推奨します。理由は次のとおりです。
- 1点あたりの単価が高い。
- 真贋への不安が強い。
- メルカリ公式アプリの対象外にいる。

フィギュアは市場が最大ですが、メルカリ公式と真正面からぶつかるため、2番手とします。

## 4. 名称・MVP・価格

**名称候補**（いずれも他社商標を含みません）：
1. **Tanuki Scout**：調べた範囲では衝突なし。
2. **Mekiki Scout**（目利き）：意味は最も合っています。ただし日本で「mekiki」を使う事業があり、mekiki.com も使用中のため、組み合わせた名前にしています。
3. **Kitsune Lens**：kitsunelens.com は登録済みです。

いずれもWeb検索で確認しただけです。正式な商標調査（USPTO・J-PlatPat の9類・42類）とドメインの所有者確認は未実施です。

**MVPの中核機能：Listing Decoder（出品読解）**
- 開いている出品ページ上で、状態表記・ランク（S/A/B、Exc+++など）・返品条件を英語で解説します。
- あわせて、ルールに基づく危険信号を表示します（「ジャンク」「動作未確認」の表記、偽物を示す語句、相場より極端に安い価格など）。
- 処理はすべてブラウザ内で完結し、サーバーは不要です。規約リスクと開発工数が最も小さく済みます。
- 総額計算は需要が最も強いものの、関税や代行手数料が頻繁に変わり保守が重いため、v1.1で有料機能として追加します。

**価格案：**
- 無料：基本の約100語の解説と、1サイトの基本警告。
- Pro：月 $3.99 ／ 年 $29 ／ 買い切り $59。全サイト・全ジャンル、高度な警告、総額計算（v1.1）を含みます。
- 課金手段：Chrome Web Store の決済は2021年に廃止済み（[Google](https://developer.chrome.com/webstore/cws-payments-deprecation)）のため、まず **ExtensionPay**（手数料5%＋Stripe手数料）を使います（[extensionpay.com](https://extensionpay.com/)）。海外ユーザーの付加価値税（VAT）処理が重くなったら Lemon Squeezy か Paddle に移ります。

## 5. 本部・オーナーへの依頼（承認待ち）

1. 位置づけ変更（ヤフオク＋カメラ・時計を先に狙う）と、MVPを Listing Decoder にすることの承認。
2. 待機リスト用LPの作成許可と、ドメイン購入（オーナー）。
3. 弁護士確認の要否：ヤフオク規約8.3の「改変」と、非居住者の利用条件について。
4. Chrome Web Store の開発者登録（$5）と、決済アカウントの作成（オーナー）。

## 6. 未確認事項

- Reddit上の具体的な投稿と反応数。手作業での確認か、Reddit API が必要です。
- 駿河屋、オフモール、Amazon JP の規約本文。
- ヤフオクAPIの現状。
- Mercari Global App の購入者手数料。
- Google トレンドの実データ。

このセッションでは、コードのプッシュ、PR作成、外部への投稿、アカウント作成は一切していません。
