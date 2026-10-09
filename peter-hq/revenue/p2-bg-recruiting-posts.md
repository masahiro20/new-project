# P2 Budget Guard　外部試用者5人の募集の文面

作成：Midas（2026-10-09、本部の指示で Vega から引き継ぎ）　状態：**下書き。送信・投稿しない**
元にしたもの：Vega の募集手順書 `signal-lab/budget-guard/docs/user-recruiting-plan.md`（`peter/p2-signal-lab`）。**ルール・安全策・上限・プライバシーはすべて手順書に従う。**この文書は、手順書の §5（EN-1〜3、JA-1〜3）を補う文面だけを足す。

**手順書と同じルール（再掲）**
- 1人に1回。フォローは7日後に1回だけ。
- 新しい連絡は1日5通まで（1つのコミュニティで2通まで）。公開投稿は1つのコミュニティで週1回まで。
- 「初期の試作品」「管理者権限のキーが必要」「停止はテストモードから始まる」「デモトークンで試せる」を必ず書く。
- **キーは絶対に送ってもらわない。**
- 割引や報酬で釣らない。価格は通話で「案」として伝えるだけ（本部の承認事項）。
- 苦情・削除・モデレーターの注意が1件でもあったら、その日の連絡を全部止める。
- 候補者の管理表はリポジトリにコミットしない。**この文書にも個人は書かない。**

**プレースホルダー**
| 置き換えるもの | 中身 | 状態 |
|---|---|---|
| `{{BG_URL}}` | 外部の人が試せる環境の URL | 手順書 §10 の最後の項目（試す環境）が未決。Cloudflare Workers（無料プラン）で動くことは確認済み（`2122c0e`）。デプロイはオーナーが行う |
| `{{CONTACT}}` | 返信を受ける連絡先 | オーナーが決める |
| `{{SENDER_NAME}}` | 送信者として表示する名前 | オーナーが決める |

---

## 1. 出来事ごとの書き出し（手順書の EN-2・JA-2 の1文目の差し替え用）
手順書の候補者は、stage1 の公開スレッドから探す。スレッドごとの「相手の投稿を具体的に1つ引く」1文を先に用意した。**相手の投稿を読んで、本人の体験だと確かめてから使う**（手順書 §3）。

| スレッド（stage1） | 出来事 | EN の1文目 | JA の1文目 |
|---|---|---|---|
| https://news.ycombinator.com/item?id=49950441 | AI クローラーで $4,000 の請求 | I read your comment about the $4,000 bill from AI crawlers ({link}), and the part about only finding out afterwards stuck with me. | AI クローラーで4,000ドルの請求が来た件のコメント（{リンク}）を拝見しました。後から気づくしかなかった、という点が印象に残っています。 |
| https://news.ycombinator.com/item?id=49732873 | ボットで Vercel の請求が10倍 | I read your post about the bot traffic that multiplied your Vercel bill ({link}). | ボットのアクセスで Vercel の請求が何倍にもなった件の投稿（{リンク}）を拝見しました。 |
| https://news.ycombinator.com/item?id=49949235 | 既定のハード上限を求める議論 | I saw your comment in the thread asking for default hard budget caps ({link}). | 既定でハード上限がほしい、というスレッドでのコメント（{リンク}）を拝見しました。 |
| https://news.ycombinator.com/item?id=49949316 | GCP の上限が一部のサービスだけ | I saw your comment about spend caps only covering a few services ({link}). | 上限をかけられるサービスが一部だけ、というコメント（{リンク}）を拝見しました。 |

注意：
- HN には DM がない。**プロフィールに連絡先を公開している人だけ**、メールで EN-2 を送る（手順書 §2）。
- GCP・Cloudflare だけを使っている人は、今は対象外（手順書 §3-2）。待機リストへの案内だけにする。

## 2. コミュニティへの投稿（各1回まで）

### 2-1. Vercel Community（#community カテゴリ。手順書 §2：回答の中で売り込まない）
**題名**
```
Looking for 5 people to test a spend guard for Vercel, OpenAI and Anthropic (early prototype)
```
**本文**
```
Hi all. Disclosure up front: I'm building this, and I'm looking for feedback, not customers.

Budget Guard checks your Vercel, OpenAI and Anthropic usage every hour against a monthly budget. At 80% it emails you. At 100% it can run a stop you set up in advance: pause a Vercel project, set a hard limit on an OpenAI project, or set Anthropic keys in a workspace to inactive. All of those can be undone.

Things you should know before trying it:
- It's an early prototype.
- It needs an admin-level key, because none of the three providers offer a read-only cost key. Please use a dedicated, revocable key you can delete afterwards.
- Every stop starts in test mode. It only records the request it would have sent until you switch it on yourself.
- You can try it with a demo token first.

Vercel's own Spend Management is good and free, so if Vercel is your only provider, start there. This is for people who use more than one provider and want one budget view and a stop they can test first.

If you'd give it 15 minutes and tell me what feels risky or missing, reply here or reach me at {{CONTACT}}. Please don't send me any keys.

{{BG_URL}}
```

### 2-2. OpenAI Developer Forum（作ったものの紹介。手順書 §2：繰り返しや過度の宣伝は不可、DM で売り込まない）
**題名**
```
Built a small spend guard: hourly usage check, 80% email, reversible project hard limit at 100%
```
**本文**
```
I built this after reading too many "woke up to a surprise bill" threads, and I'd like feedback from people who manage OpenAI projects.

For OpenAI, it reads organization usage every hour against a monthly budget you set. At 80% it emails you, and at 100% it can set a hard limit on a project you choose. You can remove that limit to undo it. It does the same for Vercel and Anthropic if you use them.

Honest caveats:
- It's an early prototype.
- It needs an Admin key, because there's no read-only cost key. Please create a dedicated key with an expiry and revoke it when you're done.
- Stops start in test mode, which only logs the request it would send.
- One thing I haven't verified: how quickly OpenAI enforces a newly set project limit. I'd like to hear from anyone who has seen this in practice.

If you're willing to try it for 15 minutes and tell me what's missing, reply here. Please don't send keys to anyone, me included.

{{BG_URL}}
```

### 2-3. X（オーナーのアカウントから。手順書 §2：1人には公開リプライで1回だけ）
単独の投稿（英語）：
```
Looking for 5 devs hit (or worried) by a surprise Vercel, OpenAI or Anthropic bill.

I'm building Budget Guard: hourly spend checks, email at 80%, a reversible stop at 100% (starts in test mode).

Early prototype; needs an admin key. Never send me keys.
{{BG_URL}}
```

単独の投稿（日本語）：
```
Vercel／OpenAI／Anthropic の想定外の請求に困った（または不安な）開発者の方を5人探しています。

毎時の利用額チェック、80%でメール、100%で元に戻せる停止（最初はテストモード）をする Budget Guard を作っています。

初期の試作品です。キーは送らないでください。
{{BG_URL}}
```

（英語・日本語とも、X の数え方で280以内を確認。URL は23として計算）

**X の注意**：今の自動化用アカウントは P0（福祉事業所向け）の予約投稿を流している。開発者向けの投稿を混ぜるかどうかは、P7・P8 と同じくオーナーの判断（アカウントを分けるか）を待つ。

### 2-4. Reddit
手順書 §2 のとおり、**各サブレディットのルールは未確認**。投稿の前にサイドバーとルールを読み、本部に要約を出して承認を得る。文面は 2-1 を短くしたものを使う。宣伝の DM は送らない。

## 3. 「試してみたい」と返事が来たら（返信の文面）

### EN
```
Thanks for being up for it. Here's how to try it without risking anything:

1. Open {{BG_URL}} and add a connection with the token `demo` first. It uses fixed sample data and calls no real API.
2. If you'd like to try your real account, create a dedicated key just for this:
   - Vercel: a team-scoped token with an expiry, Member role.
   - OpenAI: a new Admin key with an expiry.
   - Anthropic: a new Admin key you can revoke afterwards.
   Paste it into the app yourself. Please don't send it to me.
3. Leave the stop in test mode. When the budget is reached, you'll see the request it would have sent, and nothing is actually stopped.
4. When you're done, delete the connection in the app and revoke the key on the provider's side.

If it's easier, we can do this together on a 15-minute call. I won't ask to see your screen while you create the key.

If you ask me to delete your data, I'll do it within 7 days and let you know.
```

### JA
```
ありがとうございます。リスクなしで試していただく方法です。

1. {{BG_URL}} を開き、まずトークンに `demo` と入れて接続を追加してください。固定のサンプルデータで動き、本物の API は呼びません。
2. ご自身のアカウントで試す場合は、このためだけの専用キーを作ってください。
   - Vercel：チーム限定・期限付き・Member ロールのトークン
   - OpenAI：期限付きの新しい Admin キー
   - Anthropic：後で失効できる新しい Admin キー
   キーはご自身でアプリに入力してください。私には送らないでください。
3. 停止はテストモードのままにしてください。予算に達すると「送るはずだったリクエスト」が表示されるだけで、実際には何も止まりません。
4. 終わったら、アプリで接続を削除し、各サービス側でキーを失効させてください。

15分の通話で一緒に進めることもできます。キーを作る画面を見せていただく必要はありません。

データの削除をご希望の場合は、7日以内に削除してご連絡します。
```

## 4. 1週間後の感想の聞き方（1回だけ）
```
Quick check-in on Budget Guard: three short questions, answer any you like.
1. Did anything feel risky or unclear when you connected it?
2. What would you need before switching a stop from test mode to live?
3. Is there a provider or stop action you expected that's missing?
Thanks again. This is the last message unless you reply.
```
日本語版：
```
Budget Guard の件で、1週間たったのでご様子を伺いました。答えやすいものだけで大丈夫です。
1. 接続するときに、怖いと感じたところや分かりにくいところはありましたか。
2. 停止をテストモードから本番に切り替えるには、何があれば安心ですか。
3. あるはずだと思ったのに、なかった連携や停止の方法はありましたか。
ご返信がなければ、これで最後のご連絡にします。
```

## 5. 承認に出すもの（手順書 §10 に足す）
- この文書の 2-1・2-2・2-3（投稿の文面）。
- 「試す環境」の決定：Cloudflare Workers の無料プランに `{{BG_URL}}` をデプロイしてよいか。外部公開にあたるので、オーナーに上げる。
- X のアカウントの扱い（2-3 の注意）。
