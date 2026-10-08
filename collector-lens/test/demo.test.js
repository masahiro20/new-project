const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Load the glossary + analyzer the same way the demo page does (shared global namespace).
for (const f of ["src/glossary-data.js", "src/analyzer.js", "demo/samples.js"]) {
  delete require.cache[require.resolve(path.join("..", f))];
}
require("../src/glossary-data.js");
const CL = require("../src/analyzer.js");
const SAMPLES = require("../demo/samples.js");

const index = CL.buildIndex(CL.GLOSSARY);
const ids = (arr) => arr.map((x) => x.id);

const CONDITION_LABELS = ["商品の状態", "状態", "コンディション", "商品状態", "状態ランク", "ランク"];
const RETURN_LABELS = ["返品", "返品の可否", "返品について", "返品可否"];

// Same rule as the demo: first line that begins with one of the labels followed
// by ":" or "：" — the value is the rest of the line. Longest label tried first.
function extractLine(text, labels) {
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    for (const label of sorted) {
      if (!line.startsWith(label)) continue;
      const rest = line.slice(label.length).trimStart();
      if (rest[0] === ":" || rest[0] === "：") return rest.slice(1).trim();
    }
  }
  return "";
}

function analyzeSample(s) {
  const title = s.text.split("\n")[0];
  return CL.analyze(
    {
      title,
      description: s.text,
      condition: extractLine(s.text, CONDITION_LABELS),
      returns: extractLine(s.text, RETURN_LABELS)
    },
    null,
    index
  );
}

const byId = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));

test("glossary has 227 entries", () => {
  assert.equal(CL.GLOSSARY.entries.length, 227);
});

test("six samples: 3 camera + 3 watch, unique ids, well-formed", () => {
  assert.equal(SAMPLES.length, 6);
  assert.equal(SAMPLES.filter((s) => s.genre === "camera").length, 3);
  assert.equal(SAMPLES.filter((s) => s.genre === "watch").length, 3);
  assert.equal(new Set(SAMPLES.map((s) => s.id)).size, 6);
  for (const s of SAMPLES) {
    assert.equal(typeof s.label, "string");
    assert.ok(s.label.length > 0 && s.label.length <= 40, s.id);
    const lines = s.text.split("\n").filter((l) => l.trim());
    assert.ok(lines.length >= 3 && lines.length <= 10, `${s.id} has ${lines.length} lines`);
  }
});

test("samples also attach to globalThis.DEMO_SAMPLES", () => {
  assert.equal(globalThis.DEMO_SAMPLES, SAMPLES);
});

test("detectGenre matches each sample's declared genre", () => {
  for (const s of SAMPLES) {
    assert.equal(CL.detectGenre(s.text), s.genre, s.id);
    assert.equal(analyzeSample(s).genre, s.genre, s.id);
  }
});

test("extractLine helper", () => {
  assert.equal(extractLine("a\n商品の状態：ジャンク品\nb", CONDITION_LABELS), "ジャンク品");
  assert.equal(extractLine("ランク: AB", CONDITION_LABELS), "AB");
  assert.equal(extractLine("返品について：不可", RETURN_LABELS), "不可");
  assert.equal(extractLine("状態は良好です", CONDITION_LABELS), "");
});

test("every sample yields a condition and a returns line", () => {
  for (const s of SAMPLES) {
    assert.ok(extractLine(s.text, CONDITION_LABELS), `${s.id} condition`);
    assert.ok(extractLine(s.text, RETURN_LABELS), `${s.id} returns`);
  }
});

test("Camera A (junk rangefinder): high score, untested + no returns", () => {
  const r = analyzeSample(byId["camera-junk-rangefinder"]);
  assert.equal(r.score.level, "high");
  const f = ids(r.flags);
  for (const id of ["rule:no_return_and_untested", "junk", "dousa_mikakunin", "ncnr", "kabi", "kumori"]) {
    assert.ok(f.includes(id), id);
  }
  assert.ok(r.flags.filter((x) => x.risk === "high").length >= 3);
  assert.ok(r.returns.terms.some((t) => t.risk === "high"), "returns line decoded as NCNR");
  assert.equal(r.reassurances.length, 0);
});

test("Camera B (shop SLR): low score, ranks, negated reassurances", () => {
  const r = analyzeSample(byId["camera-shop-slr"]);
  assert.notEqual(r.score.level, "high");
  assert.ok(r.ranks.some((x) => x.kind === "shop" && x.label === "AB"));
  assert.ok(r.ranks.some((x) => x.kind === "export" && /Exc\+\+\+/.test(x.label)));
  const neg = r.reassurances.filter((x) => x.negated).map((x) => x.id).sort();
  assert.deepEqual(neg, ["kabi", "kumori"]);
  assert.ok(ids(r.reassurances).includes("dousa_kakunin_zumi"));
  assert.ok(ids(r.reassurances).includes("henpin_ka"));
  assert.ok(!ids(r.flags).includes("kabi"));
  assert.ok(r.returns.terms.some((t) => t.risk === "positive"));
});

test("Camera C (lens): balsam separation flagged, no rule hits", () => {
  const r = analyzeSample(byId["camera-lens-balsam"]);
  const f = ids(r.flags);
  assert.ok(f.includes("balsam"));
  assert.ok(f.includes("fukikizu"));
  assert.ok(!f.some((id) => id.startsWith("rule:")));
  // "油滲みはなく" is a negated defect.
  assert.ok(r.reassurances.some((x) => x.id === "abura" && x.negated));
});

test("Watch A (authenticity unknown): authenticity rule + redial", () => {
  const r = analyzeSample(byId["watch-authenticity-redial"]);
  assert.equal(r.score.level, "high");
  const f = ids(r.flags);
  for (const id of ["rule:authenticity_disclaimer_luxury", "shingan_fumei", "redial", "henpin_fuka"]) {
    assert.ok(f.includes(id), id);
  }
});

test("Watch B (serviced shop watch): not high, OH done, 日差 but not 日差し", () => {
  const s = byId["watch-shop-serviced"];
  assert.ok(s.text.includes("日差し"), "sample should contain 日差し as a decoy");
  const r = analyzeSample(s);
  assert.notEqual(r.score.level, "high");
  assert.ok(ids(r.reassurances).includes("oh_done"));
  assert.ok(ids(r.reassurances).includes("henpin_ka"));
  assert.ok(ids(r.terms).includes("nissa"));
  const nissaHits = CL.findTerms(s.text, index).filter((h) => h.entry.id === "nissa");
  assert.equal(nissaHits.length, 1, "only 日差+5秒 matches, not 日差し");
});

test("Watch C (assembled watch): franken + aftermarket strap + as-is", () => {
  const r = analyzeSample(byId["watch-assembled-parts"]);
  assert.equal(r.score.level, "high");
  const f = ids(r.flags);
  for (const id of ["franken", "shagai_belt", "genjouhin", "genjou_watashi", "rule:no_return_and_untested"]) {
    assert.ok(f.includes(id), id);
  }
});

const DEMO_HTML = path.join(__dirname, "..", "demo", "collector-lens-demo.html");

test("demo HTML is a self-contained fragment with no network access", (t) => {
  if (!fs.existsSync(DEMO_HTML)) {
    t.skip("demo/collector-lens-demo.html not built yet");
    return;
  }
  const html = fs.readFileSync(DEMO_HTML, "utf8");
  assert.ok(!/<!doctype/i.test(html), "no <!doctype>");
  assert.ok(!/<html[\s>]/i.test(html), "no <html>");
  assert.ok(!/<body[\s>]/i.test(html), "no <body>");
  assert.ok(/working title/i.test(html), 'mentions "working title"');
  for (const bad of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon"]) {
    assert.ok(!html.includes(bad), `no ${bad}`);
  }
  assert.ok(!/https?:\/\//i.test(html), "no external URLs");
});
