# Model Switch Calculator (static site)

Public, English version of `signal-lab/model-switch-calculator/`. Paste an Anthropic or OpenAI usage export and see what the same traffic would cost per month on other Claude and GPT models. Plain static files: no build step, no dependencies, no backend.

Planned URL: https://masahiro20.github.io/new-project/calc/

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site: landing page, calculator, price table, how-it-works, FAQ, Budget Guard waitlist (dummy). All CSS/JS is inline. |
| `favicon.svg` | Favicon (relative link). |
| `og.png` | 1200×630 social preview image. |
| `og-template.html` | Source of `og.png`. Not linked from the site. |
| `tests/logic.test.js` | Logic tests. Run `node calc/tests/logic.test.js` (Node 18+, no deps). |

All asset paths are relative, so the site works under any sub-path. The only absolute URLs are `canonical`, `og:url`, `og:image` and `twitter:image`. Crawlers require absolute URLs there. If the hosting URL changes, update those four tags in `index.html`.

## Deploy on GitHub Pages

1. Make sure `calc/` is on the branch that Pages publishes.
2. In the repo, go to **Settings → Pages → Build and deployment**. Pick **Deploy from a branch**, choose the branch (e.g. `main`) and the folder **`/ (root)`**. The site is then served at `https://masahiro20.github.io/new-project/calc/`.
   - If Pages already publishes another folder (e.g. `/docs`) or a separate branch, copy `calc/` into that folder or branch instead. The URL becomes `<pages-root>/calc/`, and you need to update the four absolute URLs above.
   - Jekyll does not change any file here, so `.nojekyll` is optional. You only need it, at the publishing root, if other folders start with `_`.
3. After the site deploys, check `…/calc/`, `…/calc/og.png` and `…/calc/favicon.svg`. Then run a URL through a card validator (e.g. opengraph.xyz) to confirm the preview.

## Updating prices

Prices live in a single constant, `PRICES`, inside `<script id="app">` in `index.html`. It sits between the `PRICES —` and `END PRICES` banners and has the same shape as the source tool.

- Change the numbers, `source`, `note` and `checkedOn`. Values are USD per 1M tokens and `null` means not listed. Every "Checked …" date on the page is filled in from `PRICES.checkedOn`.
- A row counts toward totals only when it has `status: "verified"` and non-null `input`/`output`. Every other row is shown as "Unverified", and users can type a price into it.
- Models listed in `MAIN_IDS` (UI code) are pre-selected and shown first. All other models go under "Older models".
- If a model has a different price tier (e.g. Haiku 5.5 over 100K tokens, OpenAI over 272K), update the copy in "How it works" and the notes in step 05.
- Run `node calc/tests/logic.test.js`. One test checks that `PRICES` matches `signal-lab/model-switch-calculator/index.html`. Update both files together, or change that test if the two are meant to diverge.
- `og.png` shows sample numbers. Re-render it from `og-template.html` with Playwright at 1200×630 if those numbers change.

## Privacy

- All parsing and calculation run in the browser. Usage data is never uploaded.
- No analytics, trackers, cookies or storage. The only scripts are inline. The page's Content-Security-Policy is `default-src 'none'` with no `connect-src`, so the browser blocks network requests from the page. Fonts are system fonts.
- External links go only to the official Anthropic and OpenAI pricing pages (`target="_blank" rel="noopener noreferrer"`).
- The Budget Guard waitlist form is a **dummy** (marked `TODO(dummy)` in the code). It validates the email locally, shows a message, and sends and stores nothing. The email field has no `name`, so even a no-JS submit carries no data. Before connecting a real signup, update the privacy copy on the page and add a privacy notice.
