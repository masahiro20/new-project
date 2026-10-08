import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseGlossary, parseTable, runChecks, type CheckResult, type Finding } from "../src/core/index.js";

export const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

export function runSample(tables: string[], glossary?: string): CheckResult {
  return runChecks(
    tables.map((t) => parseTable(read(t), basename(t))),
    glossary ? parseGlossary(read(glossary), glossary) : undefined,
  );
}

export const find = (r: CheckResult, rule: string, id?: string): Finding[] =>
  r.findings.filter((f) => f.rule === rule && (!id || f.id === id));
