import { z } from "zod";
import { CLIENT_EVENTS, track } from "@/lib/analytics";
import { clientIp } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

const schema = z.object({ event: z.enum(CLIENT_EVENTS) });

// Per-isolate limiter (no Upstash command): pageviews are only anonymous counters, so an
// approximate per-instance limit is enough, and it keeps a pageview at ONE command
// (HINCRBY) for the Upstash free-tier budget (docs/deploy-cloudflare.md §7.1).
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;
const hits = new Map<string, { n: number; until: number }>();
function allowed(ip: string, now = Date.now()): boolean {
  if (hits.size > 10_000) hits.clear(); // bounded memory
  const h = hits.get(ip);
  if (!h || h.until <= now) {
    hits.set(ip, { n: 1, until: now + WINDOW_MS });
    return true;
  }
  return ++h.n <= LIMIT;
}

/** sendBeacon target. Only pageview / cta_click are accepted from browsers. */
export async function POST(request: Request) {
  let data: unknown = null;
  try {
    data = JSON.parse(await request.text()); // sendBeacon sends text/plain
  } catch {}
  const parsed = schema.safeParse(data);
  if (!parsed.success) return new Response(null, { status: 400 });
  if (allowed(clientIp(request.headers))) await track(getKV(), parsed.data.event);
  return new Response(null, { status: 204 });
}
