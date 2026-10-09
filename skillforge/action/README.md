# Kotomark GitHub Action

Runs `kotomark check` (JA↔EN localization consistency QA) on your script files and reports the findings as
PR annotations, a job summary and optional JUnit / JSON files. It is a composite action that runs the bundled
CLI committed at `dist/kotomark.mjs` with the runner's Node — no `npm install`, no other actions.

```yaml
- uses: actions/checkout@v4
- uses: masahiro20/new-project/skillforge/action@<ref>   # pin a commit SHA or tag
  with:
    paths: loc/
    glossary: loc/kotomark.glossary.json
```

> **Where it lives.** For now the action is a subdirectory (`skillforge/action`) of `masahiro20/new-project`.
> `uses: owner/repo/path@ref` works from other repositories only if that repository is **public**, or — for a
> private/internal repository — when the caller is in the same organization/enterprise and the repository's
> *Settings → Actions → General → Access* allows it. Within this repository you can also use
> `uses: ./skillforge/action` after `actions/checkout`. When Kotomark moves to its own repository the
> directory moves as-is (`action.yml`, `run.sh`, `dist/`); only the `uses:` path changes.

## Requirements

- **Node.js 20+** on `PATH`. GitHub-hosted runners have it; on self-hosted runners or containers without Node,
  add `actions/setup-node` before this action. The action fails with exit code 2 if Node is missing or older.
- **bash 4+**. Tested on Linux; macOS runners ship bash 3.2 as `/bin/bash` but GitHub's macOS images put a
  newer bash first on `PATH`. Windows runners (Git Bash) are untested.
- **Permissions:** nothing beyond `contents: read` (for checkout). Annotations and the job summary need no
  token. A separate test-report action that creates check runs needs `checks: write` for that step's job.

## Inputs

| Input | Default | Description |
|---|---|---|
| `paths` | `.` | Files or directories to check. One per line (lines may contain spaces), or whitespace separated on one line. A single line that names one existing path is taken as-is. Directories are searched recursively for `.csv .tsv .json .xlf .xliff .xlsx .po .pot`. |
| `glossary` | — | Glossary (JSON or CSV). Empty = `kotomark.glossary.json`, `glossary.json` or `kotomark.glossary.csv` in the working directory if present. |
| `fail-on` | `error` | Fail when findings at or above this severity exist: `error`, `warning`, `never`. |
| `locale` | `en` | Language of messages and labels: `en`, `ja`. |
| `min-severity` | — | Hide findings below `info`/`warning`/`error` in annotations, JUnit and the summary. Gating and the count outputs always use **all** findings. |
| `input-format` | — | Force the input format (`csv`, `tsv`, `json`, `xliff`, `xlsx`, `po`, `i18n-json`, `unity-csv`, `unreal-csv`). |
| `junit-path` | — | Write a JUnit XML report here. `<failure>`s follow `fail-on` (`warning` when `fail-on: never`). |
| `json-path` | — | Write the full JSON result (all findings + `summary`) here. |
| `annotations` | `true` | Emit findings as `::error` / `::warning` / `::notice` annotations on the checked files. |
| `summary` | `true` | Append the Markdown report to the job summary. |
| `working-directory` | `.` | Directory to run in; relative paths above resolve against it. Keep the repository root so annotations land on the right files. |

## Outputs

| Output | Description |
|---|---|
| `errors` | Number of error findings |
| `warnings` | Number of warning findings |
| `infos` | Number of info findings |
| `exit-code` | `0` passed, `1` findings at/above `fail-on`, `2` bad input or usage (missing file, bad option, Node too old) |

The step exits with `exit-code` **after** all reports are written, so a failing check still leaves the
annotations, summary and JUnit/JSON files behind. Use `if: always()` on later steps that consume them.

## Example: JUnit upload and a custom gate

```yaml
name: Localization QA
on:
  pull_request:
    paths: ["loc/**"]

permissions:
  contents: read

jobs:
  kotomark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: kotomark
        uses: masahiro20/new-project/skillforge/action@<ref>
        with:
          paths: |
            loc/main story
            loc/side quests
          glossary: loc/kotomark.glossary.json
          fail-on: error
          junit-path: reports/kotomark-junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: kotomark-junit
          path: reports/kotomark-junit.xml
      - if: always()
        run: echo "Kotomark found ${{ steps.kotomark.outputs.errors }} error(s), ${{ steps.kotomark.outputs.warnings }} warning(s)"
```

To show the JUnit file as a test report, add a reporter action after it (e.g. `mikepenz/action-junit-report`
or `dorny/test-reporter`, with `if: always()`); those need `checks: write`.

A copyable workflow is in [`../.github-example/kotomark.yml`](../.github-example/kotomark.yml).

GitHub shows at most 10 annotations of each level per step and 50 per job in the PR diff; the full list is in
the job summary and the JUnit/JSON reports.

## Development

- `run.sh` holds the step logic; `action.yml` only maps inputs to `INPUT_*` environment variables (inputs are
  never interpolated into the script). Run it locally:
  `INPUT_PATHS=samples/ja-en/script.csv INPUT_GLOSSARY=samples/ja-en/glossary.json bash action/run.sh`.
- Rebuild the bundle after CLI/core changes with `npm run build:action` (from `skillforge/`) and commit
  `action/dist/kotomark.mjs`. It is a single file with all dependencies bundled; it must not import anything
  outside Node built-ins.
- Tests: `test/action.test.ts` (runs `run.sh` with fake `GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY`).
