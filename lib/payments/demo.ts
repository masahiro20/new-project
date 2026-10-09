// DEMO provider for P0. No money moves and nothing external is called.
// P0 keeps nothing on the server, so a demo checkout is a signed token instead of
// a stored record:  demo_<base64url(JSON{h,p,t})>.<base64url(HMAC-SHA256)>
//   h = input hash (binds the purchase to one facility's form, like Stripe metadata)
//   p = 1 once "paid" on /checkout/demo, t = issued-at (seconds)
// Uses Web Crypto only, so it runs on Node (Vercel) and Cloudflare Workers alike.

const PENDING_TTL_SECONDS = 60 * 60; // unpaid checkouts expire after 1 hour
const PAID_TTL_SECONDS = 7 * 24 * 60 * 60; // same window as a Stripe session

type Payload = { h: string; p: 0 | 1; t: number };

export const isDemoToken = (id: string) => /^demo_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(id);

function signingSecret(): string {
  const secret = process.env.DEMO_SIGNING_SECRET;
  if (secret) return secret;
  // Fall back only when explicitly in dev/test. Wrangler inlines NODE_ENV from the *build*
  // machine, so "not production" (e.g. NODE_ENV=staging or ci) must not mean "public secret".
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") return "dev-only-demo-signing-secret";
  throw new Error("DEMO_SIGNING_SECRET is not set");
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const hmacKey = () => crypto.subtle.importKey("raw", enc.encode(signingSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function hmac(data: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(data))));
}

/** Constant-time check (subtle.verify) instead of comparing strings. */
async function validSignature(data: string, sig: string): Promise<boolean> {
  let mac: Uint8Array<ArrayBuffer>;
  try {
    mac = fromB64url(sig);
  } catch {
    return false;
  }
  return crypto.subtle.verify("HMAC", await hmacKey(), mac, enc.encode(data));
}

async function sign(payload: Payload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `demo_${body}.${await hmac(body)}`;
}

/** Verifies signature and age; returns the payload or null. */
async function verify(token: string, now = Date.now()): Promise<Payload | null> {
  if (!isDemoToken(token)) return null;
  const [body, sig] = token.slice("demo_".length).split(".");
  if (!(await validSignature(body, sig))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Payload;
    const age = now / 1000 - payload.t;
    const ttl = payload.p ? PAID_TTL_SECONDS : PENDING_TTL_SECONDS;
    return age >= 0 && age < ttl ? payload : null;
  } catch {
    return null;
  }
}

/** Starts a demo checkout: returns the in-app card page URL. */
export async function createDemoCheckout(inputHash: string): Promise<string> {
  const token = await sign({ h: inputHash, p: 0, t: Math.floor(Date.now() / 1000) });
  return `/checkout/demo/?token=${token}`;
}

/** Marks a pending demo checkout paid (the card was already validated). Returns the paid token, or null. */
export async function payDemoCheckout(token: string): Promise<string | null> {
  const payload = await verify(token);
  if (!payload) return null;
  if (payload.p) return token;
  return sign({ h: payload.h, p: 1, t: Math.floor(Date.now() / 1000) });
}

/** True when the token is a valid, recent, paid demo checkout for exactly this input. */
export async function isDemoPaidFor(token: string, inputHash: string): Promise<boolean> {
  const payload = await verify(token);
  return !!payload && payload.p === 1 && payload.h === inputHash;
}
