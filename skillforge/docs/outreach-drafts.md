# Kotomark（仮称）第1弾 初回連絡の下書き（10件＋Midas 案の追加3件）

> **社内用の下書きです。まだ誰にも送っていません。** 送信・連絡・アカウント作成は一切していません。
> 宛先は `pilot-targets.md` の「3. 最初に声をかける10件」と、「2-B. Midas の候補リストから追加」です。文面の約束は `outreach-templates.md`・`pilot-guide.md`・`data-policy.md` と食い違わないように書いています。
> 各社の公開ページは 2026-10-09 に開いて、文面で触れた事実を確かめました（各候補の「確認した事実」欄）。
>
> **変更履歴**
> - 2026-10-09 Midas 案を統合（候補追加、"台本/script" を精度の文から切り離す（製品の説明では使用可）、英語署名の統一、8-4 英語版、団体への相談）
> - 2026-10-09 本部判断を反映（精度の数字を本文へ、米国宛て2通は保留、Shiravune は DM 短縮版）

---

## 0. 一覧

| # | 宛先 | 言語 | 経路（公開の業務窓口） | 文面で触れる事実（確認元） | 想定形式 | 主なリスク | 本文の長さ（精度の数字） | 承認 |
|---|---|---|---|---|---|---|---|---|
| 1 | Impetus（インピタス） | JA | 見積もり・問い合わせフォーム https://www.impetus.jp/for-clients-quotes | ENDER LILIES / ENDER MAGNOLIA などの実績、LQA（impetus.jp） | XLSX / CSV / XLIFF | 大手案件のNDA | 393字（数字あり） | [ ] |
| 2 | Lemnisca LLC | EN | サイト内フォーム https://lemnisca.net/#contact | Raging Loop・Root Double の翻訳・編集・QA（lemnisca.net） | XLSX / CSV、KAG・Tyrano `.ks` | 依頼元とのNDA、成人向けの取引先、CAN-SPAM（住所） | 167語（数字なし） | [ ] **保留（米国の住所表記の問題が片付くまで）** |
| 3 | 8-4, Ltd. | JA／EN（どちらか1通） | 一般窓口 info@8-4.jp（https://8-4.jp/about-us/ に掲載） | 2005年設立、Fire Emblem Warriors: Three Hopes 英語版（8-4.jp） | XLSX / CSV / XLIFF | 任天堂など大手のNDA、外部ツール方針 | 3-A 日本語版 395字／3-B 英語版 160語（どちらも数字あり） | [ ] |
| 4 | Fruitbat Factory | EN | 一般窓口 info@fruitbatfactory.com（about.html に掲載） | 2012年から日本のゲームに特化、Unity / KiriKiri / Tyrano（about.html） | KAG・Tyrano `.ks`、Unity CSV | GDPR（拠点未検証）、`.ks` の配置条件 | 171語（数字あり） | [ ] |
| 5 | Shiravune | JA | 公式 X の DM（業務DMを受け付けている場合のみ） | 東京拠点、うたわれるもの PC版（shiravune.com/about） | XLSX / CSV、Ren'Py / `.ks` | 成人向けタイトルあり、窓口がSNSのみ | **DM短縮版 261字を送る**（数字あり）／長い版 391字は参考 | [ ] |
| 6 | Active Gaming Media | JA | 問い合わせフォーム https://www.activegamingmedia.com/index.php/contact/ （区分「その他」） | 2026-10-06 告知「アナザーエデン ビギンズ」LQA担当（公式トップ） | XLSX / CSV / XLIFF、Unity / Unreal CSV | 社内ツール審査、クライアントNDA、自社ツールとの競合 | 396字（数字あり） | [ ] ※PLAYISM（同じ会社）とはどちらか1通 |
| 7 | Chorus Worldwide | JA | 問い合わせフォーム https://chorusworldwide.com/jp-contact/ （区分「ビジネスに関するお問い合わせ」） | コーヒートーク の日本展開（フォームの作品一覧、about-us） | Unity CSV / XLSX / i18n JSON | 開発元との契約で台本を出せない | 396字（数字あり） | [ ] |
| 8 | Kakehashi Games（架け橋ゲームズ） | JA | 会社案内の一般メール（https://www.kakehashigames.com/about-us.html。表示はブラウザで確認） | 海外インディーの日本語化・日本展開、Cairn の配信（公式トップ） | CSV / XLSX / i18n JSON / .po / Unity CSV | 翻訳が外注の可能性 | 399字（数字あり） | [ ] |
| 9 | Shloc Ltd | EN | 一般窓口 mail@shloc.com（https://www.shloc.com/en/contact） | DEATH STRANDING 2 の JP > EN Localization、ロンドン・東京拠点（shloc.com） | XLSX / CSV / XLIFF | AAAの機密、GDPR / PECR（英国） | 176語（数字あり） | [ ] |
| 10 | Middlebury Institute（MIIS） | EN | 大学の公開窓口（下記の注意。プログラム事務局の窓口を要確認） | 2024-05-09 記事：学生8名が LocJam 6 で英→日翻訳、用語と口調を統一 | CSV / XLSX / XLIFF / .po | 大学の承認、FERPA、授業日程、CAN-SPAM | 160語（数字なし） | [ ] **保留（米国の住所表記の問題が片付くまで）** |
| 6' | PLAYISM（AGM のレーベル。**#6 と同じ会社**）— Midas 案 | （#6 の文面を書き換えて使う） | Developer/Business Contact Form https://playism.com/en/contact/ | — | — | #6 との二重連絡 | 下書きなし（#6 か PLAYISM のどちらか1通だけ） | — |
| 11 | Phoenixx（株式会社Phoenixx）— Midas 案 | JA | 問い合わせフォーム https://phoenixx.ne.jp/contactus/ （区分「ビジネス（ゲーム）」。※phoenixx.co.jp は別会社） | 2019年設立のインディーパブリッシャー、日本→世界・世界→日本アジアの展開（phoenixx.ne.jp） | CSV / XLSX / JSON | 翻訳が外注の可能性、返信に2週間 | 391字（数字あり） | [ ] |
| 12 | Ysbryd Games — Midas 案 | EN | 一般窓口 hello@ysbryd.net（ysbryd.net の Contact Us に掲載） | Polish（QA・workflow help）の支援、VA-11 HALL-A・WORLD OF HORROR（ysbryd.net） | CSV / XLSX / XLIFF / .po / JSON / Ren'Py | GDPR / PECR（英国法人と記載、所在地未確定）、日本語版の有無が不明 | 170語（数字あり） | [ ] |
| 13 | MangaGamer — Midas 案 | EN | **要判断**：blog.mangagamer.org/contact-us/（フォーム保守中、案内先は support@ のみ） | 日本のノベルの英語ローカライズ・販売（about.php。運営は東京の Japan Animation Contents） | XLSX / CSV、`.ks`、Ren'Py | 成人向けカタログ（作品名なし）、窓口がサポート用 | 161語（数字あり） | [ ] **要判断（窓口）** |
| — | DANGEN Entertainment — Midas 案 | — | ゲーム応募用の窓口しか見つからず | — | — | — | 下書きなし | **保留** |
| — | JAST USA — Midas 案 | — | — | — | — | 米国（CAN-SPAM）、成人向け | 下書きなし | **保留** |

団体への相談（3章）：IGDA Localization SIG（EN 115語）、IGDA日本（JA 289字）、JAT（EN 117語）、JTF（JA 285字）、Women in Localization（EN 116語、保留を推奨）、BitSummit（JA 319字）。各 オーナー承認: [ ]。

---

## 1. 送信ルール（送る前に必ず読む）

1. **1通ずつオーナーの承認を取ってから送ります。** 宛先と文面の両方を確認し、各候補の「オーナー承認: [ ]」に印が付いたものだけ送ります。一斉送信・BCC送信はしません。
2. **差し込みを埋めます。** `{{demo_link}}`（公開共有の設定にしたデモURL。社内URL・トークン付きURLは不可）、`{{contact}}`（返信先。**現在未提供**のため、決まるまで送信不可）、`{{sender_name}}`。送る前に `{{` が残っていないことを確認します。
3. **特定電子メール法（日本：#1, 3, 5, 6, 7, 8, 11, 13）：** 広告・宣伝にあたりうるため、相手がアドレスを公表している業務窓口に限り、「営業お断り」等の記載がないことを送信直前にもう一度確認します（2026-10-09 時点では10件とも、追加の #11・#13 も該当記載は見当たりませんでした）。本文に送信者名・連絡先・配信停止の方法を必ず入れます。
4. **CAN-SPAM（米国：#2, #10。2026-10-09 本部判断で2通とも保留。Midas 案の JAST も米国のため下書きを作らず保留）：** 送信者の明記、配信停止の方法、申し出から10営業日以内の停止に加え、**送信者の所在地（郵便の住所）**の記載が必要になる場合があります。署名に住所を足すかは送信前に法務・オーナーが判断します。
5. **GDPR / PECR（英国・EU：#4, #9, #12）：** 公開されている業務用の窓口だけに送ります（個人のアドレスは推測しない・使わない）。連絡の根拠（正当な利益）を説明できるようにし、削除の求めがあれば連絡先リストからも消します。
6. **フォームとDM：** 問い合わせフォームは用意された区分（「その他」「ビジネス」）を使い、サポート窓口・採用窓口には送りません。DMは業務用アカウントがDMを受け付けている場合だけです。コミュニティの公開の場には投稿しません。
7. **成人向けの取引先（#2, #5, #13）：** 文面で触れる作品は全年齢と確認できたものだけにします（送信前に年齢区分を再確認）。当社の資料に成人向けの内容を入れません。
8. **NDA・機密：** こちらから台本の送付を求めません。試用は付属サンプルか、相手が選んだNDAに触れない抜粋で、ブラウザ版デモ（処理はブラウザ内、アップロードなし）で行ってもらいます。受け取るのは「ラベルをコピー（CSV）」の内容だけで、原文・訳文の列は既定で空になります。デモの画面は 2026-10-09 時点で日本語だけなので、英語の相手には英語の手順を添えるか通話を勧めます（#2 のメモ参照）。
9. **数字（2026-10-09 本部承認：本文に入れる）：** 文面に入れてよい精度の数字は、**調整に使っていないデータ（2回目）の値だけ**で、表現は次の文言に限ります（件数と条件を必ずセットで書き、「約97%」だけを抜き出さない）。
   - 日本語：「調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。」
   - 英語："On six open-source projects we never tuned on (3 games, 3 apps), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator)."
   - 日→英の相手（#3, #4, #5, #9）だけ、括弧内に「、主に英→日」／"; mostly EN→JA"（#9 は "mostly EN→JA strings"）を足してよい。これ以外の言い換えはしません。
   - **使わない表現：** 本部案の「調整に使っていないゲーム台本297件で287件を正しく判定（約97%）」は**事実と違うので使いません**。297件は6つのオープンソース（ゲーム3・アプリ3）から抜き取った警告・エラーで、対象は主に UI・翻訳文字列（.po・YAML・JSON）と Ren'Py のデモ1本であり、ゲーム台本ではありません。判定はAI評価者1名（人の確認はまだ、再現率は未測定）で、指摘の大半は未翻訳の検出です。調整に使ったデータの 190/190 も**使いません**。
   - **「台本」/"script" の使い分け（2026-10-09 Midas 案・本部の補足）：** 製品の説明（「ゲームの台本・翻訳ファイルの一貫性を検査する」"checks game scripts and translation files"）では使ってよい。ただし**精度の文では使わず**、297件が台本で測った数字だと読める書き方（「台本で97%」「scripts … 287 of 297」など）はしません。精度の文は上の文言（オープンソース6本の翻訳＝翻訳ファイル）のままにします。形式を示すときは Ren'Py の翻訳ファイル、TyranoScript/KAG の .ks シナリオファイルのように具体的に書いてかまいません。
   - 入れた文面：#1, 3（日本語版・英語版とも）, 4, 5, 6, 7, 8, 9, 11, 12, 13。#2・#10（米国宛て）は保留中のため数字は入れていません（保留が解けて送る場合も、入れるなら上の英語の文言だけ）。団体への相談（3章）には数字を入れていません。
10. **追いかけは1回まで：** 返信がなければ、**7〜10日後に1回だけ**、`outreach-templates.md` の 3-B（元のスレッドへの返信）を送ります。その後は連絡しません。（テンプレートの「1〜2週間」より短めの、この下書き用の取り決めです。）
11. **同じ会社・グループには1通だけ：** Active Gaming Media（#6）と PLAYISM は同じ会社（PLAYISM は AGM のレーベル）なので、どちらか一方の窓口だけに送り、追いかけも合わせて1回です（既定は #6 の AGM フォーム）。
12. **断られた・停止を求められたら：** すぐ `pilot-targets.md` の該当行に「連絡不要」と書き、二度と送りません。
13. **文字数：** 各文面は英語180語以内、日本語400字以内（署名を含む本文。件名・改行は除き、差し込みは1字と数える）に収めています。Shiravune の DM 短縮版は280字以内です。現在の長さは「0. 一覧」の表にあります。書き換えたら数え直してください。

---

## 2. 下書き

### 1. Impetus（株式会社インピタス）— 日本語

**件名：** 英日・日英ゲーム台本の一貫性チェック（試作品）お試しのお願い

```text
株式会社インピタス ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。貴社サイトでENDER LILIES・ENDER MAGNOLIAなどの実績とLQAを拝見しました。

Kotomark（仮称）は、台本全体の用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、XLSX・CSV・XLIFFを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。

ブラウザ版デモ（{{demo_link}}）で付属サンプルかNDA外の抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。台本はアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 東京の小規模スタジオで、英→日・日→多言語の翻訳とLQAを自社で行っている（impetus.jp で確認：サービスに Translation / LQA / Voiceover。実績に Horizon、God of War、ENDER LILIES、ENDER MAGNOLIA など）。小規模なので試作品を試してもらいやすい。
- **確認した事実（2026-10-09）：** トップページの実績一覧に ENDER LILIES: Quietus of Knights と ENDER MAGNOLIA: Bloom in the Mist。見積もりページにフォームあり、営業お断りの記載なし。
- **経路：** https://www.impetus.jp/for-clients-quotes のフォーム（相談内容は「その他」）。添付は使わない。
- **リスク：** 実績の多くが大手パブリッシャー案件でNDAが厳しい。文面では大手タイトル名を「使っている」ように書かないこと（インディー作品名だけに触れている）。見積もり用フォームなので、営業と受け取られる可能性あり。
- **オーナー承認: [ ]**

---

### 2. Lemnisca LLC — English

**Subject:** Early JA→EN script consistency checker: 30-minute try, free

```text
Hello Lemnisca team,

I'm {{sender_name}} from the Kotomark development team. Your site lists translation, editing and QA on visual novels such as Raging Loop and Root Double, which is exactly the kind of long-form JA→EN script I'd like a practitioner's view on.

Kotomark (working name) is an early prototype that reads a whole script and flags term, katakana, character-name, honorific and voice drift with file:line references. It reads XLSX/CSV sheets and KAG/TyranoScript .ks scenario files directly. So far it has mostly been tested on EN→JA strings, not JA→EN novels, which is why your eye would help.

One small ask: spend about 30 minutes with the browser demo ({{demo_link}}) on the bundled sample or an NDA-safe excerpt, then send me the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call works too. Everything runs in your browser; nothing is uploaded. It's free, with no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 日→英のノベル専門で、翻訳・編集・LQAを一貫して行う（lemnisca.net：Localization Direction / Translation / LQA）。用語・キャラ名・敬称・口調は Kotomark の検査項目そのもの。日→英の実台本での検証がまだ無いので、いちばん学びが大きい相手。
- **確認した事実（2026-10-09）：** サイトの実績に Root Double（Xtend Edition）、Raging Loop、The Shell 三部作、Kamitsubaki City REGENERATE など、いずれも "translation, editing, and QA"。サイト内フォームあり、営業お断りの記載なし。
- **経路：** https://lemnisca.net/ のお問い合わせフォーム（#contact）。
- **リスク：** 依頼元（パブリッシャー）とのNDA。取引先に成人向け作品を含むため、文面は Raging Loop・Root Double（全年齢版あり）に限定したが、**送信前に両作の年齢区分を再確認**。米国の可能性があるため CAN-SPAM（所在地の記載）を確認。`.ks` は言語ごとに複製したシナリオ（`ja/first.ks` + `en/first.ks` など）を組み合わせる方式なので、相手の配置と違う場合は書き出しが必要（`docs/formats-ks.md`）。**デモの画面は日本語だけ**（2026-10-09 時点、英語UIなし）。英語の文面ではボタン名を日本語のまま示し、括弧で英訳を添えた。英語話者の相手（#2, #4, #9, #10）には、英語の短い手順書を添えるか、英語UIができるまで20分の通話を勧める方がよいかもしれない。
- **保留（米国の住所表記の問題が片付くまで）：** 2026-10-09 本部判断。CAN-SPAM で求められうる送信者の郵便住所をどう書くかが決まるまで送らない。文面は残しておく（精度の数字は未記入）。
- **オーナー承認: [ ]**

---

### 3. 8-4, Ltd. — 日本語版／英語版（どちらか1通だけ。オーナーが選ぶ）

#### 3-A. 日本語版

**件名：** 日英ゲーム台本の一貫性チェック（試作品）お試しのお願い

```text
8-4, Ltd. ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。2005年からの日英・英日ローカライズとFire Emblem Warriors: Three Hopesの英語版を拝見しました。

Kotomark（仮称）は、台本全体の用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品です。調整に使っていないオープンソース6本（ゲーム3・アプリ3、主に英→日）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。

ブラウザ版デモ（{{demo_link}}）で付属サンプルかNDA外の抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。台本はアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

#### 3-B. English version

**Subject:** JA↔EN consistency checker (prototype): could 8-4 tell us where it's wrong?

```text
Hello 8-4 team,

I'm {{sender_name}} from the Kotomark development team. Your site describes Japanese-to-English and English-to-Japanese localization since 2005, including the English localization of Fire Emblem Warriors: Three Hopes, so your judgement would mean a lot to us.

Kotomark (working name) is an early prototype that checks game scripts and translation files for term, katakana, character-name, honorific and voice drift, with file:line references. It reads XLSX/CSV and XLIFF. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator).

One small ask: about 30 minutes with the browser demo ({{demo_link}}) on the bundled sample or an NDA-safe excerpt, then send the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call works too. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 2005年設立の東京の老舗で、日→英・英→日の両方向（8-4.jp/about-us で明記）。現場の目が厳しく、誤検出の指摘に価値がある。
- **確認した事実（2026-10-09）：** about-us に "Established: Oct. 5, 2005"、Japanese-to-English / English-to-Japanese localization。トップページに "8-4 worked on the English localization of Fire Emblem Warriors: Three Hopes"。
- **経路：** about-us に掲載の一般窓口 info@8-4.jp（General Inquiries）。媒体・採用・サポート用の別アドレスには送らない。
- **リスク：** 任天堂・カプコンなど大手案件のNDA、外部ツールの利用方針が厳しい可能性。英語話者の多い会社なので、2026-10-09 に**英語版（3-B）を追加**した（Midas 案）。日本語版（3-A）と英語版のどちらで送るかはオーナー判断で、**送るのは片方だけ**（両方送ると二重の連絡になる）。英語版を選ぶ場合、デモの画面が日本語だけである点はルール8のとおり。
- **オーナー承認: [ ]**

---

### 4. Fruitbat Factory — English

**Subject:** A consistency checker that reads KiriKiri/Tyrano .ks: 30-minute try?

```text
Hello Fruitbat Factory team,

I'm {{sender_name}} from the Kotomark development team. Your About page says you've focused on Japanese games since 2012 and specialise in Unity, KiriKiri and Tyrano projects, so I thought our prototype might fit your workflow.

Kotomark (working name) is an early prototype that checks JA→EN scripts and translation files for term, katakana, character-name, honorific and voice drift, with file:line references. It reads KAG/TyranoScript .ks files (one copy per language), Unity string-table CSVs and XLSX/CSV. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator).

One small ask: about 30 minutes with the browser demo ({{demo_link}}) on the bundled sample or a safe excerpt, then send the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call is fine instead. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 小規模（チーム欄19名）で、日本のインディー作品の英語化とQAを自社で行う。Unity / KiriKiri / Tyrano に特化と明記しており、2026-10-09 に追加した `.ks` 対応をいちばん試してもらえる相手。
- **確認した事実（2026-10-09）：** about.html に "focused on Japanese games since 2012"、"specialize in Unity, KiriKiri and Tyrano"、一般窓口 info@fruitbatfactory.com。
- **経路：** info@fruitbatfactory.com（サポート用 support@ には送らない）。
- **リスク：** 所在国はサイトに記載なし（ドイツと言われるが未検証）。EU/英国の可能性があるため GDPR・各国の電子通信規制を前提に、業務窓口だけに送る。`.ks` は「言語ごとに複製したシナリオ」を組み合わせる方式で、1ファイルに両言語を入れる独自の作り方には対応していない可能性（`docs/formats-ks.md` で確認してから送る）。「自社が興味を持てる案件だけ扱う」との記載あり、返信が無くても追いかけは1回まで。
- **オーナー承認: [ ]**

---

### 5. Shiravune — 日本語（X の DM）

**件名：** （DMのため件名なし）

#### 5-A. DM 短縮版（**送るのはこちら**／261字）

```text
突然のDM失礼します。Kotomark 開発チームの{{sender_name}}です。日英台本の用語・キャラ名・敬称・口調の揺れを行番号付きで示す試作品を作っています。調整に使っていないオープンソース6本（ゲーム3・アプリ3、主に英→日）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。日→英は検証前です。ブラウザ版デモ（{{demo_link}}、アップロードなし・無料）を30分お試しいただき、「ラベルをコピー（CSV）」の内容をお送りいただけないでしょうか。不要でしたら一言ください。以後お送りしません。
```

#### 5-B. 長い版（参考。DMで送らない／391字）

```text
Shiravune ご担当者様

突然のDM失礼します。Kotomark 開発チームの{{sender_name}}です。東京から英語・中国語で届けられた、うたわれるもののPC版などを拝見しました。

Kotomark（仮称）は、台本全体の用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、XLSX・CSV、Ren'Py、.ksを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3、主に英→日）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。日→英は検証前です。

ブラウザ版デモ（{{demo_link}}）で付属サンプルかNDA外の抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。台本はアップロードされず、無料です。

連絡が不要でしたら一言ください。以後お送りしません。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 2019年設立の東京のローカライズチーム兼パブリッシャー。日→英（と中国語）で、ノベル・RPG の台本量が多い。
- **確認した事実（2026-10-09）：** shiravune.com/about に "Tokyo-based localization team"、"PC ports of the Utawarerumono series"。フォーム・メールは無く、公式の X と Discord のみ。
- **経路：** 公式 X アカウントの DM。**業務用アカウントがDMを開放しているか、プロフィールに「ビジネスはDMへ」等の案内があるかを先に確認**し、無ければ送らない（Discord には送らない。公開の場にも投稿しない）。
- **リスク：** 成人向けタイトルを扱う。文面ではうたわれるもの PC版だけに触れた（送信前に該当作の年齢区分を再確認）。チームは英語話者が多い可能性があり、`pilot-targets.md` では英語版の想定だったため、**英語に差し替えるかはオーナー判断**（日本拠点なので日本語を既定にした）。
- **送る文面：** 2026-10-09 本部判断で **5-A の DM 短縮版（261字、精度の数字入り）を送る**。5-B の長い版は参考として残す。X の DM 自体に280字の上限は無いが、DMで読みやすい長さとして本部の指定（280字以内）に合わせた。DM宛てなので `{{contact}}` は入れず、返信はDMで受ける（配信停止の一文は入れた）。
- **オーナー承認: [ ]**

---

### 6. Active Gaming Media（アクティブゲーミングメディア）— 日本語

**件名：** 日英ゲーム台本の一貫性チェック（試作品）お試しのお願い

```text
株式会社アクティブゲーミングメディア ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。10月6日の「アナザーエデン ビギンズ」LQA担当の告知を拝見しました。

Kotomark（仮称）は、台本の用語・表記・キャラ名・敬称・口調の揺れを行番号付きで示す試作品で、XLSX・CSV・XLIFF、Unity／Unrealの文字列表を読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。

ブラウザ版デモ（{{demo_link}}）で付属サンプルかNDA外の抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。台本はアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 日本でLQA・ローカライズを事業の柱にしている中規模（約50名との報道）。ツールの評価に慣れており、PLAYISM のパブリッシング側の視点ももらえる可能性。
- **確認した事実（2026-10-09）：** 公式トップのお知らせに 2026.10.06「『アナザーエデン ビギンズ』のLQAを弊社が担当いたしました！」。サービスに「LQA・QA」「ゲーム翻訳・ローカライズ」。
- **経路：** https://www.activegamingmedia.com/index.php/contact/ のフォーム。区分は「その他」（「ローカライズ…（お見積りのご依頼）」は見積もり用なので使わない）。個人情報の取扱いへの同意が必要。営業お断りの記載なし。
- **リスク：** 社内のツール導入審査、クライアントのNDA。自社で翻訳サービスを持つため競合と見られる可能性。中規模なので担当部署に回るまで時間がかかる前提。
- **別経路（Midas 案で追加、同じ会社）：** PLAYISM（AGM のパブリッシングレーベル）の Developer/Business Contact Form（https://playism.com/en/contact/ 。2026-10-09 確認：フォームは「Game User」と「Developer/Business」の2種、メールアドレスの掲載なし、営業お断りの記載なし、フッターに ©Active Gaming Media Inc.・PLAYISM は同社の登録商標と明記）。**同じ会社なので、送るのは AGM フォームか PLAYISM フォームのどちらか1通だけ**（既定は AGM フォーム。PLAYISM 側に送る場合は文面の告知の部分を PLAYISM のパブリッシングに合わせて書き換え、オーナー承認を取り直す）。Game User 用フォームには送らない。
- **オーナー承認: [ ]**

---

### 7. Chorus Worldwide（コーラスワールドワイド）— 日本語

**件名：** 英日ゲーム台本の一貫性チェック（試作品）お試しのお願い

```text
株式会社コーラスワールドワイド ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。「コーヒートーク」など海外インディー作品の日本展開を拝見しました。

Kotomark（仮称）は、台本の用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、Unityの文字列表CSV、XLSX、i18n JSONを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。

ブラウザ版デモ（{{demo_link}}）で付属サンプルか契約に触れない抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。台本はアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 英→日の小規模パブリッシャー。カタカナ表記・口調の揺れの検査が英→日でどう見えるかを確かめられる。検証済みの方向（英→日）に近く、精度の数字も比較的当てはまる。
- **確認した事実（2026-10-09）：** jp-contact フォームの作品一覧に「コーヒートーク-エピソード1」「コーヒートーク トーキョー」など。about-us にアジア・日本向け展開の支援（`pilot-targets.md`）。営業お断りの記載なし。
- **経路：** https://chorusworldwide.com/jp-contact/ 、区分「ビジネスに関するお問い合わせ」、作品欄は該当なし（「サポート：その他」は選ばない。選択が必須なら送信前に判断）。
- **リスク：** 開発元との契約で台本を外に出せない（文面でも「契約に触れない抜粋」とした）。コーヒートークの日本語版を自社で訳したかは未確認なので、文面は「日本展開を拝見」に留めた。使用エンジン・形式も推定。
- **オーナー承認: [ ]**

---

### 8. Kakehashi Games（架け橋ゲームズ）— 日本語

**件名：** 日本語ローカライズの納品前チェック（試作品）お試しのお願い

```text
架け橋ゲームズ ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。「Cairn」など海外インディーの日本語化と日本展開を拝見しました。

Kotomark（仮称）は、英日の翻訳ファイルの用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、CSV・XLSX・JSON・.poなどを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。外注翻訳の納品チェックに使えるかも伺いたいです。

デモ（{{demo_link}}）で付属サンプルか抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。台本はアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 小規模で、海外作品の日本語ローカライズ・レーティング・展開をまとめて請け負う（about-us：「300本以上」のインディー作品を手がけたと記載）。翻訳が外注なら「外注先の納品チェック」という別の使い方の意見がもらえる。
- **確認した事実（2026-10-09）：** about-us に日本語ローカライズ・マーケティング・レーティング審査などのサービス。公式トップに「Cairn」の配信開始のお知らせ。**注意：** `pilot-targets.md` では「日英の両方向」としていたが、about-us の記載は海外→日本の方向だけだったので、文面は英→日に合わせた。
- **経路：** about-us に掲載の一般メールアドレス（自動取得では保護されて見えないため、オーナーがブラウザで表示して確認）。X・Facebook の DM は使わない。
- **リスク：** 翻訳を外注している可能性（文面で納品チェックの用途に触れて対応）。台本は開発元の権利物。
- **オーナー承認: [ ]**

---

### 9. Shloc Ltd — English

**Subject:** Could a JP>EN team tell us where our checker is wrong? (sample only)

```text
Hello Shloc team,

I'm {{sender_name}} from the Kotomark development team. Your site lists JP > EN localization on DEATH STRANDING 2: ON THE BEACH, and I'd value the judgement of a team working at that level.

Kotomark (working name) is an early prototype that reads JA↔EN scripts and translation files and flags term, katakana, character-name, honorific and voice drift with file:line references. It reads XLSX/CSV and XLIFF. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA strings), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator). It's untested on JA→EN scripts and still has false positives.

Your projects are confidential, so I'm not asking for any project text. One small ask: 30 minutes with the browser demo ({{demo_link}}) on its bundled sample, then send the text from the "ラベルをコピー（CSV）" (copy labels) button; or a 20-minute call. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 日→英の専門家集団（ロンドン・東京）。実データは無理でも、付属サンプルで「プロの目から見た外れ」を教えてもらえる。
- **確認した事実（2026-10-09）：** shloc.com のトップに "DEATH STRANDING 2: ON THE BEACH — JP > EN Localization"、"FINAL FANTASY XVI — EN Script Editing and Performance Direction"。contact ページに mail@shloc.com、ロンドンと東京のオフィス。
- **経路：** mail@shloc.com（contact ページ掲載の一般窓口）。
- **リスク：** 案件はほぼAAAで機密が重い。文面では**付属サンプルだけ**を頼み、抜粋も求めていない。タイトル名は「公開されている実績に触れる」だけで、使っていると匂わせない。英国の GDPR・PECR（法人宛ての業務窓口なので比較的低リスクだが、配信停止の申し出には即対応）。
- **オーナー承認: [ ]**

---

### 10. Middlebury Institute of International Studies at Monterey（MIIS）— English

**Subject:** A JA↔EN consistency checker for a localization class? (20-min call)

```text
Hello,

I'm {{sender_name}} from the Kotomark development team. I read the Institute's May 2024 story about eight students localizing "Not Enough Time" from English into Japanese for LocJam 6, including standardizing terminology and each character's way of speaking. That is exactly what our prototype checks.

Kotomark (working name) is an early prototype that flags term, katakana, character-name, honorific and voice drift across a JA↔EN script, with file:line references. It reads CSV/XLSX, XLIFF, gettext .po and i18n JSON. It's free for this pilot.

Could you forward this to a faculty member in Translation and Localization Management who teaches game localization? The ask is a 20-minute call to see whether a class exercise could use the browser demo ({{demo_link}}) with its bundled sample. It runs in the browser; nothing is uploaded, and we would collect no student data. No obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 翻訳・ローカライズ管理（TLM）の修士課程があり、学生チームが英→日のゲーム翻訳で「用語と各キャラの話し方の統一」をしている。授業の演習で使ってもらえれば、一度に複数人の意見が集まる。
- **確認した事実（2026-10-09）：** 記事（2024-05-09）：学生8名が LocJam 6 で "Not Enough Time" を英→日に4日で翻訳、用語と各キャラの話し方を統一、244チーム中の1つ。
- **経路：** **未確定。** 大学の contact-us ページには学部別の窓口が無く、一般窓口（miis@middlebury.edu）は入学（Admissions）欄にある。TLM プログラムのページは 2026-10-09 時点で 404。送る前に「Offices and Services」から**プログラム事務局の公開窓口**を探す。教員個人のアドレスには直接送らない（公開の学内名簿にあっても、まず事務局経由）。
- **リスク：** 大学の承認手続き、学生データの扱い（FERPA：学生のラベル結果は個人が分からない形で集計し、教員を通して任意参加で合意）、授業日程（次の学期に合わせる必要）。米国の CAN-SPAM（所在地の記載）。依頼は「20分の通話」のみに絞り、学生に直接連絡しない。
- **保留（米国の住所表記の問題が片付くまで）：** 2026-10-09 本部判断。CAN-SPAM で求められうる送信者の郵便住所をどう書くかが決まるまで送らない。文面は残しておく（精度の数字は未記入）。
- **オーナー承認: [ ]**

---

### 11. Phoenixx（株式会社Phoenixx）— 日本語（Midas 案で追加）

**件名：** ゲームの台本・翻訳ファイルの一貫性チェック（試作品）お試しのお願い

```text
株式会社Phoenixx ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。日本のクリエイターの海外展開と、海外作品の日本・アジア展開の取り組みを拝見しました。

Kotomark（仮称）は、ゲームの翻訳ファイルの用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、CSV・XLSX・JSONなどを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。

デモ（{{demo_link}}）で付属サンプルかNDA外の抜粋を30分試し、「ラベルをコピー（CSV）」の内容をお送りいただけませんか。お電話でも結構です。データはアップロードされず、無料です。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 2019年設立のインディーゲームのパブリッシャーで、「日本のクリエイターを世界へ」と、海外作品の日本・アジア展開の両方を掲げる（phoenixx.ne.jp）。タイトル数が多く、日英の両方向の翻訳ファイルを扱っているはず。`pilot-targets.md` の #12（補欠）を Midas 案で第1弾に追加。
- **確認した事実（2026-10-09）：** 公式トップ（https://phoenixx.ne.jp/ ）に 2019年設立のインディーゲームパブリッシャー、本社は東京都武蔵野市、事業はゲーム（パブリッシング・企画・開発）・マネジメント・イベント（OSAKA INDIE GAMES SUMMIT 2026 を開催）。作品一覧は多数あるが、どれを自社で翻訳したかの記載は無いので、文面では作品名に触れていない。
- **経路：** https://phoenixx.ne.jp/contactus/ のフォーム、区分は「ビジネス（ゲーム）」（「ゲーム内容」「ゲームの不具合」「HYDE RUN」は選ばない）。同意のチェックが必須。営業お断りの記載なし。返信まで2週間ほどかかるとの記載があるため、**追いかけはルール10の7〜10日ではなく3週間後を目安にする**のがよい（オーナー判断）。
- **注意（経路の取り違え）：** Midas 案にあった https://phoenixx.co.jp/contact.html は**別の会社**（名古屋市東区の不動産会社）のページだった（2026-10-09 確認）。**そちらには送らない。**
- **リスク：** 翻訳を外注している可能性（窓口の担当者が翻訳の当事者でないかもしれない）。東方Project の二次創作作品など権利関係の複雑な作品があるため、作品名には触れない。
- **オーナー承認: [ ]**

---

### 12. Ysbryd Games — English（Midas 案で追加）

**Subject:** Do any of your titles ship in Japanese? A free consistency check (prototype)

```text
Hello Ysbryd team,

I'm {{sender_name}} from the Kotomark development team. Your site describes the "Polish" support you give developers, including QA and workflow help, across titles such as VA-11 HALL-A and WORLD OF HORROR.

Kotomark (working name) is an early prototype that checks EN↔JA game scripts and translation files for term, katakana, character-name, honorific and voice drift, with file:line references. It reads CSV/XLSX, XLIFF, gettext .po, i18n JSON and Ren'Py translation files. On six open-source projects we never tuned on (3 games, 3 apps), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator).

If any of your titles ship in Japanese, one small ask: about 30 minutes with the browser demo ({{demo_link}}) on the bundled sample or an NDA-safe excerpt, then send the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call works too. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** インディーゲームのパブリッシャーで、開発者への支援に「Polish」（QA・作業の流れの手助け・アドバイザー）を掲げる。英語圏の作品を多言語で出す立場なので、英→日の翻訳ファイルの納品チェックとしての意見がもらえる可能性。
- **確認した事実（2026-10-09）：** ysbryd.net のトップに Contact Us 欄があり、Email のリンクとして hello@ysbryd.net を掲載（会社の一般窓口）。作品一覧に VA-11 HALL-A、WORLD OF HORROR、Demonschool など。支援内容に Funding / Polish（QA、workflow help、advisors）/ Visibility。**日本語版を自社で出しているかはサイトに記載なし**なので、文面は「日本語で出している作品があれば」とした。
- **経路：** hello@ysbryd.net（サイト掲載の一般窓口）。X・Facebook の DM は使わない。
- **所在地：** 住所の記載なし。プライバシーポリシーは "Ysbryd Games Worldwide Limited, a United Kingdom company"、フッターは "© Ysbryd Games Pte Ltd."（シンガポール法人の名称）で、どちらか確定しない。**GDPR / 英国 PECR を前提に扱う**（業務窓口だけ、削除の求めには即対応）。
- **リスク：** サイトに「連絡のいちばんの方法は、こちらから声をかけたくなる良いゲームを作ること」とあり、主にゲームの売り込みを想定した窓口。返信が無くても追いかけは1回まで。日本語版が無ければ試用の意味が薄い。
- **オーナー承認: [ ]**

---

### 13. MangaGamer — English（Midas 案で追加）

**Subject:** A consistency checker for JA→EN visual novel text (prototype, free to try)

```text
Hello MangaGamer team,

I'm {{sender_name}} from the Kotomark development team. MangaGamer localizes and publishes Japanese visual novels in English, and long-form JA→EN text is exactly where I'd value a practitioner's view.

Kotomark (working name) is an early prototype that checks game scripts and translation files for term, katakana, character-name, honorific and voice drift, with file:line references. It reads XLSX/CSV, KAG/TyranoScript .ks scenario files and Ren'Py translation files. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator). It is untested on JA→EN novels.

One small ask: about 30 minutes with the browser demo ({{demo_link}}) on its bundled sample, then send the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call works too. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

**オーナー向けメモ**
- **なぜこの相手か：** 日本のビジュアルノベルの日→英ローカライズと販売で、文章量が非常に多い。用語・キャラ名・敬称・口調は Kotomark の検査項目そのもの。`pilot-targets.md` の #14 を Midas 案で第1弾に追加。
- **確認した事実（2026-10-09）：** mangagamer.com/about.php に運営会社 Japan Animation Contents Inc.、住所は**東京都台東区雷門**（日本）。よって米国ではなく、CAN-SPAM の保留の対象外。**日本の特定電子メール法**を前提に扱う。
- **成人向け（ルール7）：** カタログの中心が成人向けのため、**文面では作品名に一切触れていない**。全年齢と確認できた作品も挙げない。当社のサンプル・資料に成人向けの内容を入れない。試用は付属サンプルだけを頼み、抜粋は求めていない。
- **経路：** **要判断（送る前にオーナーが決める）。** about.php の「Publish with Us」から辿る https://blog.mangagamer.org/contact-us/ は、2026-10-09 時点で「フォームは保守中」とあり、「すべての問い合わせは support (at) mangagamer.com へ」と案内している。公開されている唯一のアドレスがサポート用で、ルール6（サポート窓口には送らない）に当たりうる。**フォームの復旧を待ってフォームから送る**のが安全。support@ に送るかはオーナー判断。
- **リスク：** 成人向け作品が中心で、当社のブランド上の配慮が必要。台本は開発元の権利物。JA→EN のノベルでの検証はまだ無い（文面にも明記）。
- **オーナー承認: [ ]** **要判断（窓口：フォーム復旧待ち、または support@ を使うかの判断）**

---

### 保留（Midas 案の候補のうち、下書きを作らなかったもの）

- **DANGEN Entertainment（大阪）：** 2026-10-09 に確認できた公開の窓口は、ゲームの応募（パブリッシングの持ち込み）用だけで、業務の一般窓口が見つからなかった。応募窓口を試用の依頼に使わない。一般窓口が見つかるまで保留。
- **JAST USA（米国・サンディエゴ）：** 米国のため、#2・#10 と同じく CAN-SPAM の住所表記の問題が片付くまで保留。成人向けカタログが中心のため、再開する場合もルール7（全年齢の作品だけ、または作品名なし）を適用。

---

## 3. 団体・コミュニティへの相談（試用の募集の場があるか尋ねる）

> Midas 案で追加（2026-10-09）。**会員に直接声をかけるのではなく**、「試作品のお試しを会員に案内してよい場・チャンネルがあるか」を団体の公開窓口に1回だけ尋ねるための文面です。
> - 会員個人・役員個人には連絡しません（名簿やSNSで見つけても使わない）。団体の掲示板・SNS・Slack などに無断で投稿しません。
> - 案内してよい場があると言われても、その場の規約（広告料・事前審査など）に従い、内容はあらためてオーナーの承認を取ります。
> - 精度の数字は入れていません。追いかけは1回まで、「不要」と言われたら `pilot-targets.md` に記録して二度と送りません。
> - 文字数の上限は下書きと同じ（日本語400字・英語180語）。長さは各文面の見出しに書いています。

### 3-1. IGDA Localization SIG — English（115語）

- **経路：** IGDA の LocSIG ページのフォーム https://igda.org/?p=1591 （2026-10-09 確認：「このフォームで LocSIG に連絡を」、活動・参加・パートナーシップの相談を受け付けると記載。名前・メール・電話・本文の欄）。共同議長など個人の連絡先は使わない。
- **規制：** IGDA は国際団体（米国の非営利団体）。勧誘ではなく問い合わせだが、送信者名と配信停止の一文を入れた。
- **オーナー承認: [ ]**

```text
Hello IGDA Localization SIG,

I'm {{sender_name}} from the Kotomark development team. We're building an early prototype that checks game scripts and translation files (JA↔EN) for terminology, character-name, honorific and voice consistency, and we're looking for a few localization practitioners who would try it for free and tell us where it's wrong.

We don't want to contact members directly or post anywhere uninvited. Is there an appropriate venue or channel (a newsletter, a community board, a meetup slot) where an invitation like this would be welcome? If not, a simple "no" is perfectly fine.

If you'd rather not hear from us again, just say so and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

### 3-2. IGDA日本（NPO法人国際ゲーム開発者協会日本）— 日本語（289字）

- **経路：** 公式サイト https://www.igda.jp/ に掲載の info@igda.jp（2026-10-09 確認）。**ただしサイト上は「イベント情報・プレスリリースの掲載依頼」の宛先として書かれている**ので、相談に使ってよいかは送る前にオーナーが判断する。専門部会に SIG-Glocalization があるが、内容と窓口は未確認（部会ごとのアドレスは推測しない）。
- **オーナー承認: [ ]**

```text
IGDA日本 ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。ゲームの台本・翻訳ファイル（日英）の用語・キャラ名・敬称・口調の揺れを検査する試作品を作っており、無料で試して「どこが間違っているか」を教えてくださる方を数名探しています。

会員の皆さまへ個別にご連絡したり、許可なく投稿したりするつもりはありません。こうしたお試しの募集をご案内してよい場（お知らせ欄、SIG の会合など）がございましたら、お教えいただけませんか。適当な場がなければ、その旨だけでも幸いです。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

### 3-3. JAT（日本翻訳者協会）／エンターテインメント分科会（JATENT）— English（117語）

- **経路：** https://jat.org/contact のフォーム（2026-10-09 確認：名前・メール・件名・本文、英語・日本語どちらでも可、本文1,000字まで）。宛先区分は **「Special Interest Groups (SIGs)」** を選ぶ。翻訳者の募集ではないので求人フォームは使わない。会員個人には連絡しない。
- **注意：** トップページに分科会の例として "entertainment" はあるが、「JATENT」という名称はサイト上で確認できなかった【未検証】。文面では "your entertainment SIG" と書いた。英語で書いたが、日本語に差し替えてもよい（オーナー判断）。
- **オーナー承認: [ ]**

```text
Hello JAT team,

I'm {{sender_name}} from the Kotomark development team. We're building an early prototype that checks game scripts and translation files (JA↔EN) for terminology, character-name, honorific and voice consistency, and we're looking for a few game translators who would try it for free and tell us where it's wrong.

We don't want to contact members directly or post anywhere uninvited. Could you tell us whether your entertainment SIG, or JAT more broadly, has an appropriate venue or channel where an invitation like this would be welcome? If not, a simple "no" is perfectly fine.

If you'd rather not hear from us again, just say so and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

### 3-4. JTF（一般社団法人日本翻訳連盟）— 日本語（285字）

- **経路：** 公式サイト https://www.jtf.jp/ の「お問い合わせ」https://www.jtf.jp/inquiry 。**フォームの中身（区分・営業お断りの有無）は自動取得で確認できなかった【未検証】**ので、送る前にブラウザで開いて確かめる。サイトには「広告掲載について」https://www.jtf.jp/insertion もあり、有料の告知枠が正式な場である可能性（その場合はオーナーが費用を判断）。
- **オーナー承認: [ ]**

```text
日本翻訳連盟 ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。ゲームの台本・翻訳ファイル（日英）の用語・表記・キャラ名・敬称・口調の揺れを検査する試作品を作っており、無料で試して誤りを教えてくださる翻訳者の方を数名探しています。

会員の皆さまへ個別にご連絡したり、許可なく投稿したりするつもりはありません。こうしたお試しの募集をご案内してよい場（会報、告知欄、部会など）がございましたら、お教えいただけませんか。有料の掲載枠のみでしたら、その旨だけでも幸いです。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

### 3-5. Women in Localization — English（116語）

- **経路：** 公式サイトの Contact Us（https://www.womeninlocalization.com/contact-us ）に掲載の団体の一般窓口 contact@womeninlocalization.com（2026-10-09 確認：48時間以内に返信と記載）。支部（chapter）の役員個人には連絡しない。日本の支部の有無は未確認。
- **規制：** 米国（カリフォルニア）拠点の可能性が高い。勧誘ではなく問い合わせだが、#2・#10 と同じく**CAN-SPAM の住所表記の判断が決まるまで保留を推奨**（オーナー判断）。
- **オーナー承認: [ ]**

```text
Hello Women in Localization team,

I'm {{sender_name}} from the Kotomark development team. We're building an early prototype that checks game scripts and translation files (JA↔EN) for terminology, character-name, honorific and voice consistency, and we're looking for a few localization professionals who would try it for free and tell us where it's wrong.

We don't want to contact members directly or post anywhere uninvited. Is there an appropriate venue or channel (a newsletter, a chapter event, a community board) where an invitation like this would be welcome? If not, a simple "no" is perfectly fine.

If you'd rather not hear from us again, just say so and we won't contact you further.

{{sender_name}}, Kotomark development team
{{contact}}
```

### 3-6. BitSummit（BitSummit 実行委員会）— 日本語（319字）

- **経路：** https://www.bitsummit.org/ja/contact/ のフォーム（2026-10-09 確認：名前・メール・件名・本文、区分なし、メールアドレスの掲載なし、営業お断りの記載なし）。スポンサー・メディア向けの別ページがあり、出展・スポンサー枠が正式な場である可能性（費用が絡む場合はオーナー判断）。作品の応募窓口には送らない。
- **オーナー承認: [ ]**

```text
BitSummit 実行委員会 ご担当者様

突然のご連絡失礼します。Kotomark 開発チームの{{sender_name}}です。ゲームの台本・翻訳ファイル（日英）の用語・キャラ名・敬称・口調の揺れを検査する試作品を作っており、無料で試して「どこが間違っているか」を教えてくださるインディー開発者・ローカライズ担当の方を数名探しています。

出展者の皆さまへ個別にご連絡したり、許可なく投稿したりするつもりはありません。こうしたお試しの募集をご案内してよい場（出展者向けのお知らせ、交流の場など）がございましたら、お教えいただけませんか。適当な場がなければ、その旨だけでも幸いです。

今後のご連絡が不要でしたら「不要」とご返信ください。

Kotomark 開発チーム {{sender_name}}
{{contact}}
```

---

## 4. 送信前の最終チェック（1通ごと）

- [ ] オーナー承認の印がある
- [ ] `{{demo_link}}` `{{contact}}` `{{sender_name}}` を差し替え、`{{` が残っていない（`{{contact}}` は未提供なので、決まるまで送れない）
- [ ] デモのURLを自分で開き、付属サンプルの検査と「ラベルをコピー（CSV）」が動くことを確かめた
- [ ] 宛先は公開の業務窓口で、営業お断りの記載が無いことを当日に再確認した
- [ ] 触れた作品・事実を当日にもう一度公式ページで確かめた（成人向けでないことも）
- [ ] 配信停止の一文と送信者名が入っている（米国宛ては住所の要否を確認した）
- [ ] 精度の数字は送信ルール9の文言どおり（オープンソース6本・ゲーム3・アプリ3、抜き取った警告・エラー297件中287件、約97%、自社のAI評価者による判定）で、件数と条件が揃っている。精度の文で「ゲーム台本」「scripts」で測ったとは書いていない（製品の説明での「台本」は可）。190/190 は使っていない
- [ ] 同じ会社・グループにすでに送っていない（AGM と PLAYISM はどちらか1通、8-4 は日本語版か英語版の1通）
- [ ] 団体への相談（3章）は「案内してよい場があるか」を尋ねるだけで、会員個人に連絡していない
- [ ] 送信日を記録し、7〜10日後のフォローアップ（1回だけ）の予定を入れた
