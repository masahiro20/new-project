#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { parseGlossary, parseTable, renderMarkdown, runChecks, type Format } from "../core/index.js";

const USAGE = `Usage: yuragi check <table> [<table>...] [--glossary g.json] [--format csv|tsv|json|xliff]
                     [--json] [--no-rules] [--no-info] [--wide] [--out report.md]

Exit code: 0 = no errors, 1 = errors found, 2 = bad input.`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      glossary: { type: "string", short: "g" },
      format: { type: "string" },
      json: { type: "boolean" },
      "no-rules": { type: "boolean" },
      "no-info": { type: "boolean" },
      wide: { type: "boolean" },
      out: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...files] = positionals;
  if (values.help || cmd !== "check" || !files.length) {
    console.error(USAGE);
    return values.help ? 0 : 2;
  }
  const tables = files.map((f) => parseTable(readFileSync(f, "utf8"), basename(f), { format: values.format as Format | undefined }));
  const glossary = values.glossary ? parseGlossary(readFileSync(values.glossary, "utf8"), values.glossary) : undefined;
  const result = runChecks(tables, glossary, { rules: !values["no-rules"], wideAsTwo: values.wide });
  const text = values.json ? JSON.stringify(result, null, 2) : renderMarkdown(result, { includeInfo: !values["no-info"] });
  if (values.out) writeFileSync(values.out, text + "\n");
  else console.log(text);
  return result.findings.some((f) => f.severity === "error") ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 2;
}
