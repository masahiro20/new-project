# P1 Kotomark（仮称）　優先度 A の12件の個別文面（下書き）

作成：Midas（2026-10-09）　**送信しない。** オーナーが1通ずつ承認してから送る。
元にしたもの：
- Forge の `skillforge/docs/outreach-templates.md`（`peter/p1-skillforge`）
- 連絡先リスト `peter-hq/revenue/p1-targets.md`

## 置き換えるもの
残っているのは `{{CONTACT}}`（返信を受けるメールアドレス。オーナーから届いたら置き換える）だけ。

| 項目 | 中身 | 状態 |
|---|---|---|
| デモ | https://masahiro20.github.io/new-project/kotomark/demo/ | **公開済み・置き換え済み**（2026-10-09 に開けることを確認） |
| 説明ページ | https://masahiro20.github.io/new-project/kotomark/ | **公開済み・置き換え済み** |
| 送信者名 | 日本語版「Kotomark 開発チーム」、英語版「Kotomark development team」 | **決定・置き換え済み**（本部の決定） |
| `{{CONTACT}}` | 返信を受けるメールアドレス | オーナーが決める |

## 共通の注意（テンプレートの「使い方の注意」から）
- 宛名は個人名を使わず「ご担当者様」「Hello ... team」にした。個人の連絡先は集めていないため。
- 本文の「なぜあなたに連絡したか」の1文は、公開情報で確かめられる事実だけ。作品名は、検索で確認できた 8-4 と Shloc だけに入れた。**送る前に、相手の最新の仕事を見て、担当者が自分の言葉に書き直す。**
- 実績・数字・価格は書いていない（まだないため）。初期の試作品であることを明記した。
- 配信停止の一文と、送信者名・連絡先は削らない。
- 窓口が［要確認］の4件（#5 DANGEN、#8 Kakehashi、#10 JAST、#11 Fruitbat Factory）は、窓口を確かめるまで送らない。
- 送る前に、相手のページに「営業メールお断り」などの表示がないかを見る（特定電子メール法）。
- フォローアップは1回だけ（テンプレート3-B）。
- 1日2〜3件まで。返信を見て文面を直しながら進める。

## 送信前のチェック（1通ごと）
- [ ] `{{...}}` が1つも残っていない（件名も含む）
- [ ] デモの URL を送る直前にもう一度開いて、動くことを確かめた
- [ ] 「なぜあなたに連絡したか」を、相手の最近の仕事に合わせて書き直した
- [ ] 窓口が会社の公開窓口で、「営業お断り」の表示がない
- [ ] オーナーの承認を取った

---

## 1. 8-4, Ltd.
- **窓口：** info@8-4.jp（会社サイトの About）［確認］
- **使うテンプレート：** テンプレート1・英語版（メール）

**Subject:** Request: try an early JA↔EN script consistency checker (30 min, free)

Hello 8-4, Ltd. team,

I'm writing from the Kotomark development team. I came across 8-4's Japanese–English localization work on titles such as Monster Hunter and NieR, and I'd value the view of a team that does LQA at that level.

I'm building an early prototype called Kotomark (working name). It reads a JA↔EN game script as a whole and reports what drifts between lines, with `file:line` references:

- glossary term drift (one term rendered two ways)
- katakana notation drift (サーバー / サーバ)
- character-name and speaker-label drift
- honorific drift (e.g. how 様 is handled)
- voice drift (a character's pronoun or politeness suddenly changing)

It is an early prototype and it does produce false positives. I'm looking for a few practitioners to tell me which flags are wrong, so I can fix the rules.

**The ask (about 30 minutes)**
1. Open the browser demo (https://masahiro20.github.io/new-project/kotomark/demo/) and run it on the bundled sample, or on an NDA-safe excerpt (for example, with proper nouns swapped out).
2. Tell me which flags you think are false positives, with a short reason. I'll send a short pilot guide that explains how to record them.

More about the tool: https://masahiro20.github.io/new-project/kotomark/

The pilot is free. There is nothing to buy and no payment involved either way.

**How your data is handled**
- The browser demo runs entirely in your browser; scripts and glossaries are not uploaded anywhere.
- A local CLI version that makes no network calls is also available.
- If you use the hosted version, scripts are not stored and their text is never written to logs. I will not ask you to send me a script.
- When you send results back, you're welcome to delete the source and target text columns first.

If you're interested, just reply to this email. Thanks for reading.

If you'd rather not hear from me again, reply "no thanks" and I won't contact you further.

Kotomark development team
{{CONTACT}}

---

## 2. Shloc
- **窓口：** https://www.shloc.com/en/contact または mail@shloc.com［確認］
- **使うテンプレート：** テンプレート1・英語版（メール）

**Subject:** Request: try an early JA↔EN script consistency checker (30 min, free)

Hello Shloc team,

I'm writing from the Kotomark development team. I came across Shloc's Japanese-to-English work, including the European localization of Dragon Quest VII, and I'd value your team's view on consistency checks.

I'm building an early prototype called Kotomark (working name). It reads a JA↔EN game script as a whole and reports what drifts between lines, with `file:line` references:

- glossary term drift (one term rendered two ways)
- katakana notation drift (サーバー / サーバ)
- character-name and speaker-label drift
- honorific drift (e.g. how 様 is handled)
- voice drift (a character's pronoun or politeness suddenly changing)

It is an early prototype and it does produce false positives. I'm looking for a few practitioners to tell me which flags are wrong, so I can fix the rules.

**The ask (about 30 minutes)**
1. Open the browser demo (https://masahiro20.github.io/new-project/kotomark/demo/) and run it on the bundled sample, or on an NDA-safe excerpt (for example, with proper nouns swapped out).
2. Tell me which flags you think are false positives, with a short reason. I'll send a short pilot guide that explains how to record them.

More about the tool: https://masahiro20.github.io/new-project/kotomark/

The pilot is free. There is nothing to buy and no payment involved either way.

**How your data is handled**
- The browser demo runs entirely in your browser; scripts and glossaries are not uploaded anywhere.
- A local CLI version that makes no network calls is also available.
- If you use the hosted version, scripts are not stored and their text is never written to logs. I will not ask you to send me a script.
- When you send results back, you're welcome to delete the source and target text columns first.

If you're interested, just reply to this email. Thanks for reading.

If you'd rather not hear from me again, reply "no thanks" and I won't contact you further.

Kotomark development team
{{CONTACT}}

---

## 3. PLAYISM
- **窓口：** https://playism.com/en/contact/［確認］
- **使うテンプレート：** テンプレート2・日本語版（短い文面）

PLAYISM
ご担当者様

突然のご連絡失礼します。Kotomark 開発チームです。日本のインディー作品を英語圏に届けていらっしゃる PLAYISM さんの英語版を拝見し、ご連絡しました。

日英ゲーム台本の一貫性チェックツール「Kotomark（仮称）」を試作しています。台本全体を見て、用語の訳揺れ、カタカナ表記の揺れ、キャラ名・敬称・口調の揺れを、ファイル名と行番号付きで指摘します。

まだ初期の試作品で、誤検出があります。もしよければ30分ほど、ブラウザ版デモで付属のサンプルか、NDAに触れない抜粋を試して、「この指摘は外れ」というものを教えていただけないでしょうか。記録の仕方は短い説明書でお伝えします。試用は無料で、お支払いは一切ありません。

デモはブラウザ内だけで動き、台本はどこにもアップロードされません。こちらから台本をお送りいただくこともありません。

デモ：https://masahiro20.github.io/new-project/kotomark/demo/
説明：https://masahiro20.github.io/new-project/kotomark/
連絡先：{{CONTACT}}

ご興味がなければ、このまま流していただいて大丈夫です。今後の連絡が不要でしたら一言いただければ、以後お送りしません。

---

## 4. 株式会社アクティブゲーミングメディア
- **窓口：** https://www.activegamingmedia.com/index.php/contact/［確認］
- **使うテンプレート：** テンプレート1・日本語版（メール）
- **メモ：** 社名の表記は、送る前に公式サイトで確認する。

**件名：** 日英ゲーム台本の一貫性チェック（試作品）の試用のお願い

株式会社アクティブゲーミングメディア
ご担当者様

突然のご連絡失礼いたします。Kotomark 開発チームと申します。
ゲームのローカライズと LQA を手がけていらっしゃる御社に、現場のご意見をいただきたくご連絡しました。

現在、日英（英日）のゲーム台本を**台本全体で**見て、行と行の間の揺れを `ファイル名:行番号` 付きで指摘するツール「Kotomark（仮称）」を試作しています。対象は次のような揺れです。

- 用語集の訳語の揺れ（同じ用語が2通りに訳されている など）
- カタカナ表記の揺れ（「サーバー／サーバ」など）
- キャラクター名・話者ラベルの揺れ
- 敬称の訳し方の揺れ（「様」の扱いなど）
- 口調の揺れ（一人称や丁寧さが急に変わる行）

**まだ初期の試作品**で、誤検出も出ます。それを減らすために、実務の方の目で「この指摘は外れ」と教えていただけないかと考えています。

**お願いしたいこと（30分程度）**
1. ブラウザ版デモ（https://masahiro20.github.io/new-project/kotomark/demo/）を開き、付属のサンプル、またはNDAに触れない範囲の抜粋（固有名詞を置き換えたものなど）で検査してみる
2. 外れだと思った指摘を、簡単な理由と一緒に教えていただく（記録の仕方をまとめた説明書をお送りします）

ツールの説明：https://masahiro20.github.io/new-project/kotomark/

試用は無料で、費用は一切かかりません。謝礼などのお支払いもない、純粋なお願いです。

**データの扱い**
- ブラウザ版デモは、すべての処理がお使いのブラウザ内で完結し、台本や用語集はどこにもアップロードされません。
- 通信をしないローカル版（コマンドライン）もご用意できます。
- サーバー版を使う場合も、台本は保存せず、ログにも本文は残しません。こちらから台本の送付をお願いすることはありません。
- 結果をお送りいただく際は、原文・訳文の列を消していただいて構いません。

ご興味があれば、このメールにご返信いただくだけで結構です。お忙しいところ、最後までお読みいただきありがとうございました。

今後このようなご連絡が不要でしたら、「不要」とだけご返信ください。以後ご連絡いたしません。

Kotomark 開発チーム
{{CONTACT}}

---

## 5. DANGEN Entertainment
- **窓口：** **要確認**：見つかった窓口は作品の売り込み用（https://pitch.dangenentertainment.com）。ツールの案内に使ってよいかが分からないので、一般の窓口が見つかるまで送らない
- **使うテンプレート：** テンプレート2・英語版（短い文面）
- **メモ：** 送る前に、一般の問い合わせ窓口を探す。

Hello DANGEN Entertainment team, this is the Kotomark development team. I've followed DANGEN's multilingual indie releases out of Osaka and wanted to ask a small JA/EN team for a reality check on a consistency tool.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: https://masahiro20.github.io/new-project/kotomark/demo/
More: https://masahiro20.github.io/new-project/kotomark/
Contact: {{CONTACT}}

No worries if it's not a fit. Say the word and I won't message again.

---

## 6. 株式会社Phoenixx
- **窓口：** https://phoenixx.co.jp/contact.html［確認］
- **使うテンプレート：** テンプレート2・日本語版（短い文面）

株式会社Phoenixx
ご担当者様

突然のご連絡失礼します。Kotomark 開発チームです。インディー作品の多言語展開を手がけていらっしゃる御社に、日英台本のチェックについてご意見をいただきたくご連絡しました。

日英ゲーム台本の一貫性チェックツール「Kotomark（仮称）」を試作しています。台本全体を見て、用語の訳揺れ、カタカナ表記の揺れ、キャラ名・敬称・口調の揺れを、ファイル名と行番号付きで指摘します。

まだ初期の試作品で、誤検出があります。もしよければ30分ほど、ブラウザ版デモで付属のサンプルか、NDAに触れない抜粋を試して、「この指摘は外れ」というものを教えていただけないでしょうか。記録の仕方は短い説明書でお伝えします。試用は無料で、お支払いは一切ありません。

デモはブラウザ内だけで動き、台本はどこにもアップロードされません。こちらから台本をお送りいただくこともありません。

デモ：https://masahiro20.github.io/new-project/kotomark/demo/
説明：https://masahiro20.github.io/new-project/kotomark/
連絡先：{{CONTACT}}

ご興味がなければ、このまま流していただいて大丈夫です。今後の連絡が不要でしたら一言いただければ、以後お送りしません。

---

## 7. Chorus Worldwide
- **窓口：** https://chorusworldwide.com/jp-contact/［確認］（作品の売り込み窓口は使わない）
- **使うテンプレート：** テンプレート2・日本語版（短い文面）

Chorus Worldwide
ご担当者様

突然のご連絡失礼します。Kotomark 開発チームです。日本の作品の海外展開を手がけていらっしゃる御社に、日英台本の一貫性チェックについてご意見をいただきたくご連絡しました。

日英ゲーム台本の一貫性チェックツール「Kotomark（仮称）」を試作しています。台本全体を見て、用語の訳揺れ、カタカナ表記の揺れ、キャラ名・敬称・口調の揺れを、ファイル名と行番号付きで指摘します。

まだ初期の試作品で、誤検出があります。もしよければ30分ほど、ブラウザ版デモで付属のサンプルか、NDAに触れない抜粋を試して、「この指摘は外れ」というものを教えていただけないでしょうか。記録の仕方は短い説明書でお伝えします。試用は無料で、お支払いは一切ありません。

デモはブラウザ内だけで動き、台本はどこにもアップロードされません。こちらから台本をお送りいただくこともありません。

デモ：https://masahiro20.github.io/new-project/kotomark/demo/
説明：https://masahiro20.github.io/new-project/kotomark/
連絡先：{{CONTACT}}

ご興味がなければ、このまま流していただいて大丈夫です。今後の連絡が不要でしたら一言いただければ、以後お送りしません。

---

## 8. Kakehashi Games
- **窓口：** **要確認**：公式サイト https://kakehashigames.com/ の問い合わせページ（/contact は応答あり、中身は未読）
- **使うテンプレート：** テンプレート2・日本語版（短い文面）
- **メモ：** 英→日の向きなので、英→日の敬称・口調の検査を前に出す。

Kakehashi Games
ご担当者様

突然のご連絡失礼します。Kotomark 開発チームです。海外のインディー作品を日本向けに届けていらっしゃる御社に、英→日の台本で起きやすい敬称・口調の揺れのチェックについてご意見をいただきたくご連絡しました。

日英ゲーム台本の一貫性チェックツール「Kotomark（仮称）」を試作しています。台本全体を見て、用語の訳揺れ、カタカナ表記の揺れ、キャラ名・敬称・口調の揺れを、ファイル名と行番号付きで指摘します。

まだ初期の試作品で、誤検出があります。もしよければ30分ほど、ブラウザ版デモで付属のサンプルか、NDAに触れない抜粋を試して、「この指摘は外れ」というものを教えていただけないでしょうか。記録の仕方は短い説明書でお伝えします。試用は無料で、お支払いは一切ありません。

デモはブラウザ内だけで動き、台本はどこにもアップロードされません。こちらから台本をお送りいただくこともありません。

デモ：https://masahiro20.github.io/new-project/kotomark/demo/
説明：https://masahiro20.github.io/new-project/kotomark/
連絡先：{{CONTACT}}

ご興味がなければ、このまま流していただいて大丈夫です。今後の連絡が不要でしたら一言いただければ、以後お送りしません。

---

## 9. MangaGamer
- **窓口：** https://blog.mangagamer.org/contact-us/［確認］
- **使うテンプレート：** テンプレート2・英語版（短い文面）

Hello MangaGamer team, this is the Kotomark development team. MangaGamer has been bringing Japanese visual novels to English readers for years, and VN scripts are exactly where name and voice drift hurts most.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: https://masahiro20.github.io/new-project/kotomark/demo/
More: https://masahiro20.github.io/new-project/kotomark/
Contact: {{CONTACT}}

No worries if it's not a fit. Say the word and I won't message again.

---

## 10. JAST
- **窓口：** **要確認**：https://jastusa.com/contact（応答あり、中身は未読）
- **使うテンプレート：** テンプレート2・英語版（短い文面）

Hello JAST team, this is the Kotomark development team. JAST's long-running English releases of Japanese visual novels made me think your editors would have strong opinions on script-wide consistency checks.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: https://masahiro20.github.io/new-project/kotomark/demo/
More: https://masahiro20.github.io/new-project/kotomark/
Contact: {{CONTACT}}

No worries if it's not a fit. Say the word and I won't message again.

---

## 11. Fruitbat Factory
- **窓口：** **要確認**：公式サイト https://fruitbatfactory.com/ で窓口が見つからなかった
- **使うテンプレート：** テンプレート2・英語版（短い文面）
- **メモ：** 窓口が見つからなければ送らない。

Hello Fruitbat Factory team, this is the Kotomark development team. Fruitbat Factory's English releases of Japanese indie titles are the kind of small-team JA→EN work this tool is meant to help with.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: https://masahiro20.github.io/new-project/kotomark/demo/
More: https://masahiro20.github.io/new-project/kotomark/
Contact: {{CONTACT}}

No worries if it's not a fit. Say the word and I won't message again.

---

## 12. Ysbryd Games
- **窓口：** hello@ysbryd.net（公式サイトの Contact）［確認］
- **使うテンプレート：** テンプレート2・英語版（短い文面）

Hello Ysbryd Games team, this is the Kotomark development team. I'm reaching out because Ysbryd publishes indie titles across languages, and I'd like a small publisher's view on script consistency checks.

I'm prototyping Kotomark (working name): it checks a whole JA↔EN game script for term, katakana, name, honorific and voice drift, with file:line refs.

It's early and has false positives. Could you spend ~30 min running the browser demo on its sample or an NDA-safe excerpt and tell me which flags are wrong? Free, no payment involved.

The demo runs in your browser; nothing is uploaded.

Demo: https://masahiro20.github.io/new-project/kotomark/demo/
More: https://masahiro20.github.io/new-project/kotomark/
Contact: {{CONTACT}}

No worries if it's not a fit. Say the word and I won't message again.

---
