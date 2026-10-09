# Model Switch Calculator（静的サイト）

`signal-lab/model-switch-calculator/` の公開用・英語版。Anthropic か OpenAI の利用エクスポート（または汎用 CSV）を貼り付けると、同じ利用量をほかの Claude・GPT・Gemini モデルに移した場合の月額を表示する。ただの静的ファイルで、ビルド手順・依存パッケージ・バックエンドはない。

公開 URL：https://masahiro20.github.io/new-project/calc/ （`gh-pages` 上のコピーから配信。このディレクトリがソース）。

サイトの画面文言（UI テキスト）は海外向けなので英語のままにしている。この README で「」で囲んだ英語は、画面上の表記そのもの。

## v2 の変更点（2026-10-09）

- **Google Gemini モデルを追加。** Gemini の行を 11 個（provider は `google`）追加した。出典は公式の Gemini API 価格ページで、Paid tier・Standard・テキスト／画像／動画入力の単価。うち 3 つが主要モデル（初期選択）：Gemini 3.8 Flash、Gemini 3.5 Flash-Lite、Gemini 3.1 Pro Preview。残りの 8 つは「More models」に入れた。Pro 系はプロンプト 200K トークン以下の階層を使う。Gemini 3.8／3.7／3.6 Flash の価格は 2026-12-31 までのプロモ価格。
- **Gemini のキャッシュの前提。** Gemini にはキャッシュ済みトークンの単価（`cacheRead` として使う）と 1 時間ごとの保存料があるが、キャッシュ書き込みの単価はない。Gemini 宛てでは、キャッシュ書き込みトークンを入力単価で数え、保存料は計算に入れない。Gemini の行はすべて `cacheWrite` が `null`。
- **Google プロバイダ。** モデル名が `gemini`（または `models/gemini`）で始まると Google と判定する。Gemini 専用のエクスポート読み込みはない。Gemini の利用データは汎用 CSV で入れる（FAQ 参照）。ステップ 05 にプロバイダの絞り込みがある：All / Anthropic / OpenAI / Google。
- **共有リンク。** 「Copy share link」（ステップ 03）を押すと、設定と集計トークン量を URL ハッシュに入れる：`#s=<base64url(JSON)>`、`v: 1`。「What's in this link」の開閉部で、中身の JSON をそのまま見せ、合計値から利用量が分かることを警告する。リンクを開くとその状態を復元し、「Loaded from shared link」バッジと「Clear shared link」ボタンを出す。不正なリンクはエラーを出し、代わりにサンプルを読み込む。
- **価格の再確認。** Anthropic と OpenAI の 24 行を 2026-10-09 にすべて再確認した。価格の変更はなかった。`PRICES.checkedOn` を 2026-10-09 にした。

### 共有リンクの形式（v1）

```json
{ "v": 1, "period": "30d" | "raw", "keepCache": true, "days": 14,
  "totals": { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 },
  "models": { "<price-table id>": { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 } },
  "other":  { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 },
  "compare": ["<price-table id>"],
  "manual": { "<price-table id>": { "input": 1, "output": 2, "cacheRead": 0.1, "cacheWrite": 1.25 } } }
```

- トークンの値は、データ期間の生の合計（単位はトークン）。`unc` はキャッシュなし入力、`cw5` と `cw1` は 5 分と 1 時間のキャッシュ書き込み、`cr` はキャッシュ読み込み、`out` は出力。`days` は 30 日換算に使う。
- データ中のモデルは価格表 ID をキーにする。価格表にないモデルの利用量は `other` に合算するので、ユーザーが入力したモデル名はリンクに入らない。行・日付・ファイル名・貼り付けたテキストも一切入れない。
- 復号（`Share.decode`）は例外を投げない。次のものは拒否する：8000 文字を超えるハッシュ、不正な base64url、不正な UTF-8、オブジェクトでない JSON、1 以外の `v`。数値は有限かつ 0 以上でなければならない。トークンは 1e15、日数は 3660、価格は 1M トークンあたり 10000 USD で頭打ちにする。リストは 200 件まで。未知の ID は無視し、そのトークンは `other` に移す。リンクから復号した文字列は `PRICES` を引くキーにだけ使い、HTML としては出さない。
- 形式はバージョン 1。変えるときは `v` を上げ、`v: 1` の復号は残すこと。古いリンクを持っている人がいるため。

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | サイト全体：LP、計算機、価格表、仕組みの説明、FAQ、Budget Guard の待機リスト（ダミー）。CSS／JS はすべてインライン。 |
| `favicon.svg` | ファビコン（相対リンク）。 |
| `og.png` | 1200×630 の SNS プレビュー画像。 |
| `og-template.html` | `og.png` の元ファイル。サイトからはリンクしていない。 |
| `tests/logic.test.js` | ロジックのテスト。共有リンクのエンコード／デコード、悪意あるハッシュ、手計算で確かめた Gemini のコストを含む。実行は `node calc/tests/logic.test.js`（Node 18 以上、依存なし）。 |

アセットのパスはすべて相対なので、どのサブパスに置いても動く。絶対 URL は `canonical`、`og:url`、`og:image`、`twitter:image` だけ。クローラーがここに絶対 URL を求めるため。公開 URL が変わったら、`index.html` のこの 4 つのタグを直すこと。

## GitHub Pages へのデプロイ

1. Pages が公開するブランチに `calc/` があることを確かめる。
2. リポジトリの **Settings → Pages → Build and deployment** で **Deploy from a branch** を選び、ブランチ（例：`main`）とフォルダ **`/ (root)`** を選ぶ。すると `https://masahiro20.github.io/new-project/calc/` で配信される。
   - Pages がすでに別のフォルダ（例：`/docs`）や別ブランチを公開している場合は、そのフォルダかブランチに `calc/` をコピーする。URL は `<pages-root>/calc/` になり、上の 4 つの絶対 URL を直す必要がある。
   - Jekyll はここのファイルを何も変えないので、`.nojekyll` はなくてもよい。必要になるのは、ほかのフォルダが `_` で始まるようになった場合だけで、そのときは公開ルートに置く。
3. デプロイ後、`…/calc/`、`…/calc/og.png`、`…/calc/favicon.svg` を確認する。次にカード検証ツール（例：opengraph.xyz）に URL を通して、プレビューを確かめる。

## 価格の更新

価格は `index.html` の `<script id="app">` 内にある定数 `PRICES` ひとつにまとまっている。`PRICES —` と `END PRICES` の見出しコメントの間にあり、形は元ツールと同じ。

手順：

1. 公式ページを 3 つ開く。出典はこの 3 つだけ：https://platform.claude.com/docs/en/about-claude/pricing 、https://developers.openai.com/api/docs/pricing 、https://ai.google.dev/gemini-api/docs/pricing 。OpenAI の表は、ページの生データから読むのが楽（ページを `curl` してモデル ID で検索する）。Gemini のページは HTML を除去すると `<=` ／ `>` の階層ラベルが消えるので、Pro の階層は生の HTML から読む。
2. `PRICES` の行を書き換える。`PRICES.checkedOn` を確認した日付にする。一部の行だけ再確認した場合は、その行それぞれに `checkedOn` を付ける。
3. `PRICES.notes` に、何が変わったかを 1 文で足す。
4. テストを実行する。UI を変えた場合は、下に書いた Playwright の確認もやり直す。

補足：

- 変えるのは数値、`source`、`note`、`checkedOn`。値は 1M トークンあたりの USD で、`null` は「掲載なし」。ページ上の「Checked …」の日付は、すべて `PRICES.checkedOn` から埋める。
- 合計に使われるのは、`status: "verified"` で `input`／`output` が null でない行だけ。それ以外の行は「Unverified」と表示され、ユーザーが価格を入力できる。
- `MAIN_IDS`（UI コード）に並べたモデルは初期選択され、先頭に出る。それ以外はすべて「More models」に入る（中立なラベル。そのモデルの note に「プロバイダのページがそう書いている」とない限り、古い・旧世代とは言わない）。
- 価格階層が別にあるモデル（例：Haiku 5.5 の 100K トークン超、OpenAI の 272K 超、Gemini Pro の 200K 超）を変えたら、「How it works」の文言とステップ 05 の注記も直す。
- Gemini の行：`cacheWrite: null` のままにする（Gemini はキャッシュ書き込み単価を載せていない）。テキスト入力の単価を使う。Gemini 3.8／3.7／3.6 Flash の価格は 2027-01-01 に変わる（$1.50 / $7.50 / キャッシュ $0.15）。そのときに更新する。
- `node calc/tests/logic.test.js` を実行する。テストのひとつが、Anthropic と OpenAI の価格が `signal-lab/model-switch-calculator/index.html` と一致するかを調べる。元ツールには Gemini の行がないので、Google の行と日付は比較しない。2 つのファイルは一緒に更新すること。
- `og.png` にはサンプルの数値が載っている。その数値が変わったら、`og-template.html` から Playwright で 1200×630 で描き直す。

## プライバシー

- 読み込みと計算はすべてブラウザ内で行う。利用データはアップロードしない。
- 解析ツール・トラッカー・Cookie・ストレージは使わない。スクリプトはインラインのものだけ。ページの Content-Security-Policy は `default-src 'none'` で `connect-src` がないので、ページからの通信はブラウザが止める。フォントはシステムフォント。
- 共有リンクが URL ハッシュに入れるのは、設定と集計トークン量だけ（貼り付けたデータは入れない）。ブラウザはハッシュをサーバーに送らない。それでも合計値から利用量は分かるので、コピーする前にページでそう伝えている。
- 外部リンクは、Anthropic・OpenAI・Google の公式価格ページだけ（`target="_blank" rel="noopener noreferrer"`）。
- Budget Guard の待機リストのフォームは **ダミー**（コードに `TODO(dummy)` と印がある）。メールアドレスをローカルで検証してメッセージを出すだけで、何も送らず、何も保存しない。メール欄に `name` がないので、JS なしで送信してもデータは載らない。本物の登録につなぐ前に、ページのプライバシー文言を直し、プライバシー通知を加えること。

## ローカルでの確認（サブパス）

```sh
mkdir -p /tmp/site/new-project && ln -sfn "$PWD/calc" /tmp/site/new-project/calc
python3 -m http.server 8765 --directory /tmp/site   # open http://127.0.0.1:8765/new-project/calc/
```

v2 は Playwright（Chromium）で、1280px のライトと 360px のダークで確認した。確認した項目：コンソールエラーがない、ページ自身のオリジン以外へのリクエストがない、横スクロールがない、Gemini の行があり価格が付いている、プロバイダの絞り込みが動く。さらに、あるページでコピーした共有リンクを新しいコンテキストで開くと比較行が完全に一致すること、悪意あるハッシュや壊れたハッシュで注入が起きずサンプルに戻ることも確認した。
