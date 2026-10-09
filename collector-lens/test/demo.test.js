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

// Simplified line reader for the analyzer-level sample tests below (like the
// overlay, it reads ランク as a condition label). The demo page's own
// extractListing keeps the rank separate; it is tested against the built page further down.
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

test("glossary has 281 entries", () => {
  assert.equal(CL.GLOSSARY.entries.length, 281);
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

// ---------- Built page (jsdom) ----------
const ROOT = path.join(__dirname, "..");
const readSrc = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// The landed-cost preview inlines the FICTIONAL fixture tables (never data/rates).
function ratesScript() {
  const tables = Object.fromEntries(["meta", "proxies", "shipping", "destinations"].map((k) => [k, JSON.parse(readSrc(`test/fixtures/rates/${k}.json`))]));
  return "/* Fictional sample tables from test/fixtures/rates — not real fees. */\n" +
    "globalThis.DEMO_RATES = " + JSON.stringify(tables) + ";";
}

function expectedBuild() {
  let html = readSrc("demo/template.html");
  const parts = [
    ["/*__GLOSSARY__*/", readSrc("src/glossary-data.js")],
    ["/*__ANALYZER__*/", readSrc("src/analyzer.js")],
    ["/*__SAMPLES__*/", readSrc("demo/samples.js")],
    ["/*__LANDED_COST__*/", readSrc("src/landed-cost.js")],
    ["/*__RATES__*/", ratesScript()]
  ];
  for (const [mark, src] of parts) {
    html = html.replace(mark, () => "\n" + src.replace(/<\/script/gi, "<\\/script") + "\n");
  }
  return html;
}

function loadPage(t) {
  if (!fs.existsSync(DEMO_HTML)) { t.skip("demo/collector-lens-demo.html not built yet"); return null; }
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM(fs.readFileSync(DEMO_HTML, "utf8"), { runScripts: "dangerously" });
  return dom.window;
}

test("built page is up to date and inlines glossary, analyzer, samples and landed-cost engine verbatim", (t) => {
  if (!fs.existsSync(DEMO_HTML)) { t.skip("not built"); return; }
  const html = fs.readFileSync(DEMO_HTML, "utf8");
  assert.ok(html === expectedBuild(), "demo/collector-lens-demo.html is stale: run npm run build:demo");
  for (const f of ["src/glossary-data.js", "src/analyzer.js", "demo/samples.js", "src/landed-cost.js"]) assert.ok(html.includes(readSrc(f)), f);
  assert.ok(html.startsWith("<title>"), "<title> comes first");
  assert.ok(/仮称/.test(html) && /fictional/i.test(html), "working title + fictional samples stated");
});

test("page script renders with textContent only", () => {
  const tpl = readSrc("demo/template.html");
  for (const bad of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
    assert.ok(!tpl.includes(bad), `template must not use ${bad}`);
  }
});

test("page extractListing reads labelled lines", (t) => {
  const w = loadPage(t);
  if (!w) return;
  const x = (s) => { const r = w.extractListing(s); return [r.condition, r.rank, r.returns]; };
  assert.deepEqual(x("商品の状態：ジャンク品\n返品：不可"), ["ジャンク品", "", "不可"]);
  assert.deepEqual(x("【商品の状態】目立った傷や汚れなし\n【返品】不可"), ["目立った傷や汚れなし", "", "不可"]);
  assert.deepEqual(x("■状態ランク：B\n・返品について 返品不可"), ["", "B", "返品不可"]);
  assert.deepEqual(x("　状態　良好\n返品不可です"), ["良好", "", ""]);
  assert.deepEqual(x("返品・交換：不可"), ["", "", "不可"]);
  assert.deepEqual(x("状態は良好です\n返品不可"), ["", "", ""]);
  assert.equal(w.extractListing("").description, "");
});

test("page panel: every sample decodes with fixed sections and no repeated items", (t) => {
  const w = loadPage(t);
  if (!w) return;
  const d = w.document;
  const buttons = [...d.querySelectorAll(".sample-btn")];
  assert.equal(buttons.length, SAMPLES.length);
  for (const b of buttons) {
    b.click();
    const id = b.getAttribute("data-id");
    assert.equal(b.getAttribute("aria-pressed"), "true", id);
    const body = d.getElementById("panel-body");
    const heads = [...body.querySelectorAll("h3")].map((h) => h.firstChild.textContent);
    assert.deepEqual(heads, ["Condition", "Grade", "Returns", "Warnings", "Worth noting"], id);
    // Each term is explained only once across the panel. A risky term from the
    // condition/returns line is referenced there ("Explained under Warnings.").
    const ex = [...body.querySelectorAll(".item")]
      .map((n) => (n.querySelector(".ja") || {}).textContent + "|" + (n.querySelector(".ex") || {}).textContent)
      .filter((k) => !k.endsWith("|Explained under Warnings."));
    assert.deepEqual(ex.filter((v, i) => ex.indexOf(v) !== i), [], `${id}: repeated ${ex}`);
    const r = w.__lastResult;
    // The badge counts exactly the items under Warnings.
    const warnH = [...body.querySelectorAll("h3")].find((h) => h.firstChild.textContent === "Warnings");
    const warnItems = warnH.nextElementSibling.querySelectorAll(".item").length;
    assert.equal(warnItems, r.score.total, `${id}: badge ${r.score.label} vs ${warnItems} warnings`);
    assert.equal(d.getElementById("score").textContent, r.score.label, id);
    assert.equal(d.getElementById("score").className, "badge lvl-" + r.score.level, id);
    // Every sample shows something under Condition (a term or a grade) and Returns.
    const listing = w.extractListing(d.getElementById("listing-input").value);
    assert.ok(listing.condition || listing.rank, `${id} condition or rank`);
    assert.ok(listing.returns, `${id} returns`);
  }
});

test("page renders pasted markup as text", (t) => {
  const w = loadPage(t);
  if (!w) return;
  const d = w.document;
  const input = d.getElementById("listing-input");
  input.value = '商品の状態：<img src=x onerror="globalThis.pwned=1">ジャンク\n返品：<b>不可</b>';
  w.decodeListing();
  assert.equal(w.pwned, undefined);
  assert.equal(d.querySelectorAll("#panel-body img, #panel-body b, #read-fields img, #read-fields b").length, 0);
  assert.ok(d.getElementById("read-fields").textContent.includes("<img src=x"));
});

test("page estimate preview: fictional label + finite total range for the defaults", (t) => {
  const w = loadPage(t);
  if (!w) return;
  const d = w.document;
  const sec = d.getElementById("estimate");
  assert.ok(sec, "estimate section exists");
  // Placed below the panel (after <main>).
  assert.equal(sec.previousElementSibling.tagName, "MAIN");
  assert.match(d.getElementById("est-flag").textContent, /Sample numbers from a fictional proxy — not real fees/);
  const r = w.__lastEstimate;
  assert.ok(r, "estimate rendered");
  assert.ok(Number.isFinite(r.low) && Number.isFinite(r.high), `range ${r.low}..${r.high}`);
  assert.ok(r.low > 0 && r.low < r.high, "default band (up to ¥1,000) gives a real range");
  assert.equal(r.currency, "USD");
  const total = d.getElementById("est-total").textContent;
  assert.match(total, /^US\$[\d,]+ – US\$[\d,]+$/);
  assert.ok(!/NaN|undefined|null/.test(sec.textContent), "no NaN/undefined/null rendered");
  const lines = d.querySelectorAll("#est-lines .est-line");
  assert.equal(lines.length, r.lines.length);
  for (const li of lines) assert.ok(li.querySelector(".chip"), "every line shows its status");
  assert.ok(/Checked 2026-10-01/.test(d.getElementById("est-lines").textContent), "checked date shown");
  assert.ok(/Fictional test table/.test(d.getElementById("est-lines").textContent), "source shown");
  // Changing inputs re-renders; a destination with an unconfirmed fee lists it as not included.
  const dest = d.getElementById("est-dest");
  dest.value = "DE";
  dest.dispatchEvent(new w.Event("change"));
  assert.equal(w.__lastEstimate.currency, "EUR");
  assert.ok(Number.isFinite(w.__lastEstimate.low));
  assert.ok(/Not included/.test(d.getElementById("est-lines").textContent));
  // A typed exchange rate replaces the sample reference rate.
  const fx = d.getElementById("est-fx");
  fx.value = "120";
  fx.dispatchEvent(new w.Event("input"));
  assert.equal(w.__lastEstimate.used.fx_source, "user");
});
