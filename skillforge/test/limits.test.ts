// Security review B-02: glossary × script work must not grow as terms × rows, and the hosted server bounds every run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLI_LIMITS, enforceLimits, LimitError, runChecks, SERVER_LIMITS, withTimeBudget, checkBudget } from "../src/core/index.js";
import { clearTextCaches } from "../src/core/text.js";
import { AnchorMatcher, foldCase, phraseAnchor } from "../src/core/matcher.js";
import { containsPhrase } from "../src/core/text.js";
import { check, devContext } from "../src/server/tools.js";
import { stressData } from "./stress-data.js";

test("AnchorMatcher finds every anchor occurrence (overlaps, shared prefixes, empty anchors)", () => {
  const m = new AnchorMatcher(["he", "she", "his", "hers", "", "ヒーロー", "ロー"]);
  const found = (t: string) => m.find(t).sort((a, b) => a - b);
  assert.deepEqual(found("ushers"), [0, 1, 3, 4]);
  assert.deepEqual(found("ahis"), [2, 4]);
  assert.deepEqual(found("ヒーローの"), [4, 5, 6]);
  assert.deepEqual(found("xyz"), [4], "an empty anchor is always a candidate");
  assert.deepEqual(new AnchorMatcher([]).find("anything"), []);
});

test("phraseAnchor is a necessary condition of containsPhrase (case, plurals, inflection, apostrophes)", () => {
  const cases: [string, string, "ja" | "en"][] = [
    ["The mana  stones glow", "Mana Stone", "en"], ["Knives!", "Knife", "en"], ["abilities", "Ability", "en"], ["Bob’s shop", "Bob's Shop", "en"],
    ["egg hunt", "Egg Hunts", "en"], ["RESET", "Reset", "en"], ["leaves", "Leaf", "en"], ["boxes", "Box", "en"], ["ÉCLAIR", "éclair", "en"],
    ["マナ・ストーンを使う", "マナ・ストーン", "ja"], ["ＡＢＣ社", "ａｂｃ社", "ja"],
  ];
  for (const [text, phrase, lang] of cases) {
    for (const loose of [false, true]) {
      if (!containsPhrase(text, phrase, lang, false, loose)) continue;
      assert.ok(foldCase(text.replace(/[‘’ʼ′]/g, "'")).includes(phraseAnchor(phrase, lang)), `${phrase} in ${text}`);
    }
  }
});

test("engine limits: clear errors for oversized glossaries and scripts", () => {
  const { glossary, tables } = stressData(10, 100);
  assert.doesNotThrow(() => enforceLimits(tables, glossary, SERVER_LIMITS));
  const big = { ...glossary, terms: Array.from({ length: SERVER_LIMITS.maxTerms + 1 }, (_, i) => ({ source: `語${i}`, target: `t${i}` })) };
  assert.throws(() => enforceLimits(tables, big, SERVER_LIMITS), (e: Error) => e instanceof LimitError && /Too many glossary terms \(5,001 > 5,000\)/.test(e.message));
  assert.doesNotThrow(() => enforceLimits(tables, big, CLI_LIMITS), "the CLI is far more generous");
  const many = stressData(10, 1).tables;
  many[0]!.rows = Array.from({ length: SERVER_LIMITS.maxRows + 1 }, (_, i) => ({ file: "a.csv", line: i, id: `${i}`, source: "あ", target: "a" }));
  assert.throws(() => enforceLimits(many, glossary, SERVER_LIMITS), /Too many rows \(100,001 > 100,000\)/);
  const product = { ...glossary, terms: big.terms.slice(0, 5000) };
  const rows60k = stressData(1, 1).tables;
  rows60k[0]!.rows = Array.from({ length: 60_000 }, (_, i) => ({ file: "a.csv", line: i, id: `${i}`, source: "あ", target: "a" }));
  assert.throws(() => enforceLimits(rows60k, product, SERVER_LIMITS), /Glossary × script too large/);
  const longText = stressData(1, 1).tables;
  const chunk = "あ".repeat(SERVER_LIMITS.maxRowChars);
  longText[0]!.rows = Array.from({ length: SERVER_LIMITS.maxChars / SERVER_LIMITS.maxRowChars + 1 }, (_, i) => ({ file: "a.csv", line: i, id: `${i}`, source: chunk, target: "" }));
  assert.throws(() => enforceLimits(longText, undefined, SERVER_LIMITS), /Too much text/);
});

// Atlas re-review of c461679: nested glossary terms (あ, ああ, …) and one huge line ran 36–67 s past the 20 s budget.
test("B-02 pathological: nested terms and one huge line are refused by the limits or stop within the budget", () => {
  const nested = (n: number, extra = "") => ({ terms: Array.from({ length: n }, (_, i) => ({ source: "あ".repeat(i + 1) + extra, target: `T${i}` })), characters: [] });
  const oneLine = (len: number) => [{ file: "x.csv", format: "csv" as const, sourceLang: "ja" as const, targetLang: "en" as const, rows: [{ file: "x.csv", line: 2, id: "1", source: "あ".repeat(len), target: "a" }] }];
  // The attack as reported: 3,000 nested terms (up to 3,000 chars) and a 1,000,000-char line — refused before any work.
  const t0 = Date.now();
  assert.throws(() => enforceLimits(oneLine(1_000_000) as never, nested(3000), SERVER_LIMITS), (e: Error) => e instanceof LimitError && /too long/.test(e.message));
  assert.throws(() => enforceLimits(oneLine(1_000_000) as never, nested(10), SERVER_LIMITS), /x\.csv:2: line too long \(1,000,000 characters > 100,000\)/);
  assert.ok(Date.now() - t0 < 1000);
  // The worst case inside the limits: 200 nested terms of up to 200 chars, a 100,000-char line. Must finish quickly…
  clearTextCaches();
  const g = nested(SERVER_LIMITS.maxTermLength);
  enforceLimits(oneLine(SERVER_LIMITS.maxRowChars) as never, g, SERVER_LIMITS);
  const t1 = Date.now();
  withTimeBudget(SERVER_LIMITS.timeBudgetMs, () => runChecks(oneLine(SERVER_LIMITS.maxRowChars) as never, g));
  if (!process.env.KOTOMARK_SKIP_PERF) assert.ok(Date.now() - t1 < 5_000, `took ${Date.now() - t1} ms`);
  // …and a budget is honoured inside a single line, not only between rows (CLI-sized input, 300 ms budget).
  clearTextCaches();
  const t2 = Date.now();
  assert.throws(() => withTimeBudget(300, () => runChecks(oneLine(3_000_000) as never, nested(1000))), (e: Error) => e instanceof LimitError && /time budget/.test(e.message));
  assert.ok(Date.now() - t2 < 3_000, `budget overrun: ${Date.now() - t2} ms`);
});

test("AnchorMatcher: nested anchors are reported once each, in time linear in the text (output links)", () => {
  const anchors = Array.from({ length: 2000 }, (_, i) => "あ".repeat(i + 1));
  const m = new AnchorMatcher(anchors);
  const t0 = Date.now();
  const found = m.find("あ".repeat(200_000));
  assert.equal(found.length, 2000);
  assert.equal(new Set(found).size, 2000);
  assert.deepEqual(m.find("ああ").sort((a, b) => a - b), [0, 1]);
  assert.ok(Date.now() - t0 < 2_000, `took ${Date.now() - t0} ms`);
});

test("engine limits: over-long glossary strings are refused on the server, allowed further on the CLI", () => {
  const long = "語".repeat(SERVER_LIMITS.maxTermLength + 1);
  const g = (t: object) => ({ terms: [], characters: [], ...t });
  assert.throws(() => enforceLimits([], g({ terms: [{ source: long, target: "x" }] }) as never, SERVER_LIMITS), /Glossary term too long \(201 characters > 200\)/);
  assert.throws(() => enforceLimits([], g({ terms: [{ source: "a", target: "x", forbidden: [long] }] }) as never, SERVER_LIMITS), /variant too long/);
  assert.throws(() => enforceLimits([], g({ characters: [{ id: "c", ja: "a", en: "b", aliases: { ja: [long] } }] }) as never, SERVER_LIMITS), /character name too long/);
  assert.doesNotThrow(() => enforceLimits([], g({ terms: [{ source: long, target: "x" }] }) as never, CLI_LIMITS));
});

test("time budget: a run past its budget stops with a LimitError; no budget outside withTimeBudget", () => {
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10_000; i++) checkBudget();
  });
  const { glossary, tables } = stressData(300, 4000);
  clearTextCaches();
  assert.throws(() => withTimeBudget(1, () => runChecks(tables, glossary)), (e: Error) => e instanceof LimitError && /time budget \(0\.001 s\)/.test(e.message));
  // the deadline is cleared afterwards
  assert.doesNotThrow(() => runChecks(tables, glossary));
});

test("server: check_script refuses an oversized glossary before charging rows", async () => {
  const { glossary } = stressData(SERVER_LIMITS.maxTerms + 1, 1);
  const ctx = devContext();
  const args = {
    tables: [{ filename: "s.csv", content: "id,source,target\n1,こんにちは,Hello\n" }],
    glossary: { filename: "g.json", content: JSON.stringify({ terms: glossary.terms }) },
  };
  await assert.rejects(check(ctx, args), /Too many glossary terms \(5,001 > 5,000\)/);
});

// Performance regression (B-02): 1,000 terms + 100 characters × 10,000 rows took ~14 s with the terms × rows scan and takes well
// under a second with the Aho-Corasick prefilters. The threshold is generous so a loaded CI machine does not flake;
// set KOTOMARK_SKIP_PERF=1 to skip on very slow machines.
test("perf: 1,000 terms + 100 characters × 10,000 rows stays fast", { skip: process.env.KOTOMARK_SKIP_PERF === "1" }, () => {
  const { glossary, tables } = stressData(1000, 10_000, 3);
  const K = "アイウエオカキクケコサシスセソタチツテト";
  for (let i = 0; i < 100; i++) glossary.characters.push({ id: `c${i}`, ja: `${K[i % 20]}${K[Math.floor(i / 20)]}ン`, en: `Hero${String.fromCharCode(97 + (i % 26))}${i}` });
  clearTextCaches();
  const t0 = performance.now();
  const r = runChecks(tables, glossary);
  const ms = performance.now() - t0;
  assert.ok(r.findings.length > 1000, "the run did real work");
  assert.ok(ms < 6000, `runChecks took ${Math.round(ms)} ms (expected about 1 s; the old algorithm took ~14 s)`);
});
