// Run: npm test   (or: node --test test/cli.test.js)  -- needs Node 18+ and Python 3.9+.
// Runs the CLI as a child process against the scanner's test fixtures.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI_ROOT = path.resolve(__dirname, "..");
const BIN = path.join(CLI_ROOT, "bin", "atlas-scan.js");
const FX = path.resolve(CLI_ROOT, "..", "scanner", "tests", "fixtures");
const POS = path.join(FX, "pos"); // positive control: poisoned tool descriptions, exec(b64decode(...)), ...
const NEG = path.join(FX, "neg"); // negative control: a scanner's own rules / docs that only cite patterns
const PKG = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, "package.json"), "utf8"));
const FORBIDDEN = /malware|malicious/i;
const FOOTER = "Static analysis only — nothing was executed. Findings are patterns, not a verdict of intent.";

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8", cwd: opts.cwd || CLI_ROOT, env: { ...process.env, NO_COLOR: "1", ...(opts.env || {}) },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("--version prints the package version", () => {
  const r = run(["--version"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^atlas-scan ${PKG.version.replace(/\./g, "\\.")} `));
});

test("--help documents options and exit codes", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0, r.err);
  for (const opt of ["--json", "--findings", "--format", "--min-severity", "--show-suppressed", "--no-ast", "--quiet", "--version"]) {
    assert.ok(r.out.includes(opt), `missing ${opt}`);
  }
  assert.match(r.out, /Exit codes/);
});

test("positive control exits 1 and reports grouped findings", () => {
  const r = run([POS]);
  assert.equal(r.code, 1, r.err);
  assert.match(r.out, /CRITICAL \(\d+\)/);
  assert.match(r.out, /ATL-TP-001 +poison_tool\.py:\d+/);
  assert.match(r.out, /ATL-OB-003 +server\.ts:\d+/); // JS/TS AST layer (typescript dependency) is active
  assert.match(r.out, /why: /);
  assert.match(r.out, /Grade F/);
  assert.ok(r.out.trimEnd().endsWith(FOOTER));
});

test("clean (negative control) fixture exits 0", () => {
  const r = run([NEG]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /no high\/critical pattern in src\/skill/);
});

test("--format json parses and matches the exit code", () => {
  const r = run([POS, NEG, "--format", "json"]);
  assert.equal(r.code, 1, r.err);
  const d = JSON.parse(r.out);
  assert.equal(d.tool, "atlas-scan");
  assert.equal(d.version, PKG.version);
  assert.equal(d.exit_code, 1);
  assert.equal(d.targets.length, 2);
  assert.ok(d.targets[0].high_or_critical_src_skill > 0);
  assert.equal(d.targets[1].high_or_critical_src_skill, 0);
  assert.ok(d.targets[0].findings.every((f) => !f.suppressed));
  assert.equal(d.note, FOOTER);
});

test("--min-severity filters the report but not the exit code; --json/--findings write files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-scan-test-"));
  try {
    const j = path.join(tmp, "r.json");
    const l = path.join(tmp, "f.jsonl");
    const r = run([POS, "--min-severity", "critical", "--quiet", "--json", j, "--findings", l]);
    assert.equal(r.code, 1, r.err);
    const d = JSON.parse(fs.readFileSync(j, "utf8"));
    assert.ok(d.targets[0].findings.length > 0);
    assert.ok(d.targets[0].findings.every((f) => f.sev === "critical"));
    const lines = fs.readFileSync(l, "utf8").trim().split("\n").map((x) => JSON.parse(x));
    assert.ok(lines.some((f) => f.suppressed), "findings file keeps suppressed candidates");
    assert.ok(lines.every((f) => f.target && f.rule && f.why !== null));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--show-suppressed lists suppressed candidates with reasons", () => {
  const r = run([NEG, "--show-suppressed"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /SUPPRESSED/);
  assert.match(r.out, /why: inside a detection pattern/);
});

test("missing path exits 2", () => {
  const r = run([path.join(FX, "does-not-exist")]);
  assert.equal(r.code, 2);
  assert.match(r.err, /path not found/);
});

test("no path and unknown option exit 2", () => {
  assert.equal(run([]).code, 2);
  assert.equal(run([NEG, "--bogus"]).code, 2);
});

test("missing Python gives a clear error and exits 2", () => {
  const r = run([NEG], { env: { ATLAS_PYTHON: path.join(CLI_ROOT, "no-such-python") } });
  assert.equal(r.code, 2);
  assert.match(r.err, /Python 3\.9\+ is required/);
});

test("relative paths are reported relative, never as absolute paths", () => {
  const r = run([path.relative(FX, POS), "--format", "json"], { cwd: FX });
  const d = JSON.parse(r.out);
  assert.equal(d.targets[0].path, "pos");
  assert.ok(!r.out.includes(FX), "absolute fixture path leaked into output");
});

test("output never uses the words malware/malicious", () => {
  for (const args of [[POS], [NEG, "--show-suppressed"], [POS, "--format", "json"], ["--help"]]) {
    const r = run(args);
    assert.doesNotMatch(r.out + r.err, FORBIDDEN, args.join(" "));
  }
});

test("bundled scanner copies are in sync with atlas/scanner", () => {
  const r = spawnSync(process.execPath, [path.join(CLI_ROOT, "scripts", "sync.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
