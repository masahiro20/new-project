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
  longText[0]!.rows[0]!.source = "あ".repeat(SERVER_LIMITS.maxChars + 1);
  assert.throws(() => enforceLimits(longText, undefined, SERVER_LIMITS), /Too much text/);
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
