# Budget Guard ステージ2：外部ユーザー5人の募集手順書

> **現状：まだ何も送っていない。** 投稿・DM・メール・コメント・アカウント作成は一切していない。
> **以下の手順は、どれも実行前にオーナー／本部の承認が要る。** 承認の単位は「どのコミュニティで」「誰に」「どの文面で」の3点。承認なしでは1通も送らない。
> 作成日：2026-10-08。根拠：`README.md`、`docs/provider-apis.md`、`peter-hq/projects/p2-signal-lab/stage1-ideas.md`。

---

## 0. ゴールとステージゲート

- **目標：** 外部ユーザー5人に、実際に使ってもらう。身内とチームメンバーは数えない。
- **「使った」の定義（ステージゲート用）。** 次の3つをすべて満たした人を1人と数える。
  1. 本物のプロバイダ（Vercel・OpenAI・Anthropic のどれか）を **1つ以上** 接続した。トークン検証を通っていること。`demo` トークンは数えない。
  2. 次のどちらかを1回以上行った。
     - **毎時チェックが1回以上** 成功した（ダッシュボードに当日の利用額が出ている）。
     - **テスト停止** を1回以上実行した（test モードで「送るはずのリクエスト」が記録されている）。
  3. 15分の導入通話、または書面で、感想を1つ以上もらった。
- **数えないもの：** 待機リストへの登録、デモトークンだけの試用、LP の閲覧。
- **live 停止は必須にしない。** 本番を止める操作を勧誘の条件にしない。

---

## 1. 対象者（ICP）

**対象になる人**
- 個人開発者か、小さなチーム（〜10人程度）。
- 従量課金の **Vercel（Pro）・OpenAI API・Anthropic API（Console）** のうち、少なくとも1つを自分の財布か会社のカードで払っている。
- 次のどちらかに当てはまる。
  - **痛い目にあった：** 想定外の請求を受けたことがある。原因はボット、クローラー、無限ループ、キーの漏洩など。
  - **恐れている：** 公開投稿で、上限やハードキャップを求めている。または「止める手段がない」と書いている。
- Admin キー、またはチームのトークンを自分で発行できる権限がある（Org owner／admin、Vercel の Member 以上）。

**対象外**
- 大企業の社員で、権限がない人。社内の調達やセキュリティ審査が必要になる。
- 請求の話題に触れているだけで、自分では払っていない人。例：記事の転載や、ニュースへのコメントだけの人。
- 未成年と思われる人。
- 被害の真っ最中の人。返金交渉中などで、まだ混乱している場合。落ち着くまで連絡しない。

---

## 2. 探す場所と、各コミュニティのルール

**共通の原則**
- 宣伝の投稿より、**公開の投稿に対して、役に立つ返信をする** ほうを優先する。
- リンクは、聞かれたときか、明らかに話題に沿うときだけ貼る。
- 同じ文面を複数の場所に貼らない。
- 規約は投稿の直前に、**その場で読み直す**。下の要約は 2026-10-08 時点のもので、変わっている可能性がある。

| 場所 | 探し方 | 自己宣伝のルール（要点） | 出典 |
|---|---|---|---|
| **Hacker News** | stage1 の該当スレッド：[ハードキャップ](https://news.ycombinator.com/item?id=49949235)、[$4,000 のクローラー請求](https://news.ycombinator.com/item?id=49950441)、[GCP の上限](https://news.ycombinator.com/item?id=49949316)、[Cloudflare](https://news.ycombinator.com/item?id=49942987)、[Vercel の請求が10倍](https://news.ycombinator.com/item?id=49732873)。コメントした人のプロフィールに連絡先があるかを見る。 | 「Please don't use HN primarily for promotion」。投票やコメントを頼むのは禁止。**Show HN** は、すぐ試せるものだけ。サインアップページ、ランディングページ、待機リストは対象外。HN には DM の機能がない。プロフィールに公開連絡先がある人だけが対象になる。 | https://news.ycombinator.com/newsguidelines.html 、 https://news.ycombinator.com/showhn.html |
| **Vercel Community** | community.vercel.com で「spend」「bill」「pause」「Spend Management」「usage spike」を検索する。 | FAQ には自己宣伝の明文規定が見当たらない（確認できたのは、問題のある内容を通報する旨と「投稿は公開」の注意だけ）。個人の作品やフィードバックを求める投稿は #community カテゴリが場所。**回答の中で自分の製品を売り込まない。** | https://community.vercel.com/faq 、 https://community.vercel.com/c/community/4 |
| **OpenAI Developer Forum** | community.openai.com で「spend limit」「unexpected charges」「billing spike」「hard limit」を検索する。 | 「Share the cool things you have built, but avoid repetitive or overly promotional posts」。「Spamming other members with pitches or other forms of self-promotion will not be tolerated」。**DM での売り込みは禁止と読む。** 機密情報を DM で求めることも禁止。 | https://community.openai.com/faq |
| **Anthropic（開発者向けの場）** | 公式 Discord や、GitHub の anthropics 系リポジトリの issue を見る。 | 公式 Discord の自己宣伝ルールは **確認できなかった**。参加したら、まず #rules を読む。読むまでは投稿しない。 | 未確認 |
| **Reddit** | r/webdev、r/nextjs、r/vercel、r/SaaS、r/SideProject、r/OpenAI、r/ClaudeAI、r/indiehackers。検索語は「vercel bill」「surprise bill」「API bill」「spend limit」。 | **各サブレディットのルールは確認できなかった**（2026-10-08、reddit.com は取得できず）。多くのサブレディットに、自己宣伝の比率ルールや週1回の宣伝スレッドがある。**投稿前に各サブレディットのサイドバーとルールを読み、本部に要約を出して承認を得る。** 宣伝 DM は送らない。 | 未確認（各サブレディットの /about/rules を投稿前に確認する） |
| **X** | 検索：`"vercel bill"`、`"openai bill" surprise`、`"anthropic" "spend limit"`、`"hard cap" billing`、`"woke up to" bill`。直近30日に絞る。 | X のスパムとプラットフォーム操作のポリシーは **取得できなかった**（403）。一般的な注意として、無差別なメンション、リプライ、DM を短時間に繰り返すのはスパム扱いになり得る。**1人には公開リプライで1回だけ声をかけ、DM は相手が許可したときだけ送る。** | https://help.x.com/en/rules-and-policies/platform-manipulation （内容は未確認） |
| **GitHub issues** | `"surprise bill"`、`"spend limit"`、`"billing" "runaway"`、`"vercel" "bill"` で issue を検索する。対象は OSS の Next.js テンプレート、AI SDK、エージェント系ツールなど。 | 利用規約：issue に「monetized or excessive bulk content」を投稿しない。宣伝を主目的にしない。API などで集めたデータを、迷惑メールに使わない。**issue へのコメントで勧誘しない。** プロフィールに連絡先を公開している人にだけ、個別に連絡する。「連絡しないで」と言われたら、すぐ止める。 | https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies |

---

## 3. 公開投稿から候補者を絞る手順

1. **事実を確認する。** 投稿が本人の体験かを確かめる。「I got」「we were billed」のような一人称の書き方か、スクショがあるか。転載や伝聞は除く。
2. **プロバイダを確認する。** Vercel・OpenAI・Anthropic のどれかか。Cloudflare や GCP だけの人は、今は対象外。待機リストへの案内だけにする。
3. **規模を確認する。** 個人か、小さなチームか。プロフィール、リポジトリ、サイトから判断する。
4. **時期を確認する。** 直近90日以内の投稿か。古い投稿の人には連絡しない。
5. **連絡手段を確認する。** **本人が公開している連絡先** があるか（プロフィールのメール、サイト、DM 開放など）。ない人には連絡しない。
6. **今の状況を確認する。** 揉めている最中ではないか。被害の直後で、怒りや焦りが強い投稿には連絡しない。
7. **スコアをつける。** 痛み（0〜2）＋該当するプロバイダの数（0〜3）＋連絡のしやすさ（0〜1）。**4点以上** の人を本部の承認候補にする。

---

## 4. 候補者の管理表（テンプレート）

個人情報は最小限にする（§9）。メールアドレスなどの連絡先は、この表に書かない。表には「公開プロフィールの URL」だけを書く。

| ID | 見つけた日 | 場所 | 公開投稿の URL | ハンドル | プロバイダ（V/O/A） | 痛み（被害／不安） | スコア | 承認状態（未申請／承認／却下） | 連絡日 | 使った文面（EN-1 など） | 返信 | 通話日 | 接続（demo／real） | 毎時チェック or テスト停止 | 感想の要約 | 次のアクション | 削除期限 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 | 2026-10-__ | HN | https://news.ycombinator.com/item?id=… | … | V | 被害 | 5 | 未申請 | — | — | — | — | — | — | — | 本部承認待ち | 2026-12-31 |

---

## 5. メッセージの文面

**ルール**
- 1人に送るのは1回だけ。返信がなければ、7日後に1回だけ短いフォローを送り、それで終わりにする。
- 相手の投稿を具体的に1つ引く。
- 「初期の試作品で、Admin キーが必要」と必ず書く。
- テストモードとデモトークンの選択肢を必ず書く。
- 割引や報酬で釣らない。
- **キーを DM で送ってもらうことは絶対に求めない。**

### EN-1（公開リプライ。HN や Forum のスレッドなど、ルール上許される場合のみ）
> Sorry about the bill — that's rough. Disclosure: I'm building a small tool for exactly this (hourly spend check for Vercel/OpenAI/Anthropic, email at 80%, a reversible stop at 100%). It's an early prototype and it needs an admin-level key, because none of the three offer read-only cost keys. If you'd ever want to poke at it in test mode, my contact is in my profile. No worries if not.

### EN-2（DM またはメール。相手が連絡先を公開している場合のみ）
> Hi {name} — I read your post about {specific incident, e.g. "the Vercel bill after the crawler spike"} ({link}).
> I'm building Budget Guard, an early prototype that checks Vercel / OpenAI / Anthropic spend hourly, emails at 80%, and at 100% runs a stop you armed (pause a Vercel project, set an OpenAI project hard limit, or set Anthropic keys to inactive — all reversible).
> Honest caveats: it needs an admin-level key (none of the providers offer read-only cost keys), and every stop starts in test mode, so nothing gets stopped unless you switch it on.
> You can try it with a demo token or a throwaway project first. Please don't send me any keys — you'd paste a dedicated, revocable key into the app yourself, and delete it whenever you like.
> Would you be open to a 15-minute call or async feedback? If not, no reply needed and I won't follow up more than once.

### EN-3（7日後のフォロー。1回きり）
> Quick follow-up on Budget Guard. Totally fine if it's not useful — this is my last message on it. Thanks for writing up your experience either way.

### JA-1（公開リプライ）
> 請求の件、大変でしたね。開示しておくと、ちょうどこの問題向けの小さなツールを作っています。Vercel／OpenAI／Anthropic の利用額を毎時チェックして、80%でメールし、100%で元に戻せる停止をかけます。まだ初期の試作品です。3社とも読み取り専用のコストキーがないので、管理者権限のキーが必要になります。テストモードで触ってみたい場合は、プロフィールの連絡先からどうぞ。興味がなければスルーしてください。

### JA-2（DM／メール。相手が連絡先を公開している場合のみ）
> {名前} さん、はじめまして。{具体的な出来事。例：「クローラーで Vercel の請求が跳ねた件」} の投稿（{リンク}）を拝見しました。
> Budget Guard という初期の試作品を作っています。Vercel／OpenAI／Anthropic の利用額を毎時取得して、80%でメールを送ります。100%では、事前に設定した停止を実行します（Vercel プロジェクトの一時停止、OpenAI プロジェクトのハード上限、Anthropic キーの無効化。どれも元に戻せます）。
> 正直にお伝えすると、管理者権限のキーが必要です。3社とも、コスト取得専用の読み取りキーがありません。ただし停止は必ずテストモードから始まり、ご自身で切り替えない限り何も止まりません。
> 最初はデモトークンや、捨てても良いプロジェクトで試せます。**キーは送らないでください。** 試していただく場合は、専用の、いつでも失効できるキーをご自身でアプリに入力していただきます。
> 15分の通話か、文章でのフィードバックをお願いできないでしょうか。不要でしたら返信はいりません。フォローは1回までにします。

### JA-3（7日後のフォロー。1回きり）
> Budget Guard の件で、最後に一度だけご連絡しました。お役に立たなければ、まったく問題ありません。体験を共有してくださって、ありがとうございました。

---

## 6. 安全と信頼

- **本番キーを DM・メール・通話で受け取らない。** 送られてきたら、すぐに削除する。そして相手に「そのキーを失効させてください」と伝える。
- **専用のキーを勧める。** Vercel はチーム限定・Member ロール・有効期限付きのトークン。OpenAI／Anthropic は Budget Guard 専用の Admin キー（OpenAI は期限付きで発行できる）。使い終わったら失効してもらう。
- **まずテストモード。** live への切り替えは勧めない。本人が望んだときだけ、確認手順（リクエスト一覧の確認、ラベルの入力）を一緒に見る。
- **デモの道を用意する。** `demo` トークンは開発環境でしか動かない（本番では拒否される）。外部ユーザーにデモを見せるときは、通話中の画面共有で、こちらの開発環境を見せる。実データで試したい人には、捨てて良いプロジェクトやワークスペースを勧める。
- **データ削除の約束。** 本人が接続を削除すると、トークンも消える。本人から依頼があったら、アカウントと接続のデータを **7日以内** に削除し、完了したと連絡する（削除期限は本部の承認事項）。ステージ2が終わったら、参加者に削除の希望を確認する。
- **できないことは正直に言う。** 未確認の事項は伝える（`docs/provider-apis.md` §5）。たとえば OpenAI の上限の強制タイミング、Anthropic の inactive から active への復帰保証、Vercel の請求データの遅延など。「保証する」とは言わない。

---

## 7. 導入通話の台本（15分）

| 時間 | 内容 |
|---|---|
| 0–2分 | お礼。通話の目的（試作品の感想をもらうこと）を伝える。録音しないこと、メモは要点だけ取ることを伝える。**「キーは口頭でもチャットでも共有しないでください」と最初に言う。** |
| 2–5分 | 相手の話を聞く。何が起きたか（または何が怖いか）。どのプロバイダか。今の対策（ネイティブの上限、アラート）。 |
| 5–9分 | 画面共有でデモを見せる（こちらの開発環境、`demo` トークン）。接続 → 予算 → テストモード → 「送るはずのリクエスト」の記録 → 元に戻す手順。3社とも読み取り専用キーがない、という注意をここで必ず伝える。 |
| 9–12分 | 本人が希望すれば、本人の画面で専用キーを発行してもらう。本人が自分でアプリに入力する。こちらはキーを見ない。毎時チェックかテスト停止の実行までを確認する。 |
| 12–14分 | 質問：「どこが怖かったか」「何があれば live にするか」「$9/月は高いか安いか」（価格は未承認の案だと伝える）。 |
| 14–15分 | 次の流れ（1週間後に1回だけ様子を聞く）。データ削除の方法。お礼。 |

---

## 8. 毎日の進め方と、止めるルール

**毎日（本部の承認後）**
1. 候補を探して、管理表に追加する（30分）。
2. 新しい候補の承認を、本部に申請する。まとめて1回。
3. 承認済みの候補にだけ連絡する。
4. 返信を見て、通話を予約し、表を更新する。
5. その日の結果を本部に1行で報告する。

**上限**
- 新しい連絡は **1日5通まで**。1つのコミュニティでは1日2通まで。
- 公開の投稿やリプライは、1つのコミュニティで **週1回まで**。
- フォローは1人1回まで。

**止めるルール**
- **苦情、通報、モデレーターからの注意が1件でもあったら、その日の連絡を全部止めて、本部に報告する。** その場所での活動は、本部が再開を判断するまで止める。
- 投稿が削除された場合も同じ扱いにする。
- 返信率が20通連続で0%なら、文面を変えるために止めて、本部と相談する。
- 5人に達したら、新しい連絡を止める。

---

## 9. プライバシー

- 集めるのは、**公開投稿の URL、公開ハンドル、プロバイダの種類、やり取りの要点** だけ。実名、住所、勤務先、電話番号は記録しない。
- 連絡先（メール）は、メールクライアントの中だけに置く。管理表や Git には書かない。
- 管理表は **リポジトリにコミットしない**。共有範囲は本部とオーナーだけにする。
- 不採用の候補と、返信のなかった候補の行は、**30日後に削除する**。参加者の行は、ステージ2が終わってから30日後に削除する（期間は本部の承認事項）。
- 「連絡しないで」と言われたら、ハンドルだけを「連絡不可」リストに残して、それ以外は消す。
- スクレイピングや API で一括収集はしない。人が読んで、1人ずつ判断する。

---

## 10. 承認チェックリスト（実行前に本部へ）

- [ ] 使うコミュニティと、その最新ルールの要約
- [ ] 文面（EN／JA）の最終版
- [ ] 候補者リスト（スコア4点以上）
- [ ] データ削除の期限（7日／30日）
- [ ] 価格の扱い：通話で「案」として伝えて良いか
- [ ] 外部ユーザーが試す環境（本番デプロイの有無、`demo` が本番で使えない点への対応）
