/*
 * Tanuki Scout (provisional name) — site detection and listing extraction.
 * Reads ONLY the DOM of the page the user has open. Never fetches anything.
 *
 * Selectors for real sites are best-effort and unverified (we do not copy or
 * store real pages). Extraction therefore leans on label text such as
 * 「商品の状態」 that is visible to users, with selector hints as a bonus and
 * generic fallbacks last. Verify on live pages by hand before any release.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  var CONDITION_LABELS = ["商品の状態", "状態", "コンディション", "商品状態", "ランク", "状態ランク"];
  var RETURN_LABELS = ["返品", "返品の可否", "返品について", "返品可否"];
  var DESCRIPTION_LABELS = ["商品説明", "商品の説明", "説明", "商品詳細", "備考", "商品紹介"];

  var SITES = [
    {
      id: "yahoo_auctions",
      name: "Yahoo! Auctions",
      priority: 1,
      host: /(^|\.)auctions\.yahoo\.co\.jp$/,
      isListing: function (url) { return /\/jp\/auction\/[a-z0-9]+/i.test(url.pathname); },
      hints: {
        description: ["#ProductExplanation", "[class*='ProductExplanation']", "[id*='description' i]", "[class*='Description']"],
        title: ["h1"]
      }
    },
    {
      id: "mercari",
      name: "Mercari",
      priority: 2,
      host: /^jp\.mercari\.com$/,
      isListing: function (url) { return /^\/(item|shops\/product)\//.test(url.pathname); },
      hints: {
        description: ["[data-testid='description']", "pre[data-testid]", "[class*='description' i]"],
        condition: ["[data-testid='商品の状態']", "[data-testid*='condition' i]"],
        title: ["h1"]
      }
    },
    {
      id: "rakuma",
      name: "Rakuma",
      priority: 3,
      host: /^item\.fril\.jp$/,
      isListing: function (url) { return /^\/[a-z0-9]{8,}/i.test(url.pathname); },
      hints: {
        description: ["[class*='item__description' i]", "[class*='description' i]"],
        title: ["h1"]
      }
    },
    {
      id: "mandarake",
      name: "Mandarake",
      priority: 4,
      host: /^order\.mandarake\.co\.jp$/,
      isListing: function (url) { return /\/order\/detailPage\//.test(url.pathname); },
      hints: {
        description: ["[class*='caution' i]", "[class*='explain' i]", "[class*='description' i]"],
        title: ["h1"]
      }
    }
  ];

  function detectSite(href) {
    var url;
    try { url = new URL(href); } catch (e) { return null; }
    if (url.protocol !== "https:") return null;
    for (var i = 0; i < SITES.length; i++) {
      var s = SITES[i];
      if (s.host.test(url.hostname)) return { site: s, isListing: s.isListing(url) };
    }
    return null;
  }

  function clean(t) {
    return (t || "").replace(/[ \t 　]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  }

  function textOf(el) {
    if (!el) return "";
    // innerText respects layout (line breaks) in browsers; jsdom lacks it.
    var t = typeof el.innerText === "string" && el.innerText ? el.innerText : el.textContent;
    return clean(t);
  }

  function firstText(doc, selectors) {
    for (var i = 0; i < (selectors || []).length; i++) {
      var el;
      try { el = doc.querySelector(selectors[i]); } catch (e) { continue; }
      var t = textOf(el);
      if (t) return t;
    }
    return "";
  }

  function stripLabel(text, label) {
    return clean(text.replace(new RegExp("^\\s*" + label + "\\s*[:：]?\\s*"), ""));
  }

  /**
   * Find the value next to a visible label ("商品の状態" → "目立った傷や汚れなし").
   * Handles <th>/<td>, <dt>/<dd>, label + sibling, and "label：value" in one node.
   */
  function findLabeledValue(doc, labels, maxLen) {
    maxLen = maxLen || 400;
    var nodes = doc.querySelectorAll("th, dt, td, dd, span, div, p, li, h2, h3, h4, label, b, strong");
    var limit = Math.min(nodes.length, 6000);
    for (var li = 0; li < labels.length; li++) {
      var label = labels[li];
      for (var i = 0; i < limit; i++) {
        var el = nodes[i];
        var own = clean(el.textContent);
        if (!own || own.length > label.length + 40) continue;
        var norm = own.replace(/\s/g, "");
        if (norm === label || norm === label + ":" || norm === label + "：") {
          var v = valueAfter(el);
          if (v && v.length <= maxLen) return v;
        } else if (norm.indexOf(label + ":") === 0 || norm.indexOf(label + "：") === 0) {
          var inline = stripLabel(own, label);
          if (inline) return inline;
        }
      }
    }
    return "";
  }

  function valueAfter(el) {
    var cur = el;
    for (var depth = 0; depth < 3 && cur; depth++) {
      var sib = cur.nextElementSibling;
      while (sib) {
        var t = textOf(sib);
        if (t) return t;
        sib = sib.nextElementSibling;
      }
      cur = cur.parentElement;
      // Stop if the parent already contains a lot more than this label.
      if (cur && clean(cur.textContent).length > 600) break;
    }
    return "";
  }

  function metaContent(doc, prop) {
    var m = doc.querySelector("meta[property='" + prop + "'], meta[name='" + prop + "']");
    return m ? clean(m.getAttribute("content")) : "";
  }

  function extractListing(doc, site) {
    var hints = (site && site.hints) || {};
    var title = firstText(doc, hints.title) || metaContent(doc, "og:title") || clean(doc.title);
    var description = firstText(doc, hints.description) ||
      findLabeledValue(doc, DESCRIPTION_LABELS, 20000) ||
      metaContent(doc, "og:description") || metaContent(doc, "description");
    var condition = firstText(doc, hints.condition) || findLabeledValue(doc, CONDITION_LABELS, 120);
    var returns = findLabeledValue(doc, RETURN_LABELS, 200);
    return {
      site: site ? site.id : "unknown",
      title: title.slice(0, 300),
      description: description.slice(0, 20000),
      condition: condition,
      returns: returns
    };
  }

  NS.SITES = SITES;
  NS.detectSite = detectSite;
  NS.extractListing = extractListing;
  NS.findLabeledValue = findLabeledValue;

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
