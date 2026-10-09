import { forbiddenOrigin, json, readCookie, readJson, sameOrigin, unauthorized } from "@/lib/api";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { getPlan } from "@/lib/config";
import { entitlementKeys, getEntitlement, isActive, sessionRevoked } from "@/lib/entitlements";
import { getDemoCheckout, isDemoCheckoutId, setDemoPlanStatus } from "@/lib/payments/demo";
import { demoCheckoutEnabled } from "@/lib/payments/mode";
import { getKV } from "@/lib/redis";

// Stand-in for the Stripe billing portal. Reads the signed cookie directly (not the
// active-entitlement check) so a canceled demo plan can still be reactivated here.

async function demoClaims(request: Request) {
  const claims = await verifyAccessToken(readCookie(request, ACCESS_COOKIE));
  if (!claims || !isDemoCheckoutId(claims.sub)) return null;
  // Same server-side sign-out check as accountFrom (lib/api.ts).
  if (sessionRevoked(claims.iat, await getKV().get(entitlementKeys.sessAfter(claims.sub)))) return null;
  return claims;
}

export async function GET(request: Request) {
  if (!demoCheckoutEnabled()) return json({ state: "disabled" }, 404);
  const claims = await demoClaims(request);
  if (!claims) return unauthorized();
  const kv = getKV();
  const entitlement = await getEntitlement(kv, claims.sub);
  if (!entitlement) return unauthorized();
  const checkout = await getDemoCheckout(kv, claims.sub);
  return json({ planLabel: getPlan(entitlement.plan)?.label ?? entitlement.plan, status: entitlement.status, active: isActive(entitlement), last4: checkout?.last4 ?? null });
}

/** POST (JSON {action: "cancel" | "reactivate"}). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  if (!demoCheckoutEnabled()) return json({ state: "disabled" }, 404);
  const claims = await demoClaims(request);
  if (!claims) return unauthorized();
  const body = await readJson(request);
  const action = body?.action === "reactivate" ? "reactivate" : "cancel";
  const e = await setDemoPlanStatus(getKV(), claims.sub, action);
  if (!e) return unauthorized();
  return json({ ok: true, done: action, status: e.status, active: isActive(e) });
}
