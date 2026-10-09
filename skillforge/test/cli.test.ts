// End-to-end tests for the `kotomark` CLI. The CLI is bundled once with the real build options
// (scripts/build-cli.mjs) into a temp dir, so these tests also cover the published single-file bin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore -- plain .mjs build script, no type declarations
import { buildCli } from "../scripts/build-cli.mjs";
import { renderJUnit, escapeXml } from "../src/core/junit.js";
import { ghData, ghProp, renderGithub } from "../src/cli/output.js";
import type { CheckResult, Finding } from "../src/core/index.js";
import { runSample } from "./helpers.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "kotomark-cli-"));
const bin: string = await buildCli(join(tmp, "kotomark.mjs"));

function cli(args: string[], cwd = root) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const SCRIPT = "samples/ja-en/script.csv";
const GLOSSARY = "samples/ja-en/glossary.json";
const expected = runSample([SCRIPT], GLOSSARY);
const count = (r: CheckResult, s: Finding["severity"]) => r.findings.filter((f) => f.severity === s).length;

test("sample has errors and warnings (precondition for the gating tests)", () => {
  assert.ok(count(expected, "error") > 0);
  assert.ok(count(expected, "warning") > 0);
});

test("bundle starts with a shebang and runs the sample check (markdown, exit 1 on errors)", () => {
  assert.ok(readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node\n"));
  const r = cli(["check", SCRIPT, "--glossary", GLOSSARY]);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stdout, /^# Script consistency report/);
  assert.match(r.stdout, /script\.csv:\d+/);
});

test("--fail-on: error → 1, warning → 1, never → 0; warnings only → 1 only with --fail-on warning", () => {
  assert.equal(cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "json"]).code, 1);
  assert.equal(cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "json", "--fail-on", "warning"]).code, 1);
  assert.equal(cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "json", "--fail-on", "never"]).code, 0);

  const dir = mkdtempSync(join(tmp, "warn-"));
  // Katakana notation drift (warning) without any error.
  writeFileSync(join(dir, "w.csv"), "id,ja,en\n1,ルーンゲートを開け,Open the Rune Gate\n2,ルーン・ゲートだ,It is the Rune Gate\n3,ルーンゲートへ,To the Rune Gate\n");
  const json = JSON.parse(cli(["check", "w.csv", "--format", "json", "--no-glossary"], dir).stdout);
  assert.equal(json.summary.errors, 0);
  assert.ok(json.summary.warnings > 0, JSON.stringify(json.summary));
  assert.equal(cli(["check", "w.csv", "--no-glossary"], dir).code, 0);
  assert.equal(cli(["check", "w.csv", "--no-glossary", "--fail-on", "warning"], dir).code, 1);
});

test("--format json: full CheckResult plus summary counts; --json alias; --min-severity filters output only", () => {
  const r = cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "json"]);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j).sort(), ["findings", "glossary", "reviewPackets", "summary", "tables", "usage"]);
  assert.equal(j.findings.length, expected.findings.length);
  assert.equal(j.summary.errors, count(expected, "error"));
  assert.equal(j.summary.warnings, count(expected, "warning"));
  assert.equal(j.summary.infos, count(expected, "info"));
  const byCat = Object.values(j.summary.byCategory as Record<string, { errors: number; warnings: number; infos: number }>);
  assert.equal(byCat.reduce((n, c) => n + c.errors + c.warnings + c.infos, 0), expected.findings.length);
  assert.equal(j.tables[0].file, SCRIPT, "file names are paths relative to cwd");

  assert.deepEqual(JSON.parse(cli(["check", SCRIPT, "-g", GLOSSARY, "--json"]).stdout).summary, j.summary);

  const errOnly = cli(["check", SCRIPT, "-g", GLOSSARY, "--json", "--min-severity", "error", "--fail-on", "warning"]);
  const e = JSON.parse(errOnly.stdout);
  assert.ok(e.findings.every((f: Finding) => f.severity === "error"));
  assert.equal(e.summary.warnings, 0);
  assert.equal(errOnly.code, 1, "gating still sees the hidden warnings");
});

test("--locale ja localizes messages in json and github output", () => {
  const en = JSON.parse(cli(["check", SCRIPT, "-g", GLOSSARY, "--json"]).stdout);
  const ja = JSON.parse(cli(["check", SCRIPT, "-g", GLOSSARY, "--json", "--locale", "ja"]).stdout);
  assert.notDeepEqual(ja.findings.map((f: Finding) => f.message), en.findings.map((f: Finding) => f.message));
  assert.match(cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "github", "--locale", "ja"]).stdout, /用語の訳揺れ|表記揺れ/);
});

/** Minimal JUnit reader: enough structure checks without an XML dependency. */
function parseJUnit(xml: string) {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const root = xml.match(/<testsuites\b[^>]*>/)![0];
  const suites = [...xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)].map((m) => ({
    tag: m[1]!,
    cases: [...m[2]!.matchAll(/<testcase\b[^>]*?(\/>|>[\s\S]*?<\/testcase>)/g)].map((c) => c[0]),
  }));
  return { root, suites, attr };
}

test("--format junit: well-formed shape, counts match findings, one passing case per empty category", () => {
  const r = cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "junit", "--out", join(tmp, "report.xml")]);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  const xml = readFileSync(join(tmp, "report.xml"), "utf8");
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  const { root, suites, attr } = parseJUnit(xml);
  // default --fail-on error → only errors are <failure>
  assert.equal(Number(attr(root, "failures")), count(expected, "error"));
  assert.equal((xml.match(/<failure /g) ?? []).length, count(expected, "error"));
  let tests = 0;
  for (const s of suites) {
    assert.equal(Number(attr(s.tag, "tests")), s.cases.length);
    assert.equal(Number(attr(s.tag, "failures")), s.cases.filter((c) => c.includes("<failure")).length);
    const cat = attr(s.tag, "name")!;
    const n = expected.findings.filter((f) => f.category === cat).length;
    assert.equal(s.cases.length, Math.max(n, 1), cat);
    if (!n) assert.match(s.cases[0]!, /no findings"[^>]*\/>$/);
    tests += s.cases.length;
  }
  assert.equal(Number(attr(root, "tests")), tests);
  assert.match(xml, new RegExp(`name="samples/ja-en/script\\.csv:\\d+ [a-z.-]+"`));
  // tags balance
  assert.equal((xml.match(/<testsuite\b/g) ?? []).length, (xml.match(/<\/testsuite>/g) ?? []).length);

  const w = cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "junit", "--fail-on", "warning"]);
  assert.equal(Number(parseJUnit(w.stdout).attr(parseJUnit(w.stdout).root, "failures")), count(expected, "error") + count(expected, "warning"));
  const j = cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "junit", "--junit-fail-on", "never"]);
  assert.equal((j.stdout.match(/<failure /g) ?? []).length, 0);
  assert.equal(j.code, 1, "--junit-fail-on does not change the exit code");
});

const nasty: CheckResult = {
  tables: [],
  glossary: { terms: 0, characters: 0 },
  usage: [],
  reviewPackets: [],
  findings: [
    { category: "term", severity: "error", rule: "term-drift", file: "a,b:c%.csv", line: 3, id: "x<1>", side: "target", message: `Use <Mana & "Stone"> 'not'\u0001\u0008 here\r\n100%` },
    { category: "voice", severity: "info", rule: "voice-note", file: "v.csv", line: 9, id: "v", side: "target", message: "fyi" },
  ],
};

test("renderJUnit escapes <&\"' and drops XML-invalid control chars", () => {
  const xml = renderJUnit(nasty);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml));
  assert.match(xml, /message="Use &lt;Mana &amp; &quot;Stone&quot;&gt; &apos;not&apos; here/);
  assert.match(xml, /name="a,b:c%\.csv:3 term-drift"/);
  assert.match(xml, /<failure type="term-drift"/);
  // info is never a failure by default; it is a passing case with system-out (or skipped)
  assert.match(xml, /name="v\.csv:9 voice-note"[^>]*>\s*<system-out>/);
  assert.match(renderJUnit(nasty, { nonFailing: "skipped" }), /<testsuites[^>]*skipped="1"/);
  assert.match(renderJUnit(nasty, { failOn: "info" }), /<testsuites[^>]*failures="2"/);
  // no raw specials left inside text or attributes
  const stripped = xml.replace(/<\/?[a-zA-Z?][^<>]*>/g, "");
  assert.ok(!/[<>]/.test(stripped));
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml));
  assert.equal(escapeXml("\uD800x\uDC00"), "x", "lone surrogates removed");
});

test("github format: one escaped workflow command per finding", () => {
  assert.equal(ghData("a%b\r\nc"), "a%25b%0D%0Ac");
  assert.equal(ghProp("a,b:c%"), "a%2Cb%3Ac%25");
  const lines = renderGithub(nasty).split("\n");
  assert.equal(lines[0], `::error file=a%2Cb%3Ac%25.csv,line=3,title=Kotomark term-drift — Glossary term drift / 用語の訳揺れ::[x<1>] Use <Mana & "Stone"> 'not'\u0001\u0008 here%0D%0A100%25`);
  assert.match(lines[1]!, /^::notice file=v\.csv,line=9,title=.*::\[v\] fyi$/);

  const r = cli(["check", SCRIPT, "-g", GLOSSARY, "--format", "github"]);
  assert.equal(r.code, 1);
  const cmds = r.stdout.split("\n").filter((l) => l.startsWith("::"));
  assert.equal(cmds.length, expected.findings.length);
  assert.equal(cmds.filter((l) => l.startsWith("::error ")).length, count(expected, "error"));
  for (const l of cmds) assert.match(l, /^::(error|warning|notice) file=samples\/ja-en\/script\.csv,line=\d+,title=[^:\n]+::[^\n]+$/);
});

test("directories are searched recursively (glossaries, node_modules and unsupported files skipped)", () => {
  const dir = mkdtempSync(join(tmp, "dir-"));
  mkdirSync(join(dir, "loc/ch1"), { recursive: true });
  mkdirSync(join(dir, "loc/node_modules/x"), { recursive: true });
  copyFileSync(join(root, SCRIPT), join(dir, "loc/ch1/script.csv"));
  copyFileSync(join(root, "samples/ja-en/ch2.json"), join(dir, "loc/ch2.json"));
  copyFileSync(join(root, GLOSSARY), join(dir, "loc/glossary.json"));
  copyFileSync(join(root, SCRIPT), join(dir, "loc/node_modules/x/ignored.csv"));
  writeFileSync(join(dir, "loc/readme.txt"), "not a table");
  const r = cli(["check", "loc", "--glossary", "loc/glossary.json", "--json", "--fail-on", "never"], dir);
  assert.equal(r.code, 0, r.stderr);
  const files = JSON.parse(r.stdout).tables.map((t: { file: string }) => t.file).sort();
  assert.deepEqual(files, ["loc/ch1/script.csv", "loc/ch2.json"]);
});

test("glossary auto-discovery from cwd, and --no-glossary", () => {
  const dir = mkdtempSync(join(tmp, "gl-"));
  copyFileSync(join(root, SCRIPT), join(dir, "script.csv"));
  copyFileSync(join(root, GLOSSARY), join(dir, "kotomark.glossary.json"));
  const auto = cli(["check", "script.csv", "--json"], dir);
  assert.match(auto.stderr, /using glossary kotomark\.glossary\.json/);
  const a = JSON.parse(auto.stdout);
  assert.ok(a.glossary.terms > 0);
  assert.equal(a.summary.errors, count(expected, "error"));
  const none = cli(["check", "script.csv", "--json", "--no-glossary"], dir);
  assert.doesNotMatch(none.stderr, /using glossary/);
  assert.equal(JSON.parse(none.stdout).glossary.terms, 0);
});

test("bad input and usage errors exit 2", () => {
  assert.equal(cli(["check", "does/not/exist.csv"]).code, 2);
  assert.equal(cli(["check", SCRIPT, "--fail-on", "sometimes"]).code, 2);
  assert.equal(cli(["check", SCRIPT, "--format", "pdf"]).code, 2);
  assert.equal(cli(["check", SCRIPT, "--locale", "fr"]).code, 2);
  assert.equal(cli(["check", SCRIPT, "--bogus-flag"]).code, 2);
  assert.equal(cli(["check"]).code, 2);
  assert.equal(cli([]).code, 2);
  const dir = mkdtempSync(join(tmp, "bad-"));
  writeFileSync(join(dir, "broken.json"), "{ not json");
  assert.equal(cli(["check", "broken.json", "--no-glossary"], dir).code, 2);
  assert.equal(cli(["check", ".", "--no-glossary"], mkdtempSync(join(tmp, "empty-"))).code, 2, "directory without inputs");
});

test("legacy --format <input format> still sets the input format", () => {
  const dir = mkdtempSync(join(tmp, "legacy-"));
  copyFileSync(join(root, SCRIPT), join(dir, "script.txt"));
  const r = cli(["check", "script.txt", "--format", "csv", "--no-glossary", "--fail-on", "never"], dir);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /--input-format csv/);
  assert.match(r.stdout, /^# Script consistency report/);
  const j = cli(["check", "script.txt", "--input-format", "csv", "--json", "--no-glossary", "--fail-on", "never"], dir);
  assert.equal(JSON.parse(j.stdout).tables[0].format, "csv");
});

test("token subcommands still work from the bundle", () => {
  const data = mkdtempSync(join(tmp, "data-"));
  const env = { ...process.env, KOTOMARK_DATA_DIR: data };
  const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8", env });
  const c = run(["token", "create", "alice", "--plan", "studio"]);
  assert.equal(c.status, 0, c.stderr);
  assert.ok(c.stdout.trim().length > 10);
  assert.match(run(["token", "list"]).stdout, /alice\s+studio/);
});
