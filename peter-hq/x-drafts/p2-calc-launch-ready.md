# P2 計算機（Model Switch Calculator）の紹介：投稿の準備（b12 承認分）

作成：Midas（2026-10-09）　対象：オーナー（投稿はオーナー自身のアカウントで）
ページ：https://masahiro20.github.io/new-project/calc/ （2026-10-09 に開けること、価格の確認日が 2026-10-09 であることを確認）

## 最初に大事なこと：Hacker News は「AI が書いた文」を禁止しています
- HN のガイドライン（公式）には、次の3つがはっきり書かれています。
  - 「生成された文を HN の投稿に入れないでください」
  - 「生成された文や AI で手直しした文をコメントに書かないでください」
  - 「投稿を自動化しないでください」
  - 出典：https://news.ycombinator.com/newsguidelines.html
- そのため、**HN の題名と最初のコメントは、オーナーが自分で書いてください。** 私が書いた英文をそのまま貼ると、ルール違反になります。
- 下に、**書く材料**（事実の箇条書き、話の順番、来そうな質問とその答えの要点）を用意しました。英語はつたなくても大丈夫です。HN では、作った本人の言葉の方が信頼されます。
- Reddit（r/SideProject）は、AI が書いた文を禁止する規則を確認できていません。それでも同じ理由で、**自分の言葉に直してから**出すことをおすすめします。参考の英文は付けておきます。

> つまり、本部の依頼「貼るだけの完成版」は、HN についてはルール上お渡しできません。代わりに、10〜15分で書ける材料にしました。

---

## 1. 出すところと日時（日本時間）
| 順 | 場所 | 推奨日時（JST） | 理由 |
|---|---|---|---|
| 1 | **Hacker News（Show HN）** | **10/14（水）22:30** | 米国東部の水曜朝9:30。読む人が多い時間。10/13（火）の夜は P8 の公開と重なるので避けた。**投稿後3時間は返信できるようにしておく** |
| 2 | **Reddit r/SideProject** | **10/16（金）23:00** | HN と同じ日に出さない。自作の紹介を受け入れる板（第三者の解説による。今のルール欄は投稿前に確認） |

**同じ日に両方へ出さない。** 知人に投票やコメントを頼まない（HN の禁止事項）。

---

## 2. Hacker News（Show HN）

### 2-1. 投稿のしかた
1. https://news.ycombinator.com/submit を開く（ログインが必要）。
2. **title**：「Show HN: 」で始めて、80字以内で、何ができるかを書く。
   - 書き方の例（あくまで形の見本です。自分の言葉で）：`Show HN: <名前> – <何ができるか>`
   - 入れたい要素：利用データを貼ると、他のモデルでの月額が分かる。
3. **url**：`https://masahiro20.github.io/new-project/calc/`
4. **text**：空欄のまま。説明は、投稿した直後に**自分の投稿へのコメント**として書く（Show HN の慣習）。

### 2-2. 最初のコメントに書く材料（事実だけ。この順で書くと伝わりやすい）
1. **なぜ作ったか**（1〜2文）：安いモデルが出るたびに「全部乗り換えたら月いくらか」を表計算でやり直していた。
2. **何をするか**：手元にある利用データ（Anthropic の Console の CSV か Admin API の JSON、OpenAI の利用データの CSV か JSON、または「日付・モデル・トークン数」だけの簡単な CSV）を貼ると、同じ使い方を今の Claude・GPT・Gemini の各モデルで続けた場合の月額を並べて出す。
3. **こだわった点**（2〜3個に絞る）
   - すべてブラウザの中で動く。ページを開いた後は通信しないので、利用データが外に出ない。
   - キャッシュの書き込みと読み出しを別々に計算する。乗り換え先でキャッシュのヒット率が保てるかを切り替えられる。
   - 価格は 2026-10-09 に各社の公式ページで確認。確認できない価格は合計に入れない。
4. **正直な注意**
   - 会社ごとにトークンの数え方が違うので、会社をまたぐ比較は概算。
   - 価格は標準料金で、まとめて処理する割引（Batch）や、長い文章の割増は入れていない。
5. **お願い**：自分の使い方で数字がおかしい所や、読めない利用データの形式があれば教えてほしい。
6. （任意）AI の手伝いで作ったかどうかを聞かれたら、正直に答える。

### 2-3. 最初の1時間に来そうな質問と、答えの要点
| 来そうな質問 | 答えの要点（事実。自分の言葉で） |
|---|---|
| トークナイザーが違うのに、比較の意味はある？ | ある程度の目安。同じ会社のモデル同士は精度が高く、会社をまたぐと概算。ページにも書いてある |
| データは本当に送られない？ | ページを開いた後は通信しない。ブラウザの開発者ツールのネットワークの欄で確かめられる。共有リンクにも行のデータは入らず、合計と設定だけ（ただし利用量の大きさは分かる） |
| Batch や長い文章の価格は？ | 入れていない。標準料金だけ。必要ならどれを足すべきか教えてほしい |
| Gemini の利用データは読める？ | 専用の読み込みはない。「日付・モデル・トークン数」の簡単な CSV で入れられる |
| 価格は誰がどうやって更新する？ | 公式の価格ページで確認した日付と出典を各行に載せている。確認できないものは「未確認」で、合計に入れない |
| Bedrock や Vertex、OpenRouter 経由の価格は？ | 今は対象外（標準の公式料金のみ）。要望が多ければ検討 |
| キャッシュの1時間の書き込みは？ | Anthropic の1時間の書き込みは入力の2倍の価格。計算は5分の書き込みの価格を使っていて、ページに注記がある |
| 何で稼ぐの？ | 計算機は無料のまま。別に、利用額の上限と停止の道具（Budget Guard）を作っていて、ページの中にリンクがある。聞かれたときだけ答える |

**やってはいけないこと**：投票のお願い、別アカウントでのコメント、AI に書かせた返信。

---

## 3. Reddit r/SideProject

### 3-1. 投稿のしかた
1. 投稿の前に、r/SideProject のルール欄（サイドバー）を読む。自作の紹介が今もできるか、決まった曜日のスレッドに限られていないかを確かめる。
2. 「Create Post」で、題名と本文を入れる。リンクは本文の中に書く。
3. 参考の英文（**自分の言葉に直してから**）：

**題名（参考）**
```
I made a free, browser-only calculator that reprices your real LLM usage on every Claude, GPT and Gemini model
```

**本文（参考）**
```
Every time a cheaper model comes out I end up doing the same spreadsheet: take last month's usage, split it into input, output and cache tokens, and multiply by a new price list. So I turned it into a page.

You paste your Anthropic or OpenAI usage export (CSV or JSON, or drop the file), and it shows what the same traffic would cost per month on each current Claude, GPT and Gemini model, side by side. You can copy the table as Markdown or CSV, or share a link that holds only the totals.

Things I cared about:
- Nothing leaves your browser. No sign-up, no uploads, no tracking.
- Cache writes and reads are priced separately, because that's where most "switch and save" estimates go wrong.
- Every price shows where it came from and when it was checked (2026-10-09). Unverified prices are left out unless you type one in.

It's free. There's sample data if you just want to see how it works:
https://masahiro20.github.io/new-project/calc/

What I'm unsure about: cross-provider comparisons are estimates because tokenizers differ. If you have a good way to handle that, I'm all ears.
```

### 3-2. 来そうな質問
HN の 2-3 と同じ。加えて、Reddit では次の質問が来やすい。
- 「なぜ作った？」→ 2-2 の1。
- 「オープンソース？」→ 事実どおりに答える。今は公開リポジトリの一部で、専用のリポジトリは未作成。

---

## 4. 投稿した後にやること
- 投稿の URL を本部に送る。週報の「計算機の訪問」と、反応の記録に使う。
- 不具合の報告が来たら、本部経由で Vega に送る。直したら、そのスレッドで一言お知らせする。
- 削除やモデレーターの注意が来たら、その場所での投稿はやめて、本部に知らせる。
