// Generates the content scripts' bundled data so they load without
// web_accessible_resources or fetch():
//   src/glossary-data.js  <- data/glossary.json      (CollectorLens.GLOSSARY)
//   src/rates-data.js     <- data/rates/*.json       (CollectorLens.RATES)
// `--check` exits non-zero if any generated file is stale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

function wrap(source, assignment) {
  return "/* GENERATED from " + source + " by scripts/build-data.mjs — do not edit. */\n" +
    "(function (root) {\n" +
    "  var NS = (root.CollectorLens = root.CollectorLens || {});\n" +
    "  " + assignment + "\n" +
    "  if (typeof module !== \"undefined\" && module.exports) module.exports = NS;\n" +
    "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n";
}

const glossary = readJson("data/glossary.json");
// Fixed key order so the output does not depend on directory listing order.
const RATE_TABLES = ["meta", "proxies", "shipping", "destinations"];
const rates = Object.fromEntries(RATE_TABLES.map((k) => [k, readJson(`data/rates/${k}.json`)]));

const outputs = [
  {
    file: "src/glossary-data.js",
    body: wrap("data/glossary.json", "NS.GLOSSARY = " + JSON.stringify(glossary) + ";"),
    summary: `${glossary.entries.length} entries`
  },
  {
    file: "src/rates-data.js",
    body: wrap("data/rates/*.json", "NS.RATES = " + JSON.stringify(rates) + ";"),
    summary: `${RATE_TABLES.join(", ")}; status ${rates.meta.status}`
  }
];

if (process.argv.includes("--check")) {
  let stale = false;
  for (const o of outputs) {
    const p = join(root, o.file);
    if (!existsSync(p) || readFileSync(p, "utf8") !== o.body) {
      console.error(`${o.file} is stale. Run: npm run build:data`);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log(outputs.map((o) => o.file.replace("src/", "")).join(" and ") + " are up to date");
} else {
  for (const o of outputs) {
    writeFileSync(join(root, o.file), o.body);
    console.log(`wrote ${o.file} (${o.summary})`);
  }
}
