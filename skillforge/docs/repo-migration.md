# GitHub Action の専用リポジトリへの移行と Marketplace 公開の準備

今の Action は `masahiro20/new-project` の `skillforge/action/` にあります。GitHub Marketplace に載せるには、
**公開リポジトリ**の**ルート**に `action.yml` があり、**1リポジトリに1つの Action** だけ、という条件を満たす必要があります。
専用リポジトリを作るのはオーナーの作業です（Claude の GitHub アプリはリポジトリを作れません）。この文書は、作ってもらったあとに
すぐ移せるよう、手順と判断材料をまとめたものです。

関連ファイル：

- [`scripts/release-action.mjs`](../scripts/release-action.mjs)（`npm run release:action`）— 公開用フォルダ `out/kotomark-action/` を組み立てて検証し、次の git コマンドを表示する（実行はしない）
- [`deploy/action-repo-ci.yml.example`](../deploy/action-repo-ci.yml.example) — 専用リポジトリ側の CI の雛形
- [`action/action.yml`](../action/action.yml) — `branding`・`name`・`description`（125字以内）・`author` を Marketplace 向けに設定済み

---

## 1. 2つの案

### 案 A：製品全体を専用リポジトリ `kotomark` に移し、Action をリポジトリのルートに置く

- `skillforge/` の履歴ごと新リポジトリへ移し、`action.yml`・`run.sh`・`dist/kotomark.mjs` をルートに置く。
- 利点：ソースと Action が1か所。`uses: OWNER/kotomark@v1`。リリースの手間が少ない。
- 欠点：
  - **製品全体が公開される。** サーバー（`src/server`）、課金・トークン、Web（`web/`、`lp/`、`site/`）、評価データ（`eval/`、他プロジェクトの台本を含む）、
    社内文書（`docs/outreach-drafts.md`、`docs/pilot-targets.md` など、未送信の声かけ文や対象企業名）が、**過去の履歴も含めて**公開されます。
    履歴から消すには filter-repo でパスごとの除外が必要で、漏れの確認が重い。
  - ルートにはすでに `dist/`（tsc とビルドの出力、`.gitignore` 対象）があり、Action 用の `dist/kotomark.mjs` をコミットするには
    構成の変更（`.gitignore` の例外、`build:action` の出力先変更）が要ります。
  - Marketplace は「1リポジトリ1 Action」なので、将来 MCP サーバー用など別の Action を足せません。
  - ルートに Web アプリや Dockerfile がある大きなリポジトリだと、Marketplace の利用者には何のリポジトリか分かりにくい。

### 案 B：薄いリポジトリ `kotomark-action` に、Action だけを置く

- 中身は `action.yml`、`run.sh`、`dist/kotomark.mjs`、`README.md`、`LICENSE`、`example/`（CI 用の見本台本）だけ。
- このリポジトリ（`skillforge/`）でビルドし、`npm run release:action` で `out/kotomark-action/` を作って、それを専用リポジトリへコピーしてタグを打つ。
- 利点：製品のソース・データ・社内文書を公開せずに済む。リポジトリの中身が利用者にとって分かりやすい。Marketplace の条件をそのまま満たす。
  ソース側の開発（`src/core` など）とリリースの周期を分けられる。
- 欠点：リリースのたびにコピーとタグ付けの手作業（または将来の自動化）が要る。専用リポジトリの履歴は「リリースごとの1コミット」になる。
  `dist/kotomark.mjs` は minify していないので、検査エンジンのロジックは読めます（ソースを公開しないことは秘匿にはならない）。

### 推奨：案 B

理由：

1. **公開範囲を最小にできる。** 案 A では、評価データ（他プロジェクトの台本）や未送信の営業文書が履歴ごと公開されるおそれがあり、取り消せません。
   案 B なら公開されるのは Action に必要なファイルだけです。
2. **Marketplace の条件（ルートに `action.yml`、1リポジトリ1 Action）を、構成を変えずに満たせる。**
3. **あとから案 A に進むことはできるが、逆はできない。** 製品をオープンソースにすると決めたら、そのとき案 A に移り、`kotomark-action` は
   アーカイブして README で新しい場所を案内すれば済みます（既存利用者の `uses:` はタグが残る限り動き続けます）。

---

## 2. オーナーにお願いする作業（Claude にはできない／してはいけないもの）

1. **名前の確認。** 「Kotomark」は仮名で商標確認が済んでいません（[`name-check.md`](name-check.md)）。公開リポジトリ名と Marketplace の名前は
   公開後に変えにくいので、先に決めてください。
2. **空の公開リポジトリを作る。** 例：`masahiro20/kotomark-action`（または組織を作ってその下に）。
   README・`.gitignore`・ライセンスは**付けずに**作成（最初のコミットはこちらから入れます）。
3. **ライセンスを決める（法的判断。Claude は決めません）。**
   - ライセンスが無い公開リポジトリは、閲覧と fork はできても、第三者に利用・改変の権利がありません。Action として使ってもらうには何らかの許諾が要ります。
   - 候補：MIT / Apache-2.0（許諾的、利用が最も広がる）、または「Action としての利用のみ許可」のような独自ライセンス。
     `dist/kotomark.mjs` には検査エンジン全体が入っている点を踏まえて判断してください。
   - バンドルに含まれる依存（fflate: MIT、zod: MIT）の著作権表示の扱いも合わせて確認。
   - 決まるまで、公開フォルダには `LICENSE.TODO`（説明のみ）が入ります。`release-action.mjs` は `LICENSE` を作りません。
4. **2要素認証（2FA）を有効にする。** Marketplace に公開するアカウントには 2FA が必要です。
5. **Marketplace の開発者向け規約（GitHub Marketplace Developer Agreement）に同意する。** 最初のリリースを「Publish this Action to the
   GitHub Marketplace」付きで作るときに求められます。規約への同意は代理できません。
6. Claude にリポジトリへの書き込み権限を与えるかどうか（与えない場合は、表示されたコマンドをオーナーが実行）。

---

## 3. そのあと私たちがやること

### 案 B（推奨）

```bash
cd skillforge
npm run release:action -- --repo masahiro20/kotomark-action --version 1.0.0
```

これで次が行われます（git の操作は一切しません）：

1. `npm run build:action` でバンドルを作り直す（`--no-build` で省略可）
2. `out/kotomark-action/` に `action.yml`、`run.sh`、`dist/kotomark.mjs`、`README.md`（`uses:` を `masahiro20/kotomark-action@v1` に書き換え、
   モノレポ用の注記を SHA 固定の案内に置き換え）、`LICENSE.TODO`、`example/script.csv`・`example/glossary.json` を置く
3. 公開フォルダと、リポジトリ外の一時ディレクトリ（`node_modules` が上の階層にも無い場所）の両方で
   `node dist/kotomark.mjs --help` と見本への `check`、`run.sh` を実行して検証
4. 次に打つ git コマンドを表示

表示されるコマンド（例）：

```bash
git clone https://github.com/masahiro20/kotomark-action.git ../kotomark-action-repo   # 初回のみ
rsync -a --delete --exclude .git --exclude .github --exclude LICENSE --exclude LICENSE.TODO \
  out/kotomark-action/ ../kotomark-action-repo/
cd ../kotomark-action-repo
# 初回：オーナーが決めた LICENSE をここに置く
git add -A
git commit -m "Release v1.0.0 (from kotomark <sha>)"
git tag -a v1.0.0 -m "v1.0.0"
git tag -fa v1 -m "v1 -> v1.0.0"
git push origin HEAD && git push origin v1.0.0 && git push -f origin v1
```

`rsync --delete` は専用リポジトリ側の `LICENSE` と `.github/` を消さないよう除外しています。

### 案 A（採る場合）

履歴を持って行くなら `git filter-repo`（別途インストール）を使います。**必ず使い捨てのクローンで**行ってください。

```bash
git clone https://github.com/masahiro20/new-project.git kotomark-split && cd kotomark-split
git filter-repo --subdirectory-filter skillforge          # skillforge/ をルートにし、他のディレクトリの履歴を捨てる
# 公開してはいけないパスを履歴から消す（例。実際の一覧はオーナーと確認）
git filter-repo --invert-paths \
  --path eval/ --path docs/outreach-drafts.md --path docs/outreach-templates.md --path docs/pilot-targets.md
git remote add origin https://github.com/masahiro20/kotomark.git
git push -u origin main --tags
```

`git filter-repo` が使えない場合の代替（除外はできない）：

```bash
git subtree split --prefix=skillforge -b kotomark-split
git push https://github.com/masahiro20/kotomark.git kotomark-split:main
```

その後、`action/` の中身をルートへ移し（`git mv action/action.yml action/run.sh .`、`action/dist/kotomark.mjs` の置き場所と `.gitignore` の `/dist/` の調整、
`build:action` の出力先変更、`test/action.test.ts` のパス変更）、README の `uses:` を `masahiro20/kotomark@v1` にします。
公開前に `git log --all --stat` で、残ってはいけないファイルが無いか確認してください。

---

## 4. `action.yml` の Marketplace 向け項目

| 項目 | 値 | メモ |
|---|---|---|
| `name` | `Kotomark script consistency check` | Marketplace 全体で一意でなければならず、既存のユーザー名・組織名・カテゴリ名とも重複不可。公開時に弾かれたら変更 |
| `description` | 114字（125字以内） | Marketplace の一覧に表示される |
| `author` | `Kotomark` | |
| `branding.icon` / `branding.color` | `check-square` / `blue` | Feather アイコンの一部と、決められた色（white, black, yellow, blue, green, orange, red, purple, gray-dark）から選ぶ |

---

## 5. バージョンの付け方

- リリースごとに semver のタグ `v1.0.0`、`v1.0.1`、`v1.1.0` … を打つ（注釈付きタグ）。これは**動かさない**。
- メジャーごとの**動くタグ** `v1` を、そのメジャーの最新リリースに付け替える（`git tag -fa v1` → `git push -f origin v1`）。
  利用者の多くは `@v1` と書くので、互換性を壊す変更（入力名の変更・削除、終了コードの意味の変更、既定値の変更で合否が変わるもの）は `v2` にする。
- 新しい指摘ルールの追加は合否を変えうるので、リリースノートに必ず書く（`fail-on: error` の利用者には、エラーの新ルールは実質的に破壊的変更。
  新ルールは最初は warning で入れるのが無難）。
- `action.yml` のバージョンは持たない（タグが唯一の版）。リリースノートにソース側のコミット（`from kotomark <sha>`）を残す。

### 利用者による SHA 固定

タグは付け替えられるので、供給網の安全を重視する利用者にはコミット SHA での固定を勧めます：

```yaml
- uses: masahiro20/kotomark-action@0123456789abcdef0123456789abcdef01234567 # v1.0.0
```

末尾のコメントでバージョンを示しておくと、Dependabot がタグを読んで SHA ごと更新してくれます。

### Dependabot

利用者側では、次の設定で `uses:` の更新 PR が届きます（README に載せる）：

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

専用リポジトリ自身の CI が使う `actions/checkout` なども、同じ設定で更新します。

---

## 6. リリースのチェックリスト

1. `skillforge/` で `npm test` と `npm run typecheck` が通る
2. 変更点を確認し、版を決める（パッチ／マイナー／メジャー。ルール追加・既定値変更の影響を確認）
3. `npm run release:action -- --repo <owner>/kotomark-action --version X.Y.Z` が最後まで通る
4. `out/kotomark-action/README.md` の `uses:` と、モノレポへの言及が残っていないことを目で確認
5. 表示されたコマンドで専用リポジトリへコピー → コミット → `vX.Y.Z` タグ → `vX` を付け替え → push
6. 専用リポジトリの CI（[`deploy/action-repo-ci.yml.example`](../deploy/action-repo-ci.yml.example) を `.github/workflows/ci.yml` に置いたもの）が通る
7. GitHub の Releases で `vX.Y.Z` からリリースを作り、初回は「Publish this Action to the GitHub Marketplace」にチェック、カテゴリ
   （例：Code quality / Continuous integration）を選ぶ
8. 別のテスト用リポジトリで `uses: <owner>/kotomark-action@vX` と `@<sha>` の両方が動くことを確認
9. このリポジトリの `action/README.md` と `docs/ci.md` の `uses:` を新しい場所に更新（移行後）

> **確認事項：** Marketplace 公開の条件として「リポジトリにワークフローファイルを含めない」と書かれていた時期があります。
> 公開前に GitHub の最新ドキュメントを確認し、まだ条件にあるなら、専用リポジトリには CI を置かず、このリポジトリ側で
> `out/kotomark-action/` に対して同じ検査を走らせてください。

---

## 7. セキュリティ

- **シークレットは不要。** Action はトークンも API キーも使いません。注釈（`::error` など）とジョブサマリーにトークンは要りません。
  ネットワークにも出ません（検査はすべてランナー上のローカル処理）。
- **権限は `contents: read` だけ**（checkout 用）。README の例はすべて `permissions: contents: read` を明示しています。
- 入力は環境変数として渡し、`run:` の中に `${{ }}` を埋め込まない（スクリプトインジェクション対策。`test/action.test.ts` で検査済み）。
- 依存のインストールをしない（`npm install` なし）ので、実行時に外部パッケージを取りに行きません。中身はコミットされた `dist/kotomark.mjs` だけ。
- 専用リポジトリでは：main ブランチの保護、タグの保護ルール（`v*` の削除・付け替えを管理者のみに）、2FA 必須、
  Dependabot アラートと secret scanning を有効にする。
- `pull_request_target` で使わないよう README で注意する（フォークの PR のファイルを読むだけなので危険は小さいが、書き込み権限と組み合わせない）。
