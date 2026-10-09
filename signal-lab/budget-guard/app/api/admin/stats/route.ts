import { timingSafeEqual } from "node:crypto";
import { getStats } from "@/lib/analytics";
import { getKV, key } from "@/lib/redis";
import { trialMetrics } from "@/lib/guard/admin";

/** GET with `Authorization: Bearer $ADMIN_TOKEN` → last 14 days of counters, waitlist size and trial metrics (lib/guard/admin.ts). */
export async function GET(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return new Response(null, { status: 404 });
  const kv = getKV();
  return Response.json(
    { waitlist: await kv.scard(key("waitlist")), days: await getStats(kv, 14), trial: await trialMetrics(kv) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
