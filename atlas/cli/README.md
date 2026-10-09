日本語版：[README.ja.md](README.ja.md)

# atlas-scan

A one-command, **read-only** static scanner for MCP servers, Claude skills and plugins.
It reads a directory as text, looks for risky patterns (tool-description poisoning,
pipe-to-shell installers, decode-then-execute, bulk environment dumps, credential-path
access, permission-bypass instructions, ...), checks each match in context with a
Python / JavaScript / TypeScript AST, and prints a grade plus every finding with the
file, line, snippet and reason.

```sh
npx atlas-scan ./path/to/server
```

> **Not on npm yet.** `package.json` has `"private": true` on purpose so that an accidental
> `npm publish` fails. The owner removes that line when publishing is approved. Until then,
> use one of the options in [Install and run](#install-and-run).

## Safety

- **Nothing is executed.** Scanned files are never run, imported, installed, built or
  type-checked. Python files go through `ast`/`tokenize`; JS/TS files go through the
  TypeScript *parser* only (`ts.createSourceFile`).
- **No install scripts.** This package has no `preinstall`/`install`/`postinstall`
  scripts. Its only dependency is `typescript` (pinned to 5.9.3), which also has none.
- **No network.** The CLI makes no network requests: no OSV lookups, no registry or
  package downloads, no telemetry. (Atlas has separate tools for OSV and registry checks;
  they are not part of this package. If such options are ever added here, they must be
  opt-in flags and documented as making network requests.) The only thing `npx` itself
  downloads is this package and `typescript` from your npm registry.
- **Safe output.** Control and invisible characters in snippets (ANSI escapes, bidi
  overrides, zero-width characters) are printed as `\uXXXX`, so a scanned file cannot
  drive your terminal.
- **Wording.** Results are *patterns detected*, not a verdict. The tool never labels
  code as malware.

## Requirements

- Node.js 18 or newer
- Python 3.9 or newer, found as `python3` or `python` (or `py -3` on Windows).
  Set `ATLAS_PYTHON=/path/to/python3` to choose one. Python runs in isolated mode
  (`python3 -I -B`), so `PYTHON*` environment variables and user site-packages are
  ignored and no `.pyc` files are written.

## Install and run

Once published:

```sh
npx atlas-scan ./my-mcp-server
```

Before publishing, from a checkout of this repository:

```sh
# 1) directly (run `npm install --ignore-scripts` in atlas/cli once for the JS/TS AST layer)
node atlas/cli/bin/atlas-scan.js ./my-mcp-server

# 2) as a packed tarball, exactly as users would get it
cd atlas/cli && npm pack            # -> atlas-scan-0.1.0.tgz
npx --yes ./atlas-scan-0.1.0.tgz ../../path/to/scan
# from another directory, use a file: spec (a bare absolute path is run as a command):
npx --yes file:/abs/path/to/atlas-scan-0.1.0.tgz ./path/to/scan
```

Without the `typescript` dependency the scan still runs; JS/TS files then get the
regex tier only and a warning is printed.

## Usage

```
atlas-scan PATH [PATH ...] [options]
```

| Option | Meaning |
| --- | --- |
| `--format text\|json\|sarif` | stdout format (default `text`; `sarif` = SARIF 2.1.0) |
| `--json FILE` | also write the JSON report to `FILE` |
| `--sarif FILE` | also write a SARIF 2.1.0 report to `FILE` (for GitHub code scanning) |
| `--fail-on high\|critical\|none` | which severity in `src`/`skill` code makes the exit code 1 (default `high` = high or critical; `none` never exits 1) |
| `--fail-on-reach REACH[,REACH]` | only findings of these [reaches](#reach-where-a-finding-sits) count for exit code 1: `agent`, `exec`, `other`, comma-separated (default: all three, i.e. unchanged). For example `--fail-on-reach agent,exec` |
| `--findings FILE` | write every finding, including suppressed candidates, as JSON Lines |
| `--min-severity LEVEL` | hide findings below `info`/`low`/`medium`/`high`/`critical` in the report (exit code and `--findings` are unaffected) |
| `--show-suppressed` | also list candidates the context layer suppressed, each with its reason |
| `--no-ast` | regex tier only (skip the AST context layer) |
| `--quiet`, `-q` | text format: one summary line per target |
| `--version` | print the version |
| `--help` | print help |

Text output, per target: the grade and trust score, file/skill counts, the number of
high/critical findings in `src`/`skill` code per reach (for example
`agent 2 · exec 1 · other 5 (review)`), any score cap, capability badges (e.g.
`shell-exec`), then the findings in reach sections (`REACHES THE AGENT`, `RUNS AS CODE`,
then `OTHER STRINGS, COMMENTS, DOCS AND DATA` for review), each grouped by severity. Each
finding shows the rule id, `file:line`, context (`src`, `skill`, `docs`, `test`, ...) and
where the match sits (tool description, comment, code, ...), its reach, a short snippet
and, when the context layer changed it, the `why`. The `Result:` line is based on the
`agent` and `exec` high/critical findings; high/critical findings that are only in
`other` are reported there as needing review. Every report ends with:

> Static analysis only — nothing was executed. Findings are patterns, not a verdict of intent.

**About the score.** The trust score is `0.60 × security + 0.25 × provenance + 0.15 ×
maintenance`. A local scan cannot check provenance (verified namespace, attestations, ...)
or maintenance, so they show as 0 and a neutral 25. A clean tree therefore tops out around
64 (grade C). Read the security score and the findings; the grade is most useful for
comparing trees.

Paths in the output are relative to the path you pass. Pass a relative path if you
share the report.

See [`examples/`](examples/) for real output on the scanner's positive-control fixture
(`pos`) and its clean negative-control fixture (`neg`):
[`sample-output.txt`](examples/sample-output.txt), [`sample-output.json`](examples/sample-output.json),
[`sample-output.sarif`](examples/sample-output.sarif).
They were produced from the repository root with:

```sh
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg --format json
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg -q --sarif atlas/cli/examples/sample-output.sarif
```

## Reach: where a finding sits

Each finding gets a `reach`, derived from where the context layer placed the match
(`loc`), its `why`, its rule and its path. Reach only changes how findings are shown and,
with `--fail-on-reach`, which ones count for the exit code; severities, suppression and
the trust score are unchanged.

- **`agent`** – text that reaches the agent: a tool description, a prompt the code
  sends to a model, a skill, an MCP manifest / tool definition, or a file under
  `.claude/` (and similar agent config directories) or `hooks/`.
- **`exec`** – code that runs: AST code findings, install-time scripts, shell execution,
  dynamic evaluation, environment dumps, pipe-to-shell in an execution context, and
  callback endpoints in code.
- **`other`** – other string literals, comments, docs, data files and examples. These
  are often quotes or data (for example a security tool's own rules or test corpus):
  **review** them before acting.

Mapping, checked in this order (first match wins):

| # | Condition | Reach |
| --- | --- | --- |
| 1 | Rule `ATL-CE-*`, `ATL-CR-*`, `ATL-IN-*`, `ATL-OB-003`, `ATL-NW-001` | `exec` |
| 2 | Rule `ATL-PL-001` (hook / settings command) or `ATL-SK-002` (script bundled with a skill); context `skill` (`SKILL.md`, prose or fenced); path under `.claude/`, `.claude-plugin/`, `.cursor/`, `.codex/`, `.gemini/`, `.vscode/`, `.windsurf/`, `.continue/`, `.kiro/`, `.roo/`, `.amazonq/` or `hooks/`; file name `server.json`, `mcp.json`, `manifest.json`, `plugin.json`, ... (MCP manifest names) | `agent` |
| 3 | `why` = "data file (not an MCP manifest/tool definition)" | `other` |
| 4 | Data file (`.json`, `.jsonc`, `.jsonl`, `.ndjson`, `.yaml`, `.yml`, `.toml`): the scanner's data-file kind at the match — manifest / tool definition → `agent`; a command key (`command`, `run`, `script`, ...) → `exec`; plain data or a comment → `other` | as stated |
| 5 | `loc` = `string:desc`, `string:prompt`, `string:prompt~` | `agent` |
| 6 | `loc` = `code` | `exec` |
| 7 | `ATL-RF-001` in a string (`string:plain`, `string~`, `string:prompt`, `string:prompt~`) that the scanner kept at medium or above with no `why` (it sits in an execution context such as `exec(` / `spawn(` / `$(`) | `exec` |
| 8 | `ATL-NW-002` (callback endpoint) in a code-file string (`string:plain`, `string~`) with no `why` | `exec` |
| 9 | `loc` = `string:plain`, `string~`, `string:example` (few-shot example in a prompt), `string:catalog`, `string:corpus`, `string:pattern`, `string:patternlist`, `string:test`, `regex`, `comment`, `comment~`, `fenced`, `prose` | `other` |
| 10 | No `loc` (`--no-ast`, or a rule decided outside the context layer): code-scope rules (e.g. `ATL-FS-001`, `ATL-OB-004`) → `exec`; doc or data files → `other`; anything else → `agent` (location unknown, so it is not hidden among `other`) | as stated |
| 11 | Anything else | `other` |

JSON reports carry `reach` on every finding and
`high_or_critical_src_skill_by_reach` (`{"agent": n, "exec": n, "other": n}`) per target;
`--findings` lines carry `reach` too. SARIF results carry `properties.reach` and a
`properties.tags` entry `reach:agent`, `reach:exec` or `reach:other`, so code scanning
can filter on it.

`--fail-on-reach agent,exec` keeps exit code 1 for high/critical findings that reach the
agent or run, and stops `other` findings (quotes and data, pending review) from failing
the build. The default counts every reach, so existing pipelines behave as before.

## SARIF

`--format sarif` / `--sarif FILE` write one SARIF 2.1.0 run (`tool.driver.name` =
`atlas-scan`). Artifact URIs are relative to the **current directory** (`uriBaseId`
`%SRCROOT%`), prefixed with each target's relative path, so run the CLI from the
repository root for GitHub code scanning. A target outside the current directory gets
URIs relative to the target instead; absolute paths are never written. Levels: critical/high
→ `error`, medium → `warning`, low/info → `note`. `--min-severity` and `--show-suppressed`
apply; suppressed candidates carry `suppressions: [{kind: "external", justification}]`.
Each result has a stable `partialFingerprints["atlasFindingHash/v1"]`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No high or critical pattern detected in `src` or `skill` code (findings in docs/tests/examples/CI, or lower severities, may still be listed) |
| `1` | At least one high or critical pattern detected in `src` or `skill` code |
| `2` | Usage or runtime error: bad option (including an invalid `--fail-on-reach` value), missing path, Python not found, scanner crash |

`--fail-on critical` exits 1 only for critical patterns; `--fail-on none` never exits 1.
`--fail-on-reach agent,exec` exits 1 only for findings whose reach is listed; it combines
with `--fail-on`. The default (every reach) keeps the exit code unchanged.

## CI example (GitHub Actions)

```yaml
name: atlas-scan
on: [pull_request]
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      # fails the job (exit 1) when a high/critical pattern is detected in src/skill code
      - run: npx --yes atlas-scan@0.1.0 . --json atlas-report.json
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: atlas-report
          path: atlas-report.json
```

Until the package is published, replace the `npx` line with a path to the packed
tarball or to `bin/atlas-scan.js` in a checkout of this repository.

For SARIF upload to GitHub code scanning, see the composite action in
[`atlas/action`](../action/README.md).

## Rules

Rule ids (`ATL-TP-001`, `ATL-RF-001`, ...) and severities are defined in the scanner's
rule table (`scanner/scan.py`, `R`), following the Atlas rule spec `scan-rules-v0.md`.
How the context layer suppresses or downgrades a match is described in the scanner
README (`atlas/scanner/README.md` in the repository). Suppressed candidates are kept
(`--show-suppressed`, `--findings`) so every decision can be audited.

## Limitations

- Static analysis can be evaded: obfuscation, code fetched or generated at run time,
  native binaries and multi-step indirection may not be detected. A clean result is not
  a guarantee of safety, and a finding is not proof of intent.
- AST context is available for Python, JavaScript and TypeScript only. Other languages
  (Go, Rust, shell, PowerShell, ...) get regex matching with light comment/string
  heuristics.
- Files over 1 MB, binary files, symlinks and the usual vendor/build directories
  (`node_modules`, `dist`, `build`, `.venv`, ...) are skipped.
- Provenance and maintenance are not assessed (see *About the score*).

## Development

The Python scanner lives in `atlas/scanner/`; `scanner/` here holds byte-identical copies
so the package is self-contained.

```sh
cd atlas/cli
npm install --ignore-scripts
npm run sync         # copy cli.py, scan.py, ast_py.py, trust.py, js/ast_dump.cjs from ../scanner
npm test             # node:test, runs the CLI on ../scanner/tests/fixtures
```

`npm pack` runs `npm run sync:check` first and refuses to pack stale copies.
The scanner's own tests: `python3 -I -m unittest discover -s atlas/scanner/tests`.

## License

MIT — see [LICENSE](LICENSE). The scanner CLI is free to use; nothing it does depends on an Atlas account.
