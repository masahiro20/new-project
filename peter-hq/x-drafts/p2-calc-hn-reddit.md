# P2 Model Switch Calculator — HN and Reddit drafts

Author: Midas (2026-10-09). Status: **draft. Do not post before the owner approves.** Posting uses the owner's own HN and Reddit accounts.
Page: https://masahiro20.github.io/new-project/calc/ (live, checked 2026-10-09)

## What the page actually does (every claim below comes from the live page)
- You paste an Anthropic or OpenAI usage export (CSV or JSON) or drop in a file. The page shows what the same traffic would cost per month on each current Claude and GPT model, side by side.
- List prices were checked on 2026-10-08 against the official pricing pages. Rows whose price isn't verified are left out of totals, and you can type in a price yourself.
- **Runs entirely in the browser.** After the page loads it makes no network requests: no uploads, no tracking, no sign-up.
- Cache-aware:
  - Cache writes and reads are priced separately.
  - A "keep my cache hit ratio" toggle controls how cache tokens are priced on the target model.
  - 30-day normalisation.
- You can copy the results as Markdown or CSV. Sample data is included for both providers.
- Caveats stated on the page:
  - Tokenizers differ, so cross-provider comparisons are estimates.
  - Prices are standard tier, with no Batch, long-context or regional pricing.

## Rules that apply
| Place | Rules | Checked |
|---|---|---|
| Show HN | The title starts with "Show HN". It must be something people can try easily, ideally with no sign-up or email. You must be the maker and available to discuss it. Landing pages and sign-up pages don't qualify, and neither do "quickly generated one-off projects". **Don't ask friends to upvote or comment.** The first comment should explain how and why you built it. | [official] https://news.ycombinator.com/showhn.html |
| r/SideProject | Third-party guides describe it as one of the most promotion-friendly subs. Posts need a story and context; bare link drops get removed. | [secondary] https://www.indiehackers.com/post/what-subreddits-have-you-found-that-actually-allow-and-encourage-self-promotion-864d4da1cd ; current sidebar **[unverified]** |
| r/ClaudeAI | A mod post (Apr 2026) says projects go in the **Project Showcase megathread**. Posting a showcase to the main feed needs at least 50 total karma. It refers to a "Rule 7" whose text we couldn't read. | [secondary] https://redlib.groet-infra.nl/r/ClaudeAI/comments/1sly3jm/built_with_claude_project_showcase_megathread/oo1qqsm/?context=3 ; Rule 7 **[unverified]** |
| r/OpenAI, r/LLMDevs | Not checked. Reddit couldn't be fetched from this environment. | **[unverified]** — read the sidebar before posting, or skip |

**Show HN risk:** HN excludes "quickly generated one-off projects". The calculator is small, but it isn't trivial: it parses four export formats, has a cache-aware cost model and shows its price sources. The first comment should lead with that build detail, not with the launch. If the owner feels it's too thin for Show HN, post r/SideProject first and keep HN for Budget Guard.

## Order and timing (JST)
| Day | Where | Time | Why |
|---|---|---|---|
| 1 | Show HN | Tue–Thu, 22:00–23:00 JST (8–10am US Eastern) | US morning traffic. Stay on the thread for 3 hours to answer |
| 3 | r/SideProject | 23:00 JST | A different audience; don't post the same day as HN |
| 5 | r/ClaudeAI Project Showcase megathread (as a comment) | 23:00 JST | The megathread avoids the karma rule |
| — | r/OpenAI / r/LLMDevs | only after reading the rules | Optional |

One post per place. No cross-posting on the same day. Reply to every question.

---

## 1. Show HN

**Title** (73 chars, limit 80)
```
Show HN: Model Switch Calculator – price your LLM usage on every other model
```

**URL:** https://masahiro20.github.io/new-project/calc/

**First comment (by the owner)**
```
Hi HN. I built this after watching our own API bills and asking a simple question every time a cheaper model shipped: if we moved all of this traffic, what would the month actually cost?

The pricing pages answer per-token questions, but real usage is a mix of input, output, cache writes and cache reads, and that mix changes the answer a lot. So the calculator takes the usage export you already have (Anthropic Console CSV, Anthropic Admin API JSON, OpenAI usage CSV/JSON, or a plain date,model,tokens CSV) and reprices the whole bundle on each current Claude and GPT model.

A few details:
- It runs entirely in your browser. After the page loads it makes no network requests, so your usage data stays on your machine.
- Cache tokens are priced separately, with a toggle for whether your cache hit ratio carries over to the target model.
- Prices were checked against the official pages on 2026-10-08. Anything I couldn't verify is left out of totals; you can type in your own number.
- Cross-provider numbers are estimates because tokenizers differ. Same-provider comparisons are tighter.

There's sample data if you don't want to paste your own. I'd love to hear where the numbers look wrong for your workload, or which export format I'm missing.
```

## 2. r/SideProject

**Title**
```
I made a free, browser-only calculator that reprices your real LLM usage on every Claude and GPT model
```

**Body**
```
Every time a cheaper model comes out I end up doing the same spreadsheet: take last month's usage, split it into input, output and cache tokens, and multiply by a new price list. So I turned it into a page.

You paste your Anthropic or OpenAI usage export (CSV or JSON, or drop the file), and it shows what the same traffic would cost per month on each current model, side by side. You can copy the table as Markdown or CSV.

Things I cared about:
- Nothing leaves your browser. No sign-up, no uploads, no tracking.
- Cache writes and reads are priced separately, because that's where most "switch and save" estimates go wrong.
- Every price shows where it came from and when it was checked (2026-10-08). Unverified prices are left out unless you type one in.

It's free. There's sample data if you just want to see how it works:
https://masahiro20.github.io/new-project/calc/

What I'm unsure about: cross-provider comparisons are estimates because tokenizers differ. If you have a good way to handle that, I'm all ears.
```

## 3. r/ClaudeAI — comment in the Project Showcase megathread
```
**Model Switch Calculator** — https://masahiro20.github.io/new-project/calc/

What it does: paste your Anthropic Console usage CSV or Admin API usage JSON, and it shows what the same traffic would cost per month on each current Claude model (and GPT models, if you're comparing). Cache writes and cache reads are priced separately, with a toggle for keeping your cache hit ratio on the new model.

How it's built: one static page, no backend. It makes no network requests after it loads, so usage data stays in your browser. I built it with Claude Code. Prices were checked against the official pricing pages on 2026-10-08, and unverified prices are left out of totals.

Free, no sign-up. Feedback on the cost model is very welcome, especially from anyone using 1-hour cache writes.
```

## Before approval
- [ ] Owner: the HN and Reddit accounts are your own. New accounts are often limited, so older accounts are better.
- [ ] Re-check the price table against the official pages on the posting day. If prices changed, update the page first.
- [ ] Read each subreddit's current sidebar. Skip any place whose rules don't allow this.
- [ ] Never ask anyone to upvote (HN rule).
- [ ] Budget Guard isn't mentioned in these posts on purpose. The page itself links to it.
