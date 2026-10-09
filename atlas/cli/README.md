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
| `--format text\|json` | stdout format (default `text`) |
| `--json FILE` | also write the JSON report to `FILE` |
| `--findings FILE` | write every finding, including suppressed candidates, as JSON Lines |
| `--min-severity LEVEL` | hide findings below `info`/`low`/`medium`/`high`/`critical` in the report (exit code and `--findings` are unaffected) |
| `--show-suppressed` | also list candidates the context layer suppressed, each with its reason |
| `--no-ast` | regex tier only (skip the AST context layer) |
| `--quiet`, `-q` | text format: one summary line per target |
| `--version` | print the version |
| `--help` | print help |

Text output, per target: the grade and trust score, file/skill counts, any score cap,
capability badges (e.g. `shell-exec`), then findings grouped by severity. Each finding
shows the rule id, `file:line`, context (`src`, `skill`, `docs`, `test`, ...) and where
the match sits (tool description, comment, code, ...), a short snippet and, when the
context layer changed it, the `why`. Every report ends with:

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
[`sample-output.txt`](examples/sample-output.txt), [`sample-output.json`](examples/sample-output.json).
They were produced from the repository root with:

```sh
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg --format json
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No high or critical pattern detected in `src` or `skill` code (findings in docs/tests/examples/CI, or lower severities, may still be listed) |
| `1` | At least one high or critical pattern detected in `src` or `skill` code |
| `2` | Usage or runtime error: bad option, missing path, Python not found, scanner crash |

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
