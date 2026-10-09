// Tests for the GitHub Action (action/): runs action/run.sh — the composite step's logic — with fake
// GITHUB_OUTPUT / GITHUB_STEP_SUMMARY files against the committed bundle action/dist/kotomark.mjs, and
// sanity-checks action.yml (no YAML dependency: a minimal indentation-based reader for the keys we need).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const actionDir = join(root, "action");
const tmp = mkdtempSync(join(tmpdir(), "kotomark-action-"));

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  outputs: Record<string, string>;
  summary: string;
}

let n = 0;
function runAction(inputs: Record<string, string>, cwd = root): Run {
  const dir = join(tmp, `run-${++n}`);
  mkdirSync(dir);
  const outFile = join(dir, "github_output");
  const summaryFile = join(dir, "step_summary");
  writeFileSync(outFile, "");
  writeFileSync(summaryFile, "");
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: summaryFile, RUNNER_TEMP: dir, NO_COLOR: "1" };
  for (const k of Object.keys(env)) if (k.startsWith("INPUT_")) delete env[k];
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase().replace(/-/g, "_")}`] = v;
  const r = spawnSync("bash", [join(actionDir, "run.sh")], { cwd, env, encoding: "utf8" });
  const outputs = Object.fromEntries(
    readFileSync(outFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, outputs, summary: readFileSync(summaryFile, "utf8") };
}

const SAMPLE = { paths: "samples/ja-en/script.csv", glossary: "samples/ja-en/glossary.json" };

test("bundle is committed and self-contained (runs outside the repo, no node_modules)", () => {
  const bin = join(actionDir, "dist/kotomark.mjs");
  assert.ok(existsSync(bin), "run `npm run build:action`");
  const dir = mkdtempSync(join(tmp, "iso-"));
  copyFileSync(bin, join(dir, "k.mjs"));
  copyFileSync(join(root, SAMPLE.paths), join(dir, "script.csv"));
  const r = spawnSync(process.execPath, ["k.mjs", "check", "script.csv", "--no-glossary", "--format", "json", "--fail-on", "never"], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).summary);
});

test("fail-on error: outputs, exit 1, annotations, job summary, JUnit and JSON files", () => {
  const junit = join(tmp, "reports dir", "kotomark junit.xml");
  const json = join(tmp, "reports dir", "result.json");
  const r = runAction({ ...SAMPLE, "junit-path": junit, "json-path": json });
  assert.equal(r.code, 1, r.stderr);
  assert.equal(r.outputs["exit-code"], "1");
  const errors = Number(r.outputs.errors);
  assert.ok(errors > 0, JSON.stringify(r.outputs));
  assert.ok(Number(r.outputs.warnings) > 0);
  assert.match(r.outputs.infos ?? "", /^\d+$/);

  assert.match(r.stdout, /^::error file=samples\/ja-en\/script\.csv,line=\d+,title=Kotomark /m);
  assert.match(r.stdout, /^::warning file=/m);
  assert.equal(r.stdout.match(/^::error file=/gm)?.length, errors);
  assert.match(r.summary, /^# Script consistency report/);
  assert.match(r.summary, /script\.csv:\d+/);

  const xml = readFileSync(junit, "utf8");
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<failure /);
  const j = JSON.parse(readFileSync(json, "utf8"));
  assert.equal(j.summary.errors, errors);
});

test("fail-on never: exit 0 with the same counts", () => {
  const r = runAction({ ...SAMPLE, "fail-on": "never" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.outputs["exit-code"], "0");
  assert.ok(Number(r.outputs.errors) > 0);
});

test("annotations/summary off, min-severity and locale ja", () => {
  const off = runAction({ ...SAMPLE, annotations: "false", summary: "false" });
  assert.equal(off.code, 1);
  assert.doesNotMatch(off.stdout, /^::(error|warning|notice) /m);
  assert.equal(off.summary, "");

  const r = runAction({ ...SAMPLE, "min-severity": "error", locale: "ja", "fail-on": "warning" });
  assert.equal(r.code, 1);
  assert.ok(Number(r.outputs.warnings) > 0, "count outputs ignore min-severity");
  assert.doesNotMatch(r.stdout, /^::(warning|notice) /m);
  assert.match(r.stdout, /^::error /m);
  assert.match(r.summary, /[ぁ-んァ-ン一-龯]/, "Japanese report");
});

test("multi-line paths with spaces; bad input → exit 2", () => {
  const dir = mkdtempSync(join(tmp, "ws-"));
  mkdirSync(join(dir, "loc files"));
  copyFileSync(join(root, SAMPLE.paths), join(dir, "loc files", "chapter 1.csv"));
  copyFileSync(join(root, "samples/ja-en/ch2.json"), join(dir, "ch2.json"));
  copyFileSync(join(root, SAMPLE.glossary), join(dir, "my glossary.json"));
  const r = runAction({ paths: "  loc files/chapter 1.csv\n\nch2.json\n", glossary: "my glossary.json" }, dir);
  assert.equal(r.code, 1, r.stderr);
  assert.match(r.stdout, /file=loc files\/chapter 1\.csv,line=/);
  assert.match(r.summary, /ch2\.json/);

  const wd = runAction({ paths: "loc files", glossary: "my glossary.json", "working-directory": dir, "fail-on": "never" });
  assert.equal(wd.code, 0, wd.stderr);
  assert.match(wd.stdout, /file=loc files\/chapter 1\.csv,line=/);

  const spaced = runAction({ paths: `${SAMPLE.paths} samples/ja-en/ch2.json`, glossary: SAMPLE.glossary, "fail-on": "never" });
  assert.equal(spaced.code, 0, spaced.stderr);
  assert.match(spaced.summary, /ch2\.json/);

  const bad = runAction({ paths: "does-not-exist.csv" });
  assert.equal(bad.code, 2);
  assert.equal(bad.outputs["exit-code"], "2");
  assert.match(bad.stdout, /^::error title=Kotomark::/m);
  assert.equal(runAction({ ...SAMPLE, "fail-on": "bogus" }).code, 2);
});

// --- action.yml sanity check -------------------------------------------------------------------------

/** Children of `key` (2-space indented YAML mapping), as name → raw block text. */
function block(lines: string[], key: string, indent: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const pad = " ".repeat(indent);
  let i = lines.findIndex((l) => l === `${pad}${key}:`);
  assert.ok(i >= 0, `missing ${key}`);
  let cur: string | undefined;
  for (i++; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const ind = l.length - l.trimStart().length;
    if (ind <= indent) break;
    const m = ind === indent + 2 ? /^\s*([\w-]+):/.exec(l) : null;
    if (m) out.set((cur = m[1]!), []);
    else if (cur) out.get(cur)!.push(l.trim());
  }
  return out;
}

test("action.yml: composite action wiring is consistent with run.sh", () => {
  const yml = readFileSync(join(actionDir, "action.yml"), "utf8");
  assert.ok(!yml.includes("\t"), "no tabs in YAML");
  const lines = yml.split("\n");
  for (const k of ["name", "description", "inputs", "outputs", "runs"]) assert.ok(lines.some((l) => l.startsWith(`${k}:`)), `top-level ${k}`);
  assert.ok(lines.includes("  using: composite"));

  const inputs = block(lines, "inputs", 0);
  const outputs = block(lines, "outputs", 0);
  assert.deepEqual(
    [...inputs.keys()].sort(),
    ["annotations", "fail-on", "glossary", "input-format", "json-path", "junit-path", "locale", "min-severity", "paths", "summary", "working-directory"].sort(),
  );
  assert.deepEqual([...outputs.keys()].sort(), ["errors", "exit-code", "infos", "warnings"]);
  for (const [name, body] of inputs) assert.ok(body.some((b) => b.startsWith("description:")), `${name} has a description`);
  for (const [name, body] of outputs) assert.ok(body.includes(`value: \${{ steps.kotomark.outputs.${name} }}`), `${name} output wired`);

  const script = readFileSync(join(actionDir, "run.sh"), "utf8");
  for (const name of inputs.keys()) {
    const env = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
    assert.ok(yml.includes(`${env}: \${{ inputs.${name} }}`), `${name} passed as ${env}`);
    assert.ok(script.includes(`\${${env}:-`), `run.sh reads ${env}`);
  }
  for (const name of outputs.keys()) assert.ok(script.includes(`set_output ${name} `), `run.sh sets ${name}`);
  assert.doesNotMatch(lines.filter((l) => l.trim().startsWith("run:")).join("\n"), /\$\{\{/, "no expressions inside run:");
});
