import { ACCESS_COOKIE, verifyAccessToken } from "./access";
import { config } from "./config";
import { isActive, type Entitlement } from "./entitlements";
import { resolveEntitlement } from "./payments";
import type { KV } from "./redis";
import { siteUrl } from "./site";

// Helpers for the JSON route handlers behind the client-rendered pages (/app,
// /checkout/demo, /success, /access). Plain Request → Response, no next/headers, so the
// routes run under vitest as well as in Next / OpenNext.
//
// CSRF: the access cookie is SameSite=Lax (not sent on cross-site POST/fetch), and
// every state-changing route additionally requires an Origin header that matches this
// site (browsers send Origin on every POST, fetch or form). JSON bodies also force a
// CORS preflight cross-origin, which we never answer.

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const unauthorized = () => json({ error: "unauthorized" }, 401);
export const forbiddenOrigin = () => json({ error: "bad origin" }, 403);
export const badRequest = (error = "bad request") => json({ error }, 400);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** True when the request comes from this site's own pages (CSRF check for POST/DELETE). */
export function sameOrigin(request: Request, extra: string[] = [siteUrl()]): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set([originOf(request.url), ...extra.map(originOf)].filter(Boolean));
  // Proxies may send comma-separated lists, mixed case or an explicit default port;
  // normalise through URL so "Example.com:443" matches the browser's "https://example.com".
  const first = (name: string) => request.headers.get(name)?.split(",")[0]?.trim() || undefined;
  const host = first("x-forwarded-host") ?? first("host");
  if (host) {
    const proto = first("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    const forwarded = originOf(`${proto}://${host}`);
    if (forwarded) allowed.add(forwarded);
  }
  return allowed.has(originOf(origin) ?? "");
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export type Account = { id: string; email: string; entitlement: Entitlement };

/** Signed cookie (jose) + an active entitlement. null → 401. */
export async function accountFrom(request: Request, kv: KV): Promise<Account | null> {
  if (config.access.gate !== "license") return null; // Budget Guard needs per-buyer accounts
  const claims = await verifyAccessToken(readCookie(request, ACCESS_COOKIE));
  if (!claims) return null;
  const entitlement = await resolveEntitlement(kv, claims.sub);
  return isActive(entitlement) ? { id: entitlement.id, email: entitlement.email, entitlement } : null;
}

/**
 * Auth gate for /api/app/*: Origin check first for mutations (403), then the cookie (401).
 * Returns the account or the Response to send.
 */
export async function guard(request: Request, kv: KV, opts: { mutation: boolean }): Promise<Account | Response> {
  if (opts.mutation && !sameOrigin(request)) return forbiddenOrigin();
  return (await accountFrom(request, kv)) ?? unauthorized();
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
