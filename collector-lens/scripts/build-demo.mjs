// Builds demo/collector-lens-demo.html: a single self-contained page that inlines
// the extension's own dictionary and analyzer (verbatim) plus the demo samples,
// and the landed-cost engine with the fictional fixture rate tables (preview).
// The output has no doctype/html/head/body: the Artifact publisher adds that skeleton.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const inline = (src) => src.replace(/<\/script/gi, "<\\/script");

// The landed-cost preview uses the FICTIONAL fixture tables, never data/rates.
const RATE_TABLES = ["meta", "proxies", "shipping", "destinations"];
function ratesScript(readFile = read) {
  const tables = Object.fromEntries(RATE_TABLES.map((k) => [k, JSON.parse(readFile(`test/fixtures/rates/${k}.json`))]));
  return "/* Fictional sample tables from test/fixtures/rates — not real fees. */\n" +
    "globalThis.DEMO_RATES = " + JSON.stringify(tables) + ";";
}

let html = read("demo/template.html");
const parts = [
  ["/*__GLOSSARY__*/", read("src/glossary-data.js")],
  ["/*__ANALYZER__*/", read("src/analyzer.js")],
  ["/*__SAMPLES__*/", read("demo/samples.js")],
  ["/*__LANDED_COST__*/", read("src/landed-cost.js")],
  ["/*__RATES__*/", ratesScript()]
];
for (const [mark, src] of parts) {
  const at = html.indexOf(mark);
  if (at < 0 || html.indexOf(mark, at + 1) >= 0) throw new Error(`template must contain ${mark} exactly once`);
  // Function replacer: '$' sequences in the sources stay literal.
  html = html.replace(mark, () => "\n" + inline(src) + "\n");
}
if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) throw new Error("output must not contain doctype/html/head/body tags");

const out = join(root, "demo/collector-lens-demo.html");
writeFileSync(out, html);
console.log(`wrote demo/collector-lens-demo.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
