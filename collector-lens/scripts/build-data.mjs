// Generates src/glossary-data.js from data/glossary.json so the content script
// can load the dictionary without web_accessible_resources or fetch().
// `--check` exits non-zero if the generated file is stale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const glossary = JSON.parse(readFileSync(join(root, "data/glossary.json"), "utf8"));
const out = join(root, "src/glossary-data.js");
const body =
  "/* GENERATED from data/glossary.json by scripts/build-data.mjs — do not edit. */\n" +
  "(function (root) {\n" +
  "  var NS = (root.CollectorLens = root.CollectorLens || {});\n" +
  "  NS.GLOSSARY = " + JSON.stringify(glossary) + ";\n" +
  "  if (typeof module !== \"undefined\" && module.exports) module.exports = NS;\n" +
  "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n";

if (process.argv.includes("--check")) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== body) {
    console.error("src/glossary-data.js is stale. Run: npm run build:data");
    process.exit(1);
  }
  console.log("glossary-data.js is up to date");
} else {
  writeFileSync(out, body);
  console.log(`wrote src/glossary-data.js (${glossary.entries.length} entries)`);
}
