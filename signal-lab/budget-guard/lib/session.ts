import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ACCESS_COOKIE, accessCookieOptions, signAccessToken, verifyAccessToken } from "./access";
import { config } from "./config";
import { isActive, type Entitlement } from "./entitlements";
import { resolveEntitlement } from "./payments";
import { getKV } from "./redis";

// Request-bound access helpers (the "DAL"). They verify the signature AND the current
// entitlement status. There is no proxy.ts: Next 16 proxies run on the Node.js runtime,
// which OpenNext/Cloudflare supports only experimentally and which added ~5 MB to the
// Worker (docs/deploy-cloudflare.md). The /app layout's requireAccess() redirect covers it.

export type Access =
  | { gated: false; entitlement: null; plan: null } // access.gate = "none"
  | { gated: true; entitlement: Entitlement; plan: string };

/** The current visitor's access, or null. Cached per request. */
export const getAccess = cache(async (): Promise<Access | null> => {
  if (config.access.gate === "none") return { gated: false, entitlement: null, plan: null };
  const claims = await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!claims) return null;
  const entitlement = await resolveEntitlement(getKV(), claims.sub);
  return isActive(entitlement) ? { gated: true, entitlement, plan: entitlement.plan } : null;
});

/**
 * Call at the top of every page, layout, Server Action and Route Handler that
 * needs a paid user. Redirects to /access when there's no valid access.
 */
export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/access");
  return access;
}

/** Sets the signed access cookie. Server Actions / Route Handlers only. */
export async function grantAccess(entitlement: Entitlement): Promise<void> {
  const token = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
  (await cookies()).set(ACCESS_COOKIE, token, accessCookieOptions());
}

export async function revokeAccess(): Promise<void> {
  (await cookies()).delete(ACCESS_COOKIE);
}
