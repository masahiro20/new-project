# Model Switch Calculator

A browser-only tool. Paste API usage data and it estimates the monthly cost if all of that traffic moved to another model. The UI is in Japanese.

- File: `index.html` is a single page fragment that follows the artifact page contract. It has no doctype/html/head/body tags and makes no network requests.
- Privacy: everything runs in the browser. Nothing is sent anywhere. The only links are the pricing-source links.

## Supported input (auto-detected)
- Anthropic Console usage CSV. Columns such as `usage_input_tokens_no_cache`, `..._cache_write_5m/1h`, `..._cache_read`, `usage_output_tokens`.
- Anthropic Admin API `usage_report/messages` JSON. The tool reads `data[].results[]`.
- OpenAI usage CSV and Admin API `/v1/organization/usage/completions` JSON. `input_cached_tokens` is counted as part of `input_tokens`.
- Generic CSV: `date,model,input_tokens,output_tokens[,cached_input_tokens]`.

Header matching ignores case, spaces and underscores. The input can be comma, tab or semicolon separated.

## Updating prices
The price table is the single `PRICES` constant near the top of the `<script>`. It sits between the `PRICES —` and `END PRICES` banners and uses the same shape as `prices.json`.
- A row is used in totals only when it has `status: "verified"` and non-null `input` and `output` prices.
- Every other row shows 「未確認」 and is left out of totals. The user can type a price into that row to include it; the row is then marked 手入力.
- Models whose IDs are listed in `MAIN_IDS` in the UI code appear in the main price table and are selected for comparison by default. All other models go under 旧世代.

## Cost assumptions
- Prices use the Standard tier. They exclude Batch discounts, long-context surcharges and regional uplifts.
- Anthropic cache writes use the 5-minute price. A 1-hour cache write costs 2x input.
- For OpenAI targets, cache-write tokens are charged at the normal input price.
- 「キャッシュ率を維持する」 (on): cache-read tokens are charged at the target model's cache-read price.
- 「キャッシュ率を維持する」 (off): all input tokens are charged at the normal input price.
- 30日換算 multiplies the totals by 30 / (number of days the data covers).
- Token counts are approximate across providers because their tokenizers differ.
