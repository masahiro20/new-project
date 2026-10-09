import { createHash } from "node:crypto";

// Rate limiting for paths that spend API money. With UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN set, counts are shared across all serverless
// instances; otherwise (local dev, or Redis unreachable) a per-instance memory
// counter is used, which only caps abuse per instance. Limits that guard free AI
// spend pass failClosed, so with a real Anthropic key they refuse instead.

const hits = new Map<string, number[]>();

function allowInMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * Fixed-window counter in Upstash Redis via its REST API. Returns null when Redis isn't usable.
 * Sent as a transaction (multi-exec), not a pipeline, and PTTL is read back: a key that expired between
 * SET NX PX and INCR would otherwise be left with no TTL and block that key (an IP or a purchase) forever.
 */
async function allowInRedis(key: string, limit: number, windowMs: number): Promise<boolean | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `rl:${key}`;
  try {
    const send = (path: string, commands: string[][]) =>
      fetch(`${url.replace(/\/$/, "")}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(commands),
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      });
    const res = await send("multi-exec", [
      ["SET", redisKey, "0", "PX", String(windowMs), "NX"],
      ["INCR", redisKey],
      ["PTTL", redisKey],
    ]);
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    const [, incr, pttl] = (await res.json()) as { result?: number; error?: string }[];
    if (typeof incr?.result !== "number") throw new Error(incr?.error ?? "unexpected Upstash response");
    // Self-heal a counter left without a TTL (-1); best effort, the count above is still valid.
    if (pttl?.result === -1) await send("pipeline", [["PEXPIRE", redisKey, String(windowMs)]]).catch(() => undefined);
    return incr.result <= limit;
  } catch (error) {
    console.error("shared rate limit unavailable, using per-instance limit", error);
    return null;
  }
}

/**
 * failClosed: for limits that guard AI spend with no payment behind it (free preview, demo purchases
 * with real AI). When the shared store is missing, failing, or out of its free quota (an attacker can
 * burn it) and a real Anthropic key is set, refuse instead of falling back to the per-instance
 * counter, which barely limits on Workers (requests spread over many short-lived isolates).
 * RATE_LIMIT_ALLOW_MEMORY=1 opts back into the in-memory fallback (e.g. a local test with a real key).
 */
export async function checkLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: { failClosed?: boolean } = {},
): Promise<"ok" | "limited" | "unavailable"> {
  const shared = await allowInRedis(key, limit, windowMs);
  if (shared !== null) return shared ? "ok" : "limited";
  // The store is down: refusing here is not the caller's limit being reached, so say so (callers show a retry message).
  if (opts.failClosed && process.env.ANTHROPIC_API_KEY && process.env.RATE_LIMIT_ALLOW_MEMORY !== "1") return "unavailable";
  return allowInMemory(key, limit, windowMs) ? "ok" : "limited";
}

export async function allow(key: string, limit: number, windowMs: number, opts: { failClosed?: boolean } = {}): Promise<boolean> {
  return (await checkLimit(key, limit, windowMs, opts)) === "ok";
}

/** Client IP as set by the hosting proxy: Cloudflare sets cf-connecting-ip, Vercel x-real-ip. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * The unit one client controls: an IPv4 address, or the /64 of an IPv6 address (a single host usually
 * holds a whole /64, so per-address limits would be free to bypass). IPv4-mapped/embedded addresses
 * (::ffff:a.b.c.d) count as IPv4; a zone id (%eth0) is dropped.
 */
export function rateLimitSubject(ip: string): string {
  if (!ip.includes(":")) return ip;
  const addr = ip.toLowerCase().split("%")[0];
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (v4) return v4[1];
  const [head, tail = ""] = addr.split("::");
  const left = head ? head.split(":") : [];
  const right = addr.includes("::") && tail ? tail.split(":") : [];
  const groups = addr.includes("::") ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/** Hashed so raw IP addresses are never written to the shared store. */
export function ipKey(request: Request): string {
  return createHash("sha256").update(rateLimitSubject(clientIp(request))).digest("hex").slice(0, 24);
}
