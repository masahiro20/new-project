/*
 * Tanuki Scout (provisional name) — listing analyzer.
 * Pure functions: text in, findings out. No DOM, no network.
 * Loaded as a classic content script (attaches to globalThis.CollectorLens)
 * and as a CommonJS module in Node tests.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  // Words that, appearing shortly after a defect term, mean "there is none".
  var NEGATORS = [
    "なし", "無し", "ナシ", "ありません", "ございません", "無い", "ない",
    "見当たりません", "見当たらない", "見られません", "見受けられません",
    "皆無", "ゼロ"
  ];
  // Words that confirm presence and stop the negation scan.
  var AFFIRMERS = ["あり", "有り", "有", "あります", "見られます", "ございます", "多少", "少々", "若干"];
  // Characters that end the clause we scan for negation.
  var CLAUSE_END = /[。\n！!？?]/;
  var NEGATION_WINDOW = 18;

  // Risk levels in display order.
  var RISK_ORDER = { high: 0, medium: 1, low: 2, info: 3, positive: 4 };

  function normalize(text) {
    if (!text) return "";
    var t = String(text);
    if (t.normalize) t = t.normalize("NFKC");
    // Unify the many dash / wave forms sellers use.
    t = t.replace(/[‐‑‒–—―－]/g, "-");
    t = t.replace(/[〜～]/g, "~");
    return t;
  }

  /** Build a matcher from glossary entries: longest surface form first. */
  function buildIndex(glossary) {
    var forms = [];
    var entries = (glossary && glossary.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      for (var j = 0; j < e.ja.length; j++) {
        var f = normalize(e.ja[j]);
        if (f) forms.push({ form: f, lower: f.toLowerCase(), entry: e });
      }
    }
    forms.sort(function (a, b) { return b.form.length - a.form.length; });
    return { forms: forms, entries: entries };
  }

  // Is the term at [end] negated by what follows in the same clause?
  // "カビ、くもりなし" -> negated; "カビあり、くもりなし" -> not negated.
  function isNegated(lower, end) {
    var tail = lower.slice(end, end + NEGATION_WINDOW);
    var stop = tail.search(CLAUSE_END);
    if (stop >= 0) tail = tail.slice(0, stop);
    var best = -1, kind = null;
    function scan(list, k) {
      for (var i = 0; i < list.length; i++) {
        var p = tail.indexOf(list[i]);
        // On a tie ("あり" vs "ありません") the negator wins: it is the longer word.
        if (p >= 0 && (best < 0 || p < best || (p === best && k === "neg"))) { best = p; kind = k; }
      }
    }
    scan(AFFIRMERS, "aff");
    scan(NEGATORS, "neg");
    // "ない" inside "少ない" (few) is not a negator.
    if (kind === "neg" && best > 0 && tail.charAt(best - 1) === "少") return false;
    return kind === "neg";
  }

  function makeSnippet(text, start, end) {
    var a = Math.max(0, start - 14), b = Math.min(text.length, end + 18);
    return (a > 0 ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ") + (b < text.length ? "…" : "");
  }

  /** Find glossary terms in text. Non-overlapping, longest match wins. */
  function findTerms(text, index) {
    var norm = normalize(text);
    var lower = norm.toLowerCase();
    var taken = new Uint8Array(lower.length);
    var hits = [];
    for (var i = 0; i < index.forms.length; i++) {
      var f = index.forms[i];
      var from = 0, p;
      while ((p = lower.indexOf(f.lower, from)) >= 0) {
        from = p + 1;
        var end = p + f.lower.length;
        // ASCII forms (OH, GP, NCNR...) must be whole words.
        if (/^[a-z0-9]/.test(f.lower) && p > 0 && /[a-z0-9]/.test(lower.charAt(p - 1))) continue;
        if (/[a-z0-9]$/.test(f.lower) && /[a-z0-9]/.test(lower.charAt(end) || "")) continue;
        // Entry-specific guard, e.g. 日差 (daily rate) vs 日差し (sunlight).
        if (f.entry.exclude_next && f.entry.exclude_next.some(function (x) { return lower.startsWith(x, end); })) continue;
        // ...and the mirror guard on the text just before, e.g. 不良品 (defective) vs 良品 (good).
        if (f.entry.exclude_prev && f.entry.exclude_prev.some(function (x) { return lower.endsWith(x, p); })) continue;
        var clash = false;
        for (var k = p; k < end; k++) if (taken[k]) { clash = true; break; }
        if (clash) continue;
        for (k = p; k < end; k++) taken[k] = 1;
        hits.push({
          entry: f.entry,
          form: f.form,
          start: p,
          end: end,
          negated: isDefectLike(f.entry) && isNegated(lower, end),
          snippet: makeSnippet(norm, p, end)
        });
      }
    }
    hits.sort(function (a, b) { return a.start - b.start; });
    return hits;
  }

  // Only physical defects get negation handling ("カビなし"). Conditions and
  // return terms ("ジャンク", "返品不可") are never treated as negated.
  function isDefectLike(entry) {
    return entry.category === "defect";
  }

  // Shop grades: "ランク:AB", "Aランク", "状態 B+", "Exc+++", "Exc+5", "Mint-".
  var RANK_INFO = {
    "S": "S — new or as-new, no visible use.",
    "SA": "SA — near new; only tiny traces of handling.",
    "A": "A — light use; minor marks only. Check photos for the exact marks.",
    "AB": "AB — used with some visible marks; fully usable.",
    "B": "B — clearly used: scratches/wear; may have small issues.",
    "BC": "BC — heavy wear; function may be affected.",
    "C": "C — heavy wear or defects; often sold for repair/parts.",
    "D": "D — significant damage; parts only in practice.",
    "J": "J — junk: not guaranteed to work."
  };
  var SHOP_RANK_RE = /(?:ランク|状態|評価|rank|grade|condition)\s*[:：]?\s*[「【(\[]?\s*(SA|AB|BC|S|A|B|C|D|J)([+\-]?)(?![a-z])/i;
  var SHOP_RANK_RE2 = /(?:^|[^a-z])(SA|AB|BC|S|A|B|C|D|J)([+\-]?)\s*ランク/i;
  var EXPORT_RANK_RE = /\b(n\s*mint|near\s*mint|mint|exc|excellent|ex)\s*((?:\+{1,5})|(?:\+\s?\d)|-)?(?![a-z])/i;

  var EXPORT_INFO = {
    mint: "Mint — exporter grade for (claimed) like-new items.",
    "near mint": "Near Mint — very close to new; exporter's own scale.",
    exc: "Exc — 'Excellent', an exporter scale. More '+' is better (Exc+5 ≈ Exc+++++). Not standardized between sellers.",
    ex: "EX — 'Excellent' on a shop scale; meaning varies by seller."
  };

  function findRanks(text) {
    var norm = normalize(text);
    var out = [];
    var m = SHOP_RANK_RE.exec(norm) || SHOP_RANK_RE2.exec(norm);
    if (m) {
      var g = m[1].toUpperCase();
      out.push({ kind: "shop", label: g + (m[2] || ""), explain: RANK_INFO[g] || "Shop grade.", snippet: makeSnippet(norm, m.index, m.index + m[0].length) });
    }
    var x = EXPORT_RANK_RE.exec(norm);
    if (x) {
      var key = x[1].toLowerCase().replace(/\s+/g, " ").replace("n mint", "near mint");
      if (key === "excellent") key = "exc";
      // "ex" alone is too ambiguous unless followed by a plus grade.
      if (key !== "ex" || x[2]) {
        out.push({ kind: "export", label: x[0].trim(), explain: EXPORT_INFO[key] || EXPORT_INFO.exc, snippet: makeSnippet(norm, x.index, x.index + x[0].length) });
      }
    }
    return out;
  }

  /**
   * Rule-based flags that are not single glossary words.
   * Each rule returns a finding or null.
   */
  var RULES = [
    {
      id: "no_return_and_untested",
      test: function (ctx) {
        return ctx.hasAny(["ncnr", "henpin_fuka", "hoshou_nashi", "genjou_watashi"]) &&
          ctx.hasAny(["junk", "dousa_mikakunin", "mikakunin", "tsuuden_only", "genjouhin"]);
      },
      risk: "high",
      en: "Untested + no returns",
      explain: "The seller doesn't confirm it works AND won't take it back. Price it as broken."
    },
    {
      id: "authenticity_disclaimer_luxury",
      test: function (ctx) { return ctx.genre === "watch" && ctx.hasAny(["shingan_fumei", "honmono_hoshou_nashi", "no_brand"]); },
      risk: "high",
      en: "Authenticity not guaranteed (watch)",
      explain: "For watches, an authenticity disclaimer is a strong warning. Ask for movement and caseback photos, and compare serial/reference."
    },
    {
      id: "minimal_description",
      test: function (ctx) { return ctx.descriptionLength > 0 && ctx.descriptionLength < 40; },
      risk: "medium",
      en: "Very short description",
      explain: "Almost no written detail. Ask the seller specific questions before bidding."
    }
  ];

  // Film-like words that are really screen protectors ("保護フィルム"), not camera film.
  var FILM_DECOYS = /(?:保護|液晶|画面|ガラス)フィルム/g;

  function detectGenre(text) {
    var t = normalize(text).toLowerCase().replace(FILM_DECOYS, " ");
    var cam = (t.match(/カメラ|レンズ|一眼|シャッター|フィルム|ファインダー|絞り|ミラーレス|デジカメ|中判|ブローニー|nikon|canon|leica|ニコン|キヤノン|ライカ|ペンタックス|オリンパス|ミノルタ|ハッセル|mm\s?f\/?\d/g) || []).length;
    var wat = (t.match(/腕時計|時計|ムーブメント|文字盤|ベゼル|リューズ|竜頭|自動巻|手巻|クオーツ|seiko|セイコー|rolex|ロレックス|omega|オメガ|グランドセイコー|citizen|シチズン/g) || []).length;
    if (cam === 0 && wat === 0) return "general";
    return cam >= wat ? "camera" : "watch";
  }

  // Camera subgenre by simple keyword counts. Only camera listings get one.
  var LENS_RE = /単焦点|ズームレンズ|レンズ単体|レンズのみ|交換レンズ|オールドレンズ|マクロレンズ|マウント|\d\s?mm\s?f\/?\s?\d|前後キャップ|フード|絞り羽|ヘリコイド|前玉|中玉|後玉|最短撮影距離|開放f|鏡筒|鏡胴|ピントリング|フォーカスリング|ズームリング|(?:^|[^a-z])[am]f\s?レンズ/g;
  var FILM_RE = /フィルム|レンジファインダー|二眼|中判|露出計|巻き上げ|巻上げ|巻き戻し|モルト|セレン|水銀電池|距離計|二重像|シャッター幕|布幕|ブローニー|ハーフサイズ|ハーフ判|(?:135|120|220)\s?(?:フィルム|判|film)/g;
  var DIGITAL_RE = /デジタル|デジカメ|ミラーレス|ショット数|シャッター回数|センサー|撮像素子|バッテリー|充電器|画素|sdカード|液晶モニター|動画/g;
  // Words that say "this is a camera body" (a body sold with a kit lens is not a lens listing).
  var BODY_RE = /ボディ|一眼レフ|レンジファインダー|ミラーレス|カメラ本体|コンパクトカメラ|二眼レフ/g;

  function countRe(t, re) { return (t.match(re) || []).length; }

  /** "lens" | "film_camera" | "digital_camera" | null (not a camera, or undecided). */
  function detectSubgenre(text) {
    if (detectGenre(text) !== "camera") return null;
    var t = normalize(text).toLowerCase().replace(FILM_DECOYS, " ");
    var lens = countRe(t, LENS_RE);
    var film = countRe(t, FILM_RE);
    var digital = countRe(t, DIGITAL_RE);
    // 一眼レフ (SLR) is a film hint only when other film words are present.
    if (film > 0) film += countRe(t, /一眼レフ/g);
    var body = countRe(t, BODY_RE);
    if (lens > film && lens > digital && lens > body) return "lens";
    if (film === 0 && digital === 0) return null;
    return film >= digital ? "film_camera" : "digital_camera";
  }

  /**
   * Analyze an extracted listing.
   * listing: { title, description, condition, returns, shipping, price, rank }
   */
  function analyze(listing, glossary, indexCache) {
    var index = indexCache || buildIndex(glossary);
    var fields = ["title", "condition", "returns", "description", "rank"];
    var all = [];
    var seen = {};
    for (var i = 0; i < fields.length; i++) {
      var val = listing[fields[i]];
      if (!val) continue;
      var hits = findTerms(val, index);
      for (var j = 0; j < hits.length; j++) {
        var h = hits[j];
        var key = h.entry.id + (h.negated ? ":neg" : "");
        if (seen[key]) { seen[key].count++; continue; }
        h.field = fields[i];
        h.count = 1;
        seen[key] = h;
        all.push(h);
      }
    }
    // An entry that appears both negated and affirmed counts as affirmed.
    all = all.filter(function (h) { return !(h.negated && seen[h.entry.id]); });

    var genreText = [listing.title, listing.description].join(" ");
    var genre = detectGenre(genreText);
    var subgenre = genre === "camera" ? detectSubgenre(genreText) : null;
    var ids = {};
    all.forEach(function (h) { if (!h.negated) ids[h.entry.id] = true; });
    var ctx = {
      genre: genre,
      descriptionLength: normalize(listing.description || "").replace(/\s+/g, "").length,
      has: function (id) { return !!ids[id]; },
      hasAny: function (list) { return list.some(function (id) { return !!ids[id]; }); }
    };

    var flags = [];
    var terms = [];
    var reassurances = [];
    all.forEach(function (h) {
      var e = h.entry;
      var item = { id: e.id, ja: h.form, en: e.en, explain: e.explain, risk: e.risk, category: e.category, field: h.field, snippet: h.snippet, negated: h.negated };
      if (h.negated) {
        reassurances.push(Object.assign({}, item, { risk: "positive", en: negatedLabel(e), explain: NEGATED_EXPLAIN }));
      } else if (e.risk === "positive") {
        reassurances.push(item);
      } else if (e.risk === "high" || e.risk === "medium" || e.risk === "low") {
        flags.push(item);
      } else if (e.genre.indexOf(genre) >= 0 || e.genre.indexOf("general") >= 0 ||
          (subgenre && e.genre.indexOf(subgenre) >= 0)) {
        // Neutral vocabulary is shown only if it fits the item's genre:
        // "ダイヤル" is a watch dial, but also a camera's shutter-speed dial.
        // A listing we can't place (genre "general") gets general terms only,
        // so a hoodie's "フード付き" is not explained as a lens hood.
        terms.push(item);
      }
    });
    RULES.forEach(function (r) {
      if (r.test(ctx)) flags.push({ id: "rule:" + r.id, en: r.en, explain: r.explain, risk: r.risk, category: "rule" });
    });
    flags.sort(function (a, b) { return RISK_ORDER[a.risk] - RISK_ORDER[b.risk]; });

    // A condition field holding just a grade ("B", "AB+") is a shop rank.
    var bareGrade = /^(SA|AB|BC|S|A|B|C|D|J)[+\-]?$/i.test(normalize(listing.condition || "").trim());
    var rankText = [listing.rank, bareGrade ? "ランク:" + normalize(listing.condition).trim() : "", listing.title, listing.description];
    var ranks = findRanks(rankText.filter(Boolean).join("\n"));
    var conditionHits = listing.condition ? findTerms(listing.condition, index) : [];
    var returnHits = listing.returns ? findTerms(listing.returns, index) : [];
    // A negated defect in the condition line ("カビなし") is a reassurance, not a risk.
    var fieldTerm = function (h) {
      if (h.negated) return { ja: h.form, en: negatedLabel(h.entry), explain: NEGATED_EXPLAIN, risk: "positive", negated: true };
      return { ja: h.form, en: h.entry.en, explain: h.entry.explain, risk: h.entry.risk };
    };

    return {
      genre: genre,
      subgenre: subgenre,
      condition: listing.condition ? { raw: normalize(listing.condition), terms: conditionHits.map(fieldTerm) } : null,
      returns: listing.returns ? { raw: normalize(listing.returns), terms: returnHits.map(fieldTerm) } : null,
      ranks: ranks,
      flags: flags,
      reassurances: reassurances,
      terms: terms,
      score: summarize(flags)
    };
  }

  var NEGATED_EXPLAIN = "Seller states there is none. Check photos — sellers' 'none' can mean 'none I noticed'.";
  function negatedLabel(entry) {
    return "No " + entry.en.toLowerCase().replace(/\s*\(.*\)$/, "") + " (stated)";
  }

  // The badge counts exactly the items listed under Warnings (high + medium flags).
  function summarize(flags) {
    var high = flags.filter(function (f) { return f.risk === "high"; }).length;
    var med = flags.filter(function (f) { return f.risk === "medium"; }).length;
    var total = high + med;
    var level = high > 0 ? "high" : med > 0 ? "medium" : "low";
    if (!total) return { level: level, high: 0, medium: 0, total: 0, label: "No rule-based warnings" };
    var parts = [];
    if (high) parts.push(high + " serious");
    if (med) parts.push(med + " caution" + (med > 1 ? "s" : ""));
    return { level: level, high: high, medium: med, total: total, label: total + " warning" + (total > 1 ? "s" : "") + " · " + parts.join(", ") };
  }

  /**
   * Group a result into the panel's sections. Shared by the overlay and the demo.
   * - Warnings lists every high/medium flag, so its length equals score.total.
   *   A risky term from the condition/returns line is explained there once and
   *   only referenced ("see Warnings") in the Condition/Returns section.
   * - Seller states and Terms leave out anything already shown under
   *   Condition or Returns.
   */
  function groupForPanel(result) {
    var shownAbove = function (f) {
      return (f.field === "condition" && !!result.condition) || (f.field === "returns" && !!result.returns);
    };
    var isWarning = function (f) { return f.risk === "high" || f.risk === "medium"; };
    var fieldItems = function (field) {
      if (!field) return null;
      return field.terms.map(function (t) {
        return isWarning(t) ? Object.assign({}, t, { explain: "Explained under Warnings.", ref: true }) : t;
      });
    };
    return {
      condition: fieldItems(result.condition),
      returns: fieldItems(result.returns),
      warnings: result.flags.filter(isWarning),
      notes: result.flags.filter(function (f) { return f.risk === "low" && !shownAbove(f); }),
      sellerStates: result.reassurances.filter(function (f) { return !shownAbove(f); }),
      terms: result.terms.filter(function (f) { return !shownAbove(f); })
    };
  }

  NS.normalize = normalize;
  NS.buildIndex = buildIndex;
  NS.findTerms = findTerms;
  NS.findRanks = findRanks;
  NS.detectGenre = detectGenre;
  NS.detectSubgenre = detectSubgenre;
  NS.analyze = analyze;
  NS.groupForPanel = groupForPanel;

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
