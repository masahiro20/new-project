// Landed-cost engine (design docs/v1.1-total-cost-design.md §3–§6).
// Uses ONLY the fictional tables in test/fixtures/rates (Proxy A / Proxy B, made-up rates).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CL = require("../src/landed-cost.js");

const ROOT = path.join(__dirname, "..");
const readTables = (dir) => Object.fromEntries(
  ["meta", "proxies", "shipping", "destinations"].map((k) => [k, JSON.parse(fs.readFileSync(path.join(ROOT, dir, k + ".json"), "utf8"))])
);
const FIXTURE = readTables("test/fixtures/rates");
const T = () => structuredClone(FIXTURE);
const TODAY = "2026-10-09";
const run = (input, tables = T(), today = TODAY) => CL.landedCost(input, tables, today);
const line = (r, id) => r.lines.find((l) => l.id === id);
const codes = (r) => r.warnings.map((w) => w.code);
const proxy = (t, id) => t.proxies.proxies.find((p) => p.id === id);
const comp = (t, proxyId, compId) => proxy(t, proxyId).plans[0].components.find((c) => c.id === compId);
const dest = (t, cc) => t.destinations.destinations.find((d) => d.country === cc);

// No NaN / Infinity anywhere in a result.
function assertFinite(x, where = "result") {
  if (typeof x === "number") assert.ok(Number.isFinite(x), `${where} is ${x}`);
  else if (Array.isArray(x)) x.forEach((v, i) => assertFinite(v, `${where}[${i}]`));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) assertFinite(v, `${where}.${k}`);
}

// JPY-only base input (no destination -> output stays in JPY, exact yen math).
const jpy = (extra) => ({ price_jpy: 10000, domestic_shipping: "free", proxy: "proxy_a", ...extra });

test("exports: CollectorLens.landedCost on globalThis and via CommonJS", () => {
  assert.equal(typeof CL.landedCost, "function");
  assert.equal(globalThis.CollectorLens.landedCost, CL.landedCost);
});

// ---------- component kinds ----------

test("fixed: Proxy A service fee is a flat ¥300", () => {
  const r = run(jpy());
  assert.equal(r.currency, "JPY");
  const l = line(r, "proxy.service_fee");
  assert.deepEqual([l.low, l.high, l.status], [300, 300, "ok"]);
  assert.equal(l.checked_at, "2026-10-01");
  assert.match(l.source, /Fictional/);
});

test("rate: Proxy B service fee is 5.5% of the item price, floored", () => {
  const r = run(jpy({ proxy: "proxy_b", price_jpy: 12345 }));
  assert.equal(line(r, "proxy.service_fee").low, 678); // 678.975 -> floor
});

test("rate_with_min: payment fee 3% with a ¥100 minimum", () => {
  // proxy charges = 1000 + 300 -> 3% = 39 -> minimum 100
  assert.equal(line(run(jpy({ price_jpy: 1000 })), "proxy.payment_fee").low, 100);
  // 9700 + 300 = 10000 -> 300 exactly (no float creep to 301 under ceil)
  assert.equal(line(run(jpy({ price_jpy: 9700 })), "proxy.payment_fee").low, 300);
  // 20000 + 300 = 20300 -> 609
  assert.equal(line(run(jpy({ price_jpy: 20000 })), "proxy.payment_fee").low, 609);
});

test("tiered: packing option steps by item price (upper bound inclusive)", () => {
  const fee = (price) => line(run(jpy({ price_jpy: price, options: ["packing"] })), "option.packing").low;
  assert.equal(fee(5000), 200);
  assert.equal(fee(10000), 200);
  assert.equal(fee(10001), 400);
  assert.equal(fee(50000), 400);
  assert.equal(fee(60000), 800); // open-ended last tier
});

test("tiered: weight beyond the last tier is unknown, not extrapolated", () => {
  const r = run({ price_jpy: 10000, destination: "US", shipping_method: "air_sample", weight_kg: 12, fx_rate: 100 });
  const l = line(r, "shipping.international");
  assert.equal(l.status, "unknown");
  assert.equal(l.low, null);
  assert.ok(codes(r).includes("out_of_range"));
});

// ---------- rounding ----------

test("rounding per fee: ceil / floor / round, with rounding_unit", () => {
  const cases = [
    // price, mode, expected (5.5% of price)
    [12310, "floor", 677], [12310, "round", 677], [12310, "ceil", 678], // 677.05
    [12300, "floor", 676], [12300, "round", 677], [12300, "ceil", 677]  // 676.5
  ];
  for (const [price, mode, want] of cases) {
    const t = T();
    comp(t, "proxy_b", "service_fee").rows[0].rounding = mode;
    assert.equal(line(run(jpy({ proxy: "proxy_b", price_jpy: price }), t), "proxy.service_fee").low, want, `${price} ${mode}`);
  }
  const t = T();
  Object.assign(comp(t, "proxy_b", "service_fee").rows[0], { rounding: "ceil", rounding_unit: 100 });
  assert.equal(line(run(jpy({ proxy: "proxy_b", price_jpy: 12310 }), t), "proxy.service_fee").low, 700);
  const { roundTo } = CL.landedCostInternals;
  assert.equal(roundTo(0.03 * 10000, "ceil", 1), 300);
  assert.equal(roundTo(12.341, "ceil", 0.01), 12.35);
  assert.equal(roundTo(0.1 + 0.2, "ceil", 0.01), 0.3);
});

test("express shipping rounds up to ¥100 (table-defined unit)", () => {
  // US express: 2000 * 1.2 * 1.5 = 3600 for <= 0.5 kg
  const r = run({ price_jpy: 10000, destination: "US", shipping_method: "express_sample", weight_kg: 0.4, fx_rate: 100 });
  assert.equal(line(r, "shipping.international").native.low, 3600);
});

// ---------- effective dates ----------

test("effective_from: future-dated row is ignored until its date, then replaces the old one", () => {
  const fee = (today) => line(run(jpy(), T(), today), "proxy.service_fee").low;
  assert.equal(fee("2026-10-09"), 300);
  assert.equal(fee("2026-10-31"), 300);
  assert.equal(fee("2026-11-01"), 500);
  assert.equal(fee("2026-11-20"), 500);
});

test("effective_from: a component whose only row starts in the future is unknown", () => {
  const t = T();
  comp(t, "proxy_a", "service_fee").rows = [comp(t, "proxy_a", "service_fee").rows[1]]; // only the 2026-11-01 row
  const r = run(jpy(), t);
  assert.equal(line(r, "proxy.service_fee").status, "unknown");
  assert.equal(line(r, "proxy.service_fee").low, null);
});

test("effective_from: row order in the file does not matter", () => {
  const t = T();
  comp(t, "proxy_a", "service_fee").rows.reverse();
  assert.equal(line(run(jpy(), t, "2026-11-02"), "proxy.service_fee").low, 500);
  assert.equal(line(run(jpy(), t, "2026-10-09"), "proxy.service_fee").low, 300);
});

// ---------- freshness: 45 days stale, 90 days expired ----------

test("stale: checked more than 45 days ago -> still used, status stale + warning", () => {
  // Proxy B handling fee was checked 2026-08-20.
  const at = (today) => run(jpy({ proxy: "proxy_b" }), T(), today);
  const ok = at("2026-10-04"); // 45 days: not yet stale
  assert.equal(line(ok, "proxy.handling").status, "ok");
  const stale = at("2026-10-05"); // 46 days
  const l = line(stale, "proxy.handling");
  assert.deepEqual([l.low, l.status], [150, "stale"]);
  assert.ok(stale.warnings.some((w) => w.code === "stale" && w.line === "proxy.handling"));
});

test("expired: checked more than 90 days ago -> excluded, unknown, unless the user enters a value", () => {
  // Proxy B storage fee was checked 2026-06-30 (101 days before 2026-10-09).
  const r = run(jpy({ proxy: "proxy_b" }));
  const l = line(r, "proxy.storage");
  assert.deepEqual([l.low, l.high, l.status], [null, null, "unknown"]);
  assert.ok(r.warnings.some((w) => w.code === "expired" && w.line === "proxy.storage"));
  // 90 days exactly is still used (stale).
  assert.equal(line(run(jpy({ proxy: "proxy_b" }), T(), "2026-09-28"), "proxy.storage").status, "stale");
  // With the user's own amount it is included.
  const u = run(jpy({ proxy: "proxy_b", overrides: { "proxy.storage": 120 } }));
  const ul = line(u, "proxy.storage");
  assert.deepEqual([ul.low, ul.status, ul.source], [120, "user", "Your input"]);
  assert.equal(u.low - r.low, 120);
  assert.ok(!u.warnings.some((w) => w.code === "expired"));
});

// ---------- null values ----------

test("null value -> unknown, listed but excluded from the total", () => {
  const r = run(jpy({ proxy: "proxy_b" }));
  const photo = line(r, "proxy.photo");
  assert.deepEqual([photo.low, photo.high, photo.status], [null, null, "unknown"]);
  assert.ok(r.warnings.some((w) => w.code === "unknown" && w.line === "proxy.photo"));
  const sum = (k) => r.lines.reduce((a, l) => a + (l[k] ?? 0), 0);
  assert.equal(r.low, sum("low"));
  assert.equal(r.high, sum("high"));
  assert.equal(r.used.unknown_lines, r.lines.filter((l) => l.status === "unknown").length);
});

// data/rates with every value set back to null, as before any check (meta.status "placeholder").
function placeholderOf(tables) {
  const t = structuredClone(tables);
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x.rows)) for (const r of x.rows) {
      for (const f of ["value", "amount", "rate", "min", "tiers"]) if (f in r) r[f] = null;
      Object.assign(r, { effective_from: null, checked_at: null, source: null, note: "要確認：placeholder copy for tests" });
    }
    Object.values(x).forEach(walk);
  };
  walk(t);
  t.meta.status = "placeholder";
  t.meta.last_reviewed = null;
  return t;
}

test("placeholder tables (data/rates with every value null): every fee is unknown, total = item + domestic only, no NaN", () => {
  const ph = placeholderOf(readTables("data/rates"));
  const r = CL.landedCost({ price_jpy: 30000, domestic_shipping: "up_to_1000", destination: "US", subgenre: "lens", fx_rate: 150 }, ph, TODAY);
  for (const l of r.lines) if (!["item", "domestic_shipping"].includes(l.id)) assert.equal(l.status, "unknown", l.id);
  assert.equal(r.currency, "USD");
  assert.equal(r.low, 200);
  assert.equal(r.high, 206.67);
  assertFinite(r);
});

test("partial tables in data/rates: checked values are used, proxy fees stay unknown, no NaN", () => {
  const real = readTables("data/rates");
  assert.equal(real.meta.status, "partial");
  for (const cc of ["US", "GB", "DE", "AU", "CA"]) {
    for (const sub of ["lens", "film_camera", "digital_camera", "watch"]) {
      const r = CL.landedCost({ price_jpy: 30000, domestic_shipping: "up_to_1000", destination: cc, subgenre: sub, fx_rate: 150 }, real, TODAY);
      assertFinite(r);
      assert.equal(line(r, "proxy.service_fee").status, "unknown", cc + sub);
      assert.equal(line(r, "shipping.international").status, "ok", cc + sub);
      const sum = (k) => Math.round(r.lines.reduce((a, l) => a + (l[k] ?? 0), 0) * 100) / 100;
      assert.equal(r.low, sum("low"));
      assert.equal(r.high, sum("high"));
    }
  }
  // US lens, 0.5 kg default -> first method (EMS, zone 4, up to 500 g) = ¥3,900 = $26 at ¥150.
  const us = CL.landedCost({ price_jpy: 30000, domestic_shipping: "free", destination: "US", subgenre: "lens", fx_rate: 150 }, real, TODAY);
  assert.deepEqual(line(us, "shipping.international").native, { currency: "JPY", low: 3900, high: 3900 });
  assert.equal(line(us, "dest.duty").low, 25); // FOB $200 x 12.5 %
});

// ---------- duty base, de minimis ----------

test("duty base: FOB = item price only; CIF = item + shipping + insurance", () => {
  // US (FOB), fx 100: customs value 300 -> lens duty 3% = 9, extra tariff 10% = 30
  const us = run({ price_jpy: 30000, domestic_shipping: "free", destination: "US", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 });
  assert.deepEqual(us.used.customs_value, [300, 300]);
  assert.equal(line(us, "dest.duty").low, 9);
  assert.equal(line(us, "dest.extra_tariff").low, 30);
  // Same, but the table says CIF: + shipping 2400 yen = 24 -> 324 -> 9.72
  const t = T();
  dest(t, "US").duty_basis.rows[0].value = "CIF";
  const cif = run({ price_jpy: 30000, domestic_shipping: "free", destination: "US", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 }, t);
  assert.deepEqual(cif.used.customs_value, [324, 324]);
  assert.equal(line(cif, "dest.duty").low, 9.72);
  // CIF includes insurance (Proxy A option: 2% of goods total, min 200 -> 600 yen = 6)
  const ins = run({ price_jpy: 30000, domestic_shipping: "free", destination: "US", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100, proxy: "proxy_a", options: ["insurance"] }, t);
  assert.deepEqual(ins.used.customs_value, [330, 330]);
});

test("duty base unknown -> range from FOB (low) to CIF (high) + warning", () => {
  // Canada fixture has a null duty_basis.
  const r = run({ price_jpy: 30000, domestic_shipping: "free", destination: "CA", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 });
  assert.deepEqual(r.used.customs_value, [300, 324]);
  assert.ok(codes(r).includes("duty_basis_unknown"));
  const d = line(r, "dest.duty");
  assert.deepEqual([d.low, d.high], [12, 12.96]);
});

test("de minimis: at or below the threshold no duty/tax; above it, both apply", () => {
  const au = (price) => run({ price_jpy: price, domestic_shipping: "free", destination: "AU", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 });
  const low = au(50000); // 500 AUD
  assert.deepEqual([line(low, "dest.duty").low, line(low, "dest.import_tax").low], [0, 0]);
  assert.match(line(low, "dest.duty").note, /threshold/);
  const edge = au(100000); // exactly 1000 AUD -> exempt
  assert.equal(line(edge, "dest.duty").low, 0);
  const high = au(150000); // 1500 AUD: duty 5% = 75, GST 10% of 1575 = 157.5
  assert.equal(line(high, "dest.duty").low, 75);
  assert.equal(line(high, "dest.import_tax").low, 157.5);
});

test("de minimis that covers duty only (GB fixture): duty 0, VAT still charged", () => {
  // CIF = 100 + 22 (shipping 2200 yen) = 122 GBP <= 135
  const r = run({ price_jpy: 10000, domestic_shipping: "free", destination: "GB", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 });
  assert.equal(line(r, "dest.duty").low, 0);
  assert.equal(line(r, "dest.import_tax").low, 24.4);
});

// ---------- domestic shipping range ----------

test("domestic shipping band makes the total a range", () => {
  // proxy A: 10000 + band [1000, 2000] + 300; payment 3% ceil of (11300 | 12300) = 339 | 369
  const r = run(jpy({ domestic_shipping: "up_to_2000" }));
  assert.deepEqual([line(r, "domestic_shipping").low, line(r, "domestic_shipping").high], [1000, 2000]);
  assert.equal(r.low, 10000 + 1000 + 300 + 339);
  assert.equal(r.high, 10000 + 2000 + 300 + 369);
  const free = run(jpy({ domestic_shipping: "free" }));
  assert.equal(free.low, free.high);
  const band1 = run(jpy({ domestic_shipping: "up_to_1000" }));
  assert.deepEqual([line(band1, "domestic_shipping").low, line(band1, "domestic_shipping").high], [0, 1000]);
  const manual = run(jpy({ domestic_shipping: "manual", domestic_shipping_jpy: "1,500" }));
  assert.deepEqual([line(manual, "domestic_shipping").low, line(manual, "domestic_shipping").high], [1500, 1500]);
  const none = run(jpy({ domestic_shipping: undefined }));
  assert.equal(line(none, "domestic_shipping").status, "unknown");
});

// ---------- weight ----------

test("volumetric weight wins when the box is large; actual weight wins when heavy", () => {
  const base = { price_jpy: 10000, destination: "US", shipping_method: "air_sample", fx_rate: 100, dimensions_cm: { l: 30, w: 20, h: 10 } };
  const big = run({ ...base, weight_kg: 0.5 }); // 6000 / 5000 = 1.2 kg -> <=2 kg tier: 4500 * 1.2
  assert.equal(big.used.weight_basis, "volumetric");
  assert.equal(big.used.chargeable_weight_kg, 1.2);
  assert.equal(line(big, "shipping.international").native.low, 5400);
  const heavy = run({ ...base, weight_kg: 3 }); // <=5 kg tier: 8000 * 1.2
  assert.equal(heavy.used.weight_basis, "actual");
  assert.equal(line(heavy, "shipping.international").native.low, 9600);
  // Divisor comes from the table: express uses 6000 -> 1.0 kg
  const ex = run({ ...base, shipping_method: "express_sample", weight_kg: 0.5 });
  assert.equal(ex.used.chargeable_weight_kg, 1);
});

test("subgenre weight defaults (lens 0.5, film/digital body 1.0, watch 0.5), overridable", () => {
  const w = (extra) => run({ price_jpy: 10000, destination: "US", shipping_method: "air_sample", fx_rate: 100, ...extra });
  assert.equal(w({ subgenre: "lens" }).used.weight_kg, 0.5);
  assert.equal(w({ subgenre: "film_camera" }).used.weight_kg, 1);
  assert.equal(w({ subgenre: "digital_camera" }).used.weight_kg, 1);
  assert.equal(w({ genre: "watch" }).used.weight_kg, 0.5);
  const d = w({ subgenre: "film_camera" });
  assert.equal(d.used.weight_source, "default");
  assert.ok(codes(d).includes("weight_default"));
  assert.equal(line(d, "shipping.international").native.low, 3600);
  const o = w({ subgenre: "film_camera", weight_kg: 1.5 });
  assert.equal(o.used.weight_source, "user");
  assert.ok(!codes(o).includes("weight_default"));
  assert.equal(line(o, "shipping.international").native.low, 5400);
  const none = w({ genre: "general" });
  assert.ok(codes(none).includes("no_weight"));
  assert.equal(line(none, "shipping.international").status, "unknown");
});

// ---------- FX ----------

test("FX: user rate converts yen lines; bundled reference rate used (with date) when none is entered", () => {
  const user = run({ price_jpy: 30000, destination: "US", fx_rate: 120 });
  assert.equal(user.currency, "USD");
  assert.equal(line(user, "item").low, 250);
  assert.equal(line(user, "item").native.low, 30000);
  assert.equal(user.used.fx_source, "user");
  assert.ok(!codes(user).includes("fx_reference"));
  const ref = run({ price_jpy: 30000, destination: "US" });
  assert.equal(ref.used.fx_rate, 150);
  assert.equal(line(ref, "item").low, 200);
  const w = ref.warnings.find((x) => x.code === "fx_reference");
  assert.match(w.message, /2026-10-01/);
});

test("FX: no usable rate -> total stays in JPY, import taxes unknown", () => {
  const t = T();
  t.meta.fx_reference.USD.rows[0].checked_at = "2026-05-01"; // > 90 days: not used
  const r = run({ price_jpy: 30000, domestic_shipping: "free", destination: "US", subgenre: "lens", shipping_method: "air_sample" }, t);
  assert.equal(r.currency, "JPY");
  assert.ok(codes(r).includes("no_fx"));
  assert.equal(line(r, "dest.duty").status, "unknown");
  // Proxy A is the default proxy: 30000 + shipping 2400 + fee 300 + payment ceil(3% of 30300) = 909
  assert.equal(r.low, 30000 + 2400 + 300 + 909);
  assertFinite(r);
});

// ---------- auction price ----------

test("auction: max bid is used when entered; otherwise current price with a warning", () => {
  const bid = run({ price_jpy: 20000, max_bid_jpy: 25000, is_auction: true });
  assert.equal(line(bid, "item").low, 25000);
  assert.equal(line(bid, "item").status, "user");
  assert.equal(bid.used.price_basis, "max_bid");
  assert.ok(!codes(bid).includes("current_price"));
  const cur = run({ price_jpy: 20000, is_auction: true });
  assert.equal(line(cur, "item").low, 20000);
  assert.equal(cur.used.price_basis, "current_price");
  assert.equal(cur.warnings.find((w) => w.code === "current_price").message, "Estimate at current price");
  const fixed = run({ price_jpy: 20000 });
  assert.ok(!codes(fixed).includes("current_price"));
});

// ---------- invalid input ----------

test("invalid input: negative / NaN / text -> warning, ignored; never NaN in the output", () => {
  const r = run({
    price_jpy: 20000, max_bid_jpy: "abc", is_auction: true, weight_kg: NaN, fx_rate: -1,
    domestic_shipping: "manual", domestic_shipping_jpy: -300, destination: "US", subgenre: "lens",
    shipping_method: "air_sample", proxy: "proxy_a", dimensions_cm: { l: "x", w: 10, h: 10 },
    overrides: { "proxy.service_fee": Infinity }
  });
  assertFinite(r);
  assert.equal(line(r, "item").low, 133.33); // falls back to current price, reference FX
  const bad = r.warnings.filter((w) => w.code === "invalid_input").map((w) => w.line);
  for (const f of ["max_bid_jpy", "weight_kg", "fx_rate", "domestic_shipping_jpy", "dimensions_cm.l", "override:proxy.service_fee"]) {
    assert.ok(bad.includes(f), f);
  }
  assert.equal(line(r, "proxy.service_fee").status, "ok"); // bad override ignored
  assert.ok(Number.isFinite(r.low) && Number.isFinite(r.high) && r.low <= r.high);

  const neg = run({ price_jpy: -5 });
  assert.equal(neg.low, null);
  assert.equal(neg.high, null);
  assert.ok(codes(neg).includes("invalid_input") && codes(neg).includes("no_price"));
  assertFinite(neg);

  for (const weird of [undefined, null, "x", 42]) assertFinite(CL.landedCost(weird, weird, weird), String(weird));
  const zero = run({ price_jpy: 0, destination: "US", fx_rate: 0, weight_kg: 0 });
  assertFinite(zero);
  assert.ok(codes(zero).includes("invalid_input"));
});

test("unknown ids (proxy, plan, option, method, destination) warn instead of throwing", () => {
  const r = run({ price_jpy: 1000, proxy: "nope", shipping_method: "nope", destination: "ZZ", options: ["nope"] });
  assert.ok(codes(r).filter((c) => c === "invalid_input").length >= 3);
  assertFinite(r);
});

test("today accepts a Date; ranges always low <= high", () => {
  const r = CL.landedCost(jpy({ domestic_shipping: "up_to_1000" }), T(), new Date(2026, 10, 2));
  assert.equal(line(r, "proxy.service_fee").low, 500);
  for (const l of r.lines) if (l.low !== null) assert.ok(l.low <= l.high, l.id);
});

// ---------- schema gate (scripts/check-rates.mjs) ----------

test("check-rates: real tables and fixtures pass; broken tables fail", async () => {
  const { validateRates } = await import("../scripts/check-rates.mjs");
  assert.deepEqual(validateRates(readTables("data/rates"), { label: "data/rates", today: TODAY }).errors, []);
  assert.deepEqual(validateRates(T(), { label: "fixture", today: TODAY }).errors, []);
  const broken = (mutate) => { const t = T(); mutate(t); return validateRates(t, { today: TODAY }).errors.join("\n"); };
  assert.match(broken((t) => { comp(t, "proxy_a", "service_fee").rows[0].source = null; }), /needs source/);
  assert.match(broken((t) => { comp(t, "proxy_a", "service_fee").rows[0].checked_at = "2026-13-01"; }), /ISO date/);
  assert.match(broken((t) => { comp(t, "proxy_a", "service_fee").rows[0].kind = "percent"; }), /kind must be/);
  assert.match(broken((t) => { comp(t, "proxy_a", "payment_fee").rows[0].rounding = "up"; }), /rounding/);
  assert.match(broken((t) => { comp(t, "proxy_a", "service_fee").rows[0].currency = "YEN"; }), /currency/);
  assert.match(broken((t) => { dest(t, "US").currency = "EUR"; }), /currency must be USD/);
  assert.match(broken((t) => { t.destinations.destinations.pop(); }), /missing CA/);
  assert.match(broken((t) => { t.meta.status = "placeholder"; }), /placeholder/);
  const real = readTables("data/rates");
  real.proxies.proxies[0].plans[0].components[0].rows[0].note = "check";
  assert.match(validateRates(real, { label: "data/rates", today: TODAY }).errors.join("\n"), /要確認/);
  // placeholder forbids values; partial allows them but needs an https source and last_reviewed.
  const ph = readTables("data/rates");
  ph.meta.status = "placeholder";
  assert.match(validateRates(ph, { label: "data/rates", today: TODAY }).errors.join("\n"), /placeholder/);
  assert.deepEqual(validateRates(placeholderOf(readTables("data/rates")), { label: "data/rates", today: TODAY }).errors, []);
  const nosrc = readTables("data/rates");
  nosrc.shipping.methods[0].destinations.US.rows[0].source = "Japan Post website";
  assert.match(validateRates(nosrc, { label: "data/rates", today: TODAY }).errors.join("\n"), /https URL/);
  const noReview = readTables("data/rates");
  noReview.meta.last_reviewed = null;
  assert.match(validateRates(noReview, { label: "data/rates", today: TODAY }).errors.join("\n"), /needs last_reviewed/);
});
