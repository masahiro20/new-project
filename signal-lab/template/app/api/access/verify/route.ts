import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessCookieOptions, consumeMagicLink, signAccessToken } from "@/lib/access";
import { isActive, type Entitlement } from "@/lib/entitlements";
import { providerForCheckout, resolveEntitlement } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

// Signing in straight from /success only works shortly after purchase; later the
// buyer uses their license key or a magic link.
const SESSION_SIGNIN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** POST (form): token=<magic link token> | session_id=<checkout id>. Sets the access cookie and 303s to /app. */
export async function POST(request: NextRequest) {
  const kv = getKV();
  const back = (error: string) => NextResponse.redirect(new URL(`/access?error=${error}`, request.url), 303);
  if (!(await rateLimit(kv, `verify:${clientIp(request.headers)}`, 20, 600))) return back("limited");

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const sessionId = form?.get("session_id");

  let entitlement: Entitlement | null = null;
  if (typeof token === "string" && token) {
    const id = await consumeMagicLink(kv, token);
    entitlement = id ? await resolveEntitlement(kv, id) : null;
    if (!isActive(entitlement)) return back("token");
  } else if (typeof sessionId === "string" && providerForCheckout(sessionId)) {
    entitlement = await resolveEntitlement(kv, sessionId);
    if (!isActive(entitlement)) return back("license");
    if (Date.now() - Date.parse(entitlement.createdAt) > SESSION_SIGNIN_WINDOW_MS) return back("expired");
  } else {
    return back("license");
  }

  const response = NextResponse.redirect(new URL("/app", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await signAccessToken({ sub: entitlement.id, plan: entitlement.plan }), accessCookieOptions());
  return response;
}
