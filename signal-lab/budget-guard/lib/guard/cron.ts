import { getEntitlement, isActive } from "../entitlements";
import { isDemoMode } from "../payments/mode";
import { key, type KV } from "../redis";
import { checkAccountDetailed } from "./service";
import { listConnRefs, parseConnRef, rebuildConnIndex } from "./store";

// Hourly check, split into small slices so one invocation stays inside the Workers
// Free limits (10 ms CPU, 50 subrequests) however many connections there are.
//
// Every UTC hour has its own work list: on the hour's first run, the connection index
// (`bg:allconns`, one SMEMBERS) is copied into `bg:cron:{hour}:pending`. Each run then
// takes at most `batch` connections from that set:
//   1. claim:   SET bg:cron:{hour}:item:{ref} running NX EX lease   (one runner per item)
//   2. check:   checkAccountDetailed(…, only = connId)  — itself under the per-connection
//               lock, so a parallel "Check now" / webhook can't run the same check
//   3. finish:  SET item = done (EX 3h), SREM pending
// A run that dies mid-item leaves the claim to expire (lease), and a later run of the
// same hour picks the item up again; a connection that keeps failing is given up for
// this hour after MAX_ATTEMPTS and retried next hour. Notices and stops stay once a
// month because they are decided from the per-connection state (evaluate.ts), which
// only one check at a time can read-and-write.
//
// Vercel: vercel.json calls /api/cron/check hourly with no batch limit → the whole list
// in one call. Cloudflare: a `* * * * *` trigger with CRON_BATCH_SIZE (wrangler.jsonc)
// → up to 60 small runs per hour.

const HOUR_TTL = 3 * 3600;

/** CRON_BATCH_SIZE (connections per run); unset = all of them (Vercel). */
export function cronBatchSize(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CRON_BATCH_SIZE);
  return Number.isInteger(n) && n > 0 ? n : Infinity;
}
export const CLAIM_LEASE_SECONDS = 5 * 60;
export const MAX_ATTEMPTS = 3;

const hourKey = (now: Date) => now.toISOString().slice(0, 13); // 2026-10-09T03
const keys = (hour: string) => ({
  init: key("bg", "cron", hour, "init"),
  pending: key("bg", "cron", hour, "pending"),
  attempts: key("bg", "cron", hour, "attempts"),
  item: (ref: string) => key("bg", "cron", hour, "item", ref),
});
const MIGRATED = key("bg", "allconns", "migrated");

export type CronSliceResult = {
  hour: string;
  /** This run created the hour's work list. */
  initialized: boolean;
  /** Connections checked in this run. */
  checked: number;
  /** Items finished without a check (no longer monitored / connection gone / gave up). */
  skipped: number;
  /** Items left for later runs this hour (approximate when runs overlap). */
  remaining: number;
  notices: number;
  errors: number;
};

const monitored = (e: Awaited<ReturnType<typeof getEntitlement>>) => isActive(e) && (e!.source !== "demo" || isDemoMode());

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** KV requests one connection check can take (claim … finish), for the subrequest budget. */
const KV_OPS_PER_ITEM = 16;

export async function runCronSlice(rawKv: KV, opts: { now?: Date; batch?: number; maxKvOps?: number } = {}): Promise<CronSliceResult> {
  // Count KV requests (each is one Upstash HTTP subrequest; Workers Free allows 50 per
  // run, and provider calls / mail need the rest): stop taking items near the budget.
  let kvOps = 0;
  const kv = new Proxy(rawKv, {
    get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...a: unknown[]) => (kvOps++, (t[p] as (...x: unknown[]) => unknown).apply(t, a)) : t[p]),
  }) as KV;
  const now = opts.now ?? new Date();
  const batch = Math.max(1, opts.batch ?? Infinity);
  const hour = hourKey(now);
  const k = keys(hour);
  const result: CronSliceResult = { hour, initialized: false, checked: 0, skipped: 0, remaining: 0, notices: 0, errors: 0 };

  if (!(await kv.get(k.init))) {
    if (!(await kv.get(MIGRATED))) {
      // Connections stored before the index existed: rebuild once (only when the index is empty).
      if ((await kv.scard(key("bg", "allconns"))) === 0) await rebuildConnIndex(kv);
      await kv.set(MIGRATED, "1");
    }
    const refs = await listConnRefs(kv);
    // Two runs may both get here; SADD is idempotent and finished items are guarded by their "done" claim.
    if (refs.length) {
      await kv.sadd(k.pending, ...refs);
      await kv.expire(k.pending, HOUR_TTL);
    }
    await kv.set(k.init, "1", { ex: HOUR_TTL });
    result.initialized = true;
  }

  const pending = shuffle(await kv.smembers(k.pending)); // shuffled: overlapping runs rarely contend for the same item
  // Every claim attempt costs subrequests, so cap them too (not only successful checks).
  const maxClaims = batch === Infinity ? Infinity : batch + 4;
  const maxKvOps = opts.maxKvOps ?? (batch === Infinity ? Infinity : 34);
  let claims = 0;
  let handled = 0;
  for (const ref of pending) {
    if (handled >= batch || claims >= maxClaims || kvOps + KV_OPS_PER_ITEM > maxKvOps) break;
    claims++;
    if (!(await kv.set(k.item(ref), "running", { nx: true, ex: CLAIM_LEASE_SECONDS }))) {
      // Running elsewhere — or already done and re-added by a racing hour init: drop it from the list.
      if ((await kv.get(k.item(ref))) === "done") await kv.srem(k.pending, ref);
      continue;
    }
    handled++;
    const finish = async () => {
      await kv.set(k.item(ref), "done", { ex: HOUR_TTL });
      await kv.srem(k.pending, ref);
    };
    const parsed = parseConnRef(ref);
    try {
      const ent = parsed ? await getEntitlement(kv, parsed.acct) : null;
      if (!parsed || !monitored(ent)) {
        result.skipped++; // lapsed subscriptions stop being monitored
        await finish();
        continue;
      }
      const r = await checkAccountDetailed(kv, parsed.acct, ent!.email, now, parsed.id);
      if (r.busy.length) {
        await kv.del(k.item(ref)); // a "Check now" holds the connection: retry in a later run
        continue;
      }
      if (r.checked === 0) result.skipped++; // connection was removed
      else result.checked++;
      result.notices += r.notices.length;
      await finish();
    } catch (err) {
      result.errors++;
      const attempts = await kv.hincrby(k.attempts, ref, 1);
      await kv.expire(k.attempts, HOUR_TTL);
      console.error(`[cron] ${ref} failed (attempt ${attempts}/${MAX_ATTEMPTS})`, err);
      if (attempts >= MAX_ATTEMPTS) await finish(); // give up for this hour; next hour starts fresh
      else await kv.del(k.item(ref)); // retry in a later run this hour
    }
  }
  result.remaining = Math.max(0, pending.length - result.checked - result.skipped);
  return result;
}
