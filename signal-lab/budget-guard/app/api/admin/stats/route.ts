import { timingSafeEqual } from "node:crypto";
import { getStats } from "@/lib/analytics";
import { getKV, key } from "@/lib/redis";

/** GET with `Authorization: Bearer $ADMIN_TOKEN` → last 14 days of counters + waitlist size. */
export async function GET(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response(null, { status: 404 });
  const kv = getKV();
  return Response.json({ waitlist: await kv.scard(key("waitlist")), days: await getStats(kv, 14) });
}
