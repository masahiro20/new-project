import { z } from "zod";
import { CLIENT_EVENTS, track } from "@/lib/analytics";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

const schema = z.object({ event: z.enum(CLIENT_EVENTS) });

/** sendBeacon target. Only pageview / cta_click are accepted from browsers. */
export async function POST(request: Request) {
  let data: unknown = null;
  try {
    data = JSON.parse(await request.text()); // sendBeacon sends text/plain
  } catch {}
  const parsed = schema.safeParse(data);
  if (!parsed.success) return new Response(null, { status: 400 });
  const kv = getKV();
  if (await rateLimit(kv, `track:${clientIp(request.headers)}`, 120, 600)) await track(kv, parsed.data.event);
  return new Response(null, { status: 204 });
}
