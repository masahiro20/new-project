import type { KV } from "./redis";
import { key } from "./redis";

/** Fixed-window limiter shared across instances via KV. Returns true if allowed. */
export async function rateLimit(kv: KV, name: string, limit: number, windowSeconds: number): Promise<boolean> {
  const k = key("rl", name);
  const count = await kv.incr(k);
  if (count === 1) await kv.expire(k, windowSeconds);
  return count <= limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
