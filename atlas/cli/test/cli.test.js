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
  for (const opt of ["--json", "--sarif", "--fail-on", "--findings", "--format", "--min-severity", "--show-suppressed", "--no-ast", "--quiet", "--version"]) {
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

// ---------------------------------------------------------------------------
// SARIF 2.1.0 and --fail-on
const SARIF_LEVEL = { critical: "error", high: "error", medium: "warning", low: "note", info: "note" };

function sarifOf(args, opts) {
  const r = run([...args, "--format", "sarif"], opts);
  return { ...r, d: JSON.parse(r.out) };
}

test("--format sarif emits a SARIF 2.1.0 log GitHub code scanning accepts", () => {
  const { code, err, d } = sarifOf([path.relative(FX, POS), path.relative(FX, NEG)], { cwd: FX });
  assert.equal(code, 1, err);
  assert.equal(d.version, "2.1.0");
  assert.match(d.$schema, /^https:\/\/.*sarif-2\.1\.0\.json$/);
  assert.equal(d.runs.length, 1);
  const run0 = d.runs[0];
  const drv = run0.tool.driver;
  assert.equal(drv.name, "atlas-scan");
  assert.equal(drv.version, PKG.version);
  assert.ok(!("informationUri" in drv));
  const ids = drv.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "rule ids unique");
  for (const rule of drv.rules) {
    assert.ok(rule.shortDescription.text);
    assert.ok(rule.properties.tags.includes("security"));
    assert.ok(["error", "warning", "note"].includes(rule.defaultConfiguration.level));
  }
  assert.ok(run0.results.length > 0);
  const fps = new Set();
  for (const res of run0.results) {
    assert.ok(ids.includes(res.ruleId), `ruleId ${res.ruleId} not in rules`);
    assert.equal(drv.rules[res.ruleIndex].id, res.ruleId);
    assert.equal(res.level, SARIF_LEVEL[res.properties.severity]);
    assert.match(res.message.text, /^Pattern detected: /);
    const loc = res.locations[0].physicalLocation;
    assert.equal(loc.artifactLocation.uriBaseId, "%SRCROOT%");
    const uri = loc.artifactLocation.uri;
    assert.match(uri, /^(pos|neg)\//, uri);
    assert.ok(!uri.startsWith("/") && !/^[a-z]+:/i.test(uri) && !uri.includes(".."), `not relative: ${uri}`);
    assert.ok(Number.isInteger(loc.region.startLine) && loc.region.startLine >= 1);
    const fp = res.partialFingerprints["atlasFindingHash/v1"];
    assert.ok(fp && !fps.has(fp), "fingerprints present and unique");
    fps.add(fp);
    assert.equal(res.properties.suppressed, false);
    assert.ok(!("suppressions" in res));
  }
  for (const [sev, level] of Object.entries({ critical: "error", high: "error", medium: "warning", low: "note" })) {
    assert.ok(run0.results.some((x) => x.properties.severity === sev && x.level === level), `${sev} -> ${level}`);
  }
  assert.ok(!JSON.stringify(d).includes(FX), "absolute fixture path leaked into SARIF");
});

test("SARIF fingerprints are stable across runs and --sarif FILE matches stdout", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-scan-test-"));
  try {
    const f = path.join(tmp, "out.sarif");
    const a = sarifOf([POS, "--sarif", f]);
    const b = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.deepEqual(a.d, b);
    const fp = (d) => d.runs[0].results.map((x) => x.partialFingerprints["atlasFindingHash/v1"]);
    assert.deepEqual(fp(a.d), fp(sarifOf([POS]).d));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("SARIF lists suppressed candidates only with --show-suppressed, as external suppressions", () => {
  assert.equal(sarifOf([NEG]).d.runs[0].results.filter((x) => x.suppressions).length, 0);
  const { code, d } = sarifOf([NEG, "--show-suppressed"]);
  assert.equal(code, 0);
  const sup = d.runs[0].results.filter((x) => x.properties.suppressed);
  assert.ok(sup.length > 0);
  for (const x of sup) {
    assert.equal(x.suppressions[0].kind, "external");
    assert.ok(x.suppressions[0].justification);
  }
});

test("SARIF output never uses the words malware/malicious", () => {
  const r = run([POS, NEG, "--show-suppressed", "--format", "sarif"]);
  assert.doesNotMatch(r.out + r.err, FORBIDDEN);
});

test("--fail-on none exits 0 on the positive control; --fail-on critical fails on critical only", () => {
  assert.equal(run([POS, "--fail-on", "none", "-q"]).code, 0);
  assert.equal(run([POS, "--fail-on", "critical", "-q"]).code, 1);
  assert.equal(run([POS, "--fail-on", "high", "-q"]).code, 1);
  assert.equal(run([POS, "--fail-on", "bogus"]).code, 2);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-scan-test-"));
  try { // a high (not critical) pattern in src code
    fs.writeFileSync(path.join(tmp, "app.py"), "import base64\nPAYLOAD = 'eA=='\nexec(base64.b64decode(PAYLOAD))\n");
    const d = JSON.parse(run([tmp, "--format", "json"]).out);
    assert.equal(d.targets[0].counts_src_skill.critical, 0);
    assert.ok(d.targets[0].counts_src_skill.high > 0);
    assert.equal(run([tmp, "-q"]).code, 1, "default --fail-on high");
    assert.equal(run([tmp, "-q", "--fail-on", "critical"]).code, 0);
    const s = sarifOf([tmp, "--fail-on", "critical"]);
    assert.equal(s.code, 0);
    assert.equal(s.d.runs[0].invocations[0].exitCode, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("bundled scanner copies are in sync with atlas/scanner", () => {
  const r = spawnSync(process.execPath, [path.join(CLI_ROOT, "scripts", "sync.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});
