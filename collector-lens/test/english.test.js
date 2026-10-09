// The panel is for English readers: UI strings and every glossary "en" label
// must be English. Japanese may appear in explanations only as a quoted term.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers");

const JP = /[぀-ヿ一-鿿]/;
const CL = load();

test("every glossary English label is English", () => {
  const bad = CL.GLOSSARY.entries.filter((e) => JP.test(e.en)).map((e) => e.id);
  assert.deepEqual(bad, []);
});

test("Japanese inside an explanation comes with an English gloss", () => {
  for (const e of CL.GLOSSARY.entries) {
    if (!JP.test(e.explain)) continue;
    // Each run of Japanese is followed (within a few chars) by a gloss in ( ) or quotes or "=".
    for (const m of e.explain.matchAll(/[぀-ヿ一-鿿・]+/g)) {
      const after = e.explain.slice(m.index + m[0].length, m.index + m[0].length + 4);
      const before = e.explain.slice(Math.max(0, m.index - 2), m.index);
      assert.ok(/[("'=,]/.test(after) || /'/.test(before), `${e.id}: "${m[0]}" has no English gloss`);
    }
  }
});

test("overlay UI strings are English", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "overlay.js"), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  assert.ok(!JP.test(code), "overlay.js has Japanese UI text");
});
