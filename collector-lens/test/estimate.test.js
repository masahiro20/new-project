// "Estimated total" section of the panel (design docs/v1.1-total-cost-design.md §8)
// and its settings storage helper. Uses the bundled placeholder tables
// (src/rates-data.js, all values null) and the FICTIONAL fixture tables.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { load } = require("./helpers");

const CL = load();
const index = CL.buildIndex(CL.GLOSSARY);
const ROOT = path.join(__dirname, "..");
const FIXTURE = Object.fromEntries(["meta", "proxies", "shipping", "destinations"].map((k) =>
  [k, JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/rates", k + ".json"), "utf8"))]));
const TODAY = "2026-10-09";
const TITLE = "ニコン 50mm 単焦点レンズ";
const LISTING = { title: TITLE, description: "50mmの単焦点レンズです。カビ、くもりなし。動作確認済み。", condition: "目立った傷や汚れなし" };

function fakeChrome(initial) {
  const data = initial ? structuredClone(initial) : {};
  const calls = { get: 0, set: [] };
  return {
    data, calls,
    storage: {
      local: {
        get(key, cb) { calls.get++; const o = {}; if (key in data) o[key] = structuredClone(data[key]); setImmediate(() => cb(o)); },
        set(obj, cb) { calls.set.push(structuredClone(obj)); Object.assign(data, structuredClone(obj)); if (cb) setImmediate(cb); }
      }
    }
  };
}

// Fresh page + overlay. `estimate` is passed to the panel as meta.estimate.
function render(estimate, { chrome } = {}) {
  CL._estimateUi.open = false;
  CL._estimateUi.breakdown = false;
  CL.estimateSettings._reset();
  if (chrome) globalThis.chrome = chrome; else delete globalThis.chrome;
  const dom = new JSDOM("<!doctype html><body><input id='page-search'></body>");
  const result = CL.analyze(LISTING, null, index);
  const shadow = CL.renderOverlay(dom.window.document, result, { openShadow: true, estimate: estimate || {} });
  const q = (s) => shadow.querySelector(s);
  return { dom, shadow, q, result };
}

function click(e) { e.dispatchEvent(new e.ownerDocument.defaultView.Event("click", { bubbles: true })); }
function open(q) { click(q(".est-toggle")); }
function set(q, sel, value, type) {
  const c = q(sel);
  c.value = value;
  c.dispatchEvent(new c.ownerDocument.defaultView.Event(type || (c.tagName === "SELECT" ? "change" : "input"), { bubbles: true }));
}
const lineTexts = (shadow) => [...shadow.querySelectorAll(".est-lines li")].map((li) => li.textContent);
const warningTexts = (shadow) => [...shadow.querySelectorAll(".est-warnings li")].map((li) => li.textContent);
const tick = () => new Promise((r) => setImmediate(r));

test.afterEach(() => { delete globalThis.chrome; });

test("feature flags: landed cost on, Pro billing off", () => {
  assert.deepEqual({ ...CL.FEATURES }, { landedCost: true, proBilling: false });
  assert.ok(Object.isFrozen(CL.FEATURES));
});

test("no payment or billing code ships in the content scripts", () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  for (const f of m.content_scripts.flatMap((c) => c.js)) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/extensionpay|ExtPay|stripe|checkout|paddle|lemonsqueezy/i.test(src), f);
  }
});

test("bundled rate tables are generated from data/rates", () => {
  for (const k of ["meta", "proxies", "shipping", "destinations"]) {
    assert.deepEqual(CL.RATES[k], JSON.parse(fs.readFileSync(path.join(ROOT, "data/rates", k + ".json"), "utf8")), k);
  }
});

test("section sits at the end of the panel body and is collapsed by default", () => {
  const { shadow, q } = render();
  const est = q(".body > .est");
  assert.ok(est, "section present");
  assert.equal(q(".body").lastElementChild, est);
  assert.equal(q(".est-toggle").getAttribute("aria-expanded"), "false");
  assert.equal(q(".est-body").hidden, true);
  assert.match(q(".est-toggle").textContent, /Estimated total/);
  open(q);
  assert.equal(q(".est-toggle").getAttribute("aria-expanded"), "true");
  assert.equal(q(".est-body").hidden, false);
  assert.ok(shadow.textContent.includes(CL.ESTIMATE_DISCLAIMER));
  assert.equal(CL.ESTIMATE_DISCLAIMER, "Rough estimate. Fees, shipping and taxes change; check with your proxy and carrier.");
});

test("section is left out when the feature flag is off", () => {
  const saved = CL.FEATURES;
  try {
    CL.FEATURES = { landedCost: false, proBilling: false };
    const { q } = render();
    assert.equal(q(".est"), null);
  } finally { CL.FEATURES = saved; }
});

test("no price on the page: input only, no total, no NaN", () => {
  const { shadow, q } = render({ today: TODAY, listing: { is_auction: true, genre: "camera", subgenre: "lens" } });
  open(q);
  assert.equal(q(".est-bid").value, "");
  assert.equal(q(".est-bid").placeholder, "");
  assert.match(shadow.textContent, /Price not found on this page/);
  assert.equal(q(".est-total").textContent, "—");
  assert.match(q(".est-status").textContent, /Enter your max bid/);
  assert.ok(!/NaN|Infinity|undefined/.test(shadow.textContent));
});

test("placeholder tables (all null): finite total from the price, other lines 'Not confirmed yet — excluded'", () => {
  const { shadow, q } = render({ today: TODAY, listing: { is_auction: true, genre: "camera", subgenre: "lens" } });
  open(q);
  set(q, ".est-bid", "30000");
  set(q, ".est-dest", "US");
  // Only proxies in data/rates are offered.
  assert.deepEqual([...q(".est-proxy").options].map((o) => o.value), CL.RATES.proxies.proxies.map((p) => p.id));
  // Item ¥30,000 + band "up to ¥1,000" (default); everything else excluded. No FX -> yen.
  assert.equal(q(".est-total").textContent, "¥30,000 – ¥31,000");
  assert.match(q(".est-status").textContent, /not confirmed yet and excluded/);
  click(q(".est-bd-toggle"));
  assert.equal(q(".est-lines").hidden, false);
  const lines = lineTexts(shadow);
  assert.ok(lines.some((t) => /Item price/.test(t) && /¥30,000/.test(t)));
  for (const label of ["Proxy service fee", "Payment fee", "International shipping"]) {
    const l = lines.find((t) => t.includes(label));
    assert.ok(l, label);
    assert.ok(l.includes("Not confirmed yet — excluded"), l);
  }
  // Warnings: shown, and not repeating the per-line "not confirmed" notes.
  const w = warningTexts(shadow);
  assert.ok(w.some((t) => /exchange rate/i.test(t)), w.join("\n"));
  assert.ok(w.some((t) => /typical weight/i.test(t)));
  assert.ok(!w.some((t) => /^Proxy service fee: not confirmed/.test(t)));
  assert.match(q(".est-fx-label").textContent, /yen per 1 USD/);
  assert.match(shadow.textContent, /No reference rate bundled/);
  assert.ok(!/NaN|Infinity|undefined|null/.test(shadow.querySelector(".est").textContent));
});

test("fixture tables: finite range in the destination currency, dated sources, warnings", () => {
  const { shadow, q } = render({
    tables: FIXTURE, today: TODAY,
    listing: { price_jpy: 30000, is_auction: true, genre: "camera", subgenre: "lens" }
  });
  open(q);
  // Listing price is the default (placeholder); empty input -> current price.
  assert.equal(q(".est-bid").placeholder, "30000");
  assert.match(shadow.textContent, /current price \(¥30,000\)/);
  assert.equal(q(".est-weight").placeholder, "0.5");
  set(q, ".est-dest", "US");
  set(q, ".est-domestic", "free");
  const total = q(".est-total").textContent;
  assert.match(total, /^US\$[\d,]+( – US\$[\d,]+)?$/, total);
  const nums = total.match(/[\d,]+/g).map((s) => Number(s.replace(/,/g, "")));
  nums.forEach((n) => assert.ok(Number.isFinite(n) && n > 200, String(n)));

  const engine = CL.landedCost({ price_jpy: 30000, is_auction: true, domestic_shipping: "free", proxy: "proxy_a",
    shipping_method: "air_sample", destination: "US", genre: "camera", subgenre: "lens" }, FIXTURE, TODAY);
  assert.equal(q(".est-total").textContent.replace(/[^\d–]/g, ""),
    (Math.floor(engine.low) === Math.ceil(engine.high) ? String(Math.floor(engine.low)) : Math.floor(engine.low) + "–" + Math.ceil(engine.high)));

  const lines = lineTexts(shadow);
  assert.equal(lines.length, engine.lines.length);
  const fee = lines.find((t) => t.startsWith("Proxy service fee"));
  assert.match(fee, /Checked 2026-\d\d-\d\d/);
  assert.match(fee, /Fictional/);
  assert.match(fee, /¥300/); // native yen amount shown next to the converted one
  const w = warningTexts(shadow);
  assert.ok(w.includes("Estimate at current price"), w.join("\n"));
  assert.ok(w.some((t) => /reference exchange rate/.test(t)));
  assert.match(shadow.textContent, /reference rate from 2026-10-01/);
  assert.ok(!/NaN|Infinity|undefined/.test(shadow.querySelector(".est").textContent));

  // User input changes the total; a bad value is ignored with a warning, never NaN.
  set(q, ".est-fx", "100");
  assert.notEqual(q(".est-total").textContent, total);
  set(q, ".est-weight", "abc");
  assert.ok(warningTexts(shadow).some((t) => /invalid value for the weight/.test(t)));
  assert.ok(!/NaN|Infinity/.test(shadow.querySelector(".est").textContent));
});

test("fixture tables: an expired line says 'Not confirmed yet — excluded'", () => {
  const { shadow, q } = render({ tables: FIXTURE, today: "2027-06-01", listing: { price_jpy: 10000, genre: "watch" } });
  open(q);
  set(q, ".est-dest", "GB");
  const lines = lineTexts(shadow);
  assert.ok(lines.some((t) => t.startsWith("Proxy service fee") && t.includes("Not confirmed yet — excluded")), lines.join("\n"));
  assert.ok(warningTexts(shadow).some((t) => /not used/.test(t)));
  assert.ok(!/NaN|Infinity/.test(shadow.textContent));
});

test("key and input events inside the panel do not reach the page", () => {
  const { dom, q } = render({ tables: FIXTURE, today: TODAY, listing: {} });
  open(q);
  const win = dom.window;
  const seen = [];
  for (const type of ["keydown", "keyup", "keypress", "input", "beforeinput"]) {
    win.document.addEventListener(type, () => seen.push(type));
    win.addEventListener(type, () => seen.push("window:" + type));
  }
  for (const sel of [".est-bid", ".est-fx", ".est-weight", ".est-dest"]) {
    const t = q(sel);
    for (const type of ["keydown", "keyup", "keypress"]) t.dispatchEvent(new win.KeyboardEvent(type, { key: "j", bubbles: true, composed: true }));
    t.dispatchEvent(new win.InputEvent("beforeinput", { bubbles: true, composed: true }));
    t.dispatchEvent(new win.InputEvent("input", { bubbles: true, composed: true }));
  }
  assert.deepEqual(seen, []);
  // Control: the same event from the page itself still reaches the page.
  win.document.getElementById("page-search").dispatchEvent(new win.KeyboardEvent("keydown", { key: "j", bubbles: true, composed: true }));
  assert.deepEqual(seen, ["keydown", "window:keydown"]);
});

test("settings helper saves only the allowed keys", () => {
  const chrome = fakeChrome();
  globalThis.chrome = chrome;
  CL.estimateSettings._reset();
  const saved = CL.estimateSettings.save({
    destination: "US", shipping_method: "air_sample", domestic_shipping: "free", proxy: "proxy_a",
    fx_rates: { USD: "151.5", GBP: -1, usd: 3, EUR: "abc" },
    max_bid_jpy: 30000, weight_kg: 2, price_jpy: 30000, url: "https://jp.mercari.com/item/m1", title: TITLE,
    destination_extra: "x"
  });
  assert.deepEqual(saved, { proxy: "proxy_a", shipping_method: "air_sample", destination: "US", domestic_shipping: "free", fx_rates: { USD: 151.5 } });
  assert.equal(chrome.calls.set.length, 1);
  const keys = Object.keys(chrome.calls.set[0]);
  assert.deepEqual(keys, [CL.estimateSettings.KEY]);
  assert.deepEqual(chrome.calls.set[0][CL.estimateSettings.KEY], saved);
  // Junk ids are dropped too.
  assert.deepEqual(CL.estimateSettings.pick({ destination: "<img src=x>", proxy: "a".repeat(80) }), {});
});

test("settings helper works without chrome.storage (jsdom, other browsers) and survives errors", async () => {
  delete globalThis.chrome;
  CL.estimateSettings._reset();
  assert.doesNotThrow(() => CL.estimateSettings.save({ destination: "US" }));
  CL.estimateSettings._reset();
  const got = await new Promise((r) => CL.estimateSettings.load(r));
  assert.deepEqual(got, {});
  globalThis.chrome = { storage: { local: { get() { throw new Error("boom"); }, set() { throw new Error("boom"); } } } };
  CL.estimateSettings._reset();
  assert.doesNotThrow(() => CL.estimateSettings.save({ destination: "US" }));
  CL.estimateSettings._reset();
  assert.deepEqual(await new Promise((r) => CL.estimateSettings.load(r)), {});
  globalThis.chrome = {};
  CL.estimateSettings._reset();
  assert.deepEqual(await new Promise((r) => CL.estimateSettings.load(r)), {});
});

test("the panel saves choices (not listing content) and restores them on the next listing", async () => {
  const chrome = fakeChrome();
  const est = { tables: FIXTURE, today: TODAY, listing: { price_jpy: 30000, is_auction: true, genre: "camera", subgenre: "lens" } };
  const first = render(est, { chrome });
  await tick();
  open(first.q);
  set(first.q, ".est-bid", "45000");
  set(first.q, ".est-weight", "1.2");
  set(first.q, ".est-dest", "GB");
  set(first.q, ".est-method", "express_sample");
  set(first.q, ".est-domestic", "up_to_2000");
  set(first.q, ".est-fx", "190");
  set(first.q, ".est-fx", "190", "change");
  const stored = chrome.data[CL.estimateSettings.KEY];
  assert.deepEqual(stored, { proxy: "proxy_a", shipping_method: "express_sample", destination: "GB", domestic_shipping: "up_to_2000", fx_rates: { GBP: 190 } });
  const everything = JSON.stringify(chrome.calls.set);
  for (const leak of ["45000", "30000", "1.2", TITLE, "http", "lens"]) assert.ok(!everything.includes(leak), "saved " + leak);

  // Next listing (fresh page, settings read back from storage).
  const second = render(est, { chrome });
  await tick();
  assert.equal(second.q(".est-dest").value, "GB");
  assert.equal(second.q(".est-method").value, "express_sample");
  assert.equal(second.q(".est-domestic").value, "up_to_2000");
  assert.equal(second.q(".est-fx").value, "190");
  assert.equal(second.q(".est-bid").value, ""); // per listing, not saved
  assert.equal(second.q(".est-weight").value, "");
  assert.match(second.q(".est-total").textContent, /^£/);
  // Switching currency does not reuse the GBP rate.
  set(second.q, ".est-dest", "US");
  assert.equal(second.q(".est-fx").value, "");
});

test("bundled code and saved settings never contain listing URLs", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/estimate-settings.js"), "utf8");
  assert.ok(!/location|document\.|href/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "settings helper must not read the page");
});
