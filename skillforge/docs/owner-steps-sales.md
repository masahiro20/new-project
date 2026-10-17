# オーナーにしかできない手順（売れる状態にするまで）

Claude には、アカウントの作成、規約への同意、お金の受け取り、法的な判断はできません。この文書は、そのうちオーナーが行う作業を、順番どおりに具体的に書いたものです。
作業の前に、**A は無料・数十分**、**B はお金・法的判断が絡む**と覚えておいてください。いまはプレビュー期間（全員無料）なので、A だけ先にやって公開し、B は売る直前でも間に合います。

関連：[`repo-migration.md`](repo-migration.md)（案 A／B の比較とリリース手順）、[`licensing.md`](licensing.md)（ライセンスキー）、[`pricing-page.md`](pricing-page.md)（価格ページの文面）。

---

## A. GitHub Marketplace に Action を出す（目安：1〜2時間、費用なし）

Claude の側の準備は済んでいます（`npm run release:action` が、公開用フォルダ `out/kotomark-action/` を作って検証します。MIT の LICENSE、ELv2 の `dist/LICENSE`、
README、サンプルの出力、見本のワークフローを含みます）。

1. **名前を決める。** 「Kotomark」は仮称で商標の確認が済んでいません（[`name-check-kotomark.md`](name-check-kotomark.md)）。リポジトリ名と Marketplace の名前は公開後に変えにくいので、先に決めます。
   Marketplace では Action の `name`（`action.yml`）が全体で一意である必要があり、既存のユーザー名・組織名と重なると弾かれます。弾かれたら `action.yml` の `name` を変えます。
2. **GitHub のアカウントで 2要素認証（2FA）を有効にする。** GitHub → Settings → Password and authentication → Two-factor authentication。Marketplace への公開に必要です。
3. **空の公開リポジトリを作る。** 推奨は案 B の `kotomark-action`（例：`masahiro20/kotomark-action`）。README・.gitignore・ライセンスは**付けずに**作ります。
   組織の下に作るなら、先に組織（Organization）を作っておくと、後で名義を移さずに済みます（会社として売る予定があるなら、法人名と揃えるのが望ましい）。
4. **ライセンスは決定済み（d29）。** Action の包み（`dist/` 以外）は MIT、`dist/kotomark.mjs` は Elastic License 2.0。`release:action` が `LICENSE`・`dist/LICENSE`・
   `USAGE-TERMS.md`・`THIRD_PARTY_NOTICES.md` を作ります。**著作権者の表記は今は「The Kotomark team」**です。販売前に、法人名か個人名を決めて差し替えてください（`scripts/release-action.mjs` の `COPYRIGHT`、`licenses/` の各ファイル）。
5. **公開用フォルダを作って、リポジトリに入れる。**
   ```bash
   cd skillforge
   npm run release:action -- --repo <owner>/kotomark-action --version 1.0.0
   ```
   最後に表示される git コマンド（clone → rsync → commit → タグ `v1.0.0` と `v1` → push）を実行します。Claude に書き込み権限を渡す場合は、そのリポジトリの権限を付与してください（渡さなければ、オーナーが実行）。
6. **Marketplace の開発者向け規約（GitHub Marketplace Developer Agreement）に同意し、リリースを作る。** リポジトリの Releases → *Draft a new release* →
   タグ `v1.0.0` を選び、**「Publish this Action to the GitHub Marketplace」にチェック**を入れます（初回に規約への同意を求められます。同意は代理できません）。
   カテゴリは例として「Code quality」と「Continuous integration」を選びます。`action.yml` の `description` は 125 字以内（114 字で設定済み）、`branding` は設定済みです。
7. **別のテスト用リポジトリで動作確認。** `uses: <owner>/kotomark-action@v1` と、コミット SHA 指定の両方で動くこと、注釈とジョブサマリーが出ることを確認します。
   見本のワークフローは公開用フォルダの `example/workflow.yml` にあります。
8. **こちら（new-project）の README と `docs/ci.md` の `uses:` を新しい場所に直す**（Claude に頼めます）。
9. 最新の GitHub のドキュメントで、公開の条件を確認する（過去には「リポジトリにワークフローファイルを含めない」という条件がありました。`repo-migration.md` の §6 の注記を参照）。

> 注意：**GitHub Marketplace の Action は、Marketplace 上で課金できません**（Action の掲載に料金プランの仕組みはなく、有料の掲載は GitHub App の仕組みです。最新の仕様は公式ドキュメントで確認してください）。
> つまり、Marketplace は「見つけてもらう入口」で、お金は別の経路で受け取ります。これが次の B です。

---

## B. お金を受け取る（Studio US$49/月）— 販売を始める直前まででよい

### B-1. 先に決める（法的・事業上の判断。Claude は決めません）

1. **誰が売るか。** 個人事業主として売るのか、法人を作るのか。法人名（または屋号）を決めて、decisions.md の d29 と各ライセンス文書の「The Kotomark team」を差し替える。
2. **利用条件・返金・個人情報の文面を、弁護士に確認してもらう。** `licenses/KOTOMARK-USAGE-TERMS.md` は下書きです（d29：弁護士の確認は販売段階まで延期）。
3. **日本から売る場合の表示と税。** 特定商取引法に基づく表記（販売者の名称・住所・連絡先・料金・返金など）のページが要ります。消費税とインボイス（適格請求書）の扱い、海外の顧客への課税は、税理士に確認してください。
4. **決済の方法を選ぶ。** 候補（それぞれ手数料・対応国・税の代行の有無が違うので、最新の条件を比べて決めてください）：
   - Stripe（自分で販売者になる。日本の事業者の登録に、本人確認・銀行口座が必要）
   - Merchant of Record 型（Paddle、Lemon Squeezy など。販売者として税の処理を代行してくれる代わりに手数料が高め）
   - 最初の数社は請求書払い（銀行振込）でも始められる。件数が少ないうちは、決済の仕組みを作らずに手動で十分

### B-2. ライセンスキーを使えるようにする（コマンドの実行はオーナー）

`docs/licensing.md` が詳細です。要点：

1. 署名用の鍵ペアを作る（**秘密鍵はリポジトリの外**。このコマンドは、リポジトリの中への書き込みを拒否します）。
   ```bash
   cd skillforge
   node scripts/license-issue.mjs --init          # 秘密鍵は ~/.kotomark/license-signing-key.pem（権限 0600）
   ```
   秘密鍵は、暗号化した USB メモリなど、**オフラインで2か所にバックアップ**します。失うと、同じ鍵でキーを発行できなくなります。
2. 出力された公開鍵の1行を `src/cli/license-pubkey.ts` の `LICENSE_PUBLIC_KEYS` に貼り、`BUILD_FLOOR` をリリース日に更新して、`npm run build:action` で再ビルド → 新しいバージョンを A の手順でリリースする。
3. 顧客ごとにキーを発行する（例：年払い 5席）。
   ```bash
   node scripts/license-issue.mjs --sub cust_0001 --name "契約者名" --seats 5 --days 395 --plan studio
   ```
   出力の `KM1.…` を顧客にメールで渡します。顧客は GitHub の Secret `KOTOMARK_LICENSE_KEY` に登録して `license-key:` に渡します。発行記録（`lid`・`sub`・契約者名・席数・期限）は台帳に残す。
   年払いは約395日、月払いは約62日の期限で発行し、更新のたびに新しいキーを渡します。
4. **`PREVIEW = false` に切り替えるのは、販売を始めるときだけ。** 切り替える前のチェックリストは `licensing.md` の最後にあります（事前告知、弁護士の確認、README・LP の表記更新を含む）。

### B-3. 価格ページを公開する

1. [`pricing-page.md`](pricing-page.md) の文面を LP に入れる（Claude に頼めます）。販売前は「予定」「プレビュー中は無料」のまま。
2. 販売を始める日に、「予定」の表記を外し、決済へのリンクまたは「ご購入のご相談」の窓口（連絡先メールアドレス）を入れる。LP の連絡先は `CONTACT` 環境変数で入ります（`npm run build:site`）。
3. Studio に含めると約束している**ホスト型 MCP と共有用語集**が、その日に実際に使える状態か確認する（`docs/deploy.md`。本番は Fly.io 東京の1台の想定）。

### B-4. お金と時間がかかる順の目安

| 作業 | 費用 | 時間の目安 |
|---|---|---|
| A 全体（Marketplace 公開） | 無料 | 1〜2時間 |
| 法人名・屋号の決定 | 無料（法人を作る場合は登記費用） | 決めるだけなら即日 |
| 弁護士の確認 | 有料（見積もりを取る） | 1〜2週間 |
| 決済の登録（Stripe など） | 無料〜（手数料は売上から） | 数日（本人確認・審査） |
| 鍵の作成・キーの発行 | 無料 | 30分 |

売り始めるのに最短なのは、**A を済ませ、最初の数社には請求書（銀行振込）とキーのメール送付で始める**ことです。決済の自動化と法人化は、売上が立ってからで間に合います。
ただし、利用条件の弁護士確認と、特定商取引法に基づく表記だけは、最初の1社に売る前に済ませてください。
