日本語版：[README.ja.md](README.ja.md)

# atlas-scan GitHub Action

A composite action that runs [`atlas-scan`](../cli/README.md) — the static, **read-only**
pattern scanner for MCP servers, Claude skills and plugins — on your repository, writes a
SARIF 2.1.0 report, uploads it to GitHub code scanning and fails the job according to
`fail-on`.

Nothing in the scanned tree is executed, installed or imported. Results are *patterns
detected*, not a verdict of intent.

> **Not on the GitHub Marketplace.** Use it by repository path, pinned to a full commit SHA
> of this repository: `uses: <owner>/<repo>/atlas/action@<commit-sha>`. Replace `<owner>`,
> `<repo>` and `<commit-sha>` with the real values. The action runs the CLI from
> `atlas/cli` in the same checkout (`${{ github.action_path }}/../cli`), so the whole
> `atlas/` directory must stay together.

## Example workflow

```yaml
name: atlas-scan
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write   # upload SARIF to code scanning

jobs:
  atlas-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - id: atlas
        uses: <owner>/<repo>/atlas/action@<commit-sha>
        with:
          path: .
          fail-on: high          # critical | high | none
          # min-severity: low    # hide info findings from the report / SARIF
          # sarif-file: atlas-scan.sarif
          # upload-sarif: "true"
      - if: always()
        run: echo "atlas-scan findings=$FINDINGS exit-code=$EXIT_CODE"
        env:
          FINDINGS: ${{ steps.atlas.outputs.findings }}
          EXIT_CODE: ${{ steps.atlas.outputs.exit-code }}
```

Pull requests from forks get a read-only `GITHUB_TOKEN`, so the SARIF upload is refused
there. For such workflows set `upload-sarif: "false"` (and keep the job's pass/fail from
`fail-on`), or upload the SARIF file as a build artifact instead.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Directory to scan, relative to the workspace. |
| `min-severity` | `info` | Hide findings below `info`/`low`/`medium`/`high`/`critical` in the report and SARIF. Does not change the exit code. |
| `fail-on` | `high` | Fail when a pattern of this severity or higher is detected in `src`/`skill` code: `high` (high or critical), `critical`, or `none` (never fail on findings). |
| `sarif-file` | `atlas-scan.sarif` | Where the SARIF 2.1.0 report is written (relative to the workspace). |
| `upload-sarif` | `true` | Upload the SARIF file with `github/codeql-action/upload-sarif` (category `atlas-scan`). Needs `security-events: write`. |

## Outputs

| Output | Meaning |
| --- | --- |
| `findings` | Number of findings in the report (not suppressed, at or above `min-severity`, every context). |
| `exit-code` | `0` below the `fail-on` threshold, `1` pattern at or above `fail-on` in `src`/`skill` code, `2` usage or runtime error. |

## What it does

1. `actions/setup-node` (Node 22) and `actions/setup-python` (Python 3.12), pinned to commit SHAs.
2. `npm ci --ignore-scripts` in `atlas/cli` — installs only `typescript` (used as a parser), with no install scripts.
3. Runs `node atlas/cli/bin/atlas-scan.js --sarif <sarif-file> --fail-on <fail-on> -- <path>`
   from the workspace, so SARIF URIs are relative to the repository root (`%SRCROOT%`).
   This step never fails by itself, so the upload still happens when patterns are found.
4. Uploads the SARIF file (unless `upload-sarif` is not `true` or the scan errored).
5. Fails the job with the scanner's exit code if it was `1` (per `fail-on`) or `2`.

Inputs reach the shell only through environment variables (never `${{ }}` inside `run:`),
and `min-severity` / `fail-on` are checked against fixed lists, so input values cannot
inject shell commands. The scanner makes no network requests; the only downloads are the
pinned actions and `typescript` from the npm registry.

## SARIF details

- One run, `tool.driver.name` = `atlas-scan`; `rules` holds only the rule ids that occur,
  each with its title, default level and `security-severity` (for code-scanning severity).
- Levels: critical/high → `error`, medium → `warning`, low/info → `note`.
- Each result carries `partialFingerprints["atlasFindingHash/v1"]` (hash of rule, file and
  snippet), and `properties.severity` / `ctx` / `loc` / `suppressed`.
- Suppressed candidates appear only with the CLI's `--show-suppressed` (not exposed as an
  input), as `suppressions: [{kind: "external", justification: <why>}]`.
- Sample: [`../cli/examples/sample-output.sarif`](../cli/examples/sample-output.sarif).

## Pinned dependencies

| Action | Pin | Tag at pin time |
| --- | --- | --- |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | v7.1.0 |
| `actions/setup-python` | `5fda3b95a4ea91299a34e894583c3862153e4b97` | v7.0.0 |
| `github/codeql-action/upload-sarif` | `24c54180a607b1449ed407dd24f251e4e9147c8d` | v4.38.3 |
| `actions/checkout` (example only) | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 |

SHAs were resolved with `git ls-remote --tags` against github.com. Review release notes
before bumping, and keep pins as full SHAs (Dependabot's `github-actions` ecosystem can
update them).
