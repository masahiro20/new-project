# P2 Model Switch Calculator — X drafts (English, 5 posts)

Author: Midas (2026-10-08). Status: **draft. Do not post before the owner approves.**

- Account: the existing automation account (owner's instruction)
- Replace `{URL}` with the public URL of the calculator. Post 5 needs the Budget Guard waitlist page, so hold it until that page is live (`{URL}` there means the waitlist URL)
- Every claim matches `signal-lab/model-switch-calculator/README.md` on `peter/p2-signal-lab`. Results are estimates (Standard tier, no Batch discounts, tokenizers differ across providers), so no post promises savings
- Length: checked against X's 280 limit, with each URL counted as 23 : all 5 posts fall between 215 and 255

---

### 1. Launch
New cheaper models keep coming. Would switching actually lower your bill?
Paste your Anthropic or OpenAI usage export and see an estimated monthly cost on other models. It runs in your browser and uploads nothing. Free.
{URL}

### 2. Caching
Most "switch and save" math ignores prompt caching.
This calculator reads cache writes and cache reads from your usage export, and lets you choose whether your cache hit rate carries over to the new model.
{URL}

### 3. Privacy and formats
Your usage logs say a lot about your product, so the calculator parses them locally and makes no network requests.
Works with Anthropic Console CSV, the Admin API usage JSON, OpenAI usage CSV/JSON, or a plain date,model,tokens CSV.
{URL}

### 4. Prices you can check
Model prices change often. The calculator only totals models whose prices we checked against the official pricing pages. Anything unconfirmed is labeled, and you can type in a price yourself.
{URL}

### 5. Budget Guard teaser (hold until the waitlist page is live)
A cheaper model lowers the bill. It doesn't stop a runaway loop at 3 a.m.
We're building Budget Guard: one view of Vercel, OpenAI and Anthropic spend, an alert at 80%, and a stop action you can test first.
Waitlist: {URL}

---

## Before approval
- [ ] Is the calculator hosted at a public URL? Today it is a page fragment on `peter/p2-signal-lab` and has no public URL yet
- [ ] Do the price rows still match the official pages on the posting day?
- [ ] Post 5 only after the Budget Guard waitlist page is published
