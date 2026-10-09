const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fixture } = require("./helpers");

const CL = load();
const index = CL.buildIndex(CL.GLOSSARY);

function decode(file, url) {
  const dom = fixture(file, url);
  const hit = CL.detectSite(url);
  assert.ok(hit && hit.isListing, "fixture URL should be a listing");
  const listing = CL.extractListing(dom.window.document, hit.site);
  return { dom, hit, listing, result: CL.analyze(listing, null, index) };
}
const ids = (arr) => arr.map((x) => x.id);

test("Yahoo! Auctions camera (table layout): junk, fungus, no returns", () => {
  const { listing, result } = decode("yahoo-camera-junk.html", "https://page.auctions.yahoo.co.jp/jp/auction/x100000001");
  assert.match(listing.title, /一眼レフ/);
  assert.equal(listing.condition, "傷や汚れあり");
  assert.equal(listing.returns, "返品不可");
  assert.match(listing.description, /カビがあります/);
  assert.equal(result.genre, "camera");
  const f = ids(result.flags);
  for (const id of ["junk", "dousa_mikakunin", "kabi", "kumori", "ncnr", "kuwashikunai", "shinkeishitsu", "rule:no_return_and_untested"]) {
    assert.ok(f.includes(id), "missing flag " + id);
  }
  assert.equal(result.score.level, "high");
  assert.equal(result.returns.terms[0].ja, "返品不可");
});

test("Yahoo! Auctions watch shop (dl layout): grade, OH, returns OK", () => {
  const { listing, result } = decode("yahoo-watch-shop.html", "https://page.auctions.yahoo.co.jp/jp/auction/x100000002");
  assert.equal(listing.condition, "目立った傷や汚れなし");
  assert.equal(listing.returns, "返品可");
  assert.equal(result.genre, "watch");
  assert.ok(result.ranks.some((r) => r.label === "A"));
  assert.ok(ids(result.reassurances).includes("oh_done"));
  assert.ok(ids(result.reassurances).includes("henpin_ka"));
  assert.ok(ids(result.flags).includes("shagai_belt"));
  assert.ok(ids(result.terms).includes("nissa"));
});

test("Mercari lens (data-testid layout): negated defects are reassurances", () => {
  const { listing, result } = decode("mercari-lens-clean.html", "https://jp.mercari.com/item/m10000000003");
  assert.equal(listing.condition, "目立った傷や汚れなし");
  assert.deepEqual(ids(result.flags).filter((id) => ["kabi", "kumori", "balsam", "abura"].includes(id)), []);
  for (const id of ["kabi", "kumori", "balsam", "abura", "dousa_kakunin_zumi"]) {
    assert.ok(ids(result.reassurances).includes(id), "missing reassurance " + id);
  }
  assert.notEqual(result.score.level, "high");
});

test("Rakuma watch: authenticity unknown + not running", () => {
  const { listing, result } = decode("rakuma-watch-fake.html", "https://item.fril.jp/0123456789abcdef");
  assert.equal(listing.condition, "やや傷や汚れあり");
  const f = ids(result.flags);
  for (const id of ["shingan_fumei", "no_brand", "fudou", "denchi_kire", "genjouhin", "rule:authenticity_disclaimer_luxury"]) {
    assert.ok(f.includes(id), "missing flag " + id);
  }
});

test("Mandarake camera (inline label): grade B, dust, tested", () => {
  const { listing, result } = decode("mandarake-camera.html", "https://order.mandarake.co.jp/order/detailPage/item?itemCode=1000000004");
  assert.equal(listing.condition, "B");
  assert.ok(result.ranks.some((r) => r.label === "B"));
  assert.ok(ids(result.flags).includes("dust"));
  assert.ok(ids(result.reassurances).includes("shutter_all_ok") || ids(result.reassurances).includes("dousa_kakunin_zumi"));
});

test("overlay renders in Shadow DOM, uses text only, and can be closed", () => {
  const { dom, hit, result } = decode("yahoo-camera-junk.html", "https://page.auctions.yahoo.co.jp/jp/auction/x100000001");
  const doc = dom.window.document;
  const before = doc.body.innerHTML.length;
  const shadow = CL.renderOverlay(doc, result, { siteName: hit.site.name, openShadow: true });
  const host = doc.getElementById(CL.OVERLAY_HOST_ID);
  assert.ok(host);
  // Page content outside our host is untouched.
  assert.equal(doc.body.innerHTML.replace(host.outerHTML, "").length, before);
  assert.match(shadow.textContent, /Warnings/);
  assert.match(shadow.textContent, /Junk/);
  assert.match(shadow.textContent, /not an appraisal/);
  // Re-render replaces rather than duplicates.
  CL.renderOverlay(doc, result, { openShadow: true });
  assert.equal(doc.querySelectorAll("#" + CL.OVERLAY_HOST_ID).length, 1);
  shadow.querySelector; // keep reference
  const s2 = host.isConnected ? shadow : doc.getElementById(CL.OVERLAY_HOST_ID).shadowRoot;
  s2.querySelector(".close").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(doc.getElementById(CL.OVERLAY_HOST_ID), null);
});

test("page text is rendered as text, never as HTML", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><body></body>");
  const evil = '<img src=x onerror="alert(1)">';
  const result = CL.analyze({ title: "カメラ", description: "ジャンク " + evil, condition: evil, returns: evil }, null, index);
  const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true });
  assert.equal(shadow.querySelector("img"), null);
  assert.match(shadow.textContent, /onerror/);
});

test("content scripts make no network calls; only the settings helper touches storage", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  const files = m.content_scripts.flatMap((c) => c.js);
  assert.ok(files.includes("src/estimate-settings.js"));
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB",
      "document.cookie", "innerHTML", "outerHTML", "insertAdjacentHTML", "eval(", "new Function", "importScripts", "browser."]) {
      assert.ok(!src.includes(banned), `${f} uses ${banned}`);
    }
    const storage = (src.match(/\bchrome\.storage[\w.]*/g) || []).map((u) => u.replace(/\.+$/, ""));
    if (f === "src/estimate-settings.js") {
      // Feature detection plus exactly one get and one set on the local area.
      for (const use of storage) assert.ok(["chrome.storage", "chrome.storage.local", "chrome.storage.local.get", "chrome.storage.local.set"].includes(use), use);
      assert.equal(storage.filter((u) => u === "chrome.storage.local.get").length, 1);
      assert.equal(storage.filter((u) => u === "chrome.storage.local.set").length, 1);
      assert.ok(!/chrome\.storage\.(sync|session|managed)/.test(src));
    } else {
      assert.deepEqual(storage, [], `${f} uses chrome.storage`);
    }
  }
});

test("a returns-field warning is explained once (under Warnings) and referenced under Returns", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><body></body>");
  const result = CL.analyze({ title: "カメラ", description: "動作確認済みのカメラです。外観にスレがあります。", returns: "返品不可" }, null, index);
  assert.equal(result.score.level, "high");
  const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true });
  const entry = CL.GLOSSARY.entries.find((e) => e.ja.includes("返品不可"));
  assert.equal(shadow.textContent.split(entry.explain).length - 1, 1);
  assert.ok(shadow.textContent.includes("Explained under Warnings."));
});

// Regression: issue 1 — a positive returns term was repeated under Seller states.
test("positive returns term is not repeated under Seller states", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><body></body>");
  const result = CL.analyze({ title: "カメラ", description: "動作確認済みです。到着後3日以内なら返品可です。", returns: "返品可" }, null, index);
  const g = CL.groupForPanel(result);
  assert.ok(g.returns.some((t) => t.risk === "positive"));
  assert.ok(!g.sellerStates.some((f) => f.field === "returns"));
  const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true });
  const ret = g.returns.find((t) => t.risk === "positive");
  assert.equal(shadow.textContent.split(ret.explain).length - 1, 1);
});

// Regression: issue 2 — "カビなし" in the condition line was shown as a risk.
test("negated defect in the condition line is a reassurance, not a risk", () => {
  const result = CL.analyze({ title: "レンズ", description: "50mmの単焦点レンズです。前後キャップ付き。ピントリングは軽く回り、絞り羽根に油染みはありません。", condition: "カビなし、くもりなし" }, null, index);
  const terms = result.condition.terms;
  assert.ok(terms.length >= 2);
  for (const t of terms) {
    assert.equal(t.risk, "positive", t.ja);
    assert.match(t.en, /^No .*\(stated\)$/);
  }
  assert.ok(!result.flags.some((f) => f.risk === "high" || f.risk === "medium"));
  const affirmed = CL.analyze({ title: "レンズ", description: "50mmのレンズです。", condition: "カビあり" }, null, index);
  assert.equal(affirmed.condition.terms[0].risk, "high");
});

// Regression: issue 3 — badge count and the Warnings list disagreed.
test("badge count equals the number of items under Warnings", () => {
  const { JSDOM } = require("jsdom");
  const cases = [
    { title: "腕時計", description: "真贋不明の腕時計です。リダンの可能性あり。動作未確認。", condition: "現状品", returns: "返品不可" },
    { title: "カメラ", description: "ジャンク品。カビ、くもりあり。素人のため詳細不明です。", condition: "ジャンク品", returns: "ノークレームノーリターン" },
    { title: "カメラ", description: "動作確認済み。カビ、くもりなし。小傷あり。", condition: "目立った傷や汚れなし", returns: "返品可" }
  ];
  for (const listing of cases) {
    const result = CL.analyze(listing, null, index);
    const g = CL.groupForPanel(result);
    assert.equal(g.warnings.length, result.score.total, result.score.label);
    const dom = new JSDOM("<!doctype html><body></body>");
    const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true });
    const warnH = [...shadow.querySelectorAll("h3")].find((h) => h.textContent === "Warnings");
    const n = warnH.nextElementSibling.querySelectorAll("li:not(.empty)").length;
    assert.equal(n, result.score.total, result.score.label);
    if (result.score.total) assert.match(shadow.querySelector(".badge").textContent, new RegExp("^" + n + " warning"));
  }
});
