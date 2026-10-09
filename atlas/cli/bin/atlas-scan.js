#!/usr/bin/env node
// atlas-scan: Node launcher for the bundled Atlas static scanner (Python).
//
// What it does: finds Python 3.9+, resolves this package's `typescript`
// dependency (used only for ts.createSourceFile, i.e. parsing), and runs
//   python3 -I -B scanner/cli.py <args>
// Nothing in the scanned tree is executed, installed or imported, and the
// launcher makes no network requests.
//
// Exit codes: 0 = no high/critical pattern in src/skill code,
//             1 = high/critical pattern detected in src/skill code,
//             2 = usage or runtime error (including "Python not found").
//             (--fail-on critical|none narrows or disables exit code 1.)
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PKG_ROOT = path.resolve(__dirname, "..");
const CLI_PY = path.join(PKG_ROOT, "scanner", "cli.py");
const MIN_PY = [3, 9];
const EXIT_ERROR = 2;

function fail(msg) {
  process.stderr.write(`atlas-scan: error: ${msg}\n`);
  process.exit(EXIT_ERROR);
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

// Candidates: $ATLAS_PYTHON (a single executable path or name), then python3 / python
// (and the `py -3` launcher on Windows).
function pythonCandidates() {
  if (process.env.ATLAS_PYTHON) return [{ cmd: process.env.ATLAS_PYTHON, pre: [] }];
  const c = [{ cmd: "python3", pre: [] }, { cmd: "python", pre: [] }];
  if (process.platform === "win32") c.push({ cmd: "py", pre: ["-3"] });
  return c;
}

function findPython() {
  const seen = [];
  for (const cand of pythonCandidates()) {
    const r = spawnSync(cand.cmd, [...cand.pre, "-I", "-c", "import sys; print('%d.%d' % sys.version_info[:2])"],
      { encoding: "utf8", windowsHide: true, timeout: 15000 });
    if (r.error || r.status !== 0) continue;
    const m = /^(\d+)\.(\d+)/.exec((r.stdout || "").trim());
    if (!m) continue;
    const ver = [Number(m[1]), Number(m[2])];
    if (ver[0] > MIN_PY[0] || (ver[0] === MIN_PY[0] && ver[1] >= MIN_PY[1])) return cand;
    seen.push(`${[cand.cmd, ...cand.pre].join(" ")} is Python ${ver.join(".")}`);
  }
  const which = process.env.ATLAS_PYTHON ? `ATLAS_PYTHON=${process.env.ATLAS_PYTHON}` : "python3 / python";
  fail(`Python ${MIN_PY.join(".")}+ is required but was not found (${seen.length ? seen.join("; ") : `tried ${which}`}).\n` +
       "  Install Python 3.9 or newer (https://www.python.org/downloads/) or set ATLAS_PYTHON to its path.");
}

// The JS/TS context layer needs the `typescript` package (parser only).
function resolveTypeScript() {
  try {
    return path.dirname(require.resolve("typescript/package.json", { paths: [PKG_ROOT] }));
  } catch {
    return undefined;
  }
}

function main() {
  if (!fs.existsSync(CLI_PY)) fail(`bundled scanner missing (${CLI_PY}); run \`npm run sync\` in atlas/cli`);
  const py = findPython();
  const env = { ...process.env, ATLAS_NODE: process.execPath };
  const version = readVersion();
  if (version) env.ATLAS_CLI_VERSION = version;
  const ts = resolveTypeScript();
  if (ts) {
    env.ATLAS_TS_PATH = ts;
  } else {
    // point at the expected location so the scanner reports it and falls back to regex tier for JS/TS
    env.ATLAS_TS_PATH = path.join(PKG_ROOT, "node_modules", "typescript");
    process.stderr.write("atlas-scan: warning: `typescript` dependency not found; JS/TS files get regex-tier checks only\n");
  }
  const r = spawnSync(py.cmd, [...py.pre, "-I", "-B", CLI_PY, ...process.argv.slice(2)],
    { stdio: "inherit", env, windowsHide: true });
  if (r.error) fail(`could not run Python: ${r.error.message}`);
  if (r.status === null) process.exit(EXIT_ERROR); // terminated by a signal
  process.exit(r.status);
}

main();
