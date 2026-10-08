import { createHash } from "node:crypto";

// Rate limiting for paths that spend API money. With UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN set, counts are shared across all serverless
// instances; otherwise (local dev, or Redis unreachable) a per-instance memory
// counter is used, which only caps abuse per instance.

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

/** Fixed-window counter in Upstash Redis via its REST API. Returns null when Redis isn't usable. */
async function allowInRedis(key: string, limit: number, windowMs: number): Promise<boolean | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `rl:${key}`;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["SET", redisKey, "0", "PX", String(windowMs), "NX"],
        ["INCR", redisKey],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    const [, incr] = (await res.json()) as { result?: number; error?: string }[];
    if (typeof incr?.result !== "number") throw new Error(incr?.error ?? "unexpected Upstash response");
    return incr.result <= limit;
  } catch (error) {
    console.error("shared rate limit unavailable, using per-instance limit", error);
    return null;
  }
}

export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  return (await allowInRedis(key, limit, windowMs)) ?? allowInMemory(key, limit, windowMs);
}

/** Client IP as set by the hosting proxy. Vercel sets x-real-ip and overwrites x-forwarded-for. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** Hashed so raw IP addresses are never written to the shared store. */
export function ipKey(request: Request): string {
  return createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 24);
}
