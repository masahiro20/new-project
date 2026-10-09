# Kotomark（仮称）第1弾 初回連絡の下書き（10件）

> **社内用の下書きです。まだ誰にも送っていません。** 送信・連絡・アカウント作成は一切していません。
> 宛先は `pilot-targets.md` の「3. 最初に声をかける10件」です。文面の約束は `outreach-templates.md`・`pilot-guide.md`・`data-policy.md` と食い違わないように書いています。
> 各社の公開ページは 2026-10-09 に開いて、文面で触れた事実を確かめました（各候補の「確認した事実」欄）。
>
> **変更履歴**
> - 2026-10-09 本部判断を反映（精度の数字を本文へ、米国宛て2通は保留、Shiravune は DM 短縮版）

---

## 0. 一覧

| # | 宛先 | 言語 | 経路（公開の業務窓口） | 文面で触れる事実（確認元） | 想定形式 | 主なリスク | 本文の長さ（精度の数字） | 承認 |
|---|---|---|---|---|---|---|---|---|
| 1 | Impetus（インピタス） | JA | 見積もり・問い合わせフォーム https://www.impetus.jp/for-clients-quotes | ENDER LILIES / ENDER MAGNOLIA などの実績、LQA（impetus.jp） | XLSX / CSV / XLIFF | 大手案件のNDA | 393字（数字あり） | [ ] |
| 2 | Lemnisca LLC | EN | サイト内フォーム https://lemnisca.net/#contact | Raging Loop・Root Double の翻訳・編集・QA（lemnisca.net） | XLSX / CSV、KAG・Tyrano `.ks` | 依頼元とのNDA、成人向けの取引先、CAN-SPAM（住所） | 166語（数字なし） | [ ] **保留（米国の住所表記の問題が片付くまで）** |
| 3 | 8-4, Ltd. | JA | 一般窓口 info@8-4.jp（https://8-4.jp/about-us/ に掲載） | 2005年設立、Fire Emblem Warriors: Three Hopes 英語版（8-4.jp） | XLSX / CSV / XLIFF | 任天堂など大手のNDA、外部ツール方針 | 395字（数字あり） | [ ] |
| 4 | Fruitbat Factory | EN | 一般窓口 info@fruitbatfactory.com（about.html に掲載） | 2012年から日本のゲームに特化、Unity / KiriKiri / Tyrano（about.html） | KAG・Tyrano `.ks`、Unity CSV | GDPR（拠点未検証）、`.ks` の配置条件 | 169語（数字あり） | [ ] |
| 5 | Shiravune | JA | 公式 X の DM（業務DMを受け付けている場合のみ） | 東京拠点、うたわれるもの PC版（shiravune.com/about） | XLSX / CSV、Ren'Py / `.ks` | 成人向けタイトルあり、窓口がSNSのみ | **DM短縮版 261字を送る**（数字あり）／長い版 391字は参考 | [ ] |
| 6 | Active Gaming Media | JA | 問い合わせフォーム https://www.activegamingmedia.com/index.php/contact/ （区分「その他」） | 2026-10-06 告知「アナザーエデン ビギンズ」LQA担当（公式トップ） | XLSX / CSV / XLIFF、Unity / Unreal CSV | 社内ツール審査、クライアントNDA、自社ツールとの競合 | 396字（数字あり） | [ ] |
| 7 | Chorus Worldwide | JA | 問い合わせフォーム https://chorusworldwide.com/jp-contact/ （区分「ビジネスに関するお問い合わせ」） | コーヒートーク の日本展開（フォームの作品一覧、about-us） | Unity CSV / XLSX / i18n JSON | 開発元との契約で台本を出せない | 396字（数字あり） | [ ] |
| 8 | Kakehashi Games（架け橋ゲームズ） | JA | 会社案内の一般メール（https://www.kakehashigames.com/about-us.html。表示はブラウザで確認） | 海外インディーの日本語化・日本展開、Cairn の配信（公式トップ） | CSV / XLSX / i18n JSON / .po / Unity CSV | 翻訳が外注の可能性 | 395字（数字あり） | [ ] |
| 9 | Shloc Ltd | EN | 一般窓口 mail@shloc.com（https://www.shloc.com/en/contact） | DEATH STRANDING 2 の JP > EN Localization、ロンドン・東京拠点（shloc.com） | XLSX / CSV / XLIFF | AAAの機密、GDPR / PECR（英国） | 174語（数字あり） | [ ] |
| 10 | Middlebury Institute（MIIS） | EN | 大学の公開窓口（下記の注意。プログラム事務局の窓口を要確認） | 2024-05-09 記事：学生8名が LocJam 6 で英→日翻訳、用語と口調を統一 | CSV / XLSX / XLIFF / .po | 大学の承認、FERPA、授業日程、CAN-SPAM | 159語（数字なし） | [ ] **保留（米国の住所表記の問題が片付くまで）** |

---

## 1. 送信ルール（送る前に必ず読む）

1. **1通ずつオーナーの承認を取ってから送ります。** 宛先と文面の両方を確認し、各候補の「オーナー承認: [ ]」に印が付いたものだけ送ります。一斉送信・BCC送信はしません。
2. **差し込みを埋めます。** `{{demo_link}}`（公開共有の設定にしたデモURL。社内URL・トークン付きURLは不可）、`{{contact}}`（返信先。**現在未提供**のため、決まるまで送信不可）、`{{sender_name}}`。送る前に `{{` が残っていないことを確認します。
3. **特定電子メール法（日本：#1, 3, 5, 6, 7, 8）：** 広告・宣伝にあたりうるため、相手がアドレスを公表している業務窓口に限り、「営業お断り」等の記載がないことを送信直前にもう一度確認します（2026-10-09 時点では10件とも該当記載は見当たりませんでした）。本文に送信者名・連絡先・配信停止の方法を必ず入れます。
4. **CAN-SPAM（米国：#2, #10。2026-10-09 本部判断で2通とも保留）：** 送信者の明記、配信停止の方法、申し出から10営業日以内の停止に加え、**送信者の所在地（郵便の住所）**の記載が必要になる場合があります。署名に住所を足すかは送信前に法務・オーナーが判断します。
5. **GDPR / PECR（英国・EU：#4, #9）：** 公開されている業務用の窓口だけに送ります（個人のアドレスは推測しない・使わない）。連絡の根拠（正当な利益）を説明できるようにし、削除の求めがあれば連絡先リストからも消します。
6. **フォームとDM：** 問い合わせフォームは用意された区分（「その他」「ビジネス」）を使い、サポート窓口・採用窓口には送りません。DMは業務用アカウントがDMを受け付けている場合だけです。コミュニティの公開の場には投稿しません。
7. **成人向けの取引先（#2, #5）：** 文面で触れる作品は全年齢と確認できたものだけにします（送信前に年齢区分を再確認）。当社の資料に成人向けの内容を入れません。
8. **NDA・機密：** こちらから台本の送付を求めません。試用は付属サンプルか、相手が選んだNDAに触れない抜粋で、ブラウザ版デモ（処理はブラウザ内、アップロードなし）で行ってもらいます。受け取るのは「ラベルをコピー（CSV）」の内容だけで、原文・訳文の列は既定で空になります。デモの画面は 2026-10-09 時点で日本語だけなので、英語の相手には英語の手順を添えるか通話を勧めます（#2 のメモ参照）。
9. **数字（2026-10-09 本部承認：本文に入れる）：** 文面に入れてよい精度の数字は、**調整に使っていないデータ（2回目）の値だけ**で、表現は次の文言に限ります（件数と条件を必ずセットで書き、「約97%」だけを抜き出さない）。
   - 日本語：「調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。」
   - 英語："On six open-source projects we never tuned on (3 games, 3 apps), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator)."
   - 日→英の相手（#3, #4, #5, #9）だけ、括弧内に「、主に英→日」／"; mostly EN→JA"（#9 は "mostly EN→JA strings"）を足してよい。これ以外の言い換えはしません。
   - **使わない表現：** 本部案の「調整に使っていないゲーム台本297件で287件を正しく判定（約97%）」は**事実と違うので使いません**。297件は6つのオープンソース（ゲーム3・アプリ3）から抜き取った警告・エラーで、対象は主に UI・翻訳文字列（.po・YAML・JSON）と Ren'Py のデモ1本であり、ゲーム台本ではありません。判定はAI評価者1名（人の確認はまだ、再現率は未測定）で、指摘の大半は未翻訳の検出です。調整に使ったデータの 190/190 も**使いません**。
   - 入れた文面：#1, 3, 4, 5, 6, 7, 8, 9。#2・#10（米国宛て）は保留中のため数字は入れていません（保留が解けて送る場合も、入れるなら上の英語の文言だけ）。
10. **追いかけは1回まで：** 返信がなければ、**7〜10日後に1回だけ**、`outreach-templates.md` の 3-B（元のスレッドへの返信）を送ります。その後は連絡しません。（テンプレートの「1〜2週間」より短めの、この下書き用の取り決めです。）
11. **断られた・停止を求められたら：** すぐ `pilot-targets.md` の該当行に「連絡不要」と書き、二度と送りません。
12. **文字数：** 各文面は英語180語以内、日本語400字以内（署名を含む本文。件名・改行は除き、差し込みは1字と数える）に収めています。Shiravune の DM 短縮版は280字以内です。現在の長さは「0. 一覧」の表にあります。書き換えたら数え直してください。

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

{{sender_name}}, Kotomark 開発チーム
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

### 3. 8-4, Ltd. — 日本語

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

**オーナー向けメモ**
- **なぜこの相手か：** 2005年設立の東京の老舗で、日→英・英→日の両方向（8-4.jp/about-us で明記）。現場の目が厳しく、誤検出の指摘に価値がある。
- **確認した事実（2026-10-09）：** about-us に "Established: Oct. 5, 2005"、Japanese-to-English / English-to-Japanese localization。トップページに "8-4 worked on the English localization of Fire Emblem Warriors: Three Hopes"。
- **経路：** about-us に掲載の一般窓口 info@8-4.jp（General Inquiries）。媒体・採用・サポート用の別アドレスには送らない。
- **リスク：** 任天堂・カプコンなど大手案件のNDA、外部ツールの利用方針が厳しい可能性。英語話者の多い会社なので、**英語版に差し替える選択肢**あり（Lemnisca の文面を 8-4 向けに直す）。日本語で送るか英語で送るかはオーナー判断。
- **オーナー承認: [ ]**

---

### 4. Fruitbat Factory — English

**Subject:** A consistency checker that reads KiriKiri/Tyrano .ks: 30-minute try?

```text
Hello Fruitbat Factory team,

I'm {{sender_name}} from the Kotomark development team. Your About page says you've focused on Japanese games since 2012 and specialise in Unity, KiriKiri and Tyrano projects, so I thought our prototype might fit your workflow.

Kotomark (working name) is an early prototype that checks a whole JA→EN script for term, katakana, character-name, honorific and voice drift, with file:line references. It reads KAG/TyranoScript .ks files (one copy per language), Unity string-table CSVs and XLSX/CSV. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator).

One small ask: about 30 minutes with the browser demo ({{demo_link}}) on the bundled sample or a safe excerpt, then send the text from the "ラベルをコピー（CSV）" (copy labels) button. A 20-minute call is fine instead. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark 開発チーム
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

Kotomark（仮称）は、英日の台本の用語・表記・キャラ名・敬称・口調の揺れを「ファイル名:行番号」付きで示す試作品で、CSV・XLSX・JSON・.poなどを読めます。調整に使っていないオープンソース6本（ゲーム3・アプリ3）の翻訳で、抜き取った警告・エラー297件中287件が実際の問題でした（約97%、自社のAI評価者による判定）。外注翻訳の納品チェックに使えるかも伺いたいです。

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

Kotomark (working name) is an early prototype that reads a whole JA↔EN script and flags term, katakana, character-name, honorific and voice drift with file:line references. It reads XLSX/CSV and XLIFF. On six open-source projects we never tuned on (3 games, 3 apps; mostly EN→JA strings), 287 of 297 sampled warnings/errors were real issues (about 97%; judged in-house by an AI evaluator). It's untested on JA→EN scripts and still has false positives.

Your projects are confidential, so I'm not asking for any project text. One small ask: 30 minutes with the browser demo ({{demo_link}}) on its bundled sample, then send the text from the "ラベルをコピー（CSV）" (copy labels) button; or a 20-minute call. Nothing is uploaded. Free, no obligation.

If you'd rather not hear from us again, reply "no thanks" and we won't contact you further.

{{sender_name}}, Kotomark 開発チーム
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

{{sender_name}}, Kotomark 開発チーム
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

## 3. 送信前の最終チェック（1通ごと）

- [ ] オーナー承認の印がある
- [ ] `{{demo_link}}` `{{contact}}` `{{sender_name}}` を差し替え、`{{` が残っていない（`{{contact}}` は未提供なので、決まるまで送れない）
- [ ] デモのURLを自分で開き、付属サンプルの検査と「ラベルをコピー（CSV）」が動くことを確かめた
- [ ] 宛先は公開の業務窓口で、営業お断りの記載が無いことを当日に再確認した
- [ ] 触れた作品・事実を当日にもう一度公式ページで確かめた（成人向けでないことも）
- [ ] 配信停止の一文と送信者名が入っている（米国宛ては住所の要否を確認した）
- [ ] 精度の数字は送信ルール9の文言どおり（オープンソース6本・ゲーム3・アプリ3、抜き取った警告・エラー297件中287件、約97%、自社のAI評価者による判定）で、件数と条件が揃っている。「ゲーム台本」とは書いていない。190/190 は使っていない
- [ ] 送信日を記録し、7〜10日後のフォローアップ（1回だけ）の予定を入れた
