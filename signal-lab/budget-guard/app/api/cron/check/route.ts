import { timingSafeEqual } from "node:crypto";
import { getKV } from "@/lib/redis";
import { isProduction } from "@/lib/site";
import { checkAll } from "@/lib/guard/service";

// Hourly check (vercel.json cron). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Without CRON_SECRET the route only works outside production.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !isProduction();
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await checkAll(getKV());
  return Response.json({ ok: true, ...result });
}
