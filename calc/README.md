# Model Switch Calculator (static site)

Public, English version of `signal-lab/model-switch-calculator/`. Paste an Anthropic or OpenAI usage export (or a generic CSV) and see what the same traffic would cost per month on other Claude, GPT and Gemini models. Plain static files: no build step, no dependencies, no backend.

Live URL: https://masahiro20.github.io/new-project/calc/ (served from a copy on `gh-pages`; this directory is the source).

## v2 changes (2026-10-09)

- **Google Gemini models.** 11 Gemini rows (provider `google`) from the official Gemini API pricing page, Paid tier, Standard, text/image/video input. Three are main models (pre-selected): Gemini 3.8 Flash, Gemini 3.5 Flash-Lite and Gemini 3.1 Pro Preview. The other eight are under "More models". Pro models use the tier for prompts of 200K tokens or less. Gemini 3.8/3.7/3.6 Flash prices are promotional through 2026-12-31.
- **Gemini cache assumption.** Gemini has a cached-token price (used as `cacheRead`) and an hourly storage price, but no cache-write price. Cache-write tokens on Gemini targets are charged at the input price, and storage is not modelled. `cacheWrite` is `null` on every Gemini row.
- **Google provider.** Model names starting with `gemini` (or `models/gemini`) are detected as Google. There is no dedicated Gemini export parser: Gemini usage goes through the generic CSV (see the FAQ). Step 05 has a provider filter: All / Anthropic / OpenAI / Google.
- **Share link.** "Copy share link" (step 03) puts settings and aggregate totals in the URL hash: `#s=<base64url(JSON)>`, with `v: 1`. A "What's in this link" disclosure shows the exact JSON and warns that the totals reveal usage volume. Opening a link restores that state, shows a "Loaded from shared link" badge, and offers a "Clear shared link" button. Invalid links show an error and load the sample instead.
- **Price re-check.** All 24 Anthropic and OpenAI rows were re-checked on 2026-10-09. No price had changed. `PRICES.checkedOn` is now 2026-10-09.

### Share-link format (v1)

```json
{ "v": 1, "period": "30d" | "raw", "keepCache": true, "days": 14,
  "totals": { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 },
  "models": { "<price-table id>": { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 } },
  "other":  { "unc": 0, "cw5": 0, "cw1": 0, "cr": 0, "out": 0 },
  "compare": ["<price-table id>"],
  "manual": { "<price-table id>": { "input": 1, "output": 2, "cacheRead": 0.1, "cacheWrite": 1.25 } } }
```

- Token values are raw totals for the data period, in tokens: `unc` is uncached input, `cw5` and `cw1` are 5-minute and 1-hour cache writes, `cr` is cache reads, `out` is output. `days` is used for 30-day scaling.
- Models in the data are keyed by price-table id. Usage from models that are not in the price table is merged into `other`, so model names typed by the user never reach the link. Rows, dates, file names and pasted text are never included.
- Decoding (`Share.decode`) never throws. It rejects a hash longer than 8000 characters, invalid base64url, invalid UTF-8, JSON that is not an object, and any `v` other than 1. Numbers must be finite and non-negative. Tokens are clamped to 1e15, days to 3660 and prices to 10000 USD per 1M tokens. Lists are capped at 200 entries. Unknown ids are ignored, and their tokens move to `other`. Strings decoded from the link are used only as lookup keys into `PRICES` and are never rendered as HTML.
- The format is version 1. If you change it, bump `v` and keep decoding `v: 1`, because people may still have old links.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site: landing page, calculator, price table, how-it-works, FAQ, Budget Guard waitlist (dummy). All CSS/JS is inline. |
| `favicon.svg` | Favicon (relative link). |
| `og.png` | 1200×630 social preview image. |
| `og-template.html` | Source of `og.png`. Not linked from the site. |
| `tests/logic.test.js` | Logic tests, including share encode/decode, hostile hashes and hand-checked Gemini costs. Run `node calc/tests/logic.test.js` (Node 18+, no deps). |

All asset paths are relative, so the site works under any sub-path. The only absolute URLs are `canonical`, `og:url`, `og:image` and `twitter:image`. Crawlers require absolute URLs there. If the hosting URL changes, update those four tags in `index.html`.

## Deploy on GitHub Pages

1. Make sure `calc/` is on the branch that Pages publishes.
2. In the repo, go to **Settings → Pages → Build and deployment**. Pick **Deploy from a branch**, choose the branch (e.g. `main`) and the folder **`/ (root)`**. The site is then served at `https://masahiro20.github.io/new-project/calc/`.
   - If Pages already publishes another folder (e.g. `/docs`) or a separate branch, copy `calc/` into that folder or branch instead. The URL becomes `<pages-root>/calc/`, and you need to update the four absolute URLs above.
   - Jekyll does not change any file here, so `.nojekyll` is optional. You only need it, at the publishing root, if other folders start with `_`.
3. After the site deploys, check `…/calc/`, `…/calc/og.png` and `…/calc/favicon.svg`. Then run a URL through a card validator (e.g. opengraph.xyz) to confirm the preview.

## Updating prices

Prices live in a single constant, `PRICES`, inside `<script id="app">` in `index.html`. It sits between the `PRICES —` and `END PRICES` banners and has the same shape as the source tool.

Steps:

1. Open the three official pages. They are the only sources: https://platform.claude.com/docs/en/about-claude/pricing, https://developers.openai.com/api/docs/pricing and https://ai.google.dev/gemini-api/docs/pricing. The OpenAI table is easiest to read from the raw page data (`curl` the page and search for the model id). The Gemini page loses the `<=` / `>` tier labels when its HTML is stripped, so read the Pro tiers from the raw HTML.
2. Edit the rows in `PRICES`. Set `PRICES.checkedOn` to the date you checked. If you only re-check some rows, give each of those rows its own `checkedOn`.
3. Add a sentence to `PRICES.notes` that says what changed.
4. Run the tests. Re-run the Playwright check described below if the UI changed.

Details:

- Change the numbers, `source`, `note` and `checkedOn`. Values are USD per 1M tokens and `null` means not listed. Every "Checked …" date on the page is filled in from `PRICES.checkedOn`.
- A row counts toward totals only when it has `status: "verified"` and non-null `input`/`output`. Every other row is shown as "Unverified", and users can type a price into it.
- Models listed in `MAIN_IDS` (UI code) are pre-selected and shown first. All other models go under "More models" (a neutral label: it does not claim a model is older or legacy unless its note says the provider page does).
- If a model has a different price tier (e.g. Haiku 5.5 over 100K tokens, OpenAI over 272K, Gemini Pro over 200K), update the copy in "How it works" and the notes in step 05.
- Gemini rows: keep `cacheWrite: null` (Gemini lists no cache-write price). Use the text input price. Gemini 3.8/3.7/3.6 Flash prices change on 2027-01-01 (to $1.50 / $7.50 / cached $0.15). Update them then.
- Run `node calc/tests/logic.test.js`. One test checks that the Anthropic and OpenAI prices match `signal-lab/model-switch-calculator/index.html`. The source tool has no Gemini rows, so Google rows and dates are not compared. Update both files together.
- `og.png` shows sample numbers. Re-render it from `og-template.html` with Playwright at 1200×630 if those numbers change.

## Privacy

- All parsing and calculation run in the browser. Usage data is never uploaded.
- No analytics, trackers, cookies or storage. The only scripts are inline. The page's Content-Security-Policy is `default-src 'none'` with no `connect-src`, so the browser blocks network requests from the page. Fonts are system fonts.
- Share links put only settings and aggregate token totals in the URL hash (never pasted data). Browsers do not send the hash to the server. The totals still reveal usage volume, and the page says so before you copy.
- External links go only to the official Anthropic, OpenAI and Google pricing pages (`target="_blank" rel="noopener noreferrer"`).
- The Budget Guard waitlist form is a **dummy** (marked `TODO(dummy)` in the code). It validates the email locally, shows a message, and sends and stores nothing. The email field has no `name`, so even a no-JS submit carries no data. Before connecting a real signup, update the privacy copy on the page and add a privacy notice.

## Local check (sub-path)

```sh
mkdir -p /tmp/site/new-project && ln -sfn "$PWD/calc" /tmp/site/new-project/calc
python3 -m http.server 8765 --directory /tmp/site   # open http://127.0.0.1:8765/new-project/calc/
```

v2 was checked with Playwright (Chromium) at 1280px light and 360px dark. The checks: no console errors, no requests outside the page's own origin, no horizontal scroll, Gemini rows present and priced, and the provider filter working. Also checked: a share link copied in one page and opened in a fresh context gives identical comparison rows; hostile and broken hashes cause no injection and fall back to the sample.
