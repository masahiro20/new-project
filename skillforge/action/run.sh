#!/usr/bin/env bash
# Kotomark GitHub Action — step logic (called by action.yml; also run directly by test/action.test.ts).
#
# Reads its inputs from INPUT_* environment variables (never interpolated into the script, so paths with
# spaces, quotes or `$` are safe) and runs the bundled CLI next to this file:
#   1. one JSON run (all findings, no --min-severity)  → outputs errors/warnings/infos/exit-code, json-path
#   2. a `--format github` run                         → annotations on stdout (annotations: true)
#   3. a `--format junit` run                          → junit-path (if set)
#   4. a Markdown run                                  → appended to $GITHUB_STEP_SUMMARY (summary: true)
# and finally exits with the exit code of the JSON run (0 passed, 1 findings at/above fail-on, 2 bad input).
#
# Environment:
#   INPUT_PATHS               files/dirs; one per line (lines may contain spaces) or, on a single line,
#                             whitespace separated (unless the whole line is one existing path). Default "."
#   INPUT_GLOSSARY            glossary file (optional; without it the CLI looks for kotomark.glossary.json …)
#   INPUT_FAIL_ON             error | warning | never (default error)
#   INPUT_LOCALE              en | ja (default en)
#   INPUT_MIN_SEVERITY        info | warning | error — hides lower findings in annotations/JUnit/summary
#   INPUT_INPUT_FORMAT        force the input format (csv, tsv, json, xliff, xlsx, po, …)
#   INPUT_JUNIT_PATH          write JUnit XML here (optional)
#   INPUT_JSON_PATH           write the full JSON result here (optional)
#   INPUT_ANNOTATIONS         true | false (default true)
#   INPUT_SUMMARY             true | false (default true)
#   INPUT_WORKING_DIRECTORY   directory to run in (default "."); relative paths above resolve against it
#   INPUT_LICENSE_KEY         license key (optional): masked with ::add-mask:: and handed to the CLI as
#                             KOTOMARK_LICENSE_KEY; never echoed. Not needed during the preview.
#   KOTOMARK_BIN              override the CLI bundle (default: dist/kotomark.mjs next to this script)
#   GITHUB_OUTPUT, GITHUB_STEP_SUMMARY  provided by the runner; skipped when unset
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin="${KOTOMARK_BIN:-$here/dist/kotomark.mjs}"

paths_in="${INPUT_PATHS:-.}"
glossary="${INPUT_GLOSSARY:-}"
fail_on="${INPUT_FAIL_ON:-error}"
locale="${INPUT_LOCALE:-en}"
min_severity="${INPUT_MIN_SEVERITY:-}"
input_format="${INPUT_INPUT_FORMAT:-}"
junit_path="${INPUT_JUNIT_PATH:-}"
json_path="${INPUT_JSON_PATH:-}"
annotations="${INPUT_ANNOTATIONS:-true}"
summary="${INPUT_SUMMARY:-true}"
workdir="${INPUT_WORKING_DIRECTORY:-.}"

# --- license key: mask it before anything else can print it, then pass it only via the environment ---
license_key="${INPUT_LICENSE_KEY:-}"
unset INPUT_LICENSE_KEY
license_key="${license_key//[$'\t\r\n ']/}"
if [[ -n "$license_key" ]]; then
  echo "::add-mask::$license_key"
  export KOTOMARK_LICENSE_KEY="$license_key"
fi
unset license_key

fail() { # message, exit code
  echo "::error title=Kotomark::$1"
  set_output exit-code "${2:-2}"
  exit "${2:-2}"
}
set_output() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf '%s=%s\n' "$1" "$2" >>"$GITHUB_OUTPUT"; fi; }
is_true() { [[ "${1,,}" == "true" || "$1" == "1" || "${1,,}" == "yes" ]]; }

# --- Node 20+ (preinstalled on GitHub-hosted runners; use actions/setup-node on self-hosted ones) ---
command -v node >/dev/null 2>&1 || fail "node not found on PATH. Kotomark needs Node.js 20+ (add actions/setup-node before this action)."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
((node_major >= 20)) || fail "Node.js $(node -v) is too old. Kotomark needs Node.js 20+ (add actions/setup-node before this action)."
[[ -f "$bin" ]] || fail "Kotomark CLI bundle not found at $bin."

case "$fail_on" in error | warning | never) ;; *) fail "Unknown fail-on \"$fail_on\" (error | warning | never)." ;; esac

cd "$workdir" || fail "working-directory \"$workdir\" does not exist."

# --- paths → array: one per line if multi-line, otherwise whitespace separated ---
paths=()
if [[ "$paths_in" == *$'\n'* ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"  # trim leading whitespace
    line="${line%"${line##*[![:space:]]}"}"  # trim trailing whitespace
    [[ -n "$line" ]] && paths+=("$line")
  done <<<"$paths_in"
elif [[ -e "$paths_in" ]]; then
  paths=("$paths_in") # a single existing path, even if it contains spaces
else
  read -r -a paths <<<"$paths_in"
fi
((${#paths[@]})) || paths=(".")

common=(--locale "$locale")
[[ -n "$glossary" ]] && common+=(--glossary "$glossary")
[[ -n "$input_format" ]] && common+=(--input-format "$input_format")
shown=()
[[ -n "$min_severity" ]] && shown+=(--min-severity "$min_severity")

tmp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/kotomark.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

kotomark() { node "$bin" check "$@"; }

# --- 1. JSON run: counts, outputs and the exit code ---
code=0
kotomark "${common[@]}" --format json --fail-on "$fail_on" --out "$tmp/result.json" -- "${paths[@]}" || code=$?
if ((code > 1)) || [[ ! -s "$tmp/result.json" ]]; then
  ((code > 1)) || code=2
  fail "kotomark check failed with exit code $code (bad input or usage; see the log above)." "$code"
fi

read -r errors warnings infos < <(node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).summary;
  console.log(s.errors, s.warnings, s.infos);' "$tmp/result.json")
set_output errors "$errors"
set_output warnings "$warnings"
set_output infos "$infos"
set_output exit-code "$code"
if [[ -n "$json_path" ]]; then
  mkdir -p "$(dirname "$json_path")"
  cp "$tmp/result.json" "$json_path"
fi

# Later runs re-read the same inputs; their notes duplicate run 1, so stderr is shown only on failure.
render() { # extra args...
  local rc=0
  kotomark "${common[@]}" "${shown[@]}" "$@" -- "${paths[@]}" 2>"$tmp/stderr" || rc=$?
  if ((rc > 1)); then
    cat "$tmp/stderr" >&2
    echo "::warning title=Kotomark::report run failed with exit code $rc"
  fi
}

# --- 2. annotations ---
if is_true "$annotations"; then
  render --format github --fail-on never
fi

# --- 3. JUnit (failures follow fail-on, like the CLI default) ---
if [[ -n "$junit_path" ]]; then
  mkdir -p "$(dirname "$junit_path")"
  junit_fail_on="$fail_on"
  [[ "$fail_on" == never ]] && junit_fail_on=warning
  render --format junit --fail-on never --junit-fail-on "$junit_fail_on" --out "$junit_path"
fi

# --- 4. job summary ---
if is_true "$summary" && [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  render --format md --fail-on never --out "$tmp/summary.md"
  if [[ -f "$tmp/summary.md" ]]; then
    { cat "$tmp/summary.md"; echo; } >>"$GITHUB_STEP_SUMMARY"
  fi
fi

if ((code == 0)); then
  echo "Kotomark: passed (${errors} error(s), ${warnings} warning(s), ${infos} info; fail-on ${fail_on})."
else
  echo "Kotomark: failed (${errors} error(s), ${warnings} warning(s), ${infos} info; fail-on ${fail_on})."
fi
exit "$code"
