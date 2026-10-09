# 出典データ：Misskey（日本語原文 → 英語訳の UI 文字列）

- リポジトリ: https://github.com/misskey-dev/misskey
- コミット（2026-10-09 に `git ls-remote https://github.com/misskey-dev/misskey HEAD` で取得した HEAD）: `53ac6808ae4921305e761c545863ee6593edd1f4`
- ライセンス: AGPL-3.0（同コミットの `LICENSE` は GNU AFFERO GENERAL PUBLIC LICENSE Version 3）。評価はローカルでのみ行い、本文は再配布していません。labels.csv / misses.csv には原文・訳文を入れず、fp-patterns.md の引用は短い抜粋に限っています。
- 翻訳の向き: `crowdin.yml` が `source: /locales/ja-JP.yml`、`translation: /locales/%locale%.yml` と定めており、**日本語が原文**です（日→英の実データ）。
- 内容: SNS アプリの UI 文字列です。**ゲームの台詞ではありません**（下記「探索の記録」を参照）。

| ファイル | 取得 URL | 行数 | sha256 |
|---|---|---|---|
| `locales/ja-JP.yml` | https://raw.githubusercontent.com/misskey-dev/misskey/53ac6808ae4921305e761c545863ee6593edd1f4/locales/ja-JP.yml | 3600 | `7517c79a768d6b2b8519f9b1bca841caaf0177c17fb13981491d42669d6c2de2` |
| `locales/en-US.yml` | https://raw.githubusercontent.com/misskey-dev/misskey/53ac6808ae4921305e761c545863ee6593edd1f4/locales/en-US.yml | 3471 | `11bbe9f7634c26b127d822519fbd540f155591574fb2fd8f07e79a206cd0b2be` |

## 変換（Kotomark は YAML を読めないため）

`yml2csv.py`（このディレクトリ）で、2つの YAML のスカラー値をドット区切りのキーで平らにし、`id,ja,en,context` の CSV にしました。`context` には `ja-JP.yml:<行>` を入れています。ja 側のキーが基準で、en にないキーは `en` が空になります。結果は 3216 行で、英語が空の行は 15 行です（en にないキー 14 件、値が空 1 件）。
labels.csv の `file_line` は **CSV の物理行**（Kotomark の行番号）です。YAML の行はおおむね「CSV 行 − 9 前後」ですが、ずれは一定でないため、CSV の `context` 列で確認してください。

```bash
SHA=53ac6808ae4921305e761c545863ee6593edd1f4; D=/tmp/claude-0/eval/jaen/misskey; mkdir -p $D
for f in ja-JP en-US; do curl -sSfL -o $D/$f.yml https://raw.githubusercontent.com/misskey-dev/misskey/$SHA/locales/$f.yml; done
python3 -I eval/misskey/yml2csv.py $D/ja-JP.yml $D/en-US.yml $D/misskey.csv     # PyYAML 6.0.1
npx tsx src/cli/index.ts check $D/misskey.csv --no-glossary --format json --fail-on never > $D/A.json
npx tsx src/cli/index.ts draft $D/misskey.csv --out $D/draft.json
npx tsx src/cli/index.ts check $D/misskey.csv --glossary $D/draft.json --format json --fail-on never > $D/B.json
npx tsx src/cli/index.ts check $D/misskey.csv --glossary eval/misskey/hand-glossary.json --format json --fail-on never > $D/C.json
```

エンジンの状態: 2026-10-09 時点の skillforge 作業ツリー（この評価で src/ は変更していません）。

## 設定

- **A**: 用語集なし（`--no-glossary`）。
- **B**: `kotomark draft` の自動用語集（100 語、キャラクター 0）を手直しせずに使用。
- **C**: `hand-glossary.json`。Misskey の製品用語 12 語（ノート、リノート、リアクション、サーバー、連合、ドライブなど）とマスコットの 藍 → Ai。サーバー は `server` だけを正とし、旧称の `instance` はあえて許容していません（JA 側は インスタンス → サーバー に統一済みのため）。

## ラベルの付け方

- A は 21 件すべて。B（760 件）と C（93 件）は `random.Random(20261009).sample(range(len(findings)), 60)` で 60 件を抜き取り。
- `id` 列は Kotomark の finding `id`（YAML のキー）の sha1 先頭 10 桁です。
- 見逃し: CSV の行から `random.Random(20261009).sample(range(3216), 60)` で 60 行を選んで目で確認しました。あわせて、プレースホルダー・タグ・前後の空白の差分を機械的に走査しました。`[targeted]` の行は、この走査や用語の集計で見つけたもので、無作為抽出には含まれません。

## 探索の記録（Part 1：約 30 分）

「日本語が原作で、英訳が機械可読な形で公開され、利用を認める明確なライセンスがある台詞データ」を探しました。

| 候補 | 結果 |
|---|---|
| GitHub コード検索（`game/tl/english` の `.rpy`） | このセッションでは GitHub の検索 API が使えませんでした（403、リポジトリ単位のアクセスに限定）。Web 検索でも、日本語原作で `tl/english` を同梱し、ライセンスが明確な Ren'Py 作品は見つかりませんでした。見つかったのは翻訳ツール、英→日の翻訳パッチ（ZATO-ja）、ライセンスが freeware/custom の作品（Narcissu など）です。 |
| Hosted Weblate（原文が ja のプロジェクト） | Web 検索では、日本語が原文のゲームのプロジェクトは見つかりませんでした。 |
| Suika2（MIT、日本製ノベルエンジン）のサンプル | `github.com/suika2engine/suika2` は取得できませんでした（移転または非公開）。後継の Suika3 は時間内に確認できていません。 |
| **変愚蛮怒 Hengband**（`hengband/hengband` @ `03c8564c8ede`） | `lib/edit/MonsterMessages.jsonc`（モンスターの台詞、`{"ja":[…],"en":[…]}`）やクエストの JSONC に日英が並んでおり、形式は理想に近いデータです。ただし、(1) ライセンスが Moria/Angband ライセンスで、「教育・研究・非営利の目的に限り複製・配布可」という**非営利条件**です（`lib/help/jlicense.txt`）。(2) 台詞の多くは英語版 Angband/Zangband（とトールキン）が原文で、日本語は訳です（例：Farmer Maggot の台詞）。日本語が原作とは言えません。この2点から、**採用しませんでした**。法務の確認が取れれば、Hengband 独自のユニークやクエストに絞って再評価する価値はあります。 |
| **Misskey**（AGPL-3.0） | 日本語が原文であることが `crowdin.yml` で確認できます。ライセンスも明確です。台詞ではなく UI ですが、日→英の実データとして**採用しました**。 |

結論: 時間内に、日本語原作でライセンスが明確な**ゲーム台本**は見つかりませんでした。日→英の台詞での精度・再現率は、`eval/synthetic-jaen/` の合成ベンチマークで補っています。
