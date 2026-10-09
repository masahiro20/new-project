#!/usr/bin/env node
// Writes reports/index.json for the office page from peter-hq/reports/*.md.
// Publish the page with these files: reports/index.json (this output) and reports/<date>.md (from peter-hq/reports/).
//   node peter-hq/office/build-reports-index.mjs <out-dir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "../reports");
const out = process.argv[2] || ".";
const reports = fs.readdirSync(src).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().map((f) => ({ date: f.slice(0, 10), file: f }));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify({ reports }));
console.log(`index.json: ${reports.length} reports`);
