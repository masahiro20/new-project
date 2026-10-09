import { test } from "node:test";
import assert from "node:assert/strict";
import { findingsToLabelCsv, scoreLabels } from "../src/core/pilot.js";
import { parseTable, runChecks } from "../src/core/index.js";

test("label CSV neutralises formula-like cells and the scorer reads them back", () => {
  const csv = "id,ja,en\n=cmd,魔導石だ。,=HYPERLINK(\"x\") Magic Stone\n";
  const table = parseTable(csv, "f.csv");
  const glossary = { terms: [{ source: "魔導石", target: "Mana Stone", forbidden: ["Magic Stone"] }], characters: [] };
  const result = runChecks([table], glossary);
  const out = findingsToLabelCsv(result, [table]);
  assert.ok(!/(^|,)=/m.test(out), "no cell may start with =");
  assert.ok(out.includes("'=cmd"));
  const labeled = out.replace(/,,(\r?\n)/g, ",TP,$1");
  const known = "string_id,category,memo\n'=cmd,term,x\n";
  const score = scoreLabels(labeled, known);
  assert.equal(score.total.tp, result.findings.length);
  assert.equal(score.recall?.found, 1);
});
