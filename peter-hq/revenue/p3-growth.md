# P3 Pitch（日本語のアクセント練習）　集客計画・無料ベータの告知・有料化の基準

作成：Midas（2026-10-09）　状態：**計画と下書き。投稿はしない**（投稿はオーナーのアカウントで、承認後に）

元にしたもの（`peter/p3-pitch`、`b75bd49` 時点）：
- `pitch/docs/lp.md`（英語の LP。無料ベータ、価格は載せない）
- `pitch/docs/eval-plan.md`、`pitch/docs/eval-results.md`
- `pitch/docs/decisions.md`
- 本部の `peter-hq/projects/p3-pitch/stage1-report.md`

URL：無料ベータは公開済み。告知では説明ページ https://masahiro20.github.io/new-project/pitch/ を使う（ページから「./app/」のアプリへ進む。アプリは https://masahiro20.github.io/new-project/pitch/app/ 。2026-10-09 に開けることを確認）

## 0. 先に決めておくこと（重要）
1. **人の声での精度がまだ測れていない。**
   - 合成音声では合格率 98〜99%。ただし `eval-results.md` 自身が「実際の声より条件が良いので、上限の目安」と書いている。
   - 人の声の検証は、Wikimedia の制限で1件しか取れず中断している。
   - **告知では精度の数字を一切出さない。** 「ベータで、判定はまだ調整中」と正直に書く（LP と同じ方針）。
2. **このコミュニティは「AI が書いた文」を嫌う。**
   - r/languagelearning は、AI で書いた投稿・返信・許可申請を禁止している。「AI が中核の機能」のアプリも禁止。
   - Pitch の中核は AI ではなく音の高さの解析なので、アプリは当てはまらない。
   - ただし**下の告知文は AI（Midas）が書いた下書き**。**オーナーが自分の言葉で書き直してから投稿する**ことを条件にする。そのまま貼らない。
3. **オーナー自身が日本語のネイティブであることが、最大の信頼材料。**
   - 「日本人の開発者が、学習者のために作った」は事実で、強い。
   - オーナーとご家族の声で、人の声の検証を始められる（お金がかからない）。告知より先にやる価値がある（§4 の条件1）。

## 1. コミュニティと投稿ルール
| # | 場所 | 規模・向き | 自作の紹介のルール | 確認 |
|---|---|---|---|---|
| 1 | **r/LearnJapanese** | 登録約73万人（P3 ステージ1の調査） | **毎週水曜の「Material Recs and Self-Promo」スレッドでだけ**紹介できる。水曜のスレッドで反応が良ければ、モデレーターに1回だけ単独の投稿を頼める。かな表だけのアプリは不可。学習者に何ができるかを書く | ［二次］https://alexanderweichart.de/5_Archive/3_Resources/iOS-App-Launch-List 、スレッドの例 https://reddit.rtrace.io/r/LearnJapanese/comments/1csk870/weekly_thread_material_recs_and_selfpromo ／サイドバーの現行ルールは［未確認］ |
| 2 | **r/languagelearning** | 言語学習全般 | 毎月4日に立つ「Share Your Resources」スレッドだけ（約2週間）。自作かどうかを明記。それ以外の場所はモデレーターの許可が必要で、題名に `(self-promotion)` を付けないと即 BAN。商用の製品は**複数の言語に対応していること**が条件で、日本語だけの Pitch は単独の投稿には当てはまらない。**AI で書いた文は禁止**。6か月以内の再投稿は不可 | ［確認（ミラー経由）］https://redlib.groet-infra.nl/r/languagelearning/wiki/rules_for_promotion/ |
| 3 | **WaniKani コミュニティ（公式フォーラム）** | 日本語学習者が多い | 自作ツールの紹介に関する公式ルールの本文は見つからなかった。ルール違反は、まず非公開の警告、続くと投稿停止。第三者のガイドは、適切なカテゴリに、役に立つ資料として、自作だと明かして出すよう勧めている | ［二次］https://community.wanikani.com/t/welcome-to-the-wanikani-community-please-read-this-first-%E2%9C%A8/8 ／紹介のルールは［未確認］ |
| 4 | **Bunpro コミュニティ** | 文法学習の利用者 | 紹介のルールの本文は見つからなかった。Bunpro の素材を使う道具については「まず管理者に DM を」という回答がある。Pitch は Bunpro の素材を使わないが、**投稿の前に管理者に聞く** | ［二次］https://community.bunpro.jp/t/how-are-the-materials-on-bunpro-licensed/166870 |
| 5 | **Discord：TheMoeWay、Refold Japanese** | 没入学習の熱心な層。ピッチアクセントへの関心が高い | 各サーバーのルールは確認できなかった。宣伝用のチャンネルがあるか、**モデレーターに許可を取ってから** | ［未確認］ |
| 6 | **YouTube** | 「Japanese is flat」325万回再生（ステージ1の調査）など、関心は大きい | 他人の動画のコメント欄で宣伝しない（スパム）。**自分で短い実演動画を出す**（「はしが」を言い分ける30秒など）。音声は自分の声で | 方針 |
| 7 | **Show HN** | 開発者。技術（ブラウザ内での音高の解析、ONNX、PWA）に関心 | 公式ルール：登録なしで試せること。作った本人が説明すること。友人に投票を頼まない | ［確認］https://news.ycombinator.com/showhn.html |

**載せないもの**
- Dogen など、個人の講師・制作者への売り込み。
- italki の講師への直接の連絡（ステージ1の候補だったが、個人への連絡になるため外す）。
- 講師向けの案内は、有料化の後に、公式の提携窓口がある場所だけで考える。

## 2. 無料ベータの告知文案（5本）
**共通**
- オーナーが自分の言葉で書き直してから出す（§0-2）。
- 精度の数字は書かない。録音は端末の外に出ないこと、無料であること、作った人が日本語のネイティブであることを書く。
- 使える機能は `decisions.md` と LP にあるものだけ：
  - 「単語＋が」の判定（モーラごと）
  - 4つのアクセント型
  - 最小対の練習（箸・橋・端 など）
  - 結果の共有カード
  - Anki への書き出し
  - オフラインで使える PWA

### 2-1. r/LearnJapanese 水曜スレッドへのコメント（英語）
```
I made a free browser tool that checks your pitch accent from your own voice, and I'd love feedback from people here.

You pick a word and say it with が (はしが, さくらが). It splits your recording into morae, lays your pitch over the dictionary pattern, and tells you whether the drop landed in the right place: too early, too late, never dropped, or shouldn't have dropped.

Some details:
- About 2,000 everyday nouns, all four accent types, standard Tokyo accent from UniDic.
- A minimal-pair drill (箸・橋・端, 雨・飴, 神・紙・髪).
- Your voice is analysed in the browser. Recordings never leave your device.
- You can export the words you missed to Anki.

I'm a native Japanese speaker, and it's an early beta. The judging is still being tuned, so if it marks you wrong when you're sure you said it right, that's exactly what I want to hear about.

https://masahiro20.github.io/new-project/pitch/
```

### 2-2. r/languagelearning 月次スレッド「Share Your Resources」（英語。規則どおり「自作」と明記）
```
[I made this] Pitch: a free, browser-only pitch accent checker for Japanese

Who it's for: intermediate and advanced Japanese learners (around N3–N1) who want feedback on their own pronunciation, not just the dictionary pattern.

What it does: you say a word followed by が, and it shows your pitch on each mora against the standard Tokyo pattern and tells you where the drop should be. There's a minimal-pair drill and Anki export.

Free, no sign-up. Audio is processed on your device. It's an early beta, and I'm still tuning the judging.

https://masahiro20.github.io/new-project/pitch/
```

### 2-3. WaniKani / Bunpro のフォーラム（英語。**投稿前にカテゴリと管理者の了承を確認**）
```
Title: Free beta: a pitch accent checker that listens to your own voice

Hi all. I'm a native Japanese speaker and I've built a small browser tool for practising pitch accent, and I'm looking for learners to try it and tell me where it gets things wrong.

How it works: pick a word, say it with が, and it shows your pitch mora by mora against the dictionary pattern (heiban, atamadaka, nakadaka, odaka) and tells you if the drop is in the right place. There's also a minimal-pair drill, a result card you can save, and an Anki export for the words you missed.

It runs in your browser, works offline once installed, and your recordings never leave your device. It's free while in beta.

The judging is still being tuned, especially for quiet or creaky voices. If you try it, I'd love to hear which words it judged wrongly.

https://masahiro20.github.io/new-project/pitch/
```

### 2-4. Show HN（英語。題名69字、上限80字）
```
Show HN: Pitch – check your Japanese pitch accent from your own voice
```
最初のコメント：
```
I'm a native Japanese speaker, and I built this for learners who can read and write well but still get told their pronunciation sounds "off". Most of that is pitch accent: 箸 (chopsticks) and 橋 (bridge) are both はし, and only the pitch tells them apart.

Pitch asks you to say a word followed by が, because the particle is what separates flat words from tail-high ones. It tracks your pitch in the browser (pitchy, or SwiftF0 via ONNX Runtime Web), segments the recording into morae, and compares where your pitch drops with the UniDic accent type.

Everything runs on-device, so recordings never leave the browser, and it works offline as a PWA. The accent data is UniDic (BSD) and all the libraries are permissively licensed.

It's a beta. On synthetic speech the segmentation works well, but I haven't finished validating on real voices, so I'm not quoting accuracy numbers yet. Reports of wrong judgements are the most useful feedback.

https://masahiro20.github.io/new-project/pitch/
```

### 2-5. X（日本語。オーナーのアカウントから。日本の日本語教師・学習者向け）
```
日本語学習者向けのアクセント練習ツールを作りました（無料ベータ）。

「はしが」のように言うと、声の高さをモーラごとに示し、下がる位置が合っているかを判定します。録音は端末の外に出ません。

判定は調整中です。ご意見をお待ちしています。
https://masahiro20.github.io/new-project/pitch/
```
（文字数：X の数え方で280以内を確認。URL は23として計算）

**出す順番**
| 順 | 場所 | いつ |
|---|---|---|
| 1 | r/LearnJapanese 水曜スレッド | ベータの公開後、最初の水曜。反応を見る |
| 2 | X（日本語） | 1の翌日 |
| 3 | WaniKani・Bunpro のフォーラム | 管理者の了承が取れたら |
| 4 | r/languagelearning の月次スレッド | 次の4日（スレッドが立っている間） |
| 5 | Show HN | 1〜4で直した後。技術の話として |
| 6 | r/LearnJapanese の単独の投稿 | 水曜スレッドの反応が良ければ、モデレーターに1回だけ頼む |

## 3. 数字（ベータ中に測るもの）
| 指標 | 目安（4週） | 取り方 |
|---|---|---|
| ベータの利用者（判定を1回以上した人） | 200人 | Cookie を使わないアクセス解析。判定の完了をイベントで数える（P0 と同じ方式） |
| 2週目にも使った人の割合 | 20%以上 | 同上。端末の中の記録だけで、個人は特定しない |
| 「間違って合格・不合格にされた」という報告 | 件数と内容を記録 | フィードバックの窓口（フォームかメール） |
| 有料になっても使いたい人 | 50人（メールの登録） | 有料化の案内の登録。**メールアドレスを集めるには、オーナーの承認とプライバシーポリシーの更新が必要** |

## 4. 有料化の判断基準
**次の3つがすべてそろったら、有料版を出す。**

| # | 条件 | 基準 | 根拠 |
|---|---|---|---|
| 1 | **人の声で精度を確かめた** | ネイティブ4人以上（女性2・男性2以上）。正しい発音の合格率90%以上、わざと違う型で言った発音の誤合格率5%以下、判定不能5%以下。いずれも信頼区間つきで公表する | `eval-plan.md` の基準そのまま。**誤合格（間違っているのに褒める）は信頼を最も損なうので、ここが最優先** |
| 2 | **使い続ける人がいる** | ベータの利用者200人のうち、2週目にも使った人が20%以上 | 一度試して終わる道具に、月額は払われない［仮置き］ |
| 3 | **払う意思がある** | 有料化の案内に50人以上が登録、または「払う」と答えた人が利用者の10%以上 | 有料化の前に、需要を数で確かめる［仮置き］ |

**価格の案**（ステージ1の案。最終決定はオーナー）
- 月 $9／年 $69／買い切り $149。最初は「年 $69」を前に出す。
- **ベータの協力者には、最初の1年を割引する**（例：年 $49）。協力へのお礼で、登録の動機にもなる。
- 比べるもの：Migaku Pitch Trainer 月 $5、Dogen 月 $10〜15、Aomi 月 $2.99〜（ステージ1の調査）。
  - **自分の声の判定**と**ネイティブの開発者**が差別化になる。
  - ただし、条件1の数字が出る前に、この値付けは正当化できない。
- 課金の仕組み：ブラウザ版なら Stripe（P0・P2 と同じアカウント）。アプリストアは使わない（年 $99 などの費用がかかるため）。

**撤退・方向転換の基準**（本部のステージゲートに合わせた）
- ベータの公開から30日で利用者が50人未満：告知の切り口を変える。
- 60日で条件2に届かない：機能を絞り直す（最小対の練習に集中する、など）。
- 90日で有料化できない：資源を他のプロジェクトに回す。

## 5. オーナーに頼むこと（P3 を動かすとき）
| # | 内容 | 種類 |
|---|---|---|
| 1 | **オーナーとご家族の声で、人の声の検証を始める**（録音の手順は `eval-plan.md`。費用0円） | 協力 |
| 2 | 無料ベータの公開の承認（GitHub Pages など、無料の置き場所） | 外部公開 |
| 3 | 告知文を自分の言葉に書き直して投稿する。Reddit・フォーラムのアカウント | 外部公開・アカウント |
| 4 | 有料化の案内でメールアドレスを集めるかどうか（集めるならプライバシーポリシーを更新） | 法務 |

**ダッシュボード上の P3 は「保留（30日後に再判断）」のまま。**
- 1 の検証で条件1の見通しが立ったら、優先度を上げることを提案する。
- それまでは、告知文の準備まで（この文書）で止める。
