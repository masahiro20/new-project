import { key, type KV } from "../redis";
import { checkConnectionLocked } from "./service";
import { sweepPurchases } from "../payments/purchases";
import { MAX_DELETES_PER_SWEEP, MAX_PURCHASES_PER_SWEEP, SWEEP_EVERY_HOURS, sweepRetention } from "./retention";
import { hourIndex, intervalFor, isDue, nextCheckHour } from "./schedule";
import { listConnRefs, parseConnRef, rebuildConnIndex } from "./store";

// Hourly check, split into small slices so one invocation stays inside the Workers
// Free limits (10 ms CPU, 50 subrequests) — and inside Upstash's free 500k commands a
// month — however many connections there are.
//
// Every UTC hour has its own work list `bg:cron:{hour}:pending`: a "#<interval>" sentinel
// plus the connections (`acct|connId`) due in this hour. With many connections each one
// is checked every `interval` hours (lib/guard/schedule.ts: tiers by connection count, to
// stay inside Upstash's free tier); a connection is due when its hash slot matches the
// hour, so the load is spread evenly.
//   - Hour start: the first run that finds the list empty wins `SET init NX` and fills it
//     (SMEMBERS index + SADD + EXPIRE). Losers do nothing this minute.
//   - Each run: SMEMBERS the list, then for at most `batch` items:
//       checkConnectionLocked()  — SET NX on the per-connection lock (one runner per
//                                  connection, also against "Check now" / webhooks),
//                                  MGET, provider calls, MSET, DEL lock
//       SREM the item            — done for this hour
//     A run that dies mid-item leaves the item in the list and its lock to expire
//     (CONN_LOCK_SECONDS); a later run of the same hour picks it up. An item that keeps
//     throwing is dropped for this hour after MAX_ATTEMPTS (next hour starts fresh).
//   - When only the sentinel is left the hour is done; the isolate remembers that, so the rest of
//     the hour's runs cost no Upstash command at all (a new isolate pays one SMEMBERS).
// Notices and stops stay once a month: they are decided from the per-connection state
// (evaluate.ts), which only the lock holder reads and writes.
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
export const MAX_ATTEMPTS = 3;

const hourKey = (now: Date) => now.toISOString().slice(0, 13); // 2026-10-09T03
const SENTINEL_PREFIX = "#"; // "#2" = this hour's list was built with a 2-hour interval
const keys = (hour: string) => ({
  init: key("bg", "cron", hour, "init"),
  pending: key("bg", "cron", hour, "pending"),
  attempts: key("bg", "cron", hour, "attempts"),
});

/** The last hour this isolate saw finished: later runs of that hour need no KV at all. */
let finishedHour: string | null = null;
/** Tests: forget the in-memory "hour finished" flag (= a fresh isolate). */
export function resetCronMemory(): void {
  finishedHour = null;
}

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
  /** Upstash commands this run used. */
  commands: number;
  /** Check interval (hours) of this hour's list. */
  intervalHours: number;
  /** Accounts deleted by the retention sweep in this run. */
  deletedAccounts?: number;
  /** Purchase records deleted (past 7 years) in this run. */
  deletedPurchases?: number;
};

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Requests one item can take (lock, MGET, MSET, unlock, SREM + error bookkeeping). */
const KV_OPS_PER_ITEM = 7;

export async function runCronSlice(
  rawKv: KV,
  opts: { now?: Date; batch?: number; maxKvOps?: number; /** Tests: force the interval instead of the tier table. */ interval?: number } = {},
): Promise<CronSliceResult> {
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
  const result: CronSliceResult = { hour, initialized: false, checked: 0, skipped: 0, remaining: 0, notices: 0, errors: 0, commands: 0, intervalHours: 1 };
  const done = () => ((result.commands = kvOps), result);

  if (finishedHour === hour) return done(); // 0 commands

  let members = await kv.smembers(k.pending);
  if (members.length === 0) {
    // Not filled yet (or a filler died: init expires quickly so a later run retries).
    if (!(await kv.set(k.init, "1", { nx: true, ex: 120 }))) return done();
    let refs = await listConnRefs(kv);
    if (refs.length === 0 && (await rebuildConnIndex(kv)) > 0) refs = await listConnRefs(kv); // data from before the index
    const interval = opts.interval ?? intervalFor(refs.length);
    const due = refs.filter((ref) => isDue(parseConnRef(ref)?.id ?? ref, now, interval));
    const sentinel = `${SENTINEL_PREFIX}${interval}`;
    await kv.sadd(k.pending, sentinel, ...due);
    await kv.expire(k.pending, HOUR_TTL);
    members = [sentinel, ...due];
    result.initialized = true;
    // Retention: every few hours, the list-building run also deletes up to 2 accounts whose
    // subscription / trial ended more than 30 days ago (lib/guard/retention.ts).
    if (hourIndex(now) % SWEEP_EVERY_HOURS === 0) {
      try {
        const sweep = await sweepRetention(kv, now, MAX_DELETES_PER_SWEEP);
        result.deletedAccounts = sweep.deleted.length;
        // Purchase records past their 7-year (safe side) deletion date, bit by bit.
        const purchases = await sweepPurchases(kv, now, MAX_PURCHASES_PER_SWEEP);
        if (purchases.deleted) result.deletedPurchases = purchases.deleted;
      } catch (err) {
        console.error("[cron] retention sweep failed", err); // retried at the next sweep
      }
    }
  }
  const sentinel = members.find((m) => m.startsWith(SENTINEL_PREFIX));
  const interval = Math.max(1, Number(sentinel?.slice(1)) || 1);
  result.intervalHours = interval;
  const pending = shuffle(members.filter((m) => !m.startsWith(SENTINEL_PREFIX))); // shuffled: overlapping runs rarely contend
  if (pending.length === 0) {
    finishedHour = hour;
    return done();
  }

  const maxKvOps = opts.maxKvOps ?? (batch === Infinity ? Infinity : 34);
  let attempted = 0;
  for (const ref of pending) {
    if (attempted >= batch + 2 || result.checked + result.skipped + result.errors >= batch || kvOps + KV_OPS_PER_ITEM > maxKvOps) break;
    attempted++;
    const parsed = parseConnRef(ref);
    try {
      const r = parsed ? await checkConnectionLocked(kv, parsed.acct, parsed.id, now, {
            requireEntitlement: true,
            hour,
            schedule: { intervalHours: interval, nextCheckAt: nextCheckHour(parsed.id, now, interval).toISOString() },
          }) : ({ status: "missing" } as const);
      if (r.status === "busy") continue; // being checked elsewhere right now: stays in the list
      if (r.status === "checked") {
        result.checked++;
        result.notices += r.notices.length;
      } else result.skipped++; // removed, no longer monitored, or already checked this hour by an overlapping run
      await kv.srem(k.pending, ref);
    } catch (err) {
      result.errors++;
      const attempts = await kv.hincrby(k.attempts, ref, 1);
      if (attempts === 1) await kv.expire(k.attempts, HOUR_TTL);
      console.error(`[cron] ${ref} failed (attempt ${attempts}/${MAX_ATTEMPTS})`, err);
      if (attempts >= MAX_ATTEMPTS) await kv.srem(k.pending, ref); // give up for this hour; next hour starts fresh
    }
  }
  result.remaining = Math.max(0, pending.length - result.checked - result.skipped);
  if (result.remaining === 0) finishedHour = hour;
  return done();
}
