/*
 * Tanuki Scout (provisional name) — "Estimated total" section of the panel
 * (v1.1, design docs/v1.1-total-cost-design.md §8).
 * Collapsible, closed by default. Uses the bundled rate tables
 * (CollectorLens.RATES, generated from data/rates) and the pure engine
 * CollectorLens.landedCost. Builds DOM with createElement/textContent only.
 * No network. The user's choices are saved via CollectorLens.estimateSettings
 * (the only storage code); per-listing values (bid, weight, amounts) are not saved.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  var DISCLAIMER = "Rough estimate. Fees, shipping and taxes change; check with your proxy and carrier.";
  var EXCLUDED = "Not confirmed yet — excluded";
  var SYMBOL = { USD: "US$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$", JPY: "¥" };
  var TYPE_LABEL = { lens: "lens", film_camera: "film camera", digital_camera: "digital camera", camera: "camera", watch: "watch" };
  var BANDS = [
    ["free", "Free (¥0)"],
    ["up_to_1000", "Up to ¥1,000"],
    ["up_to_2000", "¥1,000–¥2,000"],
    ["manual", "Enter amount…"]
  ];
  var DEFAULT_BAND = "up_to_1000";

  // Remembered while the page is open (memory only), so a re-render after a
  // page update does not snap the section shut.
  var ui = { open: false, breakdown: false };

  var CSS = [
    "[hidden]{display:none !important}",
    ".est{margin-top:12px;border-top:1px solid #ececf0;padding-top:4px}",
    ".est-toggle{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:6px 0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b75;font-weight:600}",
    ".est-toggle .chev{display:inline-block;width:10px}",
    ".est-note{color:#6b6b75;font-size:12px;margin:2px 0 8px}",
    ".est-form{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
    ".est-field{display:flex;flex-direction:column;gap:2px;font-size:12px;min-width:0}",
    ".est-field.wide{grid-column:1 / -1}",
    ".est-field .lbl{color:#444;font-weight:600}",
    ".est-field .hint{color:#777;font-size:11px}",
    "input,select{font:inherit;font-size:12px;color:inherit;background:#fff;border:1px solid #c9c9d1;border-radius:6px;padding:4px 6px;min-width:0;width:100%;box-sizing:border-box}",
    "input:focus-visible,select:focus-visible{outline:2px solid #3a6df0;outline-offset:0}",
    ".est-result{margin:10px 0 4px;padding:8px;border-radius:8px;background:#f7f7f9}",
    ".est-total{font-size:18px;font-weight:700}",
    ".est-sub{color:#555;font-size:12px}",
    ".est-bd-toggle{font-size:12px;color:#3a5bd0;padding:2px 0}",
    ".est-lines li{display:flex;flex-direction:column;gap:1px}",
    ".est-lines .row{display:flex;justify-content:space-between;gap:8px}",
    ".est-lines .amt{font-weight:600;white-space:nowrap}",
    ".est-lines .meta{color:#777;font-size:11px}",
    ".est-lines li.s-unknown{border-left-color:#c9c9d1}.est-lines li.s-unknown .amt{font-weight:400;color:#777;font-style:italic}",
    ".est-lines li.s-stale{border-left-color:#f0a202}.est-lines li.s-user{border-left-color:#3a6df0}.est-lines li.s-ok{border-left-color:#2a9d8f}",
    ".est-warnings li{border-left-color:#f0a202;font-size:12px}",
    ".est-warnings li.est-notice{border-left-color:#3a6df0;font-weight:600}",
    "@media (prefers-color-scheme:dark){.est{border-color:#333}.est-result{background:#2a2a30}.est-field .lbl{color:#d5d5dc}.est-sub{color:#c0c0c8}",
    "input,select{background:#2a2a30;border-color:#4a4a52}.est-bd-toggle{color:#8fa8ff}.est-note,.est-toggle,.est-field .hint,.est-lines .meta{color:#9a9aa5}}"
  ].join("");

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function isNum(x) { return typeof x === "number" && isFinite(x); }

  function money(x, cur, whole) {
    if (!isNum(x)) return "—";
    var d = cur === "JPY" || whole ? 0 : 2;
    return (SYMBOL[cur] || cur + " ") + x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function range(lo, hi, cur, whole) {
    if (!isNum(lo) || !isNum(hi)) return "—";
    if (whole && cur !== "JPY") { lo = Math.floor(lo); hi = Math.ceil(hi); }
    return lo === hi ? money(lo, cur, whole) : money(lo, cur, whole) + " – " + money(hi, cur, whole);
  }

  function option(doc, value, label) {
    var o = el(doc, "option", null, label);
    o.value = value;
    return o;
  }

  function field(doc, label, control, hint, wide) {
    var f = el(doc, "label", "est-field" + (wide ? " wide" : ""));
    f.appendChild(el(doc, "span", "lbl", label));
    f.appendChild(control);
    if (hint) f.appendChild(hint);
    return f;
  }

  function list(x) { return Array.isArray(x) ? x : []; }

  function hasOption(select, value) {
    for (var i = 0; i < select.options.length; i++) if (select.options[i].value === value) return true;
    return false;
  }

  function lineMeta(l) {
    var bits = [];
    if (l.status === "unknown") return bits;
    if (l.native && l.native.currency !== l.currency && isNum(l.native.low)) bits.push(range(l.native.low, l.native.high, l.native.currency));
    if (l.status === "stale") bits.push("May be out of date");
    if (l.checked_at) bits.push("Checked " + l.checked_at);
    if (l.source) bits.push(l.source);
    if (l.note) bits.push(l.note);
    return bits;
  }

  /**
   * buildEstimateSection(doc, opts) -> element
   * opts: {
   *   tables: { meta, proxies, shipping, destinations }  (default CollectorLens.RATES)
   *   today: "YYYY-MM-DD" or Date (default: today)
   *   listing: { price_jpy, is_auction, genre, subgenre }
   *   store: { load(cb), save(obj) }  (default CollectorLens.estimateSettings)
   * }
   * Returns null when the feature is off or the engine/tables are missing.
   */
  function build(doc, opts) {
    opts = opts || {};
    var features = NS.FEATURES || {};
    var tables = opts.tables || NS.RATES;
    if (!features.landedCost || typeof NS.landedCost !== "function" || !tables) return null;
    var listing = opts.listing || {};
    var store = opts.store === undefined ? NS.estimateSettings : opts.store;
    var proxies = list(tables.proxies && tables.proxies.proxies);
    var methods = list(tables.shipping && tables.shipping.methods);
    var dests = list(tables.destinations && tables.destinations.destinations);
    var weightDefaults = (tables.shipping && tables.shipping.weight_defaults && tables.shipping.weight_defaults.values_kg) || {};
    var listingPrice = isNum(listing.price_jpy) && listing.price_jpy > 0 ? listing.price_jpy : null;
    var savedFx = {};

    var wrap = el(doc, "section", "est");
    var toggle = el(doc, "button", "est-toggle");
    toggle.type = "button";
    var chev = el(doc, "span", "chev");
    toggle.appendChild(chev);
    toggle.appendChild(el(doc, "span", null, "Estimated total"));
    wrap.appendChild(toggle);

    var body = el(doc, "div", "est-body");
    wrap.appendChild(body);
    body.appendChild(el(doc, "p", "est-note est-disclaimer", DISCLAIMER));

    var form = el(doc, "div", "est-form");
    body.appendChild(form);

    // Price / max bid.
    var bid = el(doc, "input", "est-bid");
    bid.type = "text";
    bid.setAttribute("inputmode", "numeric");
    bid.setAttribute("autocomplete", "off");
    if (listingPrice !== null) bid.placeholder = String(listingPrice);
    var bidHint = el(doc, "span", "hint", listingPrice !== null
      ? "Leave empty to use the " + (listing.is_auction ? "current" : "listed") + " price (" + money(listingPrice, "JPY") + ")"
      : "Price not found on this page. Enter your max bid or the price.");
    form.appendChild(field(doc, listing.is_auction ? "Your max bid (JPY)" : "Max bid / price (JPY)", bid, bidHint, true));

    // Shipping within Japan.
    var band = el(doc, "select", "est-domestic");
    BANDS.forEach(function (b) { band.appendChild(option(doc, b[0], b[1])); });
    band.value = DEFAULT_BAND;
    var bandAmt = el(doc, "input", "est-domestic-jpy");
    bandAmt.type = "text";
    bandAmt.setAttribute("inputmode", "numeric");
    bandAmt.setAttribute("aria-label", "Shipping within Japan, amount in yen");
    bandAmt.placeholder = "Amount in yen";
    bandAmt.hidden = true;
    var bandField = field(doc, "Shipping within Japan", band, null);
    bandField.appendChild(bandAmt);
    form.appendChild(bandField);

    // Proxy (only those in the bundled tables).
    var proxySel = null;
    if (proxies.length) {
      proxySel = el(doc, "select", "est-proxy");
      proxies.forEach(function (p) { proxySel.appendChild(option(doc, p.id, p.display_name || p.id)); });
      form.appendChild(field(doc, "Proxy service", proxySel, null));
    }

    // Shipping method.
    var methodSel = el(doc, "select", "est-method");
    if (!methods.length) methodSel.appendChild(option(doc, "", "None available"));
    methods.forEach(function (m) { methodSel.appendChild(option(doc, m.id, m.label || m.id)); });
    form.appendChild(field(doc, "Shipping method", methodSel, null));

    // Destination.
    var destSel = el(doc, "select", "est-dest");
    destSel.appendChild(option(doc, "", "Choose…"));
    dests.forEach(function (d) { destSel.appendChild(option(doc, d.country, d.label || d.country)); });
    form.appendChild(field(doc, "Ship to", destSel, null));

    // Province / region: only for destinations whose table lists subdivisions
    // (a regional sales tax the user chooses). Not saved: the saved settings
    // stay the ones listed in estimate-settings.js (decision 2026-10-09).
    var subSel = el(doc, "select", "est-subdivision");
    var subField = field(doc, "Region", subSel, null);
    var subLabel = subField.querySelector(".lbl");
    subField.hidden = true;
    form.appendChild(subField);

    // Weight (per listing, never saved).
    var weight = el(doc, "input", "est-weight");
    weight.type = "text";
    weight.setAttribute("inputmode", "decimal");
    weight.setAttribute("autocomplete", "off");
    var wKey = listing.subgenre || listing.genre;
    var wDefault = wKey && isNum(weightDefaults[wKey]) ? weightDefaults[wKey] : null;
    if (wDefault !== null) weight.placeholder = String(wDefault);
    var weightHint = el(doc, "span", "hint", wDefault !== null
      ? "Typical for a " + (TYPE_LABEL[wKey] || wKey) + ": " + wDefault + " kg"
      : "Item type not detected. Enter a weight.");
    form.appendChild(field(doc, "Weight (kg)", weight, weightHint));

    // Exchange rate.
    var fx = el(doc, "input", "est-fx");
    fx.type = "text";
    fx.setAttribute("inputmode", "decimal");
    fx.setAttribute("autocomplete", "off");
    var fxHint = el(doc, "span", "hint");
    var fxField = field(doc, "Exchange rate", fx, fxHint);
    var fxLabel = fxField.querySelector(".lbl");
    fxLabel.className = "lbl est-fx-label";
    form.appendChild(fxField);

    // Result.
    var result = el(doc, "div", "est-result");
    result.setAttribute("aria-live", "polite");
    result.appendChild(el(doc, "div", "est-sub", "Estimated total to your door"));
    var totalEl = el(doc, "div", "est-total", "—");
    var subEl = el(doc, "div", "est-sub est-status");
    result.appendChild(totalEl);
    result.appendChild(subEl);
    body.appendChild(result);

    var bdToggle = el(doc, "button", "est-bd-toggle");
    bdToggle.type = "button";
    body.appendChild(bdToggle);
    var lines = el(doc, "ul", "est-lines");
    body.appendChild(lines);
    var warnings = el(doc, "ul", "est-warnings");
    body.appendChild(warnings);

    function currentDest() {
      for (var i = 0; i < dests.length; i++) if (dests[i].country === destSel.value) return dests[i];
      return null;
    }

    function referenceRow(cur) {
      var ref = tables.meta && tables.meta.fx_reference && tables.meta.fx_reference[cur];
      var rows = list(ref && ref.rows);
      // Latest dated row with a value (the engine also checks age and effective dates).
      var best = null;
      rows.forEach(function (r) {
        if (r && isNum(r.value) && r.value > 0 && (!best || String(r.checked_at) > String(best.checked_at))) best = r;
      });
      return best;
    }

    function refreshFxField() {
      var d = currentDest();
      var cur = d ? d.currency : null;
      fxLabel.textContent = cur ? "Exchange rate (yen per 1 " + cur + ")" : "Exchange rate (yen per 1 unit)";
      var ref = cur ? referenceRow(cur) : null;
      fx.placeholder = ref ? String(ref.value) : "";
      fx.value = cur && savedFx[cur] ? String(savedFx[cur]) : "";
      fx.disabled = !cur;
      fxHint.textContent = !cur ? "Choose where to ship first."
        : ref ? "Leave empty to use the reference rate from " + ref.checked_at + ". Today's rate is better."
        : "No reference rate bundled. Enter today's rate.";
    }

    function refreshSubdivisions() {
      var d = currentDest();
      var subs = d && d.subdivisions && Array.isArray(d.subdivisions.options) && d.subdivisions.options.length ? d.subdivisions : null;
      var keep = subSel.value;
      subSel.textContent = "";
      subField.hidden = !subs;
      if (!subs) return;
      subLabel.textContent = subs.label || "Region";
      subSel.appendChild(option(doc, "", "Choose…"));
      subs.options.forEach(function (o) { if (o && o.id) subSel.appendChild(option(doc, o.id, o.label || o.id)); });
      subSel.value = keep && hasOption(subSel, keep) ? keep : "";
    }

    function readInput() {
      bandAmt.hidden = band.value !== "manual";
      return {
        price_jpy: listingPrice,
        max_bid_jpy: bid.value.trim(),
        is_auction: !!listing.is_auction,
        domestic_shipping: band.value,
        domestic_shipping_jpy: band.value === "manual" ? bandAmt.value.trim() : "",
        proxy: proxySel ? proxySel.value : undefined,
        shipping_method: methodSel.value || undefined,
        destination: destSel.value || undefined,
        subdivision: subField.hidden ? undefined : (subSel.value || undefined),
        genre: listing.genre || null,
        subgenre: listing.subgenre || null,
        weight_kg: weight.value.trim(),
        fx_rate: fx.disabled ? "" : fx.value.trim()
      };
    }

    function renderBreakdownToggle(n) {
      bdToggle.textContent = (ui.breakdown ? "Hide breakdown" : "Show breakdown") + " (" + n + ")";
      bdToggle.setAttribute("aria-expanded", String(ui.breakdown));
      lines.hidden = !ui.breakdown;
    }

    var last = null;
    function compute() {
      var input = readInput();
      var r;
      try { r = NS.landedCost(input, tables, opts.today); } catch (e) { r = null; }
      last = r;
      lines.textContent = "";
      warnings.textContent = "";
      if (!r) {
        totalEl.textContent = "—";
        subEl.textContent = "Estimate unavailable.";
        renderBreakdownToggle(0);
        return r;
      }
      var excluded = r.lines.filter(function (l) { return l.status === "unknown"; });
      if (!isNum(r.low) || !isNum(r.high)) {
        totalEl.textContent = "—";
        subEl.textContent = "Enter your max bid or the price in yen to see a total.";
      } else {
        totalEl.textContent = range(r.low, r.high, r.currency, true);
        var bits = [r.low === r.high ? "Not a quote" : "A range, not a quote"];
        if (excluded.length) bits.push(excluded.length + " cost" + (excluded.length > 1 ? "s" : "") + " not confirmed yet and excluded");
        subEl.textContent = bits.join(" · ") + ".";
      }

      r.lines.forEach(function (l) {
        var li = el(doc, "li", "s-" + l.status);
        var row = el(doc, "div", "row");
        row.appendChild(el(doc, "span", "name", l.label));
        var known = l.status !== "unknown" && isNum(l.low) && isNum(l.high);
        row.appendChild(el(doc, "span", "amt", known ? range(l.low, l.high, l.currency) : EXCLUDED));
        li.appendChild(row);
        var meta = lineMeta(l);
        if (l.status === "user" && !l.source) meta.unshift("Your input");
        if (meta.length) li.appendChild(el(doc, "div", "meta", meta.join(" · ")));
        lines.appendChild(li);
      });
      renderBreakdownToggle(r.lines.length);

      // Warnings. "Not confirmed" notes about a breakdown line are already
      // shown on that line, so they are not repeated here.
      // Notices (e.g. a carrier's condition for this destination) come first.
      var lineIds = {};
      r.lines.forEach(function (l) { lineIds[l.id] = true; });
      r.warnings.forEach(function (w) {
        if (w.code === "notice") warnings.appendChild(el(doc, "li", "est-notice", w.message));
      });
      r.warnings.forEach(function (w) {
        if (w.code === "notice") return;
        if (w.code === "unknown" && w.line && lineIds[w.line]) return;
        warnings.appendChild(el(doc, "li", null, w.message));
      });
      return r;
    }

    function save() {
      if (!store || typeof store.save !== "function") return;
      var d = currentDest();
      if (d && !fx.disabled) {
        var v = Number(fx.value.trim().replace(/[,\s]/g, ""));
        if (fx.value.trim() === "") delete savedFx[d.currency];
        else if (isFinite(v) && v > 0) savedFx[d.currency] = v;
      }
      try {
        store.save({
          proxy: proxySel ? proxySel.value : undefined,
          shipping_method: methodSel.value || undefined,
          destination: destSel.value || undefined,
          domestic_shipping: band.value,
          fx_rates: savedFx
        });
      } catch (e) { /* not saved; the estimate still works */ }
    }

    function applySettings(s) {
      if (!s || typeof s !== "object") return;
      if (proxySel && s.proxy && hasOption(proxySel, s.proxy)) proxySel.value = s.proxy;
      if (s.shipping_method && hasOption(methodSel, s.shipping_method)) methodSel.value = s.shipping_method;
      if (s.destination && hasOption(destSel, s.destination)) destSel.value = s.destination;
      refreshSubdivisions();
      if (s.domestic_shipping && hasOption(band, s.domestic_shipping)) band.value = s.domestic_shipping;
      if (s.fx_rates && typeof s.fx_rates === "object") {
        savedFx = {};
        for (var k in s.fx_rates) if (Object.prototype.hasOwnProperty.call(s.fx_rates, k) && isNum(s.fx_rates[k])) savedFx[k] = s.fx_rates[k];
      }
      refreshFxField();
      compute();
    }

    function setOpen(open) {
      ui.open = open;
      body.hidden = !open;
      chev.textContent = open ? "▾" : "▸";
      toggle.setAttribute("aria-expanded", String(open));
      if (open && typeof toggle.scrollIntoView === "function") {
        try { toggle.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ }
      }
    }

    toggle.addEventListener("click", function (ev) { ev.stopPropagation(); setOpen(body.hidden); });
    bdToggle.addEventListener("click", function (ev) {
      ev.stopPropagation();
      ui.breakdown = !ui.breakdown;
      renderBreakdownToggle(last ? last.lines.length : 0);
    });
    [bid, bandAmt, weight, fx].forEach(function (c) { c.addEventListener("input", compute); });
    [band, methodSel, destSel].concat(proxySel ? [proxySel] : []).forEach(function (c) {
      c.addEventListener("change", function () {
        if (c === destSel) { refreshFxField(); refreshSubdivisions(); }
        compute();
        save();
      });
    });
    subSel.addEventListener("change", compute);
    fx.addEventListener("change", save);

    refreshFxField();
    refreshSubdivisions();
    compute();
    setOpen(ui.open);
    if (store && typeof store.load === "function") {
      try { store.load(applySettings); } catch (e) { /* defaults stay */ }
    }

    wrap.__estimate = { compute: compute, applySettings: applySettings, setOpen: setOpen };
    return wrap;
  }

  NS.buildEstimateSection = build;
  NS.ESTIMATE_CSS = CSS;
  NS.ESTIMATE_DISCLAIMER = DISCLAIMER;
  NS._estimateUi = ui; // tests reset this between renders

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
