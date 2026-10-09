// The browser demo runs the engine from an esbuild IIFE bundle (web/build-demo.mjs). These tests build
// that bundle in memory, run it in a bare vm context (no require/process/fs), and check it gives exactly
// the same results as importing src/core directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import * as core from "../src/core/index.js";
import { parseCsvRecords } from "../src/core/parsers/csv.js";
// @ts-ignore -- plain .mjs build script, no type declarations
import { ENGINE_BUILD_OPTIONS } from "../web/build-demo.mjs";
import { read } from "./helpers.js";

type Engine = Pick<typeof core, "parseTable" | "detectFormat" | "loadInputs" | "parseGlossary" | "runChecks" | "renderMarkdown" | "EMPTY_GLOSSARY">;

const built = await build({ ...ENGINE_BUILD_OPTIONS, write: false, logLevel: "silent" });
const bundle = built.outputFiles[0]!.text;

const sandbox: Record<string, unknown> = {};
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: "kotomark-engine.js" });
const browser = sandbox.Kotomark as Engine;

interface Input {
  name: string;
  text: string;
}

function run(engine: Engine, scripts: Input[], glossary?: Input) {
  const tables = scripts.map((s) => engine.parseTable(s.text, s.name));
  const g = glossary ? engine.parseGlossary(glossary.text, glossary.name) : undefined;
  const result = engine.runChecks(tables, g);
  return { result, json: JSON.stringify(result), markdown: engine.renderMarkdown(result) };
}

const input = (path: string, name = path.split("/").pop()!): Input => ({ name, text: read(path) });

function csvToTsv(csv: string): string {
  const cell = (c: string) => (/[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return parseCsvRecords(csv).map((r) => r.cells.map(cell).join("\t")).join("\n") + "\n";
}

const sets: { label: string; scripts: Input[]; glossary: Input }[] = [
  {
    label: "ja-en script.csv + ch2.json",
    scripts: [input("samples/ja-en/script.csv"), input("samples/ja-en/ch2.json")],
    glossary: input("samples/ja-en/glossary.json"),
  },
  { label: "en-ja ui.xlf", scripts: [input("samples/en-ja/ui.xlf")], glossary: input("samples/en-ja/glossary.json") },
  {
    label: "ja-en script.tsv (converted from script.csv)",
    scripts: [{ name: "script.tsv", text: csvToTsv(read("samples/ja-en/script.csv")) }],
    glossary: input("samples/ja-en/glossary.json"),
  },
];

test("bundle exposes the engine API as the Kotomark global", () => {
  for (const fn of ["parseTable", "detectFormat", "loadInputs", "parseGlossary", "runChecks", "renderMarkdown"] as const) {
    assert.equal(typeof browser[fn], "function", fn);
  }
  assert.equal(JSON.stringify(browser.EMPTY_GLOSSARY), JSON.stringify(core.EMPTY_GLOSSARY));
  assert.equal(browser.detectFormat("ui.xlf", ""), "xliff");
});

for (const s of sets) {
  test(`bundle matches src/core: ${s.label}`, () => {
    const direct = run(core, s.scripts, s.glossary);
    const bundled = run(browser, s.scripts, s.glossary);
    assert.ok(direct.result.findings.length > 0, "sample should produce findings");
    assert.deepEqual(JSON.parse(bundled.json), JSON.parse(direct.json));
    assert.equal(bundled.markdown, direct.markdown);
  });
}

test("TSV conversion yields the same findings as the CSV (file name aside)", () => {
  const glossary = input("samples/ja-en/glossary.json");
  const strip = (r: core.CheckResult) => r.findings.map(({ file: _f, ...rest }) => rest);
  const csv = run(browser, [input("samples/ja-en/script.csv")], glossary).result;
  const tsv = run(browser, [sets[2]!.scripts[0]!], glossary).result;
  assert.equal(tsv.tables[0]!.rows, csv.tables[0]!.rows);
  assert.ok(tsv.findings.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(strip(tsv))), JSON.parse(JSON.stringify(strip(csv))));
});

test("bundle detects the key ja-en issues", () => {
  const { result } = run(browser, sets[0]!.scripts, sets[0]!.glossary);
  const has = (rule: string) => result.findings.filter((f) => f.rule === rule);
  const magic = has("term.forbidden").filter((f) => f.found === "Magic Stone" || /Magic Stone/.test(f.message));
  assert.ok(magic.length > 0, "term.forbidden Magic Stone");
  assert.ok(magic.every((f) => f.file === "script.csv" && f.line > 1));
  assert.deepEqual(Array.from(magic, (f) => `${f.file}:${f.line}`), ["script.csv:6", "script.csv:17"]);
  assert.ok(has("name.forbidden").length > 0, "name finding");
  assert.ok(has("name.near-miss").some((f) => f.found === "Lisete"), "name near-miss");
  assert.ok(has("honorific.policy").length > 0, "honorific finding");
  assert.ok(has("voice.first-person").length > 0, "voice finding");
});

test("bundle loadInputs matches src/core: xlsx bytes, PO, Unity CSV and a ja.json + en.json pair (no TextDecoder in the sandbox)", () => {
  const bin = (p: string) => new Uint8Array(readFileSync(new URL(`../${p}`, import.meta.url)));
  const files = ["book.xlsx", "ui.po", "unity_table.csv", "locales/ja.json", "locales/en.json"].map((n) => ({ name: n, data: bin(`samples/formats/${n}`) }));
  const glossaryText = read("samples/ja-en/glossary.json");
  const go = (engine: Engine) => {
    const loaded = engine.loadInputs(files.map((f) => ({ ...f, data: new Uint8Array(f.data) })));
    const result = engine.runChecks(loaded.tables, engine.parseGlossary(glossaryText, "glossary.json"));
    return JSON.parse(JSON.stringify({ notes: loaded.notes, tables: loaded.tables, result }));
  };
  assert.ok(!("TextDecoder" in sandbox));
  const direct = go(core);
  assert.deepEqual(go(browser), direct);
  assert.equal(direct.tables.length, 4);
  assert.ok(direct.result.findings.length > 0);
});

test("bundle has no Node built-in references", () => {
  assert.doesNotMatch(bundle, /\brequire\s*\(/);
  assert.doesNotMatch(bundle, /["'`]node:/);
  for (const mod of ["fs", "path", "url", "crypto", "os", "child_process", "stream", "buffer", "util", "module"]) {
    assert.doesNotMatch(bundle, new RegExp(`(?:from|import\\()\\s*["'\`]${mod}["'\`]`), mod);
  }
  assert.doesNotMatch(bundle, /\bprocess\.(env|argv|cwd)\b/);
  assert.ok(!("require" in sandbox) && !("process" in sandbox), "vm sandbox stays bare");
});
