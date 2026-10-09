import { jwtVerify, SignJWT } from "jose";
import { config } from "./config";
export { ACCESS_COOKIE } from "./config";
import { findByEmail } from "./entitlements";
import { t } from "./i18n";
import { sendMail } from "./mail";
import { key, type KV } from "./redis";
import { assertSecretUsable, isDevEnv } from "./secrets";
import { isBuildPhase, isProduction, siteUrl, warnOnce } from "./site";

// Pure access primitives (no next/* imports) so they run under vitest.
// The request-bound helpers (cookie → account, Origin check) live in lib/api.ts.

const DEV_SECRET = "signal-lab-dev-secret-do-not-use-in-production-0000";

export function accessSecret(env: Record<string, string | undefined> = process.env): Uint8Array {
  const secret = env.ACCESS_SECRET;
  if (secret) {
    if (secret.length < 32) throw new Error("ACCESS_SECRET must be at least 32 characters");
    assertSecretUsable("ACCESS_SECRET", secret, env); // production: no published / placeholder / weak value (R1-13)
    return new TextEncoder().encode(secret);
  }
  // Fail closed (like TOKEN_ENCRYPTION_KEY, R1-04): the public dev secret only when NODE_ENV says
  // development / test — not when it is unset or anything else (e.g. a Worker bundle without it).
  if (!isDevEnv(env) && !isBuildPhase()) throw new Error("ACCESS_SECRET must be set");
  warnOnce("access-secret", "[access] ACCESS_SECRET is not set — using a fixed dev secret.");
  return new TextEncoder().encode(DEV_SECRET);
}

export type AccessClaims = { sub: string; plan: string; iat?: number };

export async function signAccessToken(claims: AccessClaims, secret = accessSecret(), days = config.access.sessionDays): Promise<string> {
  return new SignJWT({ plan: claims.plan })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setAudience(config.slug)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret);
}

export async function verifyAccessToken(token: string | undefined, secret = accessSecret()): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: config.slug });
    if (!payload.sub || typeof payload.plan !== "string") return null;
    return { sub: payload.sub, plan: payload.plan, iat: payload.iat };
  } catch {
    return null;
  }
}

export function accessCookieOptions(days = config.access.sessionDays) {
  return { httpOnly: true, secure: isProduction(), sameSite: "lax" as const, path: "/", maxAge: days * 24 * 60 * 60 };
}

// ---------- magic links ----------

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Buffer.from(digest).toString("hex");
}
// Only the hash is stored, so a KV leak doesn't yield usable links.
const magicKey = async (token: string) => key("magic", await sha256(token));

/**
 * Emails a single-use sign-in link if `email` has an entitlement; silently does
 * nothing otherwise. Callers must respond identically either way (run it in
 * after() so timing doesn't leak either). Returns the token for tests.
 */
export async function requestMagicLink(kv: KV, email: string, send = sendMail): Promise<string | null> {
  const entitlement = await findByEmail(kv, email);
  if (!entitlement) return null;
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  await kv.set(await magicKey(token), entitlement.id, { ex: MAGIC_LINK_TTL_SECONDS });
  const url = `${siteUrl()}/access?token=${token}`;
  await send({ to: entitlement.email, subject: t.mail.magicSubject(config.name), text: t.mail.magicBody(config.name, url) });
  return token;
}

/** Returns the entitlement id once; any later use (or after 15 min) returns null. */
export async function consumeMagicLink(kv: KV, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return kv.getdel(await magicKey(token));
}
