/*
 * Tanuki Scout (provisional name) — overlay panel.
 * Rendered inside a closed Shadow DOM so page CSS can't leak in and the page's
 * own layout is untouched. All page-derived text goes through textContent and
 * createTextNode only. Key and input events from inside the panel are stopped
 * at the panel, so typing in it does not trigger the marketplace's shortcuts.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});
  var HOST_ID = "collector-lens-root";
  var KEEP_INSIDE = ["keydown", "keyup", "keypress", "beforeinput", "input"];

  var CSS = [
    ":host{all:initial}",
    ".panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:360px;max-width:calc(100vw - 32px);max-height:70vh;display:flex;flex-direction:column;",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;background:#fff;border:1px solid #d0d0d6;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);overflow:hidden}",
    ".head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #ececf0;cursor:pointer;user-select:none}",
    ".title{font-weight:600;flex:1}",
    ".badge{font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px}",
    ".lvl-high{background:#fde2e1;color:#a4161a}.lvl-medium{background:#fff1d6;color:#8a5300}.lvl-low{background:#e3f4e8;color:#1e6b34}",
    "button{all:unset;cursor:pointer;padding:2px 6px;border-radius:6px;color:#555}button:hover{background:#f0f0f4}button:focus-visible{outline:2px solid #3a6df0}",
    ".body{overflow:auto;overscroll-behavior:contain;padding:4px 12px 12px}",
    ".collapsed .body,.collapsed .foot{display:none}",
    "h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b6b75;margin:12px 0 6px}",
    "ul{list-style:none;margin:0;padding:0}",
    "li{padding:6px 8px;margin:0 0 6px;border-radius:8px;background:#f7f7f9;border-left:3px solid #c9c9d1}",
    "li.r-high{border-left-color:#d62828;background:#fff5f5}li.r-medium{border-left-color:#f0a202;background:#fffaf0}li.r-low{border-left-color:#e9c46a}",
    "li.r-positive{border-left-color:#2a9d8f;background:#f2fbf9}",
    ".ja{font-weight:600}.en{font-weight:600;color:#333}.ex{color:#444;margin-top:2px}.snip{color:#777;font-size:12px;margin-top:2px}",
    ".raw{font-weight:600}",
    ".foot{padding:8px 12px;border-top:1px solid #ececf0;color:#777;font-size:11px}",
    ".empty{color:#777;font-style:italic}",
    "@media (prefers-color-scheme:dark){.panel{background:#1f1f23;color:#ececf0;border-color:#3a3a40}.head,.foot{border-color:#333}li{background:#2a2a30}",
    "li.r-high{background:#3a1d1f}li.r-medium{background:#3a2e17}li.r-positive{background:#183330}.ex,.en{color:#d5d5dc}.snip,.foot,h3{color:#9a9aa5}button{color:#ccc}button:hover{background:#333}}"
  ].join("");

  function el(doc, tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function item(doc, risk, ja, en, explain, snippet) {
    var li = el(doc, "li", "r-" + (risk || "info"));
    var line = el(doc, "div");
    if (ja) { line.appendChild(el(doc, "span", "ja", ja)); line.appendChild(doc.createTextNode(" — ")); }
    line.appendChild(el(doc, "span", "en", en));
    li.appendChild(line);
    if (explain) li.appendChild(el(doc, "div", "ex", explain));
    if (snippet) li.appendChild(el(doc, "div", "snip", "“" + snippet + "”"));
    return li;
  }

  function section(doc, title, children) {
    var frag = doc.createDocumentFragment();
    frag.appendChild(el(doc, "h3", null, title));
    var ul = el(doc, "ul");
    children.forEach(function (c) { ul.appendChild(c); });
    frag.appendChild(ul);
    return frag;
  }

  function buildPanel(doc, result, meta) {
    var panel = el(doc, "div", "panel");
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "Tanuki Scout listing notes");

    var head = el(doc, "div", "head");
    head.appendChild(el(doc, "span", "title", "Tanuki Scout"));
    var badge = el(doc, "span", "badge lvl-" + result.score.level, result.score.label);
    head.appendChild(badge);
    var toggle = el(doc, "button", "toggle", "–");
    toggle.setAttribute("aria-label", "Collapse");
    var close = el(doc, "button", "close", "×");
    close.setAttribute("aria-label", "Close");
    head.appendChild(toggle);
    head.appendChild(close);
    panel.appendChild(head);

    var body = el(doc, "div", "body");

    var g = NS.groupForPanel(result);
    var fieldItem = function (t) { return item(doc, t.risk, t.ja, t.en, t.explain); };
    if (g.condition) {
      var cond = g.condition.map(fieldItem);
      if (!cond.length) cond = [item(doc, "info", result.condition.raw, "(no dictionary entry yet)", null)];
      body.appendChild(section(doc, "Condition (as stated)", cond));
    }
    if (result.ranks.length) {
      body.appendChild(section(doc, "Grade", result.ranks.map(function (r) { return item(doc, "info", null, r.label, r.explain, r.snippet); })));
    }
    if (g.returns) {
      var ret = g.returns.map(fieldItem);
      if (!ret.length) ret = [item(doc, "info", result.returns.raw, "(no dictionary entry yet)", null)];
      body.appendChild(section(doc, "Returns", ret));
    }

    var toItem = function (f) { return item(doc, f.risk, f.ja, f.en, f.explain, f.snippet); };
    body.appendChild(section(doc, "Warnings", g.warnings.length ? g.warnings.map(toItem) : [el(doc, "li", "empty", "No rule-based warnings found. That is not a guarantee.")]));
    if (g.notes.length) body.appendChild(section(doc, "Worth noting", g.notes.map(toItem)));

    if (g.sellerStates.length) {
      body.appendChild(section(doc, "Seller states", g.sellerStates.map(function (f) { return item(doc, "positive", f.ja, f.en, f.explain, f.snippet); })));
    }
    if (g.terms.length) {
      body.appendChild(section(doc, "Terms on this page", g.terms.map(function (t) { return item(doc, "info", t.ja, t.en, t.explain); })));
    }
    // v1.1 "Estimated total" (collapsed by default). Absent if the feature
    // flag is off or the engine/tables are not loaded.
    if (typeof NS.buildEstimateSection === "function") {
      var est = NS.buildEstimateSection(doc, (meta && meta.estimate) || {});
      if (est) body.appendChild(est);
    }
    panel.appendChild(body);

    var foot = el(doc, "div", "foot", "Tanuki Scout (prototype) · " + (meta && meta.siteName ? meta.siteName + " · " : "") +
      "Rule-based notes from this page only — not an appraisal or authenticity check.");
    panel.appendChild(foot);

    function setCollapsed(c) {
      panel.classList.toggle("collapsed", c);
      toggle.textContent = c ? "+" : "–";
      toggle.setAttribute("aria-label", c ? "Expand" : "Collapse");
      toggle.setAttribute("aria-expanded", String(!c));
    }
    toggle.addEventListener("click", function (ev) { ev.stopPropagation(); setCollapsed(!panel.classList.contains("collapsed")); });
    head.addEventListener("click", function () { setCollapsed(!panel.classList.contains("collapsed")); });
    close.addEventListener("click", function (ev) { ev.stopPropagation(); remove(doc); });
    // Keyboard/input events are composed and would bubble out of the shadow
    // root to the page (e.g. a site shortcut on "/" or "j"). Stop them here.
    // The default action (typing) still happens.
    KEEP_INSIDE.forEach(function (type) {
      panel.addEventListener(type, function (ev) { ev.stopPropagation(); });
    });
    setCollapsed(!!(meta && meta.collapsed));
    return panel;
  }

  function remove(doc) {
    var old = doc.getElementById(HOST_ID);
    if (old) old.remove();
  }

  /** Render (or replace) the overlay. Returns the shadow root for tests. */
  function render(doc, result, meta) {
    remove(doc);
    var host = doc.createElement("div");
    host.id = HOST_ID;
    var shadow = host.attachShadow({ mode: meta && meta.openShadow ? "open" : "closed" });
    var style = doc.createElement("style");
    style.textContent = CSS + (NS.ESTIMATE_CSS || "");
    shadow.appendChild(style);
    shadow.appendChild(buildPanel(doc, result, meta));
    (doc.body || doc.documentElement).appendChild(host);
    return shadow;
  }

  NS.renderOverlay = render;
  NS.removeOverlay = remove;
  NS.OVERLAY_HOST_ID = HOST_ID;

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
