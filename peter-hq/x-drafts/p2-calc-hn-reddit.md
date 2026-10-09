# P2 Model Switch Calculator　HN・Reddit の投稿の下書き

**最新版は `p2-calc-launch-ready.md`（b12 承認分）。** こちらは元の下書き。

作成：Midas（2026-10-09）　状態：**下書き。オーナーの承認前は投稿しない。** 投稿はオーナー自身の HN・Reddit のアカウントで行う。
ページ：https://masahiro20.github.io/new-project/calc/ （公開中。2026-10-09 に確認。計算機 v2 の Gemini の価格と共有リンクに合わせて更新）
**投稿の本文は英語のまま**（海外の開発者向け）。説明はすべて日本語。

## ページで実際にできること（すべて公開中のページで確認した内容）
- Anthropic か OpenAI の利用データ（CSV か JSON）を貼るか、ファイルを置く。同じ使い方を、今の Claude・GPT・Gemini の各モデルで続けたら月いくらになるかを、横に並べて表示する。
- 定価は 2026-10-09 に、各社（Anthropic、OpenAI、Google）の公式の価格ページで確認したもの。確認できていない価格は合計に入れず、自分で価格を入れることもできる。
- **すべてブラウザの中で動く。** ページを開いた後は通信しない。アップロードも追跡も登録もない。
- キャッシュの扱い：
  - キャッシュの書き込みと読み出しを、別々の価格で計算する。
  - 「キャッシュのヒット率を保つ」の切り替えで、乗り換え先でのキャッシュの価格を変えられる。
  - 30日分に換算できる。
- 結果は、Markdown か CSV でコピーできる。共有リンクも作れる。
  - リンクに入るのは設定と合計のトークン数だけで、貼ったデータの行は入らない。
  - ただし利用量の大きさは分かってしまう。ページにもそう書いてある。
  - サンプルデータは Anthropic 用と OpenAI 用がある。
- Gemini の利用データを直接読む機能はない。Gemini の分は、簡単な CSV の形で入れる。Gemini Flash の価格は 2026-12-31 までのキャンペーン価格（ページに記載）。
- ページに書いてある注意：
  - 会社ごとにトークンの数え方が違うので、会社をまたぐ比較は概算。
  - 価格は標準の料金。まとめて処理する割引（Batch）、長い文章の割増、地域ごとの価格は含めていない。

## 守るルール
| 場所 | ルール | 確認 |
|---|---|---|
| Show HN | 題名は「Show HN」で始める。登録やメールアドレスなしで、すぐ試せるものに限る。作った本人が投稿し、質問に答えられること。LP、登録ページ、「急いで作った一回きりのもの」は対象外。**知人に投票やコメントを頼まない。** 最初のコメントで、なぜ・どう作ったかを説明する | ［公式］https://news.ycombinator.com/showhn.html |
| r/SideProject | 第三者の解説では、自作の紹介を最も受け入れる板の一つ。経緯や背景を書くこと。リンクだけの投稿は消される | ［二次］https://www.indiehackers.com/post/what-subreddits-have-you-found-that-actually-allow-and-encourage-self-promotion-864d4da1cd ／今のルール欄は［未確認］ |
| r/ClaudeAI | モデレーターの投稿（2026年4月）によると、作ったものは **Project Showcase のまとめスレッド**に出す。通常の投稿として出すには、Reddit での評価の点数（カルマ）が合計50以上必要。「ルール7」の本文は読めなかった | ［二次］https://redlib.groet-infra.nl/r/ClaudeAI/comments/1sly3jm/built_with_claude_project_showcase_megathread/oo1qqsm/?context=3 ／ルール7は［未確認］ |
| r/OpenAI、r/LLMDevs | 確認できていない。この環境から Reddit を読めなかった | **［未確認］**。投稿の前にルール欄を読むか、使わない |

**Show HN の注意**
- HN は「急いで作った一回きりのもの」を対象外にしている。
- 計算機は小さいが、中身はある。4つの形式の利用データを読み、キャッシュを考えた費用を計算し、価格の出典も示している。
- 最初のコメントは「公開しました」ではなく、この作りの話から始める。
- オーナーが Show HN には薄いと感じたら、先に r/SideProject に出し、HN は Budget Guard のときに取っておく。

## 出す順番と時刻（日本時間）
| 日 | 場所 | 時刻 | 理由 |
|---|---|---|---|
| 1 | Show HN | 火〜木の 22:00〜23:00（米国東部の朝8〜10時） | 米国の朝に読まれる。3時間は質問に答えられるようにしておく |
| 3 | r/SideProject | 23:00 | 読む人が違う。HN と同じ日には出さない |
| 5 | r/ClaudeAI の Project Showcase まとめスレッド（コメントとして） | 23:00 | まとめスレッドならカルマの条件がかからない |
| — | r/OpenAI、r/LLMDevs | ルールを読んでから | 任意 |

1か所に1回だけ。同じ日に複数の場所へ出さない。質問にはすべて答える。

---

## 1. Show HN（英語）

> **注意（2026-10-09 追記）**：Hacker News のガイドラインは「生成された文を投稿に入れない」「生成・AI で手直しした文をコメントに書かない」と定めている（https://news.ycombinator.com/newsguidelines.html）。**この文書の HN 用の英文はそのまま貼らない。** オーナーが自分の言葉で書くための参考にとどめる。


**題名**（76字。上限80字）
```
Show HN: Model Switch Calculator – price your LLM usage on every other model
```

**URL：** https://masahiro20.github.io/new-project/calc/

**最初のコメント（オーナーが書く）**
```
Hi HN. I built this after watching our own API bills and asking a simple question every time a cheaper model shipped: if we moved all of this traffic, what would the month actually cost?

The pricing pages answer per-token questions, but real usage is a mix of input, output, cache writes and cache reads, and that mix changes the answer a lot. So the calculator takes the usage export you already have (Anthropic Console CSV, Anthropic Admin API JSON, OpenAI usage CSV/JSON, or a plain date,model,tokens CSV) and reprices the whole bundle on each current Claude, GPT and Gemini model.

A few details:
- It runs entirely in your browser. After the page loads it makes no network requests, so your usage data stays on your machine.
- Cache tokens are priced separately, with a toggle for whether your cache hit ratio carries over to the target model.
- Prices were checked against the official pages on 2026-10-09. Anything I couldn't verify is left out of totals; you can type in your own number.
- You can share a link to your results. It carries only the settings and aggregate token totals (in the URL fragment, so it isn't sent to a server), not your rows.
- Cross-provider numbers are estimates because tokenizers differ. Same-provider comparisons are tighter.

There's sample data if you don't want to paste your own. I'd love to hear where the numbers look wrong for your workload, or which export format I'm missing.
```

## 2. r/SideProject（英語）

**題名**
```
I made a free, browser-only calculator that reprices your real LLM usage on every Claude, GPT and Gemini model
```

**本文**
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

## 3. r/ClaudeAI：Project Showcase まとめスレッドへのコメント（英語）
```
**Model Switch Calculator** — https://masahiro20.github.io/new-project/calc/

What it does: paste your Anthropic Console usage CSV or Admin API usage JSON, and it shows what the same traffic would cost per month on each current Claude model (and GPT or Gemini models, if you're comparing). Cache writes and cache reads are priced separately, with a toggle for keeping your cache hit ratio on the new model.

How it's built: one static page, no backend. It makes no network requests after it loads, so usage data stays in your browser. I built it with Claude Code. Prices were checked against the official pricing pages on 2026-10-09, and unverified prices are left out of totals.

Free, no sign-up. Feedback on the cost model is very welcome, especially from anyone using 1-hour cache writes.
```

## 承認の前に
- [ ] HN と Reddit はオーナー自身のアカウント。作ったばかりのアカウントは制限されることが多いので、以前からあるアカウントの方がよい。
- [ ] 投稿する日に、価格の表を公式ページともう一度照らし合わせる。変わっていたら、先にページを直す。
- [ ] 各サブレディットの今のルール欄を読む。ルール上だめな場所には出さない。
- [ ] 誰にも投票を頼まない（HN のルール）。
- [ ] Budget Guard には、わざと触れていない。ページの中に Budget Guard へのリンクがある。
