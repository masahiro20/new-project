# Model Switch Calculator

ブラウザだけで動くツール。API の利用データを貼り付けると、その利用量をすべて別のモデルに移した場合の月額を見積もる。UI は日本語。

- ファイル：`index.html` は、artifact のページ規約に沿った 1 ページ分の断片。doctype／html／head／body タグはなく、通信もしない。
- プライバシー：すべてブラウザ内で動く。どこにも何も送らない。リンクは価格の出典へのものだけ。

## 対応する入力（自動判定）
- Anthropic Console の利用 CSV。`usage_input_tokens_no_cache`、`..._cache_write_5m/1h`、`..._cache_read`、`usage_output_tokens` などの列。
- Anthropic Admin API の `usage_report/messages` JSON。`data[].results[]` を読む。
- OpenAI の利用 CSV と、Admin API の `/v1/organization/usage/completions` JSON。`input_cached_tokens` は `input_tokens` の一部として数える。
- 汎用 CSV：`date,model,input_tokens,output_tokens[,cached_input_tokens]`。

ヘッダーの照合では、大文字・小文字、空白、アンダースコアを無視する。区切りはカンマ・タブ・セミコロンのどれでもよい。

## 価格の更新
価格表は `<script>` の先頭近くにある定数 `PRICES` ひとつ。`PRICES —` と `END PRICES` の見出しコメントの間にあり、形は `prices.json` と同じ。
- 合計に使われるのは、`status: "verified"` で、`input` と `output` の価格が null でない行だけ。
- それ以外の行は「未確認」と表示し、合計から外す。ユーザーがその行に価格を入力すると合計に入り、その行は「手入力」と表示される。
- UI コードの `MAIN_IDS` に ID を並べたモデルは、メインの価格表に出て、初期状態で比較対象に選ばれる。それ以外のモデルはすべて「旧世代」に入る。

## コストの前提
- 価格は Standard 階層。Batch 割引、長文コンテキストの割増、リージョン割増は含めない。
- Anthropic のキャッシュ書き込みは 5 分の単価を使う。1 時間のキャッシュ書き込みは入力単価の 2 倍。
- OpenAI 宛てでは、キャッシュ書き込みトークンを通常の入力単価で数える。
- 「キャッシュ率を維持する」オン：キャッシュ読み込みトークンを、移行先モデルのキャッシュ読み込み単価で数える。
- 「キャッシュ率を維持する」オフ：入力トークンをすべて通常の入力単価で数える。
- 「30日換算」は、合計に 30 ÷（データの日数）を掛ける。
- プロバイダごとにトークナイザーが違うので、プロバイダをまたぐトークン数は概算になる。
