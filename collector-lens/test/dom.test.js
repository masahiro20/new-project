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

test("content scripts make no network or storage calls", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  for (const f of ["analyzer.js", "sites.js", "overlay.js", "content.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");
    for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "chrome.storage", "innerHTML", "eval(", "new Function"]) {
      assert.ok(!src.includes(banned), `${f} uses ${banned}`);
    }
  }
});

test("a returns-field warning is listed once (under Returns), but still scored", () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><body></body>");
  const result = CL.analyze({ title: "カメラ", description: "動作確認済みのカメラです。外観にスレがあります。", returns: "返品不可" }, null, index);
  assert.equal(result.score.level, "high");
  const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true });
  assert.equal(shadow.textContent.split("No returns").length - 1, 1);
});
