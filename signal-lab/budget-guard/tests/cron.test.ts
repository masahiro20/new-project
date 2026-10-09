import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Count provider calls made through the offline demo API (each would be a subrequest).
const providerCalls = { n: 0 };
vi.mock("@/lib/guard/demo", async (orig) => {
  const mod = await orig<typeof import("@/lib/guard/demo")>();
  return {
    ...mod,
    demoFetch: (...args: Parameters<typeof mod.demoFetch>) => {
      const f = mod.demoFetch(...args);
      const wrapped = Object.assign((url: string, init: RequestInit) => (providerCalls.n++, f(url, init)), { calls: f.calls });
      return wrapped as typeof f;
    },
  };
});

import { upsertEntitlement } from "@/lib/entitlements";
import { cronBatchSize, MAX_ATTEMPTS, resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { CONN_LOCK_SECONDS } from "@/lib/guard/service";
import { addConnection, getLog, MAX_CONNECTIONS } from "@/lib/guard/store";
import { createMemoryKV, type KV } from "@/lib/redis";

const HOUR = Date.parse("2026-10-09T03:00:00Z");
const target = { provider: "openai" as const, projectId: "proj_1" }; // demo spend $85

/** KV wrapper: counts every operation (= one Upstash command / HTTP subrequest) and every state write per connection. */
export function counted(kv: KV) {
  const stats = { ops: 0, stateWrites: new Map<string, number>(), failNextMset: 0 };
  const wrapped = new Proxy(kv, {
    get(target, prop: keyof KV) {
      const fn = target[prop];
      if (typeof fn !== "function") return fn;
      return async (...args: unknown[]) => {
        stats.ops++;
        if (prop === "mset" && stats.failNextMset > 0) {
          stats.failNextMset--;
          throw new Error("injected KV failure");
        }
        const written = prop === "mset" ? Object.keys(args[0] as object) : prop === "set" ? [String(args[0])] : [];
        for (const k of written) if (/:state:conn_/.test(k)) stats.stateWrites.set(k, (stats.stateWrites.get(k) ?? 0) + 1);
        return (fn as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      };
    },
  });
  return { kv: wrapped, stats };
}

async function seed(kv: KV, connections: number, budgetUsd = 100) {
  const ids: string[] = [];
  for (let a = 0; ids.length < connections; a++) {
    const { entitlement } = await upsertEntitlement(kv, { id: `cs_test_acct${a}`, email: `a${a}@example.com`, plan: "monthly", source: "stripe" });
    for (let c = 0; c < MAX_CONNECTIONS && ids.length < connections; c++) {
      ids.push((await addConnection(kv, entitlement.id, { label: `C${c}`, target, budgetUsd, token: "demo" })).id);
    }
  }
  return ids;
}

beforeEach(() => resetCronMemory());
afterEach(() => {
  providerCalls.n = 0;
  vi.unstubAllEnvs();
});

describe("cron slices (Cloudflare: * * * * * + CRON_BATCH_SIZE)", () => {
  it("CRON_BATCH_SIZE: unset = everything (Vercel), else a positive integer", () => {
    expect(cronBatchSize({})).toBe(Infinity);
    expect(cronBatchSize({ CRON_BATCH_SIZE: "3" })).toBe(3);
    expect(cronBatchSize({ CRON_BATCH_SIZE: "0" })).toBe(Infinity);
    expect(cronBatchSize({ CRON_BATCH_SIZE: "x" })).toBe(Infinity);
  });

  it("100 connections: checked once each within the hour, every run under 50 subrequests", async () => {
    let now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    const ids = await seed(kv, 100);
    let checked = 0;
    let notices = 0;
    let maxSubrequests = 0;
    let runs = 0;
    for (let minute = 0; minute < 60 && checked < 100; minute++) {
      now = HOUR + minute * 60_000 + 1000;
      const ops0 = stats.ops;
      const calls0 = providerCalls.n;
      const r = await runCronSlice(kv, { now: new Date(now), batch: 2 });
      runs++;
      expect(r.errors).toBe(0);
      checked += r.checked;
      notices += r.notices;
      // KV ops + provider calls + one email (Resend) and one Slack post per notice.
      maxSubrequests = Math.max(maxSubrequests, stats.ops - ops0 + (providerCalls.n - calls0) + 2 * r.notices);
    }
    expect(checked).toBe(100);
    expect(runs).toBeLessThanOrEqual(52); // 100 / 2 per run fits in the 60 runs of an hour
    expect(maxSubrequests).toBeLessThan(50);
    for (const id of ids) expect([...stats.stateWrites].filter(([k]) => k.endsWith(id)).map(([, n]) => n)).toEqual([1]);
    expect(notices).toBe(100); // one 80% alert per connection
    // Later runs in the same hour have nothing left to do.
    expect((await runCronSlice(kv, { now: new Date(now + 60_000), batch: 2 })).checked).toBe(0);
  });

  it("overlapping runs never check the same connection twice in an hour", async () => {
    let now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    await seed(kv, 30);
    for (let minute = 0; minute < 10; minute++) {
      now = HOUR + minute * 60_000;
      await Promise.all([1, 2, 3, 4].map(() => runCronSlice(kv, { now: new Date(now), batch: 2 })));
    }
    expect(stats.stateWrites.size).toBe(30);
    expect([...stats.stateWrites.values()].every((n) => n === 1)).toBe(true);
  });

  it("next hour re-checks; notices and the (test-mode) stop stay once a month", async () => {
    let now = HOUR;
    const kv = createMemoryKV(() => now);
    await seed(kv, 1, 10); // $85 of $10 → limit + stop
    const first = await runCronSlice(kv, { now: new Date(now), batch: 2 });
    expect(first).toMatchObject({ checked: 1, notices: 2 }); // limit + test-mode stop
    now = HOUR + 3600_000;
    const second = await runCronSlice(kv, { now: new Date(now), batch: 2 });
    expect(second).toMatchObject({ initialized: true, checked: 1, notices: 0 });
  });

  it("a failing check is retried in a later run, and given up for the hour after MAX_ATTEMPTS", async () => {
    let now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    await seed(kv, 1);
    stats.failNextMset = 1;
    const r1 = await runCronSlice(kv, { now: new Date(now), batch: 2 });
    expect(r1).toMatchObject({ checked: 0, errors: 1, remaining: 1 });
    now += 60_000;
    const r2 = await runCronSlice(kv, { now: new Date(now), batch: 2 });
    expect(r2).toMatchObject({ checked: 1, errors: 0 });

    // Always failing → given up after MAX_ATTEMPTS runs, not retried forever.
    now = HOUR + 3600_000;
    let errors = 0;
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      stats.failNextMset = 1;
      errors += (await runCronSlice(kv, { now: new Date(now + i * 60_000), batch: 2 })).errors;
    }
    expect(errors).toBe(MAX_ATTEMPTS);
  });

  it("a run that died mid-item: its lock expires and a later run of the hour finishes the item", async () => {
    let now = HOUR;
    const kv = createMemoryKV(() => now);
    const [id] = await seed(kv, 1);
    // The crashed run had the lock (and never removed the item from the list).
    await kv.set(`budget-guard:bg:lock:${id}`, "crashed", { ex: CONN_LOCK_SECONDS });
    expect(await runCronSlice(kv, { now: new Date(now), batch: 2 })).toMatchObject({ initialized: true, checked: 0, remaining: 1 });
    now += (CONN_LOCK_SECONDS + 1) * 1000;
    expect((await runCronSlice(kv, { now: new Date(now), batch: 2 })).checked).toBe(1);
  });

  it("waits for a running 'Check now' (per-connection lock) instead of checking in parallel", async () => {
    let now = HOUR;
    const kv = createMemoryKV(() => now);
    const [id] = await seed(kv, 1);
    await kv.set(`budget-guard:bg:lock:${id}`, "held", { ex: CONN_LOCK_SECONDS });
    expect(await runCronSlice(kv, { now: new Date(now), batch: 2 })).toMatchObject({ checked: 0, remaining: 1 });
    await kv.del(`budget-guard:bg:lock:${id}`);
    now += 60_000;
    expect((await runCronSlice(kv, { now: new Date(now), batch: 2 })).checked).toBe(1);
    expect((await getLog(kv, "cs_test_acct0")).length).toBe(1);
  });

  it("lapsed accounts are skipped, and connections from before the index are found (migration)", async () => {
    const now = HOUR;
    const kv = createMemoryKV(() => now);
    await seed(kv, 2);
    await addConnection(kv, "cs_test_lapsed", { label: "x", target, budgetUsd: 1, token: "demo" }); // no entitlement
    await kv.del("budget-guard:bg:allconns"); // data written before the index existed
    const r = await runCronSlice(kv, { now: new Date(now) }); // Vercel: no batch limit
    expect(r).toMatchObject({ initialized: true, checked: 2, skipped: 1, remaining: 0 });
  });
});
