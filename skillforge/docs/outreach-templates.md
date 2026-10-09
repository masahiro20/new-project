# Kotomark（仮称）試用協力者の募集：連絡文テンプレート（草案）

> **社内用の草案です。まだ送信しないでください。** 「Kotomark」は仮の名前で、商標の確認がまだ終わっていません（相手に送る文面では「Kotomark（仮称）」に統一します）。
> 協力者に渡す説明書は `pilot-guide.md`、データの扱いは `data-policy.md` です。文面の約束は、この2つと食い違ってはいけません。

---

## 使い方の注意（送信前に必ず読む）

1. **送信前にオーナーの承認が必要です。** 宛先リストと、個別に書き換えた文面の両方について、1通ずつ承認を取ってから送ります。承認なしの送信、一斉送信はしません。
2. **`{{demo_link}}` は差し替えが必要です。** ブラウザ版デモを公開共有の設定にした後のURLに置き換えます。社内用URL、ローカルのパス、トークン付きのURLは貼りません。デモがまだ公開されていない間は、このテンプレートは使えません。
3. **迷惑メールの規制に配慮します。**
   - **特定電子メール法（日本）：** 広告・宣伝にあたる可能性があるメールは、原則として事前の同意が必要です。名刺交換や問い合わせなどの関係がない相手への冷たいメールは、送る前に法務・オーナーに確認します。送信者の氏名（名称）、連絡先（メールアドレス等）、配信停止の方法を必ず本文に書きます。
   - **CAN-SPAM（米国）：** 件名で誤解させない、送信者を明記する、配信停止の方法を書き、申し出があれば速やかに（10営業日以内）止める。所在地（住所）の記載が必要になる場合があるため、送信前に確認します。
   - **GDPR（EU/英国）：** 個人のメールアドレスを扱う根拠（正当な利益など）を説明できるようにし、連絡先は公開されている業務用の窓口に限ります。削除の求めがあれば、こちらの連絡先リストからも消します。
4. **送信者情報と配信停止の方法を必ず明記します。** 各テンプレートの末尾の署名と「今後のご連絡が不要な場合」の一文は、削らないでください。
5. **1通ずつ個別に書き換えます。** 相手の会社・作品・役割に合わせて、最低でも「なぜあなたに連絡したか」の1文を自分の言葉で書きます。差し込みだけの一斉送信はしません。
6. **事実だけを書きます。** 導入実績、利用者数、精度の数字、価格は書きません（まだ存在しないため）。「初期の試作品」であることを必ず伝えます。他社名・作品名を「使っている」と匂わせる書き方もしません。
7. **追いかけは1回までです。** 返信がない場合のフォローアップ（テンプレート3-B）は1回だけ、最初の連絡から1〜2週間空けて送ります。その後は連絡しません。
8. **断られた・停止を求められたら、すぐ記録します。** 連絡先リストに「連絡不要」と記録し、二度と送りません。
9. **送る前に、相手の台本を受け取らない前提を確認します。** こちらから台本の送付を求めません。試用は相手の手元（ブラウザ版デモ、またはローカル版）で行ってもらいます。

### 差し込み項目

| 項目 | 内容 |
|---|---|
| `{{name}}` | 相手の名前（日本語版は「〇〇様」の形にする） |
| `{{company}}` | 相手の会社・スタジオ名 |
| `{{title_or_project}}` | 相手が手がけた作品名・プロジェクト名、または公開されている役割 |
| `{{sender_name}}` | 送信者の氏名 |
| `{{demo_link}}` | 公開共有設定後のブラウザ版デモURL |
| `{{contact}}` | 送信者の連絡先（返信用メールアドレス等） |
| `{{mutual_contact}}` | （テンプレート3-Aのみ）紹介してくれた共通の知人 |
| `{{previous_date}}` | （テンプレート3-Bのみ）最初に連絡した日付 |
| `{{元の件名}}` / `{{original_subject}}` | （テンプレート3-Bのみ）最初に送ったメールの件名 |

### 個別化のチェックリスト（1通ごとに確認）

- [ ] 宛先は公開されている業務用の連絡先か（個人のSNSの私的なアカウント・推測したアドレスではないか）
- [ ] 過去に「連絡不要」と言われた相手ではないか
- [ ] 相手の名前・会社名・敬称が正しいか（ローマ字表記、漢字、「様」の付け方）
- [ ] 「なぜあなたに連絡したか」を、相手の実際の作品・仕事・発言に触れて1文で書いたか（作品名は公開情報か）
- [ ] 相手の言語・方向（JA→EN／EN→JA）に合わせて、どちらの版を送るか決めたか
- [ ] 相手の役割に合わせて、いちばん関係のあるチェック（用語、キャラ名、敬称、口調など）を1〜2個に絞ったか
- [ ] `{{demo_link}}` を公開URLに差し替え、自分で開いて動くことを確かめたか
- [ ] `{{...}}` が1つも残っていないか（件名も含めて）
- [ ] 送信者名・連絡先・配信停止の一文が入っているか
- [ ] 実績・数字・価格・「AIで自動化」などの誇張が入っていないか
- [ ] 文字数が目安に収まっているか（DMは日本語500字／英語600字程度）
- [ ] オーナーの承認を取ったか

---

## テンプレート1：ローカライズ会社（LSP／LQAリード）向け — 初回メール

**想定：** LQAチームのリード、プロジェクトマネージャー。日英のゲーム案件を扱っていることが公開情報から分かる相手。
**ねらい：** 30分だけ、サンプルかNDAに触れない抜粋でデモを試してもらい、外れ（誤検出）を教えてもらう。

### 日本語版

**件名：** 日英ゲーム台本の一貫性チェック（試作品）の試用のお願い

{{company}}
{{name}}様

突然のご連絡失礼いたします。{{sender_name}}と申します。
{{title_or_project}}での日英ローカライズのお仕事を拝見し、LQAの現場の方にご意見をいただきたく、ご連絡しました。

現在、日英（英日）のゲーム台本を**台本全体で**見て、行と行の間の揺れを `ファイル名:行番号` 付きで指摘するツール「Kotomark（仮称）」を試作しています。対象は次のような揺れです。

- 用語集の訳語の揺れ（同じ用語が2通りに訳されている など）
- カタカナ表記の揺れ（「サーバー／サーバ」など）
- キャラクター名・話者ラベルの揺れ
- 敬称の訳し方の揺れ（「様」の扱いなど）
- 口調の揺れ（一人称や丁寧さが急に変わる行）

**まだ初期の試作品**で、誤検出も出ます。それを減らすために、実務の方の目で「この指摘は外れ」と教えていただけないかと考えています。

**お願いしたいこと（30分程度）**
1. ブラウザ版デモ（{{demo_link}}）を開き、付属のサンプル、またはNDAに触れない範囲の抜粋（固有名詞を置き換えたものなど）で検査してみる
2. 外れだと思った指摘を、簡単な理由と一緒に教えていただく（記録の仕方をまとめた説明書をお送りします）

試用は無料で、費用は一切かかりません。謝礼などのお支払いもない、純粋なお願いです。

**データの扱い**
- ブラウザ版デモは、すべての処理がお使いのブラウザ内で完結し、台本や用語集はどこにもアップロードされません。
- 通信をしないローカル版（コマンドライン）もご用意できます。
- サーバー版を使う場合も、台本は保存せず、ログにも本文は残しません。こちらから台本の送付をお願いすることはありません。
- 結果をお送りいただく際は、原文・訳文の列を消していただいて構いません。

ご興味があれば、このメールにご返信いただくだけで結構です。お忙しいところ、最後までお読みいただきありがとうございました。

今後このようなご連絡が不要でしたら、「不要」とだけご返信ください。以後ご連絡いたしません。

{{sender_name}}
{{contact}}

### English version

**Subject:** Request: try an early JA↔EN script consistency checker (30 min, free)

Hi {{name}},

My name is {{sender_name}}. I came across {{company}}'s Japanese–English localization work on {{title_or_project}}, and I'd value the view of someone who runs LQA in practice.

I'm building an early prototype called Kotomark (working name). It reads a JA↔EN game script as a whole and reports what drifts between lines, with `file:line` references:

- glossary term drift (one term rendered two ways)
- katakana notation drift (サーバー / サーバ)
- character-name and speaker-label drift
- honorific drift (e.g. how 様 is handled)
- voice drift (a character's pronoun or politeness suddenly changing)

It is an early prototype and it does produce false positives. I'm looking for a few practitioners to tell me which flags are wrong, so I can fix the rules.

**The ask (about 30 minutes)**
1. Open the browser demo ({{demo_link}}) and run it on the bundled sample, or on an NDA-safe excerpt (for example, with proper nouns swapped out).
2. Tell me which flags you think are false positives, with a short reason. I'll send a short pilot guide that explains how to record them.

The pilot is free. There is nothing to buy and no payment involved either way.

**How your data is handled**
- The browser demo runs entirely in your browser; scripts and glossaries are not uploaded anywhere.
- A local CLI version that makes no network calls is also available.
- If you use the hosted version, scripts are not stored and their text is never written to logs. I will not ask you to send me a script.
- When you send results back, you're welcome to delete the source and target text columns first.

If you're interested, just reply to this email. Thanks for reading.

If you'd rather not hear from me again, reply "no thanks" and I won't contact you further.

{{sender_name}}
{{contact}}

---

## テンプレート2：インディーのパブリッシャー／小規模スタジオ向け — 短いDM

**想定：** X／Discord／LinkedIn のDM。日英で作品を出している（出す予定の）小規模チーム。
**長さの目安：** 日本語 約500字、英語 約600字（下の本文はそれぞれその範囲内）。DMを受け付けている相手、または公開の業務用窓口がある相手にだけ送ります。

### 日本語版

{{name}}様

突然のDM失礼します。{{sender_name}}です。{{title_or_project}}の日英版を拝見してご連絡しました。

日英ゲーム台本の一貫性チェックツール「Kotomark（仮称）」を試作しています。台本全体を見て、用語の訳揺れ、カタカナ表記の揺れ、キャラ名・敬称・口調の揺れを、ファイル名と行番号付きで指摘します。

まだ初期の試作品で、誤検出があります。もしよければ30分ほど、ブラウザ版デモで付属のサンプルか、NDAに触れない抜粋を試して、「この指摘は外れ」というものを教えていただけないでしょうか。記録の仕方は短い説明書でお伝えします。試用は無料で、お支払いは一切ありません。

デモはブラウザ内だけで動き、台本はどこにもアップロードされません。こちらから台本をお送りいただくこともありません。

デモ：{{demo_link}}
連絡先：{{contact}}

ご興味がなければ、このまま流していただいて大丈夫です。今後の連絡が不要でしたら一言いただければ、以後お送りしません。

### English version

Hi {{name}}, I'm {{sender_name}}. I saw the JA/EN release of {{title_or_project}}.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: {{demo_link}}
Contact: {{contact}}

No worries if it's not a fit. Say the word and I won't message again.

---

## テンプレート3：紹介経由／フォローアップ

### 3-A. 共通の知人からの紹介

**想定：** {{mutual_contact}} さんから紹介を受けた、または紹介の了承を得た相手。紹介者が実際に紹介してくれたことを確認してから送ります（「紹介されたことにする」は禁止）。

#### 日本語版

**件名：** {{mutual_contact}}様からのご紹介：日英台本チェックの試用のお願い

{{company}}
{{name}}様

{{mutual_contact}}様からご紹介いただきました、{{sender_name}}と申します。
{{name}}様が{{title_or_project}}で日英ローカライズに携わっておられると伺い、ご連絡しました。

日英ゲーム台本を台本全体で見て、用語・カタカナ表記・キャラ名・敬称・口調の揺れを `ファイル名:行番号` 付きで指摘するツール「Kotomark（仮称）」を試作しています。まだ初期の試作品で、誤検出を減らすために、実務の方のご意見を集めています。

**お願いしたいこと：** 30分ほど、ブラウザ版デモ（{{demo_link}}）で付属のサンプルか、NDAに触れない抜粋を試し、外れだと思った指摘を教えていただくことです。記録の仕方は説明書でお伝えします。試用は無料で、お支払いは一切ありません。

**データの扱い：** デモはブラウザ内だけで動き、台本はアップロードされません。通信しないローカル版もあります。こちらから台本の送付をお願いすることはありません。

ご都合が合わなければ、遠慮なくお断りください。{{mutual_contact}}様にもその旨だけお伝えしておきます。今後のご連絡が不要でしたら、その旨ご返信いただければ以後お送りしません。

{{sender_name}}
{{contact}}

#### English version

**Subject:** Intro via {{mutual_contact}}: trying an early JA↔EN script checker

Hi {{name}},

{{mutual_contact}} suggested I get in touch. I'm {{sender_name}}, and I understand you worked on the Japanese–English localization of {{title_or_project}}.

I'm building Kotomark (working name), an early prototype that reads a JA↔EN game script as a whole and flags term, katakana notation, character-name, honorific and voice drift with `file:line` references. It still has false positives, and I'm asking a few practitioners to help me find them.

**The ask:** about 30 minutes with the browser demo ({{demo_link}}) on its sample or an NDA-safe excerpt, then a note on which flags you think are wrong. I'll send a short guide on how to record them. The pilot is free; no payment is involved.

**Data:** the demo runs entirely in your browser and nothing is uploaded. There's also a local CLI version with no network calls. I won't ask you to send me a script.

If it's not a good time, a simple "no" is completely fine, and I'll let {{mutual_contact}} know without any fuss. If you'd rather not hear from me again, just reply and I won't follow up.

{{sender_name}}
{{contact}}

### 3-B. 返信がない場合のフォローアップ（1回だけ）

**想定：** テンプレート1・2・3-Aを送ってから1〜2週間たっても返信がない相手。**これが最後の連絡です。** 元のメールのスレッドに返信する形で送ります。

#### 日本語版

**件名：** Re: {{元の件名}}

{{name}}様

{{sender_name}}です。{{previous_date}}にお送りした、日英ゲーム台本の一貫性チェック（Kotomark〈仮称〉、試作品）の試用のお願いについて、念のため一度だけご連絡しました。

お願いは変わらず、30分ほどブラウザ版デモ（{{demo_link}}）で、サンプルかNDAに触れない抜粋を試し、外れの指摘を教えていただくことです。試用は無料で、お支払いはありません。デモはブラウザ内だけで動き、台本はアップロードされません。

お忙しい時期でしたら、どうぞお気になさらないでください。**こちらからのご連絡はこれで最後にいたします。** 後日ご興味が出たときは、{{contact}} までいつでもどうぞ。

{{sender_name}}
{{contact}}

#### English version

**Subject:** Re: {{original_subject}}

Hi {{name}},

A quick, one-time follow-up to my note from {{previous_date}} about Kotomark (working name), an early-prototype consistency checker for JA↔EN game scripts.

The ask is the same: about 30 minutes with the browser demo ({{demo_link}}) on its sample or an NDA-safe excerpt, and a note on which flags look wrong. It's free, with no payment involved, and the demo runs entirely in your browser, so nothing is uploaded.

If now isn't a good time, no need to reply. **This is my last message on this.** If it becomes useful later, you can reach me at {{contact}}.

{{sender_name}}
{{contact}}

---

## 補足：返信があった後

- 協力の返事をもらったら、`pilot-guide.md`（協力者向け 1〜7章）を渡します。付録（運営側の手順）は渡しません。
- 説明書は60〜90分の手順になっています。最初の連絡では「30分」と伝えているので、**30分で終わる範囲（デモで試して、外れを数件教えてもらう）で十分**と改めて伝え、labels.csv での記録や見逃しの記録は「できれば」とします。
- 説明書7章の質問4（支払い意思・金額）は、試用をお願いする連絡文には書きません。尋ねる場合も任意の質問として扱います。
- プラグイン版を使う相手には、トークンを個別に発行し、安全な経路で渡します（説明書の付録A）。試用が終わったら失効させます。
