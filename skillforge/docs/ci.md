# Running Kotomark in CI

`kotomark check` is one command that reads your script files (or whole directories), runs every check and
exits non-zero when findings reach the severity you gate on. It needs Node 20+ and nothing else: the
published `bin` is a single bundled file (`dist/kotomark.mjs`).

> Kotomark is not on the npm registry yet (internal prototype). Until it is, install it from a packed tarball
> (`npm pack` in `skillforge/` → `kotomark-0.1.0.tgz`) committed to the repo or published as a build artifact,
> e.g. `npm install --no-save ./tools/kotomark-0.1.0.tgz`, then run `npx --no-install kotomark …`.
> The examples below assume that; swap in `npx kotomark@<version>` once it is published.

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | Passed: no findings at or above `--fail-on` (findings below it may still be reported) |
| `1` | Findings at or above `--fail-on` (default `error`) |
| `2` | Bad input or usage: missing file, unreadable/unsupported table, bad option value, unknown flag |

`--fail-on error|warning|never` sets the gate. Gating always looks at **all** findings; `--min-severity`
only hides lower-severity findings from the report.

## Report formats

| `--format` | Use |
|---|---|
| `md` (default) | Human-readable Markdown report (also nice as a job summary: `>> $GITHUB_STEP_SUMMARY`) |
| `json` | The full `CheckResult` (`tables`, `glossary`, `findings`, `usage`, `reviewPackets`) plus `summary: {errors, warnings, infos, byCategory}`. `--json` is an alias. |
| `junit` | JUnit XML for test-report UIs (GitLab, Jenkins, Azure DevOps, GitHub test-reporter actions) |
| `github` | GitHub Actions workflow commands: findings show up as annotations on the changed files |

`--out <file>` writes the report to a file (stdout stays empty); a one-line summary always goes to stderr
for non-Markdown formats. `--locale ja` switches messages and category titles to Japanese in every format.

### JUnit layout

- One `<testsuite>` per **category** (`term`, `notation`, `name`, `honorific`, `voice`, `placeholder`, `tag`,
  `ruby`, `length`), always all of them, so the report shape is stable between runs.
- One `<testcase>` per finding: `name="<file>:<line> <rule>"`, `classname="<category>"`.
- Findings at or above `--junit-fail-on` get `<failure type="<rule>" message="…">`. The default follows
  `--fail-on` (or `warning` when `--fail-on never`), so the test report and the exit code agree.
  Lower-severity findings are passing test cases with the details in `<system-out>`.
- A category with no findings gets one passing test case `<category>: no findings`.

### GitHub annotations

`error` → `::error`, `warning` → `::warning`, `info` → `::notice`, with `file=` and `line=` relative to the
working directory (run from the repo root so annotations land on the right files). Property values escape
`%`, CR, LF, `:` and `,`; messages escape `%`, CR and LF, per the workflow-command spec.

## Inputs and glossary

```bash
kotomark check loc/                          # recurse: .csv .tsv .json .xlf .xliff .xlsx .po .pot
kotomark check loc/ch1.csv loc/ch2.xlsx --glossary loc/glossary.json
kotomark check script.txt --input-format csv
```

- Directories skip `node_modules`, `.git`, files with `glossary` in the name and tool configs
  (`package.json`, `tsconfig.json`, …). Explicit file arguments are always read.
- Without `--glossary`, the first of `kotomark.glossary.json`, `glossary.json`, `kotomark.glossary.csv` in the
  working directory is used (a note goes to stderr). `--no-glossary` turns that off.
- Parser notes (skipped sheets, guessed columns, …) go to stderr.

## GitHub Action (recommended)

The repository ships a composite action, [`action/`](../action/README.md), that runs the bundled CLI
(`action/dist/kotomark.mjs`, committed) with the runner's Node 20+ — no install step:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@v4
  - id: kotomark
    uses: masahiro20/new-project/skillforge/action@<ref>   # pin a SHA or tag
    with:
      paths: loc/                 # one per line for paths with spaces
      glossary: kotomark.glossary.json
      fail-on: error              # error | warning | never
      junit-path: reports/kotomark-junit.xml   # optional; json-path too
  # outputs: steps.kotomark.outputs.errors / warnings / infos / exit-code
```

It runs one JSON pass (outputs + gate) and then renders annotations (`annotations: true`), the Markdown
job summary (`summary: true`) and the optional JUnit/JSON files, and exits with the `fail-on` exit code only
after every report is written. `uses: owner/repo/path@ref` from another repository requires this repository
to be public, or same-organization access to be allowed. All inputs, outputs and a JUnit-upload example:
[`action/README.md`](../action/README.md); a copyable workflow: [`.github-example/kotomark.yml`](../.github-example/kotomark.yml).
After changing the CLI or core, rebuild the committed bundle with `npm run build:action`.

## GitHub Actions (CLI directly)

```yaml
# .github/workflows/localization-qa.yml
name: Localization QA
on:
  pull_request:
    paths: ["loc/**", "kotomark.glossary.json"]
  push:
    branches: [main]

jobs:
  kotomark:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write          # only needed for the test-report step
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install Kotomark
        run: npm install --no-save ./tools/kotomark-0.1.0.tgz

      # Annotations on the PR diff; fails the job on errors (exit 1).
      - name: Check script consistency
        run: npx --no-install kotomark check loc/ --format github --fail-on error

      # JUnit for the test-report UI + Markdown job summary, even when the check above failed.
      - name: JUnit report
        if: always()
        run: |
          npx --no-install kotomark check loc/ --format junit --out kotomark-junit.xml --fail-on never
          npx --no-install kotomark check loc/ --min-severity warning --fail-on never >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: kotomark-junit
          path: kotomark-junit.xml
      - uses: mikepenz/action-junit-report@v5   # or dorny/test-reporter
        if: always()
        with:
          report_paths: kotomark-junit.xml
          check_name: Kotomark
```

GitHub shows at most 10 annotations of each level per step in the PR "Files changed" view and 50 per job;
the full list is in the JUnit report and the job summary.

## GitLab CI

```yaml
kotomark:
  image: node:22
  stage: test
  script:
    - npm install --no-save ./tools/kotomark-0.1.0.tgz
    - npx --no-install kotomark check loc/ --format junit --out kotomark-junit.xml
  artifacts:
    when: always
    reports:
      junit: kotomark-junit.xml
    paths: [kotomark-junit.xml]
```

The job fails on errors (exit 1) and the findings appear in the merge request's test summary. Use
`--fail-on warning` to block on warnings too, or `--fail-on never` to report without blocking.

## Other CI

Anything that reads exit codes works. `--format json` plus `jq` covers custom gates, e.g.
`kotomark check loc/ --json --fail-on never | jq -e '.summary.byCategory.term.errors // 0 | . == 0'`.
