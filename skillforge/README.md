# Yuragi（仮称）— JA↔EN game script consistency QA

> P1 SkillForge, stage 2 prototype. **Internal only — not published.** "Yuragi" (揺らぎ) is a working name; the trademark check is still pending.
> This directory is a standalone project. It has nothing to do with the Next.js app at the repo root.

It checks **the whole script at once** and reports what drifts between lines, with `file:line` references:

| Check | Example | Needs glossary? |
|---|---|---|
| **Glossary term drift** 用語の訳揺れ | 魔導石 → "Mana Stone" ×5, "Magic Stone" ×2 (`script.csv:6`, `:17`) | yes |
| **Katakana notation drift** 表記揺れ | ルーンゲート ×2 / ルーン・ゲート ×1, サーバー / サーバ | no |
| **Character-name drift** キャラ名の揺れ | "Lizette" (forbidden), "Lisete" (near-miss), speaker label `MINA` vs `ミナ` | partly |
| **Honorific drift** 敬称の揺れ | ミナ's リゼット様 → "Lady Lisette" ×2, "Lisette" ×1, "Lisette-sama" ×1 (policy: localize) | partly |
| **Voice drift** 口調の揺れ | Tobias (俺) says 僕; Lisette (polite, no contractions) says "We're gonna be fine" | profiles help |
| Bonus rules | placeholders `{0}` `%s` `[PLAYER]`, tags, ruby (`{漢字|かんじ}`, `｜漢字《かんじ》`, `<ruby>`), length limits | no |

Lines the rules can't judge — "does this still sound like her?", recurring terms missing from the glossary — come back as **review packets**. The user's own assistant (Claude Code etc.) judges them. Our server does not need to call a model.

## Architecture

```
user's Claude Code ──(plugin: skill + /lqa-check + .mcp.json)──► remote MCP server (this repo, src/server)
   │ reads files, judges review packets,                           │ deterministic engine (src/core)
   │ writes the final report                                       │ stateless: nothing stored, content never logged
   └── reasoning runs on the user's own subscription               └── optional server-side judge: OFF by default,
                                                                       uses OUR API key only (YURAGI_ANTHROPIC_API_KEY)
```

- **Inference stays with the user.** The server never accepts or relays a user's model credentials. If we ever judge on the server (batch/CI mode), it uses the company key from `YURAGI_ANTHROPIC_API_KEY` and that cost goes into the plan price. The tool `judge_review_packets_server_side` only exists when that key is set.
- **Value lives on the server** (rule engine, Japanese-specific heuristics, later: hosted shared glossaries), not in a copyable skill file.
- The product name doesn't use "Claude". Claude Code is mentioned only as a compatible client.

## Layout

```
src/core/         engine — parsers (CSV/TSV, JSON, XLIFF 1.2/2.0), glossary, checks, Markdown report
src/server/       remote MCP server (Streamable HTTP, stateless) + optional server-side judge
src/cli/          local CLI (same engine; handy for tests and demos)
plugin/           thin Claude Code plugin: skill, /lqa-check command, .mcp.json
samples/          invented sample scripts and glossaries (no real game text)
test/             node:test suites (parsers, checks, MCP over HTTP)
docs/lp.md        landing-page copy draft (NOT published)
```

## Run it

```bash
cd skillforge
npm install
npm test                       # 38 tests: parsers, checks, review regressions, MCP end-to-end
npm run check:sample           # CLI report for samples/ja-en
npx tsx src/cli/index.ts check samples/en-ja/ui.xlf --glossary samples/en-ja/glossary.json

npm run serve                  # MCP on http://localhost:8787/mcp (no auth in dev)
YURAGI_API_TOKENS=secret1 NODE_ENV=production npm run build && npm start
```

Use it from Claude Code (local test):

```bash
npm run serve &
claude --plugin-dir ./plugin   # then: /lqa-check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json
```

CLI exit codes: `0` no errors, `1` errors found, `2` bad input (CI-friendly).

## Input formats

- **CSV/TSV**: header row required. Auto-detected columns: `id|key`, `ja|source|原文`, `en|target|訳文`, `speaker|character|話者`, `max_length|limit|文字数`, `context|notes`. Line numbers are the physical line where the record starts, so multi-line cells are handled.
- **JSON**: `[{...}]`, `{"strings": [{...}]}`, or `{"key": {"ja": "...", "en": "..."}}`. The line is the record's opening brace.
- **XLIFF 1.2** (`<trans-unit>`, `maxwidth`) and **2.0** (`<unit><segment>`). Speaker comes from `<note from="speaker">`, `<note category="speaker">` or a `speaker: X` note. Inline tags (`<g>`, `<x/>`, `<ph>`, `<pc>`) are kept for the tag check.
- Direction is detected per table (JA→EN or EN→JA). Japanese-side checks run on whichever side is Japanese.
- **Glossary**: JSON (terms, characters, aliases, forbidden spellings, voice profiles, `honorificPolicy`). A simple CSV also works: `type,source,target,allowed,forbidden,note`. See `samples/ja-en/glossary.json` and `plugin/skills/script-consistency/SKILL.md`.

## MCP tools

| Tool | What it does |
|---|---|
| `check_script` | Runs all checks. Returns a Markdown report (content), plus findings, usage tallies and packet summaries (structuredContent). Options: `rules`, `wideAsTwo`, `minSeverity`. |
| `get_review_packets` | Returns the voice and unglossaried-term packets for the client to judge. Can filter with `subjects`. |
| `validate_glossary` | Parses a glossary and reports what was understood, or the errors. |
| prompt `review-script` | The step-by-step review workflow. |

Limits per call: 20 tables, 5M chars per table, 100k rows, 25 MB request.

## Known limits (prototype)

- Japanese analysis is heuristic: regex-based, no morphological analyzer. Pronoun and politeness detection is tuned to avoid obvious lookalikes (私服, こわしが), but it will miss or misread some lines. That's why voice findings stay at warning/info and the packets go to the model.
- Near-miss name detection can flag a real English word one letter away from a name. Add those words to `ignoreWords`.
- Auth is a static bearer token. Before any external user, this needs per-user tokens or OAuth, rate limits, and a written no-retention policy that also covers logs.
- No hosted glossary storage yet. Each call sends the whole glossary.
