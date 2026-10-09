#!/usr/bin/env node
// Score Kotomark JSON reports against truth.csv (synthetic benchmark #2).
//
//   node eval/synthetic-jaen-2/score.mjs --truth truth.csv \
//        --clean-G clean.G.json --drifted-G drifted.G.json --clean-A clean.A.json --drifted-A drifted.A.json \
//        --out results.json
//
// Matching: a finding matches a truth row when it is on the same line (±0) and its rule falls under the
// category mapping CATEGORY_RULES below (fixed from the rule *names* in the JSON output; the evaluator did
// not read the engine source). Findings on an injected line under a different rule are "line-only" hits.
// Findings on tricky-correct lines (expected=none) are false positives. Every other finding must have a
// manual verdict in JUDGEMENTS ("line:rule"), or it stays "unjudged" and is excluded from precision.

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

// Which rules count as catching which injected category. Prefix match on the rule id.
const CATEGORY_RULES = {
  term: ["term."],
  katakana: ["notation.katakana", "term."], // EN-side transliteration variants surface as term deviations
  name: ["name."],
  speaker: ["name.speaker"],
  honorific: ["honorific."],
  pronoun: ["voice.first-person"],
  politeness: ["voice.politeness"],
  contraction: ["voice.contraction"],
  "avoid-word": ["voice.avoid"],
  placeholder: ["placeholder."],
  ruby: ["ruby", "markup.", "notation.ruby", "tag."],
  length: ["length."],
  untranslated: ["untranslated.", "identical.", "copy."],
  copy: ["copy.", "duplicate.", "identical.", "untranslated."],
};
const ruleFits = (cat, rule) => (CATEGORY_RULES[cat] ?? []).some((p) => rule === p || rule.startsWith(p) || rule.includes(p));

// Manual verdicts for findings on lines that are neither injected nor tricky (evaluator, 2026-10-09).
const JUDGEMENTS = {
  "56:honorific.drift": { verdict: "FP", note: "clean line (Koharu: 'Narumi-sensei!'). Tie partner of the injected 'Mr. Narumi' (s6_025, already caught by honorific.policy). With honorificPolicy keep, the tie could be broken toward the policy-conforming form instead of pointing at the correct line" },
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
  return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

const truthAll = parseCsv(readFileSync(opt("truth"), "utf8")).map((t) => ({ ...t, line: Number(t.line) }));
const flags = truthAll.filter((t) => t.expected === "flag");
const tricky = truthAll.filter((t) => t.expected === "none");
const load = (p) => JSON.parse(readFileSync(p, "utf8")).findings;
const CI = new Set(["warning", "error"]);
const r3 = (x) => +x.toFixed(3);

function score(findings, clean) {
  const perTruth = flags.map((t) => {
    const here = findings.filter((f) => f.line === t.line);
    const hits = here.filter((f) => ruleFits(t.category, f.rule));
    return {
      line: t.line, id: t.id, category: t.category, description: t.description,
      found: hits.length > 0, foundCi: hits.some((f) => CI.has(f.severity)),
      lineOnly: !hits.length && here.length > 0,
      rules: [...new Set(here.map((f) => `${f.rule}:${f.severity}`))],
    };
  });
  const byCategory = {};
  for (const r of perTruth) {
    const c = (byCategory[r.category] ??= { injected: 0, found: 0, foundCi: 0, lineOnly: 0, missed: [] });
    c.injected++; if (r.found) c.found++; if (r.foundCi) c.foundCi++; if (r.lineOnly) c.lineOnly++;
    if (!r.found) c.missed.push(`${r.line} ${r.id} ${r.description}${r.lineOnly ? ` [line hit by ${r.rules.join(", ")}]` : ""}`);
  }
  for (const c of Object.values(byCategory)) { c.recall = r3(c.found / c.injected); c.recallCi = r3(c.foundCi / c.injected); }

  const verdicts = findings.map((f) => {
    const t = truthAll.find((x) => x.line === f.line);
    if (t?.expected === "flag") return { f, v: "TP", why: ruleFits(t.category, f.rule) ? `matches ${t.category}` : `other rule on injected ${t.category} line` };
    if (t?.expected === "none") return { f, v: "FP", why: `tricky-correct line (${t.category})`, tricky: true };
    const j = JUDGEMENTS[`${f.line}:${f.rule}`];
    return { f, v: j?.verdict ?? "unjudged", why: j?.note ?? "" };
  });
  const count = (xs) => {
    const tp = xs.filter((x) => x.v === "TP").length, fp = xs.filter((x) => x.v === "FP").length;
    return { findings: xs.length, tp, fp, unjudged: xs.filter((x) => x.v === "unjudged").length, precision: tp + fp ? r3(tp / (tp + fp)) : null };
  };
  const byRule = {};
  for (const x of verdicts) { const r = (byRule[x.f.rule] ??= { n: 0, TP: 0, FP: 0, unjudged: 0 }); r.n++; r[x.v]++; }

  const trickyRes = tricky.map((t) => {
    const here = findings.filter((f) => f.line === t.line);
    return { line: t.line, id: t.id, category: t.category, flagged: here.length > 0, flaggedCi: here.some((f) => CI.has(f.severity)), rules: here.map((f) => `${f.rule}:${f.severity}`), description: t.description };
  });
  const found = perTruth.filter((r) => r.found).length, foundCi = perTruth.filter((r) => r.foundCi).length;
  return {
    cleanFindings: { total: clean.length, ci: clean.filter((f) => CI.has(f.severity)).length, list: clean.map((f) => `${f.line} ${f.id} ${f.rule}:${f.severity}`) },
    recall: { injected: flags.length, found, recall: r3(found / flags.length), foundCi, recallCi: r3(foundCi / flags.length), lineOnly: perTruth.filter((r) => r.lineOnly).length, byCategory },
    precision: { all: count(verdicts), ci: count(verdicts.filter((x) => CI.has(x.f.severity))), byRule },
    tricky: { lines: tricky.length, flagged: trickyRes.filter((t) => t.flagged).length, flaggedCi: trickyRes.filter((t) => t.flaggedCi).length, detail: trickyRes },
    unmatched: verdicts.filter((x) => !truthAll.some((t) => t.line === x.f.line)).map((x) => ({ line: x.f.line, id: x.f.id, rule: x.f.rule, severity: x.f.severity, message: x.f.message, verdict: x.v, note: x.why })),
    perTruth,
  };
}

const result = {
  benchmark: "synthetic JA→EN school-mystery VN script #2 (eval/synthetic-jaen-2), written blind to the engine source",
  seed: 20261010,
  definitions: {
    found: "a finding on the injected line (±0) whose rule fits CATEGORY_RULES[category] (any severity)",
    foundCi: "same, severity warning or error",
    lineOnly: "something was reported on the injected line, but under a rule outside the category mapping",
    precision: "TP / (TP + FP). Findings on injected lines = TP; on tricky-correct lines = FP; elsewhere = manual JUDGEMENTS",
    trickyFlagged: "tricky-correct lines (expected=none) with at least one finding",
  },
  categoryRules: CATEGORY_RULES,
  configs: {
    G: { description: "glossary.json (19 terms, 8 characters with voice profiles, honorificPolicy keep)", ...score(load(opt("drifted-G")), load(opt("clean-G"))) },
    A: { description: "--no-glossary", ...score(load(opt("drifted-A")), load(opt("clean-A"))) },
  },
};
writeFileSync(opt("out"), JSON.stringify(result, null, 1) + "\n");
for (const [k, c] of Object.entries(result.configs)) {
  console.error(`${k}: recall ${c.recall.found}/${c.recall.injected} (warn+ ${c.recall.foundCi}); precision ${c.precision.all.precision} (TP ${c.precision.all.tp}, FP ${c.precision.all.fp}, unjudged ${c.precision.all.unjudged}); tricky flagged ${c.tricky.flagged}/${c.tricky.lines} (warn+ ${c.tricky.flaggedCi}); clean findings ${c.cleanFindings.total}`);
}
