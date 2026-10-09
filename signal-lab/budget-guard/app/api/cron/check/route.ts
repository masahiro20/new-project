import { timingSafeEqual } from "node:crypto";
import { getKV } from "@/lib/redis";
import { isDevEnv, usableSecret } from "@/lib/secrets";
import { cronBatchSize, runCronSlice } from "@/lib/guard/cron";

// Hourly check. Vercel (vercel.json, hourly) sends `Authorization: Bearer $CRON_SECRET`
// and, with CRON_BATCH_SIZE unset, checks every connection in one call. Cloudflare
// runs lib/guard/cron.ts directly from cf-worker.ts every minute in small slices; this
// route stays usable there for manual runs. Without CRON_SECRET it only works in development / test.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  // Unset: only in development / test (fail closed when NODE_ENV is unset or anything else).
  if (!process.env.CRON_SECRET) return isDevEnv();
  const secret = usableSecret("CRON_SECRET"); // weak / example value in production → deny
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await runCronSlice(getKV(), { batch: cronBatchSize() });
  // R1-01: undecryptable tokens make the run fail (500) so Vercel's cron log shows it; the work itself is done.
  return Response.json({ ok: !result.tokenErrors, ...result }, { status: result.tokenErrors ? 500 : 200 });
}
