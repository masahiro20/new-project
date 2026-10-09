#!/usr/bin/env node
// Score Kotomark JSON reports against truth.csv.
//
//   node eval/synthetic-jaen/score.mjs --truth truth.csv --clean-G clean.G.json --drifted-G drifted.G.json \
//        --clean-A clean.A.json --drifted-A drifted.A.json --out results.json [--before old-results.json]
//
// --before embeds the configs of an earlier results.json under "before" (kept for the fixes.md comparison).
//
// A truth row is "found" when a finding sits on the same line with one of the rules in its `expect` column.
// Findings that match no truth row are looked up in JUDGEMENTS (the evaluator's manual verdicts, keyed by
// "line:rule"); anything not listed there is reported as "unjudged" so a re-run on a changed engine cannot
// silently count new findings as correct.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

// Manual verdicts for findings on the drifted script that match no injected error (evaluator, 2026-10-09).
const JUDGEMENTS = {
  "82:honorific.drift": { verdict: "FP", note: "clean line (Hayate: Sir Gald). The 殿 group is a 1-1-1 tie (Sir Gald / Gald-dono / Gald). Before the fixes (fixes.md): warning pointing at the policy-violating Gald-dono as the 'majority'. After: info 'split, no majority' (Sir Gald ×1 / Gald ×1), still counted FP because the line itself is correct" },
};

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

const truth = parseCsv(readFileSync(opt("truth"), "utf8")).map((t) => ({ ...t, line: Number(t.line), expect: t.expect.split("|") }));
const load = (p) => JSON.parse(readFileSync(p, "utf8")).findings;
const CI = new Set(["warning", "error"]);

function score(findings, clean) {
  const perTruth = truth.map((t) => {
    const here = findings.filter((f) => f.line === t.line);
    const hits = here.filter((f) => t.expect.includes(f.rule));
    return {
      line: t.line, id: t.id, category: t.category, subtype: t.subtype,
      found: hits.length > 0,
      foundCi: hits.some((f) => CI.has(f.severity)),
      lineOnly: !hits.length && here.length > 0,
      rules: [...new Set(here.map((f) => `${f.rule}:${f.severity}`))],
      predictedGap: t.predicted_gap || undefined,
    };
  });
  const byCat = {};
  for (const r of perTruth) {
    const c = (byCat[r.category] ??= { injected: 0, found: 0, foundCi: 0, lineOnly: 0, missed: [] });
    c.injected++; if (r.found) c.found++; if (r.foundCi) c.foundCi++; if (r.lineOnly) c.lineOnly++;
    if (!r.found) c.missed.push(`${r.line} ${r.subtype}${r.lineOnly ? ` (line hit by ${r.rules.join(", ")})` : ""}`);
  }
  for (const c of Object.values(byCat)) { c.recall = +(c.found / c.injected).toFixed(3); c.recallCi = +(c.foundCi / c.injected).toFixed(3); }
  // Precision over findings
  const fl = findings.map((f) => {
    const t = truth.find((x) => x.line === f.line);
    if (t && t.expect.includes(f.rule)) return { ...f, verdict: "TP", why: `matches injected ${t.category}` };
    if (t) return { ...f, verdict: "TP", why: `other rule on injected ${t.category} line` };
    const j = JUDGEMENTS[`${f.line}:${f.rule}`];
    return { ...f, verdict: j?.verdict ?? "unjudged", why: j?.note ?? "" };
  });
  const count = (xs) => ({ findings: xs.length, tp: xs.filter((f) => f.verdict === "TP").length, fp: xs.filter((f) => f.verdict === "FP").length, unjudged: xs.filter((f) => f.verdict === "unjudged").length });
  const prec = (c) => (c.tp + c.fp ? +(c.tp / (c.tp + c.fp)).toFixed(3) : null);
  const all = count(fl), ci = count(fl.filter((f) => CI.has(f.severity)));
  const byRule = {};
  for (const f of fl) { const r = (byRule[f.rule] ??= { n: 0, tp: 0, fp: 0, unjudged: 0 }); r.n++; r[f.verdict === "TP" ? "tp" : f.verdict === "FP" ? "fp" : "unjudged"]++; }
  const found = perTruth.filter((r) => r.found).length;
  return {
    cleanFindings: clean.length,
    recall: { injected: truth.length, found, recall: +(found / truth.length).toFixed(3), foundCi: perTruth.filter((r) => r.foundCi).length, recallCi: +(perTruth.filter((r) => r.foundCi).length / truth.length).toFixed(3), byCategory: byCat },
    precision: { all: { ...all, precision: prec(all) }, ci: { ...ci, precision: prec(ci) }, byRule },
    unmatched: fl.filter((f) => !truth.some((t) => t.line === f.line)).map((f) => ({ line: f.line, rule: f.rule, severity: f.severity, verdict: f.verdict, note: f.why })),
    perTruth,
  };
}

const result = {
  benchmark: "synthetic JA→EN dialogue script (eval/synthetic-jaen)",
  seed: 20261009,
  definitions: {
    found: "a finding on the injected line whose rule is listed in truth.csv `expect` (any severity)",
    foundCi: "same, severity warning or error (what `--fail-on warning` gates on)",
    lineOnly: "something was reported on the line, but under another rule",
    precision: "TP / (TP + FP); findings on injected lines count as TP, others judged by hand (JUDGEMENTS in score.mjs)",
  },
  configs: {
    G: { description: "glossary.json (15 terms, 6 characters with voice profiles, honorificPolicy localize)", ...score(load(opt("drifted-G")), load(opt("clean-G"))) },
    A: { description: "--no-glossary", ...score(load(opt("drifted-A")), load(opt("clean-A"))) },
  },
};
if (opt("before")) {
  const old = JSON.parse(readFileSync(opt("before"), "utf8"));
  result.before = old.before ?? { note: "engine before the fixes in fixes.md (2026-10-09)", configs: old.configs };
}
writeFileSync(opt("out"), JSON.stringify(result, null, 1) + "\n");
const g = result.configs.G, a = result.configs.A;
console.error(`G: recall ${g.recall.found}/${g.recall.injected} (CI ${g.recall.foundCi}), precision ${g.precision.all.precision} (unjudged ${g.precision.all.unjudged}); A: recall ${a.recall.found}/${a.recall.injected}, precision ${a.precision.all.precision} (unjudged ${a.precision.all.unjudged})`);
