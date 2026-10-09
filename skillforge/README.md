# Kotomark（仮称）— JA↔EN game script consistency QA

> P1 SkillForge, stage 2 prototype. **Internal only — not published.** "Kotomark" is a working name; the trademark check is still pending.
> This directory is a standalone project. It has nothing to do with the Next.js app at the repo root.

It checks **the whole script at once** and reports what drifts between lines, with `file:line` references:

| Check | Example | Needs glossary? |
|---|---|---|
| **Glossary term drift** 用語の訳揺れ | 魔導石 → "Mana Stone" ×6, "Magic Stone" ×2 (`script.csv:6`, `:17`) | yes |
| **Katakana notation drift** 表記揺れ | ルーンゲート ×2 / ルーン・ゲート ×1, サーバー / サーバ | no |
| **Character-name drift** キャラ名の揺れ | "Lizette" (forbidden), "Lisete" (near-miss), speaker label `MINA` vs `ミナ` | partly |
| **Honorific drift** 敬称の揺れ | ミナ's リゼット様 → "Lady Lisette" ×2, "Lisette" ×1, "Lisette-sama" ×1 (policy: localize) | partly |
| **Voice drift** 口調の揺れ | Tobias (俺) says 僕; Lisette (polite, no contractions) says "We're gonna be fine" | profiles help |
| Bonus rules | placeholders `{0}` `%s` `$var` `[PLAYER]`, tags, ruby (`{漢字|かんじ}`, `｜漢字《かんじ》`, `<ruby>`), length limits, untranslated rows (empty, PO fuzzy, English copied into a JA target) | no |

Lines the rules can't judge — "does this still sound like her?", recurring terms missing from the glossary — come back as **review packets**. The user's own assistant (Claude Code etc.) judges them. Our server does not need to call a model.

## Architecture

```
user's Claude Code ──(plugin: skill + /lqa-check + .mcp.json)──► remote MCP server (this repo, src/server)
   │ reads files, judges review packets,                           │ deterministic engine (src/core)
   │ writes the final report                                       │ stateless: nothing stored, content never logged
   └── reasoning runs on the user's own subscription               └── optional server-side judge: OFF by default,
                                                                       uses OUR API key only (KOTOMARK_ANTHROPIC_API_KEY)
```

- **Inference stays with the user.** The server never accepts or relays a user's model credentials. If we ever judge on the server (batch/CI mode), it uses the company key from `KOTOMARK_ANTHROPIC_API_KEY` and that cost goes into the plan price. The tool `judge_review_packets_server_side` only exists when that key is set.
- **Value lives on the server** (rule engine, Japanese-specific heuristics, later: hosted shared glossaries), not in a copyable skill file.
- The product name doesn't use "Claude". Claude Code is mentioned only as a compatible client.

## Layout

```
src/core/         engine — parsers (CSV/TSV, XLSX, JSON incl. i18n locale files, XLIFF 1.2/2.0, gettext PO), loadInputs + pairing, glossary, checks, Markdown report
src/server/       remote MCP server (Streamable HTTP, stateless) + optional server-side judge
src/cli/          local CLI (same engine; handy for tests and demos)
plugin/           thin Claude Code plugin: skill, /lqa-check command, .mcp.json
samples/          invented sample scripts and glossaries (no real game text)
test/             node:test suites (parsers, checks, MCP over HTTP)
docs/lp.md        landing-page copy draft (NOT published)
docs/data-policy.md  data handling policy draft
docs/pilot-guide.md  pilot instructions for testers + false-positive measurement procedure
docs/ci.md        running `kotomark check` in GitHub Actions / GitLab CI (formats, exit codes)
scripts/build-cli.mjs  bundles the CLI into dist/kotomark.mjs (the package bin)
action/           GitHub Action (composite; runs the committed bundle action/dist/kotomark.mjs; `npm run build:action`)
.github-example/  sample workflow using the action (copy into your repo's .github/workflows/)
```

## Run it

```bash
cd skillforge
npm install
npm test                       # node:test: parsers, checks, regressions, draft, store/auth, CLI, MCP end-to-end
npm run check:sample           # CLI report for samples/ja-en
npx tsx src/cli/index.ts check samples/en-ja/ui.xlf --glossary samples/en-ja/glossary.json

npm run serve                  # MCP on http://localhost:8787/mcp (no auth in dev)
KOTOMARK_API_TOKENS=secret1 NODE_ENV=production npm run build && npm start
```

Use it from Claude Code (local test):

```bash
npm run serve &
claude --plugin-dir ./plugin   # then: /lqa-check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json
```

## CLI

One command, CI-ready. Build the single-file bin (`dist/kotomark.mjs`, Node 20+, dependencies bundled in) or run from source:

```bash
npm run build:cli && node dist/kotomark.mjs check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json
npm run kotomark -- check samples/          # from source via tsx
npm pack                                    # kotomark-0.1.0.tgz → npm i ./kotomark-0.1.0.tgz → npx kotomark …
```

```bash
kotomark check <file|dir>... [options]
  -g, --glossary <file>          JSON or CSV glossary. Default: ./kotomark.glossary.json, ./glossary.json or
                                 ./kotomark.glossary.csv if present (noted on stderr); --no-glossary disables it
  --format md|json|junit|github  report format (default md); --json = --format json
  --input-format <fmt>           force the input parser (csv|tsv|json|xliff|xlsx|po|i18n-json|unity-csv|unreal-csv); default: detected
  --columns source=原文,target=訳文  column override for tables;  --sheet <name|1-based number> for .xlsx
  --fail-on error|warning|never  exit 1 at/above this severity (default error)
  --min-severity info|warning|error  hide lower findings in the report (gating still sees them); --no-info = warning
  --junit-fail-on <sev|never>    which severities become JUnit <failure> (default: follows --fail-on)
  --locale en|ja  --no-rules  --wide  -o, --out <file>
```

- Arguments can be files or directories (recursive: `.csv .tsv .json .xlf .xliff .xlsx .po .pot`; skips
  `node_modules`, `.git`, `*glossary*` files and `package.json`/`tsconfig.json`). File names in reports are
  paths relative to the working directory, so CI annotations point at real files.
- **Exit codes:** `0` passed · `1` findings at/above `--fail-on` · `2` bad input or usage.
- **Formats:** `json` = the full result plus `summary {errors, warnings, infos, byCategory}`; `junit` = one
  `<testsuite>` per category, one `<testcase>` per finding (`file:line rule`); `github` = `::error file=…,line=…::`
  annotations. CI setup for GitHub Actions and GitLab: [`docs/ci.md`](docs/ci.md).
- **GitHub Action:** `uses: masahiro20/new-project/skillforge/action@<ref>` with `paths`/`glossary`/`fail-on` —
  annotations, job summary, JUnit/JSON files and count outputs, no npm install. See [`action/README.md`](action/README.md).
- **Changed:** `--format` used to pick the *input* format. It now picks the report format; `--format csv|tsv|xliff|xlsx|po`
  still works as an input format (with a note), but `--format json` now means JSON output — use `--input-format json`.

Other commands:

```bash
kotomark draft <files|dirs...> [--glossary existing.json] --out draft.json   # glossary draft from the script
kotomark labels <files|dirs...> --glossary g.json --out labels.csv            # labeling sheet for the pilot
kotomark score labels.csv [--known known.csv]                                 # precision / recall
kotomark token create <user> --plan solo|studio                               # per-user API token (shown once)
kotomark token list | token revoke <user|prefix>
```

## Accounts, storage and limits

- **Tokens:** per-user bearer tokens in `$KOTOMARK_DATA_DIR/tokens.json` (SHA-256 hashes only; new tokens are picked up without a restart). Legacy `KOTOMARK_API_TOKENS` still works. With no tokens at all the server runs open, and refuses to start that way in production.
- **Saved glossaries:** `GlossaryStore` interface, local backend `FileGlossaryStore` (AES-256-GCM per file, names encrypted too, key `KOTOMARK_ENCRYPTION_KEY`). Swap the backend without touching the tools.
- **Limits (in memory, no external service):** Solo 30 req/min · 200k rows/day · 10 glossaries; Studio 120 · 1M · 50. HTTP 429 + `Retry-After` when exceeded.
- **Env var rename:** all settings are `KOTOMARK_*`. The pre-rename `YURAGI_*` names are still read as a fallback (`KOTOMARK_*` wins), see `src/server/env.ts`. The default data dir is now `./.kotomark-data`.
- Scripts are never stored; caches are cleared after every request; logs carry only method/path/status/user/time (tested). See `docs/data-policy.md`.

## Input formats

Every row keeps a `file:line` the user can open: the physical line (CSV, JSON, PO) or the spreadsheet row (XLSX).

- **CSV/TSV**: header row required. Auto-detected columns: `id|key`, `ja|source|原文`, `en|target|訳文`, `speaker|character|話者`, `max_length|limit|文字数`, `context|notes|comment`. Locale headers like `Japanese(ja)`, `English (en)`, `ja-JP`, `Japanese` also work. Line numbers are the physical line where the record starts, so multi-line cells are handled.
- **Excel `.xlsx`**: the first sheet with any text (or `sheet`: name or 1-based number), header row as in CSV. The line is the spreadsheet row number and the file label names the sheet: `book.xlsx#Script`. Shared, rich-text and inline strings are read; furigana (`<rPh>`) is skipped; formulas use their cached value; dates stay serial numbers. No SheetJS: `fflate` unzips and a small XML reader does the rest (browser-safe).
- **gettext `.po` / `.pot`**: `msgctxt` → id (else `msgid`), `msgid` → source, `msgstr` (or `msgstr[0]`) → target. Other plural forms become extra rows (`id[1]` = `msgid_plural` ↔ `msgstr[1]`). `#.` comments, `#:` references and the `fuzzy` flag go into the context; header and obsolete `#~` entries are skipped; the header `Language:` sets the target language. The line is the line of `msgctxt` (or `msgid`). Unreal Engine `.po` exports (`msgctxt "Namespace,Key"`, `#. Key:` / `#. SourceLocation:`) parse as-is.
- **JSON**: `[{...}]`, `{"strings": [{...}]}`, or `{"key": {"ja": "...", "en": "..."}}`. The line is the record's opening brace.
- **i18n locale JSON** (`ja.json` = `{"menu": {"start": "開始"}}`): an object whose string leaves are in one language. Keys are flattened with dots (`menu.start`, arrays as `items.0`), the line is where the key appears, and a `{"ja": {...}}` wrapper is understood.
- **Unity Localization string table CSV** (`Key,Id,Shared Comments,Japanese(ja),English(en)`): `Key` is the id, `Shared Comments` the context. As with plain `ja,en` columns, the left language column is the source.
- **Unreal string table CSV** (`Key,SourceString,Comment`): single-language. `\n`-style escapes are decoded; a `Speaker: X` comment sets the speaker.
- **XLIFF 1.2** (`<trans-unit>`, `maxwidth`) and **2.0** (`<unit><segment>`). Speaker comes from `<note from="speaker">`, `<note category="speaker">` or a `speaker: X` note. Inline tags (`<g>`, `<x/>`, `<ph>`, `<pc>`) are kept for the tag check.
- **Single-language files are paired by key.** `loadInputs` joins a ja table and an en table (locale JSON, Unreal string tables, any CSV/XLSX with one text column such as `key,ja`) into one table labelled `ja.json+en.json` (line = line in the source file). With several candidates it pairs by name with the language masked: `ui_ja.csv` ↔ `ui_en.csv`, `locales/ja/ui.json` ↔ `locales/en/ui.json`. Keys missing on one side become rows with that side empty (the notes list them); keys only in the target file keep the target file's line and say so in the context. An unpaired file is still checked alone. The ja file is the source unless `langs.source` is `"en"`.
- Bytes are decoded as UTF-8 (BOM stripped) or UTF-16 with a BOM; invalid UTF-8 falls back to Shift_JIS where the runtime supports it.
- Direction is detected per table (JA→EN or EN→JA). Japanese-side checks run on whichever side is Japanese.
- **Glossary**: JSON (terms, characters, aliases, forbidden spellings, voice profiles, `honorificPolicy`). A simple CSV also works: `type,source,target,allowed,forbidden,note`. See `samples/ja-en/glossary.json` and `plugin/skills/script-consistency/SKILL.md`.
- Samples for every format, with deliberate drifts, are in `samples/formats/` (check them with `samples/ja-en/glossary.json`). `samples/formats/book.xlsx` is generated by `scripts/make-sample-xlsx.ts`.

Engine API (browser-safe, also exported by the demo bundle):

```ts
import { loadInputs, runChecks, parseGlossary } from "./src/core/index.js";
const { tables, notes } = loadInputs([{ name: "locales/ja.json", data: jaBytes }, { name: "locales/en.json", data: enBytes }, { name: "book.xlsx", data: xlsxBytes }], { sheet: "Script" });
const result = runChecks(tables, glossary);
```

## MCP tools

| Tool | What it does |
|---|---|
| `check_script` | Runs all checks. Returns a Markdown report (content), plus findings, usage tallies and packet summaries (structuredContent). Options: `rules`, `wideAsTwo`, `minSeverity`. |
| `get_review_packets` | Returns the voice and unglossaried-term packets for the client to judge. Can filter with `subjects`. |
| `validate_glossary` | Parses a glossary and reports what was understood, or the errors. |
| `draft_glossary` | Proposes terms and characters from recurring source terms and their most consistent renderings (nothing saved). |
| `save_glossary` / `list_glossaries` / `get_glossary` / `delete_glossary` | Hosted glossaries per user; `check_script` and `get_review_packets` accept `glossaryName`. |
| `get_usage` | Plan, today's rows, limits. |
| prompt `review-script` | The step-by-step review workflow. |

Limits per call: 20 tables, 5M chars per table, 100k rows, 25 MB request.

## Known limits (prototype)

- Japanese analysis is heuristic: regex-based, no morphological analyzer. Pronoun and politeness detection is tuned to avoid obvious lookalikes (私服, こわしが), but it will miss or misread some lines. That's why voice findings stay at warning/info and the packets go to the model.
- Near-miss name detection can flag a real English word one letter away from a name. Add those words to `ignoreWords`.
- Auth is per-user bearer tokens with in-memory limits: fine for a pilot, but OAuth and a shared limiter are needed before multi-instance hosting.
- The glossary draft is heuristic (no model). Everyday words are filtered by a built-in list plus `stopwords`/`ignoreWords`, and candidates without a consistent rendering rank last; single-kanji terms (剣, 祈り) need ≥3 consistent rows. Always review it.
