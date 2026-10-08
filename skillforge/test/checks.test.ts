import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable, renderMarkdown, runChecks } from "../src/core/index.js";
import { find, runSample } from "./helpers.js";

const ja = runSample(["samples/ja-en/script.csv", "samples/ja-en/ch2.json"], "samples/ja-en/glossary.json");
const lines = (rule: string) => find(ja, rule).map((f) => `${f.file}:${f.line}`);

test("term drift: forbidden variant and missing term, with line numbers", () => {
  assert.deepEqual(lines("term.forbidden"), ["script.csv:6", "script.csv:17"]);
  assert.deepEqual(lines("term.missing"), ["script.csv:16", "script.csv:27"]);
  const usage = ja.usage.find((u) => u.group === "魔導石 → Mana Stone")!;
  assert.equal(usage.counts["Magic Stone"], 2);
  assert.ok(usage.counts["Mana Stone"]! >= 5);
});

test("katakana notation drift in the Japanese", () => {
  assert.deepEqual(lines("notation.katakana"), ["script.csv:21"]);
});

test("character names: forbidden spelling, near-miss, speaker label drift", () => {
  assert.deepEqual(lines("name.forbidden"), ["script.csv:23"]);
  assert.deepEqual(find(ja, "name.near-miss").map((f) => f.found), ["Lisete"]);
  assert.deepEqual(find(ja, "name.speaker-label").map((f) => f.found).sort(), ["MINA", "Tobias"]);
  assert.equal(find(ja, "name.near-miss").filter((f) => f.found === "Order" || f.found === "Dawn").length, 0);
});

test("honorifics: policy violation, rendering drift, source-side shift", () => {
  assert.deepEqual(lines("honorific.policy"), ["script.csv:18"]);
  assert.deepEqual(lines("honorific.drift"), ["script.csv:15", "script.csv:18"]);
  const shift = find(ja, "honorific.source-shift");
  assert.equal(shift.length, 1);
  assert.equal(shift[0]!.line, 24);
  assert.equal(shift[0]!.severity, "info");
});

test("voice: pronoun, politeness, contractions and avoided words", () => {
  assert.deepEqual(lines("voice.first-person"), ["script.csv:20"]);
  assert.deepEqual(lines("voice.politeness"), ["script.csv:25"]);
  assert.deepEqual(lines("voice.contraction"), ["script.csv:19", "script.csv:25"]);
  assert.deepEqual(lines("voice.avoid"), ["script.csv:25"]);
});

test("bonus rules: placeholder, tags, ruby leak, length", () => {
  assert.deepEqual(lines("placeholder.mismatch"), ["script.csv:26"]);
  assert.ok(lines("tag.unbalanced").includes("script.csv:22"));
  assert.deepEqual(lines("ruby.leak"), ["script.csv:27"]);
  assert.deepEqual(lines("length.limit"), ["script.csv:32"]);
  assert.equal(find(ja, "placeholder.mismatch", "ch1_010").length, 0, "{0} kept across a multi-line cell");
});

test("review packets: one per speaker plus unglossaried recurring term", () => {
  const subjects = ja.reviewPackets.map((p) => p.subject);
  assert.ok(subjects.includes("リゼット / Lisette"));
  assert.ok(subjects.includes("封印術"));
  const lisette = ja.reviewPackets.find((p) => p.subject === "リゼット / Lisette")!;
  assert.ok(lisette.lines[0]!.flagged, "flagged lines come first");
});

test("EN→JA XLIFF: forbidden katakana rendering, notation drift, voice, inline tags", () => {
  const r = runSample(["samples/en-ja/ui.xlf"], "samples/en-ja/glossary.json");
  const at = (rule: string) => find(r, rule).map((f) => `${f.line}:${f.side}`);
  assert.deepEqual(at("term.forbidden"), ["21:target"]);
  assert.deepEqual(at("notation.katakana"), ["9:target"]);
  assert.deepEqual(at("voice.first-person"), ["34:target"]);
  assert.deepEqual(at("tag.mismatch"), ["25:target"]);
});

test("works without a glossary (drift-only mode)", () => {
  const r = runSample(["samples/ja-en/script.csv"]);
  assert.ok(find(r, "notation.katakana").length >= 1);
  assert.ok(find(r, "name.speaker-label").length === 0, "MINA vs ミナ needs the character sheet");
  assert.equal(r.glossary.terms, 0);
  assert.match(renderMarkdown(r), /Script consistency report/);
});

test("pronoun detection ignores lookalikes inside words", () => {
  const t = parseTable("id,speaker,ja,en\n1,A,私服で来た。,x\n2,A,こわしがいがある。,x\n3,A,俺は行く。,x\n4,A,俺が行く。,x\n5,A,僕が行く。,x\n", "p.csv");
  const r = runChecks([t]);
  const fp = r.usage.find((u) => u.group === "A: first-person pronoun")!;
  assert.deepEqual(fp.counts, { 俺: 2, 僕: 1 });
});

test("empty targets are skipped, not reported", () => {
  const t = parseTable("id,ja,en\n1,魔導石,\n", "e.csv");
  const r = runChecks([t], { terms: [{ source: "魔導石", target: "Mana Stone" }], characters: [] });
  assert.equal(r.findings.length, 0);
});
