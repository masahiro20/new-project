import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable } from "../src/core/index.js";
import { read } from "./helpers.js";

test("CSV: records keep the physical line they start on, including multi-line cells", () => {
  const t = parseTable(read("samples/ja-en/script.csv"), "script.csv");
  assert.equal(t.sourceLang, "ja");
  assert.equal(t.targetLang, "en");
  const byId = Object.fromEntries(t.rows.map((r) => [r.id, r]));
  assert.equal(byId["ch1_001"]!.line, 2);
  assert.equal(byId["ch1_010"]!.line, 11);
  assert.match(byId["ch1_010"]!.target, /\nTake it slowly\./);
  assert.equal(byId["ch1_011"]!.line, 14, "row after a 3-line record");
  assert.equal(byId["ch1_029"]!.maxLength, 30);
});

test("CSV: CRLF, BOM and quoted commas", () => {
  const t = parseTable('﻿key,ja,en\r\na,"こんにちは、世界","Hello, world"\r\nb,さようなら,Bye\r\n', "x.csv");
  assert.deepEqual(t.rows.map((r) => [r.id, r.line, r.target]), [["a", 2, "Hello, world"], ["b", 3, "Bye"]]);
});

test("CSV: unknown columns give a helpful error", () => {
  assert.throws(() => parseTable("foo,bar\n1,2\n", "x.csv"), /source\/target columns/);
});

test("JSON: wrapped array — line of each record's opening brace", () => {
  const t = parseTable(read("samples/ja-en/ch2.json"), "ch2.json");
  assert.deepEqual(t.rows.map((r) => [r.id, r.line]), [["ch2_001", 3], ["ch2_002", 9], ["ch2_003", 15]]);
});

test("JSON: keyed map uses keys as ids", () => {
  const t = parseTable('{\n  "a": {"ja": "猫", "en": "Cat"},\n  "b": {"ja": "犬", "en": "Dog"}\n}', "m.json");
  assert.deepEqual(t.rows.map((r) => [r.id, r.line, r.target]), [["a", 2, "Cat"], ["b", 3, "Dog"]]);
});

test("XLIFF 1.2: languages from <file>, speaker from note, line of <trans-unit>", () => {
  const t = parseTable(read("samples/en-ja/ui.xlf"), "ui.xlf");
  assert.equal(t.sourceLang, "en");
  assert.equal(t.targetLang, "ja");
  const u = t.rows.find((r) => r.id === "dlg_tobias")!;
  assert.equal(u.line, 29);
  assert.equal(u.speaker, "Tobias");
  assert.equal(t.rows[0]!.maxLength, 12);
  assert.match(t.rows.find((r) => r.id === "tip_bold")!.source, /<g id="1">Start<\/g>/);
});

test("XLIFF 2.0: <unit>/<segment> with srcLang/trgLang", () => {
  const x = `<?xml version="1.0"?>
<xliff version="2.0" xmlns="urn:oasis:names:tc:xliff:document:2.0" srcLang="ja" trgLang="en">
  <file id="f1">
    <unit id="u1">
      <notes><note category="speaker">ミナ</note></notes>
      <segment><source>魔導石 &amp; 剣</source><target>Mana Stone &amp; sword</target></segment>
    </unit>
  </file>
</xliff>`;
  const t = parseTable(x, "a.xlf");
  assert.equal(t.sourceLang, "ja");
  assert.deepEqual(t.rows.map((r) => [r.id, r.line, r.speaker, r.target]), [["u1", 4, "ミナ", "Mana Stone & sword"]]);
});
