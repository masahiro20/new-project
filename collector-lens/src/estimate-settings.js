/*
 * Tanuki Scout (provisional name) — saved settings for the "Estimated total"
 * section. This is the ONLY file that touches browser storage.
 *
 * What is saved (one key in chrome.storage.local, on this device only):
 *   proxy, shipping_method, destination, domestic_shipping (the band),
 *   fx_rates (the user's exchange rate per currency, e.g. { USD: 150 })
 * What is never saved: listing text, prices, bids, weights, URLs, or anything
 * else read from the page. Nothing is synced or sent anywhere.
 *
 * Works without storage (tests, jsdom, a browser without the API): loading
 * returns {} and saving does nothing. Firefox MV3 supports chrome.storage.local.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  var KEY = "tanukiScout.estimateSettings.v1";
  var ID_KEYS = ["proxy", "shipping_method", "destination", "domestic_shipping"];
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var CUR_RE = /^[A-Z]{3}$/;
  var cache = null;

  function toRate(x) {
    var n = typeof x === "string" ? Number(x.replace(/[,\s]/g, "")) : x;
    return typeof n === "number" && isFinite(n) && n > 0 && n < 1e6 ? n : null;
  }

  // Keep only the allowed keys, with sane values. Everything else is dropped.
  function pick(obj) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    for (var i = 0; i < ID_KEYS.length; i++) {
      var v = obj[ID_KEYS[i]];
      if (typeof v === "string" && ID_RE.test(v)) out[ID_KEYS[i]] = v;
    }
    var rates = obj.fx_rates, fx = {}, n = 0;
    if (rates && typeof rates === "object" && !Array.isArray(rates)) {
      for (var cur in rates) {
        if (!Object.prototype.hasOwnProperty.call(rates, cur) || !CUR_RE.test(cur) || n >= 10) continue;
        var v2 = toRate(rates[cur]);
        if (v2 !== null) { fx[cur] = v2; n++; }
      }
    }
    if (n) out.fx_rates = fx;
    return out;
  }

  function area() {
    try {
      if (typeof chrome !== "undefined" && chrome && chrome.storage && chrome.storage.local) return true;
    } catch (e) { /* no storage */ }
    return false;
  }

  /** load(callback): calls back once with the saved settings ({} if none). */
  function load(cb) {
    var done = false;
    function finish(v) {
      if (done) return;
      done = true;
      cache = pick(v);
      try { cb(Object.assign({}, cache)); } catch (e) { /* caller error stays local */ }
    }
    if (cache) { finish(cache); return; }
    if (!area()) { finish({}); return; }
    try {
      chrome.storage.local.get(KEY, function (items) {
        finish(items && typeof items === "object" ? items[KEY] : null);
      });
    } catch (e) {
      finish({});
    }
  }

  /** save(settings): stores only the allowed keys. Returns what was saved. */
  function save(settings) {
    var clean = pick(settings);
    cache = clean;
    if (!area()) return clean;
    try {
      var data = {};
      data[KEY] = clean;
      chrome.storage.local.set(data, function () {});
    } catch (e) { /* storage unavailable: settings last for this page only */ }
    return clean;
  }

  NS.estimateSettings = {
    KEY: KEY,
    load: load,
    save: save,
    pick: pick,
    _reset: function () { cache = null; } // tests only
  };

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
