# 価格ページの文面（下書き・未公開）

本部決定 d29 の条件に沿った、公開用の文面です。**まだ販売していないので、「予定価格」「プレビュー中は全員無料」を外さないでください。**
販売を始める前に、法人名・規約の確認（弁護士）、決済の準備が要ります（[`owner-steps-sales.md`](owner-steps-sales.md)）。
LP（`lp/index.html`）に「価格」の節として入れるか、`lp/pricing/` の別ページにするかは、オーナーが決めます。
この文面の数字は d29 のとおりです。変えるときは decisions.md を先に更新してください。

## 使い方（社内向けの説明）

- 下の「公開用の文面」の日本語・英語を、そのまま LP に貼れます（`<span class="t" lang="ja">` / `lang="en"` の組にします）。
- 円の金額は目安（月額 約¥7,800）です。為替で変わるので「約」を付け、決済が円建てかドル建てかは決済の選び方で変わります。
- 無料の線引きは **利用者の種類**（個人・OSS・従業員3名以下）で、技術的な制限ではありません。技術的に効くのは、プレビュー終了後に
  「1回の実行が 20,000 行を超える場合は有料キーが要る」という点だけです（[`licensing.md`](licensing.md)）。このことは公開文面の FAQ に書いてあります。
- 「GitHub Marketplace に載せる＝無料で使える」ではありません。Marketplace の Action に課金の仕組みはなく、支払いは Marketplace の外で受けます（`owner-steps-sales.md`）。

---

## 公開用の文面（日本語）

### Kotomark の価格（予定）

> **いまはプレビュー期間です。すべての機能を、どなたでも無料で使えます。** 有料プランの販売は始まっていません。下の価格は予定で、変わることがあります。
> 販売を始める前に、この予定をお知らせします。

| | **無料** | **Studio** |
|---|---|---|
| 対象 | 個人、オープンソースのプロジェクト、従業員3名以下の団体 | 上記以外の団体（スタジオ、パブリッシャー、翻訳会社など） |
| 料金 | 無料 | 月額 US$49（目安：約 ¥7,800）。5席まで |
| 席が増えるとき | — | 6席目から、1席あたり月額 US$9 |
| 年払い | — | 2か月分無料（10か月分のお支払い） |
| すべての検査（用語・キャラ名・敬称・口調・変数・タグなど） | ✓ | ✓ |
| 入力形式（CSV・XLSX・XLIFF・.po・Unity/Unreal など）と出力形式 | ✓ | ✓ |
| GitHub Action / コマンドライン / ブラウザ版デモ | ✓ | ✓ |
| ホスト型 MCP サーバー（AI アシスタントから使う） | — | ✓ |
| 共有用語集（チームで1つの用語集を使う） | — | ✓ |

#### よくある質問

**従業員3名以下かどうかは、どう数えますか？** 契約者（会社・団体）の従業員数で数えます。判断に迷うときはご相談ください。迷った場合は無料側で使い始めて構いません。

**無料枠で検査は減りますか？** 減りません。無料でも、すべての検査と入力・出力形式が使えます。

**台本はどこかに送られますか？** コマンドライン版・GitHub Action・ブラウザ版デモは、台本をこちらへ送りません。ライセンスキーの確認もオフラインです。
ホスト型 MCP は Studio の機能で、扱いは [データの扱い方](data-policy.md) に従います。

**1回の実行の行数に上限はありますか？** プレビュー終了後は、1回の実行で 20,000 行を超える場合に、有料のライセンスキーが必要になります
（入力を分ければ無料枠のままで使えます）。ブラウザ版デモは、プレビュー終了後も無料で上限もありません。

**ライセンスは？** Kotomark のソースは公開されています（ソース公開。オープンソースとは呼びません）。検査エンジンは Elastic License 2.0、
GitHub Action の包みは MIT です。無料の範囲と有料の条件は、利用条件（下書き）に書きます。

**支払い方法は？** 決まり次第お知らせします（予定）。

**返金は？** 規約の確定時にお知らせします。

---

## Public copy (English)

### Kotomark pricing (planned)

> **Kotomark is in a free preview: every feature is free for everyone.** Paid plans are not on sale yet. The prices below are planned and may change.
> We will announce them before any paid plan starts.

| | **Free** | **Studio** |
|---|---|---|
| For | Individuals, open-source projects, and organizations of up to 3 employees | Every other organization (studios, publishers, localization vendors) |
| Price | Free | US$49/month (about ¥7,800). Up to 5 seats |
| More seats | — | US$9/month per seat from the 6th seat |
| Annual billing | — | 2 months free (you pay for 10) |
| All checks (terms, names, honorifics, voice, placeholders, tags, …) | ✓ | ✓ |
| Input and output formats (CSV, XLSX, XLIFF, .po, Unity/Unreal, …) | ✓ | ✓ |
| GitHub Action / command line / browser demo | ✓ | ✓ |
| Hosted MCP server (use it from an AI assistant) | — | ✓ |
| Shared glossaries (one glossary for the whole team) | — | ✓ |

#### FAQ

**How do you count "up to 3 employees"?** By the employees of the licensee (company or organization). If you are unsure, ask us; if in doubt, start on the free side.

**Does the free tier have fewer checks?** No. Free includes every check and every input/output format.

**Is my script sent anywhere?** The command line, the GitHub Action and the browser demo do not send your script to us, and license keys are verified offline.
The hosted MCP server is a Studio feature; its data handling follows the data policy.

**Is there a limit on rows per run?** After the preview ends, a run of more than 20,000 rows needs a paid license key (split the input to stay on the free tier).
The browser demo stays free with no limit.

**What license is Kotomark under?** The source is available (source-available; we do not call it open source). The check engine is under the Elastic License 2.0 and the GitHub Action wrapper is MIT.
The free-use scope and the paid terms are in the usage terms (draft).

**How do I pay?** To be announced.

**Refunds?** To be announced when the terms are final.

---

## 公開前の確認（オーナー）

- [ ] 法人名（法的な主体）を決め、decisions.md の d29 の「The Kotomark team」を差し替える
- [ ] 利用条件（`licenses/KOTOMARK-USAGE-TERMS.md`）を弁護士に確認してもらい、確定版にする
- [ ] 決済の準備（`owner-steps-sales.md` の B）。日本から売る場合は、特定商取引法に基づく表記のページと、消費税・インボイスの扱いを決める
- [ ] 「予定」「プレビュー」の語を外す前に、`src/cli/license.ts` の `PREVIEW` を切り替える手順（`licensing.md` の最後）を済ませる
- [ ] Studio の「ホスト型 MCP」と「共有用語集」が、販売開始の時点で使える状態か確認する（`deploy.md`）
