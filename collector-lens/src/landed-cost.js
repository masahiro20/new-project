/*
 * Tanuki Scout (provisional name) — landed-cost estimator (v1.1, design §3–§6).
 * Pure function: (input, rate tables, today) -> estimated total as a range.
 * No DOM, no network, no storage. Every changeable number comes from the
 * tables (data/rates/*.json); this file only knows the generic component kinds
 * (fixed / rate / rate_with_min / rate_with_min_max / per_unit / tiered), the
 * generic rule shapes (tax_base, duty_rules with applies_when, subdivisions,
 * notices) and the order of the calculation. No country is named in the code.
 * Loaded as a classic script (attaches to globalThis.CollectorLens) and as a
 * CommonJS module in Node tests. Loaded as a content script for the panel's
 * "Estimated total" section (src/estimate-section.js).
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  var DAY_MS = 86400000;
  var DEFAULT_STALE_DAYS = 45;   // design §4.1: older than this -> "may be out of date"
  var DEFAULT_EXPIRE_DAYS = 90;  // design §4.1: older than this -> not used
  var KINDS = { fixed: true, rate: true, rate_with_min: true, rate_with_min_max: true, per_unit: true, tiered: true };
  // Kinds whose amount does not depend on a base value (only on the quantity).
  var NO_BASE = { fixed: true, per_unit: true };
  // Parts that a destination's tax_base may list (design §13).
  var TAX_BASE_PARTS = { goods: true, international_shipping: true, insurance: true, duty: true, customs_value: true };
  var ROUNDING = { ceil: Math.ceil, floor: Math.floor, round: Math.round };
  // Domestic shipping bands (design §3): seller -> proxy warehouse, in JPY.
  // Bands do not overlap: "up to ¥2,000" means more than ¥1,000 and up to ¥2,000.
  var DOMESTIC_BANDS = {
    free: { range: [0, 0], label: "Free (¥0)" },
    up_to_1000: { range: [0, 1000], label: "Up to ¥1,000" },
    up_to_2000: { range: [1000, 2000], label: "¥1,000–¥2,000" }
  };
  // Analyzer genre/subgenre -> fallback duty category in destinations.json.
  // A destination may key duty by the subgenre itself (e.g. digital_camera);
  // when it does not, the subgenre falls back to its parent category here.
  var DUTY_CATEGORY = { lens: "lens", film_camera: "camera", digital_camera: "camera", camera: "camera", watch: "watch" };
  var CATEGORY_LABEL = { lens: "lens", film_camera: "film camera", digital_camera: "digital camera", camera: "camera", watch: "watch" };

  // ---------- small helpers ----------

  function parseDay(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    var t = Date.UTC(y, m - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
    return t;
  }

  // today: "YYYY-MM-DD" or a Date (its local calendar day). Defaults to now.
  function dayOf(today) {
    if (typeof today === "string") return parseDay(today);
    var d = today instanceof Date ? today : new Date();
    if (isNaN(d.getTime())) return null;
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isNum(x) { return typeof x === "number" && isFinite(x); }

  function roundTo(x, mode, unit) {
    var f = ROUNDING[mode] || Math.round;
    var u = isNum(unit) && unit > 0 ? unit : 1;
    var v = x / u;
    var r = Math.round(v);
    if (Math.abs(v - r) < 1e-9) v = r; // 0.03 * 10000 must not ceil to 301
    if (u < 1) { var inv = Math.round(1 / u); return f(v) / inv; }
    return f(v) * u;
  }

  function cents(x) { return roundTo(x, "round", 0.01); }

  function defaultUnit(currency) { return currency === "JPY" ? 1 : 0.01; }

  function rowsOf(comp) { return comp && Array.isArray(comp.rows) ? comp.rows : []; }

  // effective_until (optional) is the first day a row no longer applies.
  function endedBy(r, todayMs) {
    if (!r || r.effective_until === undefined || r.effective_until === null) return false;
    var u = parseDay(r.effective_until);
    return u === null || todayMs >= u;
  }

  // Design §4.1: pick the row in effect today (latest effective_from <= today).
  // Rows with a future effective_from are ignored until their date; rows whose
  // effective_until has come are ignored from that day.
  function selectRow(comp, todayMs) {
    var best = null, bestT = -Infinity;
    var rows = rowsOf(comp);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== "object") continue;
      var t = r.effective_from == null ? -Infinity : parseDay(r.effective_from);
      if (t === null || t > todayMs || endedBy(r, todayMs)) continue;
      if (best === null || t >= bestT) { best = r; bestT = t; }
    }
    return best;
  }

  function rowHasValue(row) {
    if (!row) return false;
    if (row.kind === undefined) return row.value !== null && row.value !== undefined;
    switch (row.kind) {
      case "fixed": return isNum(row.amount);
      case "rate": return isNum(row.rate);
      case "rate_with_min": return isNum(row.rate) && isNum(row.min);
      case "rate_with_min_max": return isNum(row.rate) && isNum(row.min) && isNum(row.max);
      case "per_unit": return isNum(row.amount);
      case "tiered":
        return Array.isArray(row.tiers) && row.tiers.length > 0 && row.tiers.every(function (t) {
          return t && (t.up_to === null || isNum(t.up_to)) && (isNum(t.amount) || isNum(t.rate));
        });
      default: return false;
    }
  }

  // -> { row, status: "ok"|"stale"|"unknown", reason }
  function resolve(comp, ctx) {
    if (!comp) return { row: null, status: "unknown", reason: "missing" };
    var row = selectRow(comp, ctx.today);
    if (!row) return { row: null, status: "unknown", reason: rowsOf(comp).length ? "not_effective" : "missing" };
    if (row.kind !== undefined && !KINDS[row.kind]) return { row: row, status: "unknown", reason: "bad_kind" };
    if (!rowHasValue(row)) return { row: row, status: "unknown", reason: "null" };
    var checked = parseDay(row.checked_at);
    if (checked === null) return { row: row, status: "unknown", reason: "unchecked" };
    var age = Math.floor((ctx.today - checked) / DAY_MS);
    if (age > ctx.expireDays) return { row: row, status: "unknown", reason: "expired", age: age };
    if (age > ctx.staleDays) return { row: row, status: "stale", reason: "stale", age: age };
    return { row: row, status: "ok", reason: null, age: age };
  }

  // Evaluate one component row against a base amount (unrounded -> rounded).
  // qty: number of units (per_unit amounts and per-unit min/max multiply by it).
  function evalRow(row, base, currency, qty) {
    var x;
    var q = isNum(qty) && qty > 0 ? qty : 1;
    switch (row.kind) {
      case "fixed": x = row.amount; break;
      case "per_unit": x = row.amount * q; break;
      case "rate": x = row.rate * base; break;
      case "rate_with_min": x = Math.max(row.rate * base, row.min); break;
      case "rate_with_min_max":
        var k = row.per === "unit" ? q : 1;
        x = Math.min(Math.max(row.rate * base, row.min * k), row.max * k);
        break;
      case "tiered":
        x = null;
        for (var i = 0; i < row.tiers.length; i++) {
          var t = row.tiers[i];
          if (t.up_to === null || base <= t.up_to) { x = isNum(t.amount) ? t.amount : t.rate * base; break; }
        }
        break;
      default: x = null;
    }
    if (!isNum(x)) return null;
    var unit = isNum(row.rounding_unit) ? row.rounding_unit : defaultUnit(currency);
    return roundTo(x, row.rounding || "round", unit);
  }

  function warn(ctx, code, message, line) {
    for (var i = 0; i < ctx.warnings.length; i++) {
      var w = ctx.warnings[i];
      if (w.code === code && w.line === line && w.message === message) return;
    }
    var o = { code: code, message: message };
    if (line) o.line = line;
    ctx.warnings.push(o);
  }

  // Reads a user number: undefined/null/"" -> null (not given). Invalid -> warning + null.
  function userNum(ctx, value, field, label) {
    if (value === undefined || value === null || value === "") return null;
    var n = typeof value === "string" ? Number(value.replace(/[,\s¥$]/g, "")) : value;
    if (!isNum(n) || n < 0) {
      warn(ctx, "invalid_input", "Ignored an invalid value for " + label + ".", field);
      return null;
    }
    return n;
  }

  function overrideFor(ctx, id, label) {
    var o = ctx.overrides;
    if (!o || !Object.prototype.hasOwnProperty.call(o, id)) return null;
    return userNum(ctx, o[id], "override:" + id, label);
  }

  function baseLine(id, label, currency) {
    return { id: id, label: label, low: null, high: null, currency: currency, status: "unknown", checked_at: null, source: null };
  }

  function explainStatus(ctx, line, res) {
    if (line.status === "stale") {
      warn(ctx, "stale", line.label + ": last checked " + line.checked_at + ", more than " + ctx.staleDays + " days ago. It may be out of date.", line.id);
    } else if (line.status === "unknown") {
      if (res && res.reason === "expired") {
        warn(ctx, "expired", line.label + ": last checked more than " + ctx.expireDays + " days ago, so it is not used. Enter your own amount to include it.", line.id);
      } else if (res && res.reason === "base_unknown") {
        warn(ctx, "unknown", line.label + ": cannot be worked out because a cost it depends on is not confirmed. Not included in the total.", line.id);
      } else {
        warn(ctx, "unknown", line.label + ": not confirmed yet. Not included in the total.", line.id);
      }
    }
  }

  /*
   * Build a line from a table component.
   *   base: [low, high] in the line's currency (ignored for fixed rows)
   *   exempt: optional [bool, bool] -> amount 0 in that scenario (de minimis)
   */
  function componentLine(ctx, comp, id, label, currency, base, exempt) {
    var line = baseLine(id, label, currency);
    var ov = overrideFor(ctx, id, label);
    var res = resolve(comp, ctx);
    if (res.row) { line.checked_at = res.row.checked_at || null; line.source = res.row.source || null; }
    if (ov !== null) {
      line.low = line.high = ov;
      line.status = "user"; line.source = "Your input"; line.checked_at = null;
      return line;
    }
    if (exempt && exempt[0] && exempt[1]) {
      line.low = line.high = 0;
      line.status = exempt.status || "ok";
      line.checked_at = exempt.checked_at || line.checked_at;
      line.source = exempt.source || line.source;
      line.note = "Below the duty-free threshold";
      return line;
    }
    if (res.status === "unknown") { explainStatus(ctx, line, res); return line; }
    var row = res.row;
    // Fixed amounts may be in another currency (converted). Rate-based rows work
    // on a base in the line's currency, so their minimums/tiers must match it.
    var cur = row.currency || currency;
    if (!NO_BASE[row.kind] && row.kind !== "rate" && cur !== currency) {
      warn(ctx, "unknown", label + ": table currency " + cur + " does not match " + currency + ". Not included in the total.", id);
      return line;
    }
    var vals = [];
    for (var s = 0; s < 2; s++) {
      if (exempt && exempt[s]) { vals.push(0); continue; }
      var b = base ? base[s] : 0;
      if (!NO_BASE[row.kind] && !isNum(b)) { vals.push(null); continue; }
      var v = evalRow(row, b, cur, ctx.quantity);
      if (v !== null && cur !== currency) v = convert(ctx, v, cur, currency);
      vals.push(v);
    }
    if (vals[0] === null || vals[1] === null) {
      var baseMissing = !NO_BASE[row.kind] && base && (!isNum(base[0]) || !isNum(base[1]));
      if (row.kind === "tiered" && !baseMissing) warn(ctx, "out_of_range", label + ": outside the range of the table.", id);
      else if (cur !== currency && !baseMissing) warn(ctx, "no_fx", label + ": needs an exchange rate for " + cur + ".", id);
      explainStatus(ctx, line, { reason: baseMissing ? "base_unknown" : "null" });
      return line;
    }
    line.low = Math.min(vals[0], vals[1]);
    line.high = Math.max(vals[0], vals[1]);
    line.status = res.status;
    if (exempt && (exempt[0] || exempt[1])) line.note = "Below the duty-free threshold in part of the range";
    explainStatus(ctx, line, res);
    return line;
  }

  // Parameter (non-fee) value with dating and freshness: de minimis, divisor, FX...
  function param(ctx, comp) {
    var res = resolve(comp, ctx);
    return {
      value: res.status === "unknown" ? null : res.row.value,
      row: res.row, status: res.status, reason: res.reason
    };
  }

  // Money conversion. ctx.fx = JPY per 1 unit of the destination currency.
  function convert(ctx, amount, from, to) {
    if (!isNum(amount)) return null;
    if (from === to) return amount;
    if (!ctx.fx) return null;
    if (from === "JPY" && to === ctx.destCurrency) return amount / ctx.fx;
    if (from === ctx.destCurrency && to === "JPY") return amount * ctx.fx;
    return null;
  }

  function find(list, id, key) {
    if (!Array.isArray(list) || typeof id !== "string" || !id) return null;
    var k = key || "id";
    for (var i = 0; i < list.length; i++) if (list[i] && list[i][k] === id) return list[i];
    return null;
  }

  function sum2(lines) {
    var lo = 0, hi = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l || !isNum(l.low) || !isNum(l.high)) continue;
      lo += l.low; hi += l.high;
    }
    return [lo, hi];
  }

  function add2(a, b) {
    if (!a || !b || !isNum(a[0]) || !isNum(b[0])) return [null, null];
    return [a[0] + b[0], a[1] + b[1]];
  }

  function own(o, k) { return !!o && typeof k === "string" && k !== "" && Object.prototype.hasOwnProperty.call(o, k); }

  // Duty category: the subgenre itself if the destination lists it (e.g.
  // digital_camera), else its parent category (camera), else the genre.
  // -> { key, missing } or null when the item type is not a duty category at all.
  function dutyCategory(dest, input) {
    var duty = dest.duty || {};
    var keys = [input.subgenre, DUTY_CATEGORY[input.subgenre], input.genre, DUTY_CATEGORY[input.genre]];
    var known = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof k !== "string" || !k) continue;
      if (own(duty, k)) return { key: k, missing: false };
      if (!known && own(DUTY_CATEGORY, k)) known = DUTY_CATEGORY[k];
    }
    return known ? { key: known, missing: true } : null;
  }

  // First duty rule (dest.duty_rules) with a row in effect today that covers
  // this category. Rules list no category -> every category.
  function pickDutyRule(ctx, dest, cat) {
    var rules = Array.isArray(dest.duty_rules) ? dest.duty_rules : [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || typeof rule !== "object" || (rule.replaces !== undefined && rule.replaces !== "duty")) continue;
      if (Array.isArray(rule.categories)) {
        if (!cat) continue;
        if (rule.categories.indexOf(cat.key) < 0 && rule.categories.indexOf(DUTY_CATEGORY[cat.key]) < 0) continue;
      }
      var row = selectRow(rule, ctx.today);
      if (row) return { rule: rule, row: row };
    }
    return null;
  }

  // applies_when: { max_value, currency, of: "goods" | "customs_value" | null }.
  // Value at or below max_value -> the rule applies. of null (not confirmed)
  // tests both the goods value and the customs value.
  // -> "yes" | "no" | "maybe" for one scenario.
  function bandMatch(ctx, when, currency, goods, customs) {
    if (!when || typeof when !== "object" || when.max_value === undefined) return "yes";
    var thr = isNum(when.max_value) ? convert(ctx, when.max_value, when.currency || currency, currency) : null;
    if (!isNum(thr)) return "maybe";
    var vals = when.of === "goods" ? [goods] : when.of === "customs_value" ? [customs] : [goods, customs];
    var inside = 0, outside = 0;
    for (var i = 0; i < vals.length; i++) {
      if (!isNum(vals[i])) { inside++; outside++; } else if (vals[i] <= thr) inside++; else outside++;
    }
    return outside === 0 ? "yes" : inside === 0 ? "no" : "maybe";
  }

  function pairExempt(exempt, s) {
    if (!exempt) return null;
    var e = [exempt[s], exempt[s]];
    e.status = exempt.status; e.checked_at = exempt.checked_at; e.source = exempt.source;
    return e;
  }

  /*
   * Import duty line. Uses the category's component, unless a duty rule
   * (e.g. a flat amount for low-value parcels) applies in a scenario; when it
   * is unclear whether the rule applies, the range covers both.
   */
  function dutyLine(ctx, dest, cat, customs, goods, exempt, currency, used) {
    var label = "Import duty" + (cat ? " (" + (CATEGORY_LABEL[cat.key] || cat.key) + ")" : "");
    var comp = cat && !cat.missing ? dest.duty[cat.key] : null;
    var picked = pickDutyRule(ctx, dest, cat);
    var hasOverride = ctx.overrides && Object.prototype.hasOwnProperty.call(ctx.overrides, "dest.duty");
    if (!picked || hasOverride) return componentLine(ctx, comp, "dest.duty", label, currency, customs, exempt);
    var when = picked.row.applies_when;
    var m = [0, 1].map(function (s) {
      if (exempt && exempt[s]) return "no";
      return bandMatch(ctx, when, currency, goods[s], customs[s]);
    });
    if (m[0] === "no" && m[1] === "no") return componentLine(ctx, comp, "dest.duty", label, currency, customs, exempt);
    var ruleLabel = picked.rule.label || "Duty rule";
    var cands = [], usedRule = false, usedNormal = false;
    for (var s = 0; s < 2; s++) {
      var b = [customs[s], customs[s]];
      if (m[s] !== "no") { cands.push(componentLine(ctx, picked.rule, "dest.duty", label + " — " + ruleLabel, currency, b, null)); usedRule = true; }
      if (m[s] !== "yes") { cands.push(componentLine(ctx, comp, "dest.duty", label, currency, b, pairExempt(exempt, s))); usedNormal = true; }
    }
    used.duty_rule = picked.rule.id || null;
    used.duty_rule_applies = m[0] === "yes" && m[1] === "yes" ? "yes" : "partly";
    var line = baseLine("dest.duty", label, currency);
    line.rule = picked.rule.id || null;
    line.note = usedNormal ? ruleLabel + " — applies in part of the range" : ruleLabel;
    var srcs = [], dates = [];
    cands.forEach(function (c) {
      if (c.source && srcs.indexOf(c.source) < 0) srcs.push(c.source);
      if (c.checked_at) dates.push(c.checked_at);
    });
    line.source = srcs.length ? srcs.join(" ; ") : null;
    line.checked_at = dates.length ? dates.sort()[0] : null;
    if (cands.some(function (c) { return !isNum(c.low) || !isNum(c.high); })) return line; // unknown (already warned)
    line.low = Math.min.apply(null, cands.map(function (c) { return c.low; }));
    line.high = Math.max.apply(null, cands.map(function (c) { return c.high; }));
    line.status = cands.some(function (c) { return c.status === "stale"; }) ? "stale" : "ok";
    if (usedNormal && usedRule) {
      warn(ctx, "duty_rule_partly", ruleLabel + " may apply, depending on the value counted. The duty range covers both.", "dest.duty");
    }
    return line;
  }

  // Notices: destination notices filtered by `when` ({ carriers: [...], methods: [...] })
  // and shipping-method notices filtered by `when` ({ destinations: [...] }).
  function noticesFor(ctx, dest, method) {
    var out = [];
    function take(list, ok) {
      (Array.isArray(list) ? list : []).forEach(function (n) {
        if (!n || typeof n !== "object" || typeof n.message !== "string" || !n.message) return;
        var from = n.effective_from == null ? -Infinity : parseDay(n.effective_from);
        if (from === null || from > ctx.today || endedBy(n, ctx.today)) return;
        if (!ok(n.when || {})) return;
        out.push({ id: n.id || null, message: n.message, source: n.source || null, checked_at: n.checked_at || null });
      });
    }
    var has = function (arr, v) { return !Array.isArray(arr) || (v != null && arr.indexOf(v) >= 0); };
    if (dest) take(dest.notices, function (w) { return has(w.carriers, method && method.carrier) && has(w.methods, method && method.id); });
    if (method) take(method.notices, function (w) { return has(w.destinations, dest && dest.country); });
    return out;
  }

  /**
   * landedCost(input, tables, today)
   *
   * input: {
   *   price_jpy, max_bid_jpy, is_auction,
   *   domestic_shipping: "free"|"up_to_1000"|"up_to_2000"|"manual", domestic_shipping_jpy,
   *   proxy, plan, options: [ids], shipping_method, destination,
   *   genre, subgenre, weight_kg, dimensions_cm: { l, w, h }, quantity (units, default 1),
   *   subdivision (e.g. a province id, when the destination lists subdivisions),
   *   fx_rate (JPY per 1 unit of the destination currency), overrides: { lineId: amount }
   * }
   * tables: { meta, proxies, shipping, destinations } (data/rates/*.json)
   * today: "YYYY-MM-DD" or Date
   */
  function landedCost(input, tables, today) {
    input = input && typeof input === "object" ? input : {};
    tables = tables && typeof tables === "object" ? tables : {};
    var meta = tables.meta || {};
    var ctx = {
      today: dayOf(today),
      staleDays: isNum(meta.stale_after_days) ? meta.stale_after_days : DEFAULT_STALE_DAYS,
      expireDays: isNum(meta.expire_after_days) ? meta.expire_after_days : DEFAULT_EXPIRE_DAYS,
      overrides: input.overrides && typeof input.overrides === "object" ? input.overrides : null,
      warnings: [], fx: null, destCurrency: null, quantity: 1
    };
    if (ctx.today === null) {
      warn(ctx, "invalid_input", "Ignored an invalid date; using today.", "today");
      ctx.today = dayOf(new Date());
    }
    var jpyLines = [], destLines = [];
    var used = {};
    var qty = userNum(ctx, input.quantity, "quantity", "the quantity");
    if (qty !== null && (qty < 1 || Math.floor(qty) !== qty)) {
      warn(ctx, "invalid_input", "Ignored an invalid value for the quantity.", "quantity");
      qty = null;
    }
    ctx.quantity = qty === null ? 1 : qty;
    used.quantity = ctx.quantity;

    // 1. Item price (design §3: auctions use the user's max bid, else the current price).
    var item = baseLine("item", "Item price", "JPY");
    var price = userNum(ctx, input.price_jpy, "price_jpy", "the item price");
    var maxBid = userNum(ctx, input.max_bid_jpy, "max_bid_jpy", "your max bid");
    if (maxBid !== null) {
      item.low = item.high = maxBid; item.status = "user"; item.source = "Your max bid";
      used.price_basis = "max_bid";
    } else if (price !== null) {
      item.low = item.high = price; item.status = "ok"; item.source = "Listing price";
      used.price_basis = "listing_price";
      if (input.is_auction) {
        warn(ctx, "current_price", "Estimate at current price", "item");
        used.price_basis = "current_price";
        item.source = "Current price";
      }
    } else {
      warn(ctx, "no_price", "No item price, so no total can be shown.", "item");
    }
    jpyLines.push(item);
    var itemPair = [item.low, item.high];

    // 2. Domestic shipping (seller -> proxy warehouse), always the user's choice.
    var dom = baseLine("domestic_shipping", "Shipping within Japan", "JPY");
    var band = input.domestic_shipping;
    if (band === "manual") {
      var m = userNum(ctx, input.domestic_shipping_jpy, "domestic_shipping_jpy", "shipping within Japan");
      if (m !== null) { dom.low = dom.high = m; dom.status = "user"; dom.source = "Your input"; }
    } else if (DOMESTIC_BANDS[band]) {
      dom.low = DOMESTIC_BANDS[band].range[0]; dom.high = DOMESTIC_BANDS[band].range[1];
      dom.status = "user"; dom.source = "Your choice: " + DOMESTIC_BANDS[band].label;
    } else if (band !== undefined && band !== null && band !== "") {
      warn(ctx, "invalid_input", "Ignored an unknown shipping-within-Japan choice.", "domestic_shipping");
    }
    if (dom.status === "unknown") warn(ctx, "unknown", "Shipping within Japan: not chosen yet. Not included in the total.", "domestic_shipping");
    jpyLines.push(dom);
    var goodsTotal = add2(itemPair, [dom.low, dom.high]);

    // 3. Proxy service fees and options (stage "service"), then payment fees later.
    var proxies = (tables.proxies && tables.proxies.proxies) || [];
    var proxy = input.proxy ? find(proxies, input.proxy) : proxies[0];
    if (input.proxy && !proxy) warn(ctx, "invalid_input", "Unknown proxy service.", "proxy");
    var plan = proxy ? (input.plan ? find(proxy.plans, input.plan) : (proxy.plans || [])[0]) : null;
    if (proxy && input.plan && !plan) warn(ctx, "invalid_input", "Unknown proxy plan.", "plan");
    var serviceComps = [], paymentComps = [];
    if (plan) {
      (plan.components || []).forEach(function (c) { (c.stage === "payment" ? paymentComps : serviceComps).push(c); });
    }
    var optIds = Array.isArray(input.options) ? input.options : [];
    var isOption = {};
    optIds.forEach(function (oid) {
      var o = proxy ? find(proxy.options, oid) : null;
      if (!o) { warn(ctx, "invalid_input", "Unknown option: " + oid + ".", "options"); return; }
      isOption[o.id] = true;
      (o.stage === "payment" ? paymentComps : serviceComps).push(o);
    });

    var bases = {
      item_price: itemPair,
      domestic_shipping: [dom.low, dom.high],
      goods_total: goodsTotal
    };
    var insurance = [0, 0];
    var proxyLines = [];
    var prefix = function (c) { return (isOption[c.id] ? "option." : "proxy.") + c.id; };
    function runComp(c) {
      var b = bases[c.base || "item_price"];
      if (c.base && !b) warn(ctx, "invalid_input", "Unknown base for " + c.id + ".", c.id);
      var line = componentLine(ctx, c, prefix(c), c.label || c.id, "JPY", b || [null, null]);
      if (c.counts_as === "insurance" && isNum(line.low)) insurance = [insurance[0] + line.low, insurance[1] + line.high];
      proxyLines.push(line); jpyLines.push(line);
    }
    serviceComps.forEach(runComp);
    bases.proxy_charges = add2(goodsTotal, sum2(proxyLines));

    // 4. International shipping: chargeable weight = max(actual, volumetric).
    var ship = tables.shipping || {};
    var method = input.shipping_method ? find(ship.methods, input.shipping_method) : (ship.methods || [])[0];
    if (input.shipping_method && !method) warn(ctx, "invalid_input", "Unknown shipping method.", "shipping_method");
    var dest = find((tables.destinations && tables.destinations.destinations) || [], input.destination, "country");
    if (!dest && input.destination) warn(ctx, "invalid_input", "Unknown destination.", "destination");
    if (!dest) warn(ctx, "no_destination", "Choose a destination to include shipping and import taxes.", "destination");

    var weightKey = input.subgenre || input.genre;
    var wDefaults = (ship.weight_defaults && ship.weight_defaults.values_kg) || {};
    var weight = userNum(ctx, input.weight_kg, "weight_kg", "the weight");
    if (weight !== null && weight === 0) { warn(ctx, "invalid_input", "Ignored a weight of 0 kg.", "weight_kg"); weight = null; }
    if (weight !== null) used.weight_source = "user";
    else if (weightKey && isNum(wDefaults[weightKey])) {
      weight = wDefaults[weightKey]; used.weight_source = "default";
      warn(ctx, "weight_default", "Using a typical weight for this item type (" + weight + " kg). Change it if you know the real weight.", "weight_kg");
    } else {
      used.weight_source = null;
      warn(ctx, "no_weight", "Enter a weight to include international shipping.", "weight_kg");
    }
    used.weight_kg = weight;
    var chargeable = weight;
    var dims = input.dimensions_cm;
    if (dims && typeof dims === "object" && method) {
      var l = userNum(ctx, dims.l, "dimensions_cm.l", "the length"),
          w = userNum(ctx, dims.w, "dimensions_cm.w", "the width"),
          h = userNum(ctx, dims.h, "dimensions_cm.h", "the height");
      if (l && w && h) {
        var div = param(ctx, method.volumetric_divisor);
        if (isNum(div.value) && div.value > 0) {
          var vol = (l * w * h) / div.value;
          used.volumetric_kg = Math.round(vol * 1000) / 1000;
          if (chargeable === null || vol > chargeable) { chargeable = vol; used.weight_basis = "volumetric"; }
          else used.weight_basis = "actual";
        } else {
          warn(ctx, "unknown", "Size-based (volumetric) weight: the divisor is not confirmed, so only the actual weight is used.", "volumetric_divisor");
        }
      }
    }
    used.chargeable_weight_kg = chargeable === null ? null : Math.round(chargeable * 1000) / 1000;
    var shipLine;
    var shipComp = method && dest && method.destinations ? method.destinations[dest.country] : null;
    shipLine = componentLine(ctx, shipComp, "shipping.international",
      (method && method.label ? "International shipping (" + method.label + ")" : "International shipping"),
      "JPY", [chargeable, chargeable]);
    jpyLines.push(shipLine);
    bases.international_shipping = [shipLine.low, shipLine.high];

    // Notices (data-driven, e.g. a carrier's condition for a destination).
    var notices = noticesFor(ctx, dest, method);
    notices.forEach(function (n) { warn(ctx, "notice", n.message, "notice." + (n.id || "")); });
    bases.proxy_charges_plus_shipping = add2(bases.proxy_charges, bases.international_shipping);

    // 5. Payment fees (charged on what is paid to the proxy).
    paymentComps.forEach(runComp);

    // 6. Exchange rate (design §6 A+C): the user's rate, else the bundled reference rate.
    var currency = "JPY";
    if (dest) {
      ctx.destCurrency = dest.currency;
      var fxUser = userNum(ctx, input.fx_rate, "fx_rate", "the exchange rate");
      if (fxUser === 0) { warn(ctx, "invalid_input", "Ignored an exchange rate of 0.", "fx_rate"); fxUser = null; }
      if (fxUser !== null) {
        ctx.fx = fxUser; used.fx_source = "user";
      } else {
        var ref = param(ctx, meta.fx_reference && meta.fx_reference[dest.currency]);
        if (isNum(ref.value) && ref.value > 0) {
          ctx.fx = ref.value; used.fx_source = "reference"; used.fx_checked_at = ref.row.checked_at;
          warn(ctx, "fx_reference", "Using a reference exchange rate from " + ref.row.checked_at + " (¥" + ref.value + " = 1 " + dest.currency + "). Enter today's rate for a closer estimate.", "fx_rate");
        } else {
          warn(ctx, "no_fx", "Enter an exchange rate (yen per 1 " + dest.currency + ") to see the total in " + dest.currency + " and to include import taxes.", "fx_rate");
        }
      }
      used.fx_rate = ctx.fx;
      if (ctx.fx) currency = dest.currency;
    }
    var toOut = function (x) { return isNum(x) ? cents(convert(ctx, x, "JPY", currency)) : null; };

    // 7. Import taxes (destination currency). Customs value: FOB = item only;
    //    CIF = item + international shipping + insurance. Unknown basis -> FOB..CIF range.
    //    The import-tax base is set separately by dest.tax_base (list of parts).
    var subs = dest && dest.subdivisions && Array.isArray(dest.subdivisions.options) ? dest.subdivisions : null;
    var sub = null;
    if (subs) {
      used.subdivision = null;
      if (input.subdivision) {
        sub = find(subs.options, input.subdivision);
        if (!sub) warn(ctx, "invalid_input", "Ignored an unknown " + (subs.label || "region").toLowerCase() + ".", "subdivision");
        else used.subdivision = sub.id;
      }
      if (!sub) warn(ctx, "subdivision_not_chosen", (subs.label || "Region") + ": not chosen, so " + ((subs.tax_label || "regional sales tax").toLowerCase()) + " is not included.", "subdivision");
    }
    var subLabel = sub ? ((sub.tax && sub.tax.label) || subs.tax_label || "Regional sales tax") + " (" + (sub.label || sub.id) + ")" : null;
    if (dest && ctx.fx) {
      var basis = param(ctx, dest.duty_basis);
      var fob = [toOut(itemPair[0]), toOut(itemPair[1])];
      var shipOut = [toOut(bases.international_shipping[0]), toOut(bases.international_shipping[1])];
      var insOut = [toOut(insurance[0]), toOut(insurance[1])];
      var cifJ = add2(add2(itemPair, bases.international_shipping), insurance);
      var cif = [toOut(cifJ[0]), toOut(cifJ[1])];
      var customs;
      if (basis.value === "FOB") customs = fob;
      else if (basis.value === "CIF") customs = cif;
      else {
        customs = [fob[0], isNum(cif[1]) ? cif[1] : null];
        warn(ctx, "duty_basis_unknown", "Whether import duty is charged on the item price alone or including shipping is not confirmed. The range covers both.", "dest.duty_basis");
      }
      if (!isNum(customs[0]) || !isNum(customs[1])) customs = [null, null];
      used.duty_basis = basis.value || null;
      used.customs_value = customs;

      // De minimis: at or below the threshold -> no duty/tax for the listed kinds.
      var dm = param(ctx, dest.de_minimis);
      var dmVal = dm.row && isNum(dm.value) ? convert(ctx, dm.value, dm.row.currency || dest.currency, currency) : null;
      var appliesTo = dm.row && Array.isArray(dm.row.applies_to) ? dm.row.applies_to : ["duty", "import_tax"];
      var exemptFor = function (kind) {
        if (dmVal === null || appliesTo.indexOf(kind) < 0 || !isNum(customs[0])) return null;
        var e = [customs[0] <= dmVal, customs[1] <= dmVal];
        e.status = dm.status; e.checked_at = dm.row.checked_at; e.source = dm.row.source;
        return e;
      };
      if (dm.status === "unknown") warn(ctx, "unknown", "Duty-free threshold: not confirmed. Taxes are estimated as if it does not apply.", "dest.de_minimis");
      else if (dm.status === "stale") warn(ctx, "stale", "Duty-free threshold: last checked " + dm.row.checked_at + ", more than " + ctx.staleDays + " days ago. It may be out of date.", "dest.de_minimis");

      var cat = dutyCategory(dest, input);
      if (!cat) warn(ctx, "unknown", "Item type is not a camera, lens or watch, so the duty rate is unknown.", "dest.duty");
      used.duty_category = cat ? cat.key : null;
      destLines.push(dutyLine(ctx, dest, cat, customs, fob, exemptFor("duty"), currency, used));
      if (dest.extra_tariff) {
        destLines.push(componentLine(ctx, dest.extra_tariff, "dest.extra_tariff", dest.extra_tariff.label || "Additional tariff", currency, customs, exemptFor("duty")));
      }
      var dutyTotal = sum2(destLines);
      var dutyKnown = destLines.every(function (l) { return isNum(l.low); });
      var dutyPair = dutyKnown ? dutyTotal : [null, null];
      var customsPlusDuty = dutyKnown && isNum(customs[0]) ? [customs[0] + dutyTotal[0], customs[1] + dutyTotal[1]] : [null, null];

      // Import-tax base. dest.tax_base lists the parts (goods, international_shipping,
      // insurance, duty, customs_value); null = not confirmed -> range from
      // goods + duty (low) to goods + shipping + insurance + duty (high).
      // Without dest.tax_base the older import_tax.base setting is used.
      var tb;
      if (dest.tax_base) {
        var tbp = param(ctx, dest.tax_base);
        var parts = { goods: fob, international_shipping: shipOut, insurance: insOut, duty: dutyPair, customs_value: customs };
        var sumParts = function (list, s) {
          var t = 0;
          for (var i = 0; i < list.length; i++) {
            var pp = parts[list[i]];
            if (!pp || !isNum(pp[s])) return null;
            t += pp[s];
          }
          return t;
        };
        if (Array.isArray(tbp.value) && tbp.value.length) {
          tb = [sumParts(tbp.value, 0), sumParts(tbp.value, 1)];
          used.tax_base = tbp.value.slice();
          if (tbp.status === "stale") warn(ctx, "stale", "Import tax base: last checked " + tbp.row.checked_at + ", more than " + ctx.staleDays + " days ago. It may be out of date.", "dest.tax_base");
        } else {
          tb = [sumParts(["goods", "duty"], 0), sumParts(["goods", "international_shipping", "insurance", "duty"], 1)];
          used.tax_base = null;
          if (dest.import_tax || sub) warn(ctx, "tax_base_unknown", "Whether import tax is charged on the item price alone or also on shipping and insurance is not confirmed. The range covers both.", "dest.tax_base");
        }
        if (!isNum(tb[0]) || !isNum(tb[1])) tb = [null, null];
      } else {
        tb = dest.import_tax && dest.import_tax.base === "customs_value" ? customs : customsPlusDuty;
      }
      used.tax_base_value = tb;
      if (dest.import_tax) {
        destLines.push(componentLine(ctx, dest.import_tax, "dest.import_tax", dest.import_tax.label || "Import VAT / GST", currency, tb, exemptFor("import_tax")));
      }
      if (sub) {
        destLines.push(componentLine(ctx, sub.tax, "dest.subdivision_tax", subLabel, currency, tb, exemptFor("import_tax")));
      }
      if (dest.broker_fee) {
        destLines.push(componentLine(ctx, dest.broker_fee, "dest.broker_fee", dest.broker_fee.label || "Customs clearance fee", currency, [0, 0]));
      }
    } else if (dest) {
      ["dest.duty", "dest.import_tax"].forEach(function (id) {
        var l = baseLine(id, id === "dest.duty" ? "Import duty" : "Import VAT / GST", currency);
        destLines.push(l);
      });
      if (sub) destLines.push(baseLine("dest.subdivision_tax", subLabel, currency));
    }

    // 8. Everything into the output currency; the total is the sum of known lines.
    var lines = [];
    jpyLines.forEach(function (l) {
      var o = Object.assign({}, l);
      o.native = { currency: "JPY", low: l.low, high: l.high };
      o.low = toOut(l.low); o.high = toOut(l.high); o.currency = currency;
      if (o.low === null || o.high === null) { o.low = o.high = null; if (o.status !== "unknown") o.status = "unknown"; }
      lines.push(o);
    });
    destLines.forEach(function (l) {
      var o = Object.assign({}, l);
      o.low = isNum(l.low) ? cents(l.low) : null; o.high = isNum(l.high) ? cents(l.high) : null;
      o.native = { currency: currency, low: o.low, high: o.high };
      lines.push(o);
    });

    var total = sum2(lines);
    var low = cents(total[0]), high = cents(total[1]);
    if (item.status === "unknown") { low = null; high = null; }
    var unknown = lines.filter(function (l) { return l.status === "unknown"; }).length;
    used.unknown_lines = unknown;

    return {
      low: low,
      high: high,
      currency: currency,
      lines: lines,
      warnings: ctx.warnings,
      notices: notices,
      used: used
    };
  }

  NS.landedCost = landedCost;
  NS.landedCostInternals = { roundTo: roundTo, selectRow: selectRow, parseDay: parseDay, DOMESTIC_BANDS: DOMESTIC_BANDS };

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
