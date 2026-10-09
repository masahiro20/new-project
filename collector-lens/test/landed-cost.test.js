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
      for (const f of ["value", "amount", "rate", "min", "max", "tiers"]) if (f in r) r[f] = null;
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
  // 1500 AUD: duty 5% = 75. The fixture's tax_base adds international shipping
  // (¥2,000 = 20 AUD): GST 10% of 1500 + 20 + 75 = 159.5
  const high = au(150000);
  assert.equal(line(high, "dest.duty").low, 75);
  assert.equal(line(high, "dest.import_tax").low, 159.5);
});

test("de minimis that covers duty only (GB fixture): duty 0, VAT still charged", () => {
  // CIF = 100 + 22 (shipping 2200 yen) = 122 GBP <= 135
  const r = run({ price_jpy: 10000, domestic_shipping: "free", destination: "GB", shipping_method: "air_sample", subgenre: "lens", fx_rate: 100 });
  assert.equal(line(r, "dest.duty").low, 0);
  assert.equal(line(r, "dest.import_tax").low, 24.4);
});

// ---------- tax base, duty by subgenre, duty rules, regional tax, notices (design §13) ----------

const DEST_IN = (cc, extra) => ({ price_jpy: 30000, domestic_shipping: "free", destination: cc, shipping_method: "air_sample", fx_rate: 100, ...extra });

test("tax_base: import tax base lists its parts, separately from duty_basis", () => {
  // AU fixture: duty FOB (customs 1500), GST base = goods + shipping + insurance + duty.
  const au = (t) => run(DEST_IN("AU", { price_jpy: 150000, subgenre: "lens" }), t);
  const r = au(T());
  assert.deepEqual(r.used.customs_value, [1500, 1500]);
  assert.deepEqual(r.used.tax_base, ["goods", "international_shipping", "insurance", "duty"]);
  assert.deepEqual(r.used.tax_base_value, [1595, 1595]); // 1500 + 20 + 0 + 75
  // Insurance (Proxy A option, 2% of goods total = ¥3,000 = 30 AUD) is part of the base.
  const ins = run(DEST_IN("AU", { price_jpy: 150000, subgenre: "lens", proxy: "proxy_a", options: ["insurance"] }));
  assert.deepEqual(ins.used.tax_base_value, [1625, 1625]);
  assert.equal(line(ins, "dest.import_tax").low, 162.5);
  // Goods + duty only.
  const t1 = T();
  dest(t1, "AU").tax_base.rows[0].value = ["goods", "duty"];
  assert.equal(line(au(t1), "dest.import_tax").low, 157.5);
  // customs_value as a part (= the duty_basis result).
  const t2 = T();
  dest(t2, "AU").tax_base.rows[0].value = ["customs_value"];
  assert.equal(line(au(t2), "dest.import_tax").low, 150);
  // No tax_base: the older import_tax.base (customs value + duty) still works.
  const t3 = T();
  delete dest(t3, "AU").tax_base;
  assert.equal(line(au(t3), "dest.import_tax").low, 157.5);
  // A duty that is not confirmed makes a base that includes duty unknown.
  const t4 = T();
  dest(t4, "AU").duty.lens.rows[0].rate = null;
  dest(t4, "AU").duty.lens.rows[0].note = "要確認";
  assert.equal(line(au(t4), "dest.import_tax").status, "unknown");
});

test("tax_base null (not confirmed) -> range from goods + duty to goods + shipping + insurance + duty", () => {
  // CA fixture: duty_basis and tax_base both null; de minimis 40 CAD.
  const r = run(DEST_IN("CA", { subgenre: "lens" }));
  assert.ok(codes(r).includes("tax_base_unknown"));
  assert.equal(r.used.tax_base, null);
  // duty 12..12.96 on customs 300..324; base low 300 + 12, high 300 + 24 + 0 + 12.96
  assert.deepEqual(r.used.tax_base_value, [312, 336.96]);
  const tax = line(r, "dest.import_tax");
  assert.deepEqual([tax.low, tax.high], [15.6, 16.85]);
});

test("duty by subgenre: a subgenre key wins, otherwise it falls back to camera", () => {
  // DE fixture: digital_camera 0%, camera 3%. US fixture has no digital_camera -> camera 2%.
  const de = (sub) => run(DEST_IN("DE", { price_jpy: 50000, genre: "camera", subgenre: sub }));
  const dc = de("digital_camera");
  assert.equal(dc.used.duty_category, "digital_camera");
  assert.equal(line(dc, "dest.duty").label, "Import duty (digital camera)");
  assert.equal(line(dc, "dest.duty").low, 0);
  const fc = de("film_camera");
  assert.equal(fc.used.duty_category, "camera");
  assert.equal(line(fc, "dest.duty").label, "Import duty (camera)");
  assert.equal(line(fc, "dest.duty").low, 15.99); // 3% of CIF 500 + 33 (film body default 1.0 kg)
  const us = run(DEST_IN("US", { genre: "camera", subgenre: "digital_camera" }));
  assert.equal(us.used.duty_category, "camera");
  assert.equal(line(us, "dest.duty").low, 6);
  // A listed subgenre whose rate is not confirmed stays unknown (no silent fallback).
  const t = T();
  Object.assign(dest(t, "DE").duty.digital_camera.rows[0], { rate: null, note: "要確認" });
  const u = run(DEST_IN("DE", { price_jpy: 50000, genre: "camera", subgenre: "digital_camera" }), t);
  assert.equal(line(u, "dest.duty").status, "unknown");
  // Lens and watch keep their own categories; "general" has none.
  assert.equal(run(DEST_IN("DE", { price_jpy: 50000, subgenre: "lens" })).used.duty_category, "lens");
  const g = run(DEST_IN("DE", { price_jpy: 50000, genre: "general" }));
  assert.equal(g.used.duty_category, null);
  assert.equal(line(g, "dest.duty").status, "unknown");
});

test("per_unit duty: amount per unit x quantity, in the destination currency; de minimis still applies", () => {
  // GB fixture watch: £0.25 per unit. CIF 300 + 22 > 135.
  const gb = (extra) => run(DEST_IN("GB", { genre: "watch", ...extra }));
  assert.equal(line(gb(), "dest.duty").low, 0.25);
  assert.equal(gb().used.quantity, 1);
  assert.equal(line(gb({ quantity: 3 }), "dest.duty").low, 0.75);
  // VAT includes the duty: 20% of 322.25
  assert.equal(line(gb(), "dest.import_tax").low, 64.45);
  // Below £135: duty-free.
  assert.equal(line(gb({ price_jpy: 10000 }), "dest.duty").low, 0);
  // Invalid quantity -> warning, 1 unit.
  for (const q of [0, 1.5, -2, "x"]) {
    const r = gb({ quantity: q });
    assert.equal(r.used.quantity, 1, String(q));
    assert.ok(r.warnings.some((w) => w.code === "invalid_input" && w.line === "quantity"), String(q));
  }
});

test("rate_with_min_max: rate clamped to a minimum and maximum per unit", () => {
  // DE fixture watch: 5%, min €0.50, max €1.00 per unit. Drop the low-value rule and use FOB to reach the minimum.
  const t = T();
  dest(t, "DE").duty_rules = [];
  dest(t, "DE").duty_basis.rows[0].value = "FOB";
  const de = (price, extra) => line(run(DEST_IN("DE", { price_jpy: price, genre: "watch", ...extra }), t), "dest.duty").low;
  assert.equal(de(500), 0.5);                  // 5% of 5 = 0.25 -> min 0.50
  assert.equal(de(1500), 0.75);                // 5% of 15 = 0.75 (between)
  assert.equal(de(30000), 1);                  // 5% of 300 = 15 -> max 1.00
  assert.equal(de(500, { quantity: 3 }), 1.5); // min x 3
  assert.equal(de(30000, { quantity: 2 }), 2); // max x 2
  // per: "line" -> min/max not multiplied.
  dest(t, "DE").duty.watch.rows[0].per = "line";
  assert.equal(de(30000, { quantity: 2 }), 1);
});

test("duty rule (flat amount for low-value parcels): value threshold is inclusive", () => {
  // DE fixture rule: €2 flat when goods <= €150, from 2026-07-01 until 2028-07-01. Else 3% of CIF.
  const de = (price, today = TODAY, t = T()) => run(DEST_IN("DE", { price_jpy: price, subgenre: "lens" }), t, today);
  const at = de(15000); // goods exactly €150
  assert.equal(line(at, "dest.duty").low, 2);
  assert.equal(line(at, "dest.duty").rule, "low_value_flat");
  assert.match(line(at, "dest.duty").note, /flat duty/);
  assert.equal(at.used.duty_rule, "low_value_flat");
  // VAT base includes the flat duty: 19% of (172 + 2)
  assert.equal(line(at, "dest.import_tax").low, 33.06);
  const over = de(15001); // €150.01 -> ad valorem 3% of CIF 172.01
  assert.equal(line(over, "dest.duty").low, 5.16);
  assert.equal(line(over, "dest.duty").rule, undefined);
  assert.equal(over.used.duty_rule, undefined);
});

test("duty rule: effective_from / effective_until switch it on and off by date", () => {
  const t = T();
  t.meta.stale_after_days = 2000; t.meta.expire_after_days = 3000; // keep the fictional rows usable in 2028
  const duty = (today) => line(run(DEST_IN("DE", { price_jpy: 10000, subgenre: "lens" }), t, today), "dest.duty").low;
  // ad valorem: 3% of (100 + 22) = 3.66
  assert.equal(duty("2026-06-30"), 3.66);
  assert.equal(duty("2026-07-01"), 2);
  assert.equal(duty("2028-06-30"), 2);
  assert.equal(duty("2028-07-01"), 3.66); // effective_until is the first day it no longer applies
  const { selectRow, parseDay } = CL.landedCostInternals;
  assert.equal(selectRow({ rows: [{ effective_from: "2026-01-01", effective_until: "2026-02-01" }] }, parseDay("2026-02-01")), null);
});

test("duty rule: value counted not confirmed (of null) -> range covering both, with a warning", () => {
  const t = T();
  dest(t, "DE").duty_rules[0].rows[0].applies_when.of = null;
  // goods €140 <= 150 but CIF €162 > 150: either €2 flat or 3% of 162 = 4.86.
  const r = run(DEST_IN("DE", { price_jpy: 14000, subgenre: "lens" }), t);
  const d = line(r, "dest.duty");
  assert.deepEqual([d.low, d.high], [2, 4.86]);
  assert.match(d.note, /part of the range/);
  assert.ok(codes(r).includes("duty_rule_partly"));
  // Both values under the threshold -> flat only; both over -> ad valorem only.
  assert.equal(line(run(DEST_IN("DE", { price_jpy: 12000, subgenre: "lens" }), t), "dest.duty").high, 2); // CIF 142
  assert.equal(line(run(DEST_IN("DE", { price_jpy: 16000, subgenre: "lens" }), t), "dest.duty").low, 5.46); // 3% of 182
  // of "customs_value": CIF 162 > 150 -> ad valorem.
  dest(t, "DE").duty_rules[0].rows[0].applies_when.of = "customs_value";
  assert.equal(line(run(DEST_IN("DE", { price_jpy: 14000, subgenre: "lens" }), t), "dest.duty").low, 4.86);
  // A user's own duty amount overrides the rule.
  const o = run(DEST_IN("DE", { price_jpy: 10000, subgenre: "lens", overrides: { "dest.duty": 9 } }));
  assert.deepEqual([line(o, "dest.duty").low, line(o, "dest.duty").status], [9, "user"]);
  // A rule limited to other categories is skipped.
  const t2 = T();
  dest(t2, "DE").duty_rules[0].categories = ["watch"];
  assert.equal(line(run(DEST_IN("DE", { price_jpy: 10000, subgenre: "lens" }), t2), "dest.duty").low, 3.66);
  assertFinite(r);
});

test("regional tax (subdivisions): extra line only when the user picks one", () => {
  // CA fixture: Ontario 8%, Alberta 0%, Quebec not confirmed. Tax base not confirmed -> range.
  const ca = (sub, price = 30000) => run(DEST_IN("CA", { price_jpy: price, subgenre: "lens", subdivision: sub }));
  const none = ca(undefined);
  assert.equal(line(none, "dest.subdivision_tax"), undefined);
  assert.ok(codes(none).includes("subdivision_not_chosen"));
  assert.equal(none.used.subdivision, null);
  const on = ca("ON");
  const l = line(on, "dest.subdivision_tax");
  assert.equal(l.label, "Provincial sales tax (Ontario)");
  assert.deepEqual([l.low, l.high], [24.96, 26.96]); // 8% of 312 .. 336.96
  assert.equal(on.used.subdivision, "ON");
  assert.ok(!codes(on).includes("subdivision_not_chosen"));
  assert.equal(Math.round((on.low - none.low) * 100) / 100, 24.96);
  assert.equal(line(ca("AB"), "dest.subdivision_tax").low, 0);
  const qc = line(ca("QC"), "dest.subdivision_tax");
  assert.deepEqual([qc.low, qc.status], [null, "unknown"]);
  const bad = ca("ZZ");
  assert.ok(bad.warnings.some((w) => w.code === "invalid_input" && w.line === "subdivision"));
  assert.equal(line(bad, "dest.subdivision_tax"), undefined);
  // Under the de minimis (40 CAD) the regional tax is 0 like the import tax.
  assert.equal(line(ca("ON", 3000), "dest.subdivision_tax").low, 0);
  // Destinations without subdivisions ignore the field quietly.
  const gb = run(DEST_IN("GB", { subgenre: "lens", subdivision: "ON" }));
  assert.ok(!codes(gb).includes("subdivision_not_chosen"));
  assert.equal(gb.used.subdivision, undefined);
  // No exchange rate -> line listed as unknown.
  const t = T();
  t.meta.fx_reference.CAD.rows[0].checked_at = "2026-01-01";
  const nofx = run({ price_jpy: 30000, destination: "CA", subdivision: "ON" }, t);
  assert.equal(line(nofx, "dest.subdivision_tax").status, "unknown");
  assertFinite(on);
});

test("notices: shown only for the destination + carrier they name", () => {
  const us = run(DEST_IN("US", { subgenre: "lens" })); // air_sample -> carrier sample_post
  assert.equal(us.notices.length, 1);
  assert.equal(us.notices[0].id, "sample_post_us");
  assert.ok(us.warnings.some((w) => w.code === "notice" && w.line === "notice.sample_post_us"));
  assert.equal(run(DEST_IN("US", { subgenre: "lens", shipping_method: "express_sample" })).notices.length, 0);
  assert.equal(run(DEST_IN("GB", { subgenre: "lens" })).notices.length, 0);
  assert.deepEqual(run(jpy()).notices, []);
  // Method-level notices filtered by destination; dated notices respect their dates.
  const t = T();
  t.shipping.methods[1].notices = [{ id: "m", message: "Method notice", when: { destinations: ["GB"] }, source: "x", checked_at: "2026-10-01", effective_from: "2026-11-01" }];
  assert.equal(run(DEST_IN("GB", { shipping_method: "express_sample" }), t).notices.length, 0);
  assert.equal(run(DEST_IN("GB", { shipping_method: "express_sample" }), t, "2026-11-01").notices[0].message, "Method notice");
  assert.equal(run(DEST_IN("DE", { shipping_method: "express_sample" }), t, "2026-11-01").notices.length, 0);
});

test("data/rates rules from §12: EU flat duty, DE digital camera, per-unit watch duty, AU GST base, US Japan Post notice", () => {
  const real = readTables("data/rates");
  const R = (cc, extra) => CL.landedCost({ domestic_shipping: "free", destination: cc, ...extra }, real, TODAY);
  // DE lens, ¥20,000 at ¥160 = €125 (CIF €144.69) -> €3 flat. ¥25,000 = €156.25 -> 6.7% of CIF.
  const low = R("DE", { price_jpy: 20000, subgenre: "lens", fx_rate: 160 });
  assert.equal(line(low, "dest.duty").low, 3);
  assert.equal(low.used.duty_rule, "eu_low_value_flat");
  const high = R("DE", { price_jpy: 25000, subgenre: "lens", fx_rate: 160 });
  assert.equal(line(high, "dest.duty").low, 11.79);
  // Dates as recorded in §12: 2026-07-01 up to (not including) 2028-07-01.
  const rule = real.destinations.destinations.find((d) => d.country === "DE").duty_rules[0].rows[0];
  assert.deepEqual([rule.effective_from, rule.effective_until, rule.applies_when.max_value, rule.applies_when.currency], ["2026-07-01", "2028-07-01", 150, "EUR"]);
  // DE digital camera: not confirmed from an official page yet -> unknown (film camera 4.2%).
  assert.equal(line(R("DE", { price_jpy: 100000, subgenre: "digital_camera", fx_rate: 160 }), "dest.duty").status, "unknown");
  assert.ok(line(R("DE", { price_jpy: 100000, subgenre: "film_camera", fx_rate: 160 }), "dest.duty").low > 20);
  // Watches: DE 4.5% capped at €0.80 per unit, GB £0.20 per unit (and VAT now computable).
  assert.equal(line(R("DE", { price_jpy: 100000, genre: "watch", fx_rate: 160 }), "dest.duty").low, 0.8);
  const gbw = R("GB", { price_jpy: 100000, genre: "watch", fx_rate: 200 });
  assert.equal(line(gbw, "dest.duty").low, 0.2);
  assert.equal(line(gbw, "dest.import_tax").status, "ok");
  // AU: GST on goods + shipping (EMS ¥3,150 = 31.5 AUD) + duty 0.
  const au = R("AU", { price_jpy: 200000, subgenre: "lens", fx_rate: 100 });
  assert.equal(line(au, "dest.import_tax").low, 203.15);
  // AU / CA digital camera not confirmed -> unknown, not the camera rate.
  assert.equal(line(R("AU", { price_jpy: 200000, subgenre: "digital_camera", fx_rate: 100 }), "dest.duty").status, "unknown");
  // CA: province list, rates not confirmed.
  const ca = R("CA", { price_jpy: 30000, subgenre: "lens", fx_rate: 110, subdivision: "ON" });
  assert.equal(line(ca, "dest.subdivision_tax").status, "unknown");
  assert.equal(real.destinations.destinations.find((d) => d.country === "CA").subdivisions.options.length, 13);
  // US + Japan Post: prepaid-duties notice, in English.
  for (const m of real.shipping.methods) {
    const r = R("US", { price_jpy: 30000, subgenre: "lens", fx_rate: 150, shipping_method: m.id });
    assert.equal(r.notices.length, 1, m.id);
    assert.match(r.notices[0].message, /^Japan Post accepts parcels to the US/);
    assert.ok(!/[　-鿿]/.test(r.notices[0].message));
  }
  assert.equal(R("GB", { price_jpy: 30000, subgenre: "lens", fx_rate: 200 }).notices.length, 0);
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
  // New rule shapes (design §13).
  assert.match(broken((t) => { dest(t, "GB").duty.watch.rows[0].currency = undefined; }), /per_unit row needs a currency/);
  assert.match(broken((t) => { Object.assign(dest(t, "DE").duty.watch.rows[0], { min: 2, max: 1 }); }), /min must not exceed max/);
  assert.match(broken((t) => { dest(t, "DE").duty.watch.rows[0].max = null; }), /all be set or all be null/);
  assert.match(broken((t) => { dest(t, "DE").duty.watch.rows[0].per = "box"; }), /per must be/);
  assert.match(broken((t) => { dest(t, "DE").duty.drone = dest(t, "DE").duty.lens; }), /unknown category drone/);
  assert.match(broken((t) => { dest(t, "DE").duty.lens.rows[0].kind = "tiered"; }), /duty rows must be kind/);
  assert.match(broken((t) => { dest(t, "DE").tax_base.rows[0].value = ["goods", "postage"]; }), /parts must be among/);
  assert.match(broken((t) => { dest(t, "DE").tax_base.rows[0].value = ["customs_value", "goods"]; }), /do not list both/);
  assert.match(broken((t) => { dest(t, "DE").duty_rules[0].rows[0].effective_until = "2026-06-01"; }), /effective_until must be after/);
  assert.match(broken((t) => { dest(t, "DE").duty_rules[0].rows[0].applies_when.of = "cif"; }), /applies_when.of/);
  assert.match(broken((t) => { dest(t, "DE").duty_rules[0].rows[0].applies_when.currency = undefined; }), /applies_when needs a currency/);
  assert.match(broken((t) => { dest(t, "DE").duty_rules[0].replaces = "import_tax"; }), /replaces may only be/);
  assert.match(broken((t) => { dest(t, "CA").subdivisions.options[1].id = "ON"; }), /duplicate id/);
  assert.match(broken((t) => { dest(t, "CA").subdivisions.options[0].tax.rows[0].kind = "fixed"; }), /regional tax rows must be kind rate/);
  assert.match(broken((t) => { dest(t, "US").notices[0].message = "米国あては事前払いが必要"; }), /must be English/);
  assert.match(broken((t) => { dest(t, "US").notices[0].when = { destinations: ["US"] }; }), /when.destinations not allowed/);
  assert.match(broken((t) => { delete dest(t, "US").notices[0].checked_at; }), /needs checked_at/);
  assert.match(broken((t) => { t.shipping.methods[0].carrier = "Japan Post"; }), /carrier must match/);
  const noTaxBase = readTables("data/rates");
  delete noTaxBase.destinations.destinations.find((d) => d.country === "GB").tax_base;
  assert.match(validateRates(noTaxBase, { label: "data/rates", today: TODAY }).errors.join("\n"), /tax_base is required/);
  const noticeSrc = readTables("data/rates");
  noticeSrc.destinations.destinations.find((d) => d.country === "US").notices[0].source = "Japan Post";
  assert.match(validateRates(noticeSrc, { label: "data/rates", today: TODAY }).errors.join("\n"), /https URL/);
  const noReview = readTables("data/rates");
  noReview.meta.last_reviewed = null;
  assert.match(validateRates(noReview, { label: "data/rates", today: TODAY }).errors.join("\n"), /needs last_reviewed/);
});
