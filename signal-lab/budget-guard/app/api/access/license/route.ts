import { NextResponse } from "next/server";
import { badRequest, forbiddenOrigin, json, readJson, sameOrigin } from "@/lib/api";
import { ACCESS_COOKIE, accessCookieOptions, signAccessToken } from "@/lib/access";
import { isActive } from "@/lib/entitlements";
import { t } from "@/lib/i18n";
import { normalizeLicenseKey } from "@/lib/license";
import { resolveLicense } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

/** POST (JSON {license}): sign in with a license key. Sets the access cookie. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin(); // login CSRF
  const kv = getKV();
  if (!(await rateLimit(kv, `license:${clientIp(request.headers)}`, 10, 600))) return json({ error: t.access.limited }, 429);
  const body = await readJson(request);
  if (!body) return badRequest();
  const licenseKey = normalizeLicenseKey(String(body.license ?? ""));
  let entitlement;
  try {
    entitlement = licenseKey ? await resolveLicense(kv, licenseKey) : null;
  } catch (err) {
    // Stripe unreachable (cache miss → provider lookup): a temporary failure, not a wrong key and not a 500 (Ren QA).
    console.error("[access] license lookup failed", err instanceof Error ? err.message : err);
    return json({ error: "Could not check the license right now. Please try again in a minute." }, 503);
  }
  if (!isActive(entitlement)) return json({ error: t.access.invalidLicense }, 401);
  const res = NextResponse.json({ ok: true, redirect: "/app" }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(ACCESS_COOKIE, await signAccessToken({ sub: entitlement.id, plan: entitlement.plan }), accessCookieOptions());
  return res;
}
