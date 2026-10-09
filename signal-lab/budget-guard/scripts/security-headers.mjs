// Post-build: security headers with a per-page CSP (hashes of each page's inline scripts).
// Policy and reasons: lib/security-headers.mjs. Run by package.json:
//   npm run build     → `next build && node scripts/security-headers.mjs next`
//                       Writes the headers into .next/routes-manifest.json, which `next start` and
//                       Vercel apply to every response (static pages included). OpenNext's
//                       `build:cf` runs `npm run build` too, so its copy of the manifest has them.
//   npm run build:cf  → … && node scripts/security-headers.mjs cf
//                       Writes .open-next/security-headers.json (cf-worker.ts sets the headers on
//                       every Worker response) and .open-next/assets/_headers (files the static
//                       assets binding serves without running the Worker).
// Idempotent; fails the build if no page is found (the CSP would otherwise block every page).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { buildPolicies, NON_HTML_CSP } from "../lib/security-headers.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const mode = process.argv[2];
if (mode !== "next" && mode !== "cf") {
  console.error("usage: node scripts/security-headers.mjs next|cf");
  process.exit(2);
}

function htmlFiles(dir, base = dir, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, base, out);
    else if (e.name.endsWith(".html")) out[path.relative(base, p)] = readFileSync(p, "utf8");
  }
  return out;
}

const appDir = path.join(root, ".next/server/app");
const pages = htmlFiles(appDir);
const policies = buildPolicies(pages);
if (Object.keys(policies.routes).length === 0) {
  console.error("[security-headers] no prerendered pages found in .next/server/app");
  process.exit(1);
}
const toList = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }));

if (mode === "next") {
  const require = createRequire(path.join(root, "package.json"));
  const { buildCustomRoute } = require("next/dist/lib/build-custom-route.js");
  const manifestPath = path.join(root, ".next/routes-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ours = (h) => h.headers?.some((x) => x.key === "X-Security-Headers");
  const rule = (source, headers) => buildCustomRoute("header", { source, headers: [...toList(headers), { key: "X-Security-Headers", value: "1" }] });
  // Later rules override earlier ones for the same header (Next.js and Vercel), so: everything
  // gets the common headers + the fallback page CSP, API responses the non-HTML CSP, and each
  // prerendered page its own CSP.
  const generated = [
    rule("/:path*", { ...policies.common, "Content-Security-Policy": policies.fallback }),
    rule("/api/:path*", { "Content-Security-Policy": NON_HTML_CSP }),
    ...Object.entries(policies.routes).map(([route, csp]) => rule(route, { "Content-Security-Policy": csp })),
  ];
  manifest.headers = [...(manifest.headers ?? []).filter((h) => !ours(h)), ...generated];
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(path.join(root, ".next/security-headers.json"), JSON.stringify(policies, null, 2));
  console.log(`[security-headers] routes-manifest: ${generated.length} header rules (${Object.keys(policies.routes).length} pages)`);
} else {
  const outDir = path.join(root, ".open-next");
  if (!existsSync(outDir)) {
    console.error("[security-headers] .open-next not found: run opennextjs-cloudflare build first");
    process.exit(1);
  }
  writeFileSync(path.join(outDir, "security-headers.json"), JSON.stringify(policies, null, 2));
  // Files served straight from the assets binding (/_next/static/…, icons, images): no HTML.
  const lines = ["/*", ...toList({ ...policies.common, "Content-Security-Policy": NON_HTML_CSP }).map(({ key, value }) => `  ${key}: ${value}`)];
  writeFileSync(path.join(outDir, "assets/_headers"), lines.join("\n") + "\n");
  console.log(`[security-headers] .open-next/security-headers.json (${Object.keys(policies.routes).length} pages) + assets/_headers`);
}
