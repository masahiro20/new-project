// Security headers for every response (CSP, nosniff, Referrer-Policy, Permissions-Policy, frame).
//
// Plain JS (no TypeScript) because it runs in two places after `next build`:
//   - scripts/security-headers.mjs (post-build): computes the per-page CSP and writes it into
//     .next/routes-manifest.json (Vercel and `next start` apply those headers to every response,
//     static pages included) and into .open-next/ (the Cloudflare Worker sets them, cf-worker.ts);
//   - tests/security-headers.test.ts.
//
// CSP without nonces: every page is static (prerendered at build time), so there is no request in
// which to put a fresh nonce — Next.js only applies nonces while rendering dynamically
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Making every page
// dynamic for a nonce would cost the Workers free plan's 10 ms CPU on every page view. Instead the
// inline scripts Next.js writes into each page (Turbopack bootstrap + RSC payload) are allowed by
// their sha256 hash, per page, computed from the built HTML: no 'unsafe-inline' for scripts.
// Inline style attributes in the HTML (a CSS variable on <html>, display:contents) are allowed by
// hash with 'unsafe-hashes' in style-src-attr only; <style> elements (error pages) by hash.

import { createHash } from "node:crypto";

/** Same value as the <meta name="referrer"> in app/layout.tsx. */
export const REFERRER_POLICY = "same-origin";

/** Headers on every response (pages, API, assets). */
export const COMMON_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": REFERRER_POLICY,
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "X-Frame-Options": "DENY", // older browsers; CSP frame-ancestors 'none' is the real rule
};

/**
 * Hosts outside this site that a page may hand over to. Only a form submission's redirect is
 * covered by CSP (form-action): the "Manage billing" form POSTs /api/portal, which answers 303 to the
 * Stripe billing portal. Stripe Checkout is a top-level navigation from script (location.assign),
 * which CSP does not restrict. No external scripts, styles, images, fonts or fetches are used.
 */
export const FORM_ACTION_EXTRA = ["https://billing.stripe.com"];

/** CSP for responses that are not HTML pages (API JSON, images, files): nothing may load. */
export const NON_HTML_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const sha = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const unique = (xs) => [...new Set(xs)].sort();

/** Executable inline <script> bodies (data blocks such as application/ld+json are not scripts). */
function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /\btype\s*=\s*"([^"]*)"/i.exec(m[1])?.[1]?.trim().toLowerCase();
    if (type && type !== "text/javascript" && type !== "module" && type !== "application/javascript") continue;
    if (m[2].length) out.push(m[2]);
  }
  return out;
}

/**
 * Inline code in one page's HTML that its CSP has to allow.
 * Attribute values are decoded the way the browser sees them (&amp;, &quot;, …).
 */
export function inlineSources(html) {
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return {
    scripts: unique(inlineScripts(html).map(sha)),
    styles: unique([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => sha(m[1]))),
    styleAttrs: unique([...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => sha(decode(m[1])))),
  };
}

/** The CSP of an HTML page with these inline sources. `dev`: Next.js dev needs 'unsafe-eval'. */
export function pageCsp({ scripts = [], styles = [], styleAttrs = [] } = {}, { dev = false } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts.join(" ")}${dev ? " 'unsafe-eval'" : ""}`.trim(),
    "style-src 'self'",
    `style-src-elem 'self' ${styles.join(" ")}`.trim(),
    styleAttrs.length ? `style-src-attr 'unsafe-hashes' ${styleAttrs.join(" ")}` : "style-src-attr 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    `form-action 'self' ${FORM_ACTION_EXTRA.join(" ")}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Merge several pages' inline sources (one CSP that covers all of them). */
export function mergeSources(list) {
  return {
    scripts: unique(list.flatMap((s) => s.scripts)),
    styles: unique(list.flatMap((s) => s.styles)),
    styleAttrs: unique(list.flatMap((s) => s.styleAttrs)),
  };
}

/**
 * Route path of a prerendered page file under .next/server/app ("index.html" → "/",
 * "app/c.html" → "/app/c"); null for the special pages (_not-found, _global-error).
 */
export function routeOf(relativeHtmlPath) {
  const p = relativeHtmlPath.replace(/\\/g, "/").replace(/\.html$/, "");
  if (p === "index") return "/";
  if (p.split("/").some((s) => s.startsWith("_"))) return null;
  // Route groups "(name)" don't appear in URLs.
  return "/" + p.split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
}

/**
 * From { relativePath: html } of every prerendered page: the CSP per route, and the fallback CSP
 * (for the 404 / error pages and any other HTML response).
 */
export function buildPolicies(pages) {
  const routes = {};
  const special = [];
  for (const [rel, html] of Object.entries(pages)) {
    const route = routeOf(rel);
    const sources = inlineSources(html);
    if (route) routes[route] = pageCsp(sources);
    else special.push(sources);
  }
  return { routes, fallback: pageCsp(mergeSources(special)), nonHtml: NON_HTML_CSP, common: COMMON_HEADERS };
}

/** The CSP for a request path (trailing slash ignored) of an HTML response. */
export function cspForPath(policies, pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return policies.routes[path] ?? policies.fallback;
}
