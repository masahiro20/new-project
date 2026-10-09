import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPolicies, COMMON_HEADERS, cspForPath, inlineSources, NON_HTML_CSP, pageCsp, REFERRER_POLICY, routeOf } from "@/lib/security-headers.mjs";

// lib/security-headers.mjs: per-page CSP from the prerendered HTML (scripts/security-headers.mjs).
const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const page = (body: string) =>
  `<!DOCTYPE html><html style="--accent:#b4232c;--accent-ink:#ffffff"><head><meta name="referrer" content="same-origin"/>` +
  `<script src="/_next/static/chunks/a.js" async=""></script></head><body>${body}` +
  `<script type="application/ld+json">{"@type":"X"}</script><script>(self.__next_f=self.__next_f||[]).push([0])</script>` +
  `<script id="_R_">self.x=&quot;1&quot;</script></body></html>`;

describe("security headers", () => {
  it("hashes executable inline scripts (not JSON-LD data blocks, not src scripts) and style attributes", () => {
    const s = inlineSources(page('<div style="display:contents"></div>'));
    expect(s.scripts).toEqual([sha("(self.__next_f=self.__next_f||[]).push([0])"), sha("self.x=&quot;1&quot;")].sort());
    expect(s.styleAttrs).toEqual([sha("--accent:#b4232c;--accent-ink:#ffffff"), sha("display:contents")].sort());
    expect(s.styles).toEqual([]);
  });

  it("the page CSP allows only those hashes: no 'unsafe-inline', no 'unsafe-eval', frames refused", () => {
    const csp = pageCsp(inlineSources(page("")));
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toMatch(/script-src 'self' 'sha256-/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'self' https://billing.stripe.com"); // "Manage billing" form → 303 to Stripe's portal
    expect(NON_HTML_CSP).toContain("default-src 'none'");
  });

  it("maps built files to routes; special pages make the fallback; trailing slash ignored", () => {
    expect(routeOf("index.html")).toBe("/");
    expect(routeOf("app/c.html")).toBe("/app/c");
    expect(routeOf("(product)/app.html")).toBe("/app");
    expect(routeOf("_not-found.html")).toBeNull();
    const p = buildPolicies({ "index.html": page("a"), "pricing.html": page("b"), "_not-found.html": page("c") });
    expect(Object.keys(p.routes).sort()).toEqual(["/", "/pricing"]);
    expect(cspForPath(p, "/pricing/")).toBe(p.routes["/pricing"]);
    expect(cspForPath(p, "/nope")).toBe(p.fallback);
  });

  it("common headers: nosniff, the same Referrer-Policy as the <meta> in the layout, Permissions-Policy", () => {
    expect(COMMON_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")).toContain(`"${REFERRER_POLICY}"`);
    expect(COMMON_HEADERS["Permissions-Policy"]).toContain("camera=()");
  });

  it("both builds run the post-build step (Vercel / next start, and Cloudflare)", () => {
    const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
    expect(scripts.build).toContain("scripts/security-headers.mjs next");
    expect(scripts["build:cf"]).toContain("scripts/security-headers.mjs cf");
  });
});
