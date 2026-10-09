# 縦型ショート動画 3本 ── LEDGERBREAKER（帳簿破り）『帳簿の書 Vol.0』告知用

作成：P7 Anime 動画編集　2026-10-09
**投稿はオーナー本人が行います。** チームはアカウントを作らず、投稿もしません。広告費も払いません。
台本：`../shorts-scripts.md`（共通仕様・AI表示・規約メモ）／ハッシュタグ：`../x-posts.md` §4

## ファイル一覧

| ファイル | 長さ | 内容 | 元にした台本 |
|---|---|---|---|
| `short1-voice-taken.mp4` | 25.0秒 | 世界観のフック。払えない者は〈声〉を取り立てられる（Webtoon 第1話 p01〜p06） | #1「Your power is a loan」を Webtoon のコマ用に組み直し |
| `short2-im-not-paying.mp4` | 30.0秒 | 覚醒シーン。掴み → 契約停止 00:03 → 鎖 → 「払わねえよ。」 → 一撃 → ロゴカード（p29〜p38） | #2「Born owing infinity」の終盤を Webtoon のコマで再構成 |
| `short3-book-flip.mp4` | 20.0秒 | 『帳簿の書 Vol.0』をパラパラめくって見せる → 価格カード → 最終カード | #5「30 pages of debt」 |

共通仕様：1080×1920（9:16）、30fps、H.264（yuv420p, CRF 20, faststart）、**音声トラックなし**。音は各プラットフォームの公式ライブラリ（商用利用可）からオーナーが付けてください（市販曲・アニメ曲は使わない）。

- 冒頭1.5秒＝テキストフック。字幕は英語メイン＋小さめの日本語字幕。
- 文字は上250px・下400px・右150px の外に出しています（プラットフォームのボタン・説明文と重ならない位置）。
- 最終カード：「LEDGERBREAKER — Book of the Ledger Vol.0 / 帳簿の書 Vol.0」＋「LINK IN BIO / リンクはプロフィールから」＋小さく「Made with AI assistance / AI使用」。
- short3 の第1話脚本抜粋ページ（p25）は、台本の指示どおり**ぼかして読めない**ようにしています。
- 第1話より先のネタバレはありません（九条・ニルの正体・ケイの過去には触れていません）。

## 作り直し方

```
node anime/launch/shorts/build-shorts.js        # 3本すべて
node anime/launch/shorts/build-shorts.js 2      # 2本目だけ
node anime/launch/shorts/build-shorts.js 1 --at=0.6,10,23   # 静止画プレビューのみ（エンコードなし）
```
中間ファイル（コマのPNG・フレーム）は `$SHORTS_WORK`（未指定なら OS の一時フォルダ）に出力し、リポジトリには置きません。Google Fonts の読み込みにネット接続が必要です。字幕の文言・秒数は `build-shorts.js` の `short1()`〜`short3()` にまとめてあります。

---

## 1. `short1-voice-taken.mp4`（25秒）

### 画面のテキスト（英語のまま／日本語の意味）

| 秒 | 画面テキスト（EN） | 意味（JP） | 下の日本語字幕 |
|---|---|---|---|
| 0.0–1.5 | **IN THIS CITY, IF YOU CAN'T PAY, THEY TAKE YOUR VOICE.** | この街では、払えなければ声を奪われる。 | この街では、払えなければ〈声〉を取り立てられる。 |
| 1.5–3.3 | Midnight. Collection Day. | 午前0時。取立日。 | 午前0時。取立日。 |
| 3.3–5.0 | The bell tolls thirteen times. | 鐘が十三回鳴る。 | 取立日の鐘が、十三回。 |
| 5.0–6.8 | Every rank is public. | 格付けは全員に公開されている。 | 格付けは、全員に公開される。 |
| 6.8–8.5 | Can't pay? Hand over your collateral. | 払えない？ なら担保を差し出せ。 | 返済不能者は、担保を提出せよ。 |
| 8.5–11.5 | Every wrist shows what you owe. | 手首にはそれぞれの借金が表示される。 | 手首には、借金の残高。 |
| 11.5–13.3 | "Collateral: voice. Overdue." | 「担保：声。期日超過。」 | 「担保：〈声〉。期日超過。」 |
| 13.3–15.0 | "Executing." | 「執行する」 | 「執行する」 |
| 15.0–16.8 | They take it. | 取り立てられる。 | 取り立てられる。 |
| 16.8–18.5 | — and the sound is gone. | ——そして音が消える。 | ——音が、消えた。 |
| 18.5–21.5 | Nobody stops them. | 誰も止めない。 | 誰も、止めない。 |
| 21.5–25.0 | 最終カード：ONE KID REFUSES TO PAY. ＋ロゴ＋Book of the Ledger Vol.0＋LINK IN BIO＋Made with AI assistance | ひとりだけ、払わない少年がいる。／設定資料集はプロフィールのリンクから／AI使用 | ひとりだけ、払わない少年がいる。 |

### 説明欄（キャプション）
- EN（英語アカウント・英語圏向け）：
  `In this city, if you can't pay, they take your voice. LEDGERBREAKER — original series. Setting book in bio. #LEDGERBREAKER #worldbuilding`
  （意味：この街では、払えなければ声を奪われる。LEDGERBREAKER──オリジナル作品。設定資料集はプロフィールから。）
- JP：
  `払えなければ、声を取り立てられる街。オリジナル作品『LEDGERBREAKER／帳簿破り』第1話より。設定資料集はプロフィールから。#創作 #設定資料集`
- 説明欄の最後に共通文言（下の「AI表示」参照）を必ず付ける。

### ハッシュタグ（`x-posts.md` §4 より。1投稿2〜3個まで）
EN：`#LEDGERBREAKER` `#worldbuilding`　／　JP：`#創作` `#設定資料集`（`#LEDGERBREAKER` も可）

### 投稿メモ
- 3本の中で**最初に出す**のに向いています（世界のルールが1本でわかる）。発売前（Day −3〜−1）の予告にも使えます。発売前に出す場合は、最終カードが「LINK IN BIO」なので、プロフィールのリンク先を先に用意しておいてください。
- 音：冒頭に鐘ひとつ → 低いドローン。15.5秒の「ブツッ」でフラッシュとズームが入るので、そこで音を切る（無音にする）と効果的です。
- 固定コメントにストアURL（`{BOOTH_URL}`／`{KOFI_URL}`）。

---

## 2. `short2-im-not-paying.mp4`（30秒）

### 画面のテキスト

| 秒 | 画面テキスト（EN） | 意味（JP） | 下の日本語字幕 |
|---|---|---|---|
| 0.0–1.5 | **THEY CAME TO COLLECT. HE SAID NO.** | 取り立てに来た。彼は断った。 | 取り立てに来た。少年は、払わない。 |
| 1.5–4.0 | Rank ZERO. Balance: −∞. | 格付けZERO。残高 −∞。 | 格付けZERO。残高 −∞。 |
| 4.0–7.0 | "…That colour." | 「……その色は」 | 「……その色は」 |
| 7.0–9.8 | Collection chains from every side. | 四方から取立の鎖。 | 四方から、取立の鎖。 |
| 9.8–12.3 | The collector reaches for him — | 取立人の手が彼に伸びる—— | 取立人の手が、伸びる—— |
| 12.3–15.0 | He grabs back. | 彼は掴み返す。 | 掴み返した。 |
| 15.0–17.6 | CONTRACT SUSPENDED 00:03 | 契約停止 残り3秒 | 契約停止 00:03 |
| 17.6–19.0 | "Your borrowed power —" | 「お前の借り物——」 | 「お前の借り物——」 |
| 19.0–20.4 | "for three seconds, it's mine." | 「三秒だけ、俺のものだ。」 | 「三秒だけ、俺が差し押さえる。」 |
| 20.4–23.0 | **"I'M NOT PAYING."** | 「払わねえよ。」 | 「払わねえよ。」 |
| 23.0–25.0 | （文字なし。一撃のコマ「ドンッ」） | — | — |
| 25.0–26.6 | 00:00 — contract resumed. | 00:00──契約再開。 | 契約再開。 |
| 26.6–30.0 | ロゴカード：LEDGERBREAKER／帳簿破り＋Book of the Ledger Vol.0＋LINK IN BIO＋Made with AI assistance | 設定資料集はプロフィールのリンクから／AI使用 | 帳簿の書 Vol.0／リンクはプロフィールから |

### 説明欄
- EN：
  `One touch. Three seconds. "I'm not paying." Meet Akaba Jin, Rank ZERO. #originalcharacter #LEDGERBREAKER`
  （意味：触れて、3秒。「払わねえよ。」格付けZEROの少年、赤羽ジン。）
- JP：
  `触れて3秒、差し押さえる。格付けZEROの少年、赤羽ジン。「払わねえよ。」 #創作 #オリジナルキャラクター`
- 最後に共通のAI表示文言を付ける。

### ハッシュタグ
EN：`#LEDGERBREAKER` `#originalcharacter`（または `#worldbuilding`）　／　JP：`#創作` `#LEDGERBREAKER`
（`#オリジナルキャラクター` は shorts-scripts.md #2 のキャプションにあるタグです）

### 投稿メモ
- `x-posts.md` のスケジュールでは **Day +4 の「ショート動画1本目」がこの内容（主人公＋能力）** です。投稿後、X の JP-4／EN-4 にリプライでぶら下げてください。
- 音：13.3秒（掴む）・15.05秒（契約停止）・20.55秒（払わねえよ）・23.1秒（一撃）にズーム＋フラッシュが入ります。ここに「チン」（レジ音）や打撃音を合わせ、最後のロゴカードで鐘ひとつ。
- 最後のコマ（p38）は右上の「00:00 契約再開」だけを見せ、父親についての台詞は映していません。

---

## 3. `short3-book-flip.mp4`（20秒）

### 画面のテキスト

| 秒 | 画面テキスト（EN） | 意味（JP） | 下の日本語字幕 |
|---|---|---|---|
| 0.0–1.5 | **30 PAGES OF DEBT.**（表紙が叩きつけられる） | 借金だらけの30ページ。 | 借金だらけの30ページ。 |
| 1.5–2.3 | Book of the Ledger Vol.0 | 帳簿の書 Vol.0 | 設定資料集『帳簿の書 Vol.0』 |
| 2.3–3.5 | The city.（p5 断面図） | 都市。 | 都市。 |
| 3.5–4.7 | The Seven Lenders.（p7） | 七柱の貸主。 | 七柱の貸主。 |
| 4.7–5.9 | The rules.（p10 決闘のルール） | ルール。 | ルール。 |
| 5.9–7.1 | The power.（p13〈デフォルト〉図解） | 能力。 | 能力〈デフォルト〉。 |
| 7.1–10.3 | 8 characters.（p15 相関図 → p16 ジン → p17 ミオ → p20 ニル） | 8人のキャラクター。 | 主要8人。 |
| 10.3–11.3 | Episode 1.（p25 脚本抜粋・ぼかし） | 第1話。 | 第1話・脚本抜粋。 |
| 11.3–13.5 | A5 · 30 pages · PDF（p13 にズーム） | A5・30ページ・PDF | A5・30ページ・PDF |
| 13.5–16.6 | 価格カード：¥500 on BOOTH／$4 on Ko-fi／A5 · 30 pages · PDF | BOOTH（日本語版）500円／Ko-fi（英語版）4ドル | 日本語版・通常版／English edition |
| 16.6–20.0 | 最終カード＋「¥500 BOOTH · $4 Ko-fi」＋LINK IN BIO＋Made with AI assistance | リンクはプロフィールから／AI使用 | 帳簿の書 Vol.0／リンクはプロフィールから |

※ 中身のページは**英語版PDF**のページです。日本語アカウントで「日本語版のページを見せたい」場合は、`build-shorts.js` の `prepareBook()` の `vol0-en.pdf` を `vol0-ja.pdf` に替えて再出力できます（字幕はそのまま）。

### 説明欄（shorts-scripts.md #5 のキャプション）
- EN：
  `Book of the Ledger Vol.0 — the LEDGERBREAKER setting book. PDF, 30 pages, $4. Link in bio. Made with AI assistance.`
  （意味：『帳簿の書 Vol.0』──LEDGERBREAKER の設定資料集。PDF・30ページ・4ドル。リンクはプロフィールから。AI使用。）
- JP：
  `『LEDGERBREAKER 帳簿の書 Vol.0』設定資料集PDF・30ページ・500円。リンクはプロフィールから。AI使用・作者監修。`
- 最後に共通のAI表示文言を付ける。

### ハッシュタグ
EN：`#LEDGERBREAKER` `#worldbuilding`　／　JP：`#設定資料集` `#創作`（発売日に出す場合のみ `#BOOTH` も可）

### 投稿メモ
- 「買える物がある」と見せる直販用。**Day 0〜+7** に投稿（shorts-scripts.md #5 の指定）。
- 価格は BOOTH 通常版の500円を表示しています。応援版（1,000円）は動画には入れていないので、必要なら説明欄で補足してください。
- 音：表紙の瞬間に本を閉じる音、ページごとにめくる音、価格カードで鐘。

---

## AI表示（全3本共通・必ず行う）

shorts-scripts.md の方針をそのまま適用します。

1. **動画内**：最終カードに小さく「Made with AI assistance / AI使用」を入れてあります（消さないでください）。
2. **説明欄の末尾（共通文言）**：
   `Original series project. Visuals & text made with AI assistance, edited by the creator. / 本作はオリジナル企画です。画像・文章はAIを用いて制作し、作者が編集・監修しています。`
   AI音声（TTS）でナレーションを付けた場合は「音声：AI」を足す。
3. **YouTube**：アップロード画面の「改変または合成されたコンテンツ（altered or synthetic content）」の質問。本作の映像はアニメ調で写実的ではないため、通常は申告対象の「写実的」には当たりにくいとされていますが、**方針は「迷ったら申告」**です。AI音声を使った場合は特に申告してください。2026年5月に「AI content labeling」への名称変更・EU AI法対応の更新があったと報じられていますが、アニメ調コンテンツの扱いの詳細は**未確認（要確認）**です。
4. **YouTube の「inauthentic content」**：3本は内容が違う（世界観／主人公の覚醒／商品紹介）ので問題ありませんが、同じ映像で冒頭テキストだけ変えた版を大量に出さないでください（A/B テストは1フックにつき2〜3版まで）。
5. **TikTok / Instagram**：投稿画面に「AI生成コンテンツ」のトグルがあれば**オンにする**。条件は公式ページで**要確認**。
6. 「手描き」「公式」「アニメ化決定」「AI不使用」とは書かない。既存作品名をタグや本文に入れない。

出典は `../shorts-scripts.md` の「プラットフォーム規約メモ」を参照（2026-10-08 確認）。

## 投稿前チェックリスト
- [ ] 公式ライブラリの音を付けた（市販曲・アニメ曲ではない）
- [ ] 説明欄に共通のAI表示文言を入れた
- [ ] YouTube の改変・合成コンテンツの質問に回答した／TikTok・Instagram の AI ラベルをオンにした
- [ ] プロフィールのリンクと固定コメントのURL（`{BOOTH_URL}`／`{KOFI_URL}`）を差し替えた
- [ ] ハッシュタグは2〜3個まで、他作品名なし
