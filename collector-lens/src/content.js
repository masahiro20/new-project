/*
 * Collector Lens (working title) — content script entry point.
 * Runs only on the listing domains declared in manifest.json, reads the
 * current page's DOM, and draws an overlay. No network, no storage, no
 * messages to any server, no visits to other pages.
 */
(function (root) {
  "use strict";

  var CL = root.CollectorLens;
  if (!CL || !CL.GLOSSARY || root.__collectorLensStarted) return;
  root.__collectorLensStarted = true;

  var index = CL.buildIndex(CL.GLOSSARY);
  var lastKey = "";
  var collapsed = false;
  var timer = null;

  function run() {
    var hit = CL.detectSite(location.href);
    if (!hit || !hit.isListing) { CL.removeOverlay(document); lastKey = ""; return; }
    var listing = CL.extractListing(document, hit.site);
    // Wait until the SPA has painted something useful.
    if (!listing.title && !listing.description) return;
    var key = location.href + "|" + listing.title + "|" + listing.description.length + "|" + listing.condition;
    if (key === lastKey && document.getElementById(CL.OVERLAY_HOST_ID)) return;
    lastKey = key;
    var result = CL.analyze(listing, null, index);
    CL.renderOverlay(document, result, { siteName: hit.site.name, collapsed: collapsed });
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 400);
  }

  // Mercari is a single-page app: content appears and URLs change without a
  // reload. Re-check on DOM changes (debounced); ignore our own overlay.
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var t = records[i].target;
      if (t && t.id === CL.OVERLAY_HOST_ID) continue;
      schedule();
      return;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  run();
})(globalThis);
