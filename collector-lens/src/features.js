/*
 * Tanuki Scout (provisional name) — feature flags.
 * landedCost: the "Estimated total" section at the end of the panel.
 * proBilling: off. While it is false nothing is gated behind a plan and the
 *   extension contains no payment code at all (no billing library, no
 *   network). Turning it on needs owner approval and a separate change.
 */
(function (root) {
  "use strict";

  var NS = (root.CollectorLens = root.CollectorLens || {});

  NS.FEATURES = Object.freeze({ landedCost: true, proBilling: false });

  if (typeof module !== "undefined" && module.exports) module.exports = NS;
})(typeof globalThis !== "undefined" ? globalThis : this);
