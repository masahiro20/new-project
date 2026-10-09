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

import { demoFetch } from "@/lib/guard/demo";
import { setStatus, upsertEntitlement } from "@/lib/entitlements";
import { FAKE_TOKEN } from "./helpers/providers";
import { cronBatchSize, DEMO_CHECKS_PER_HOUR, DEMO_INTERVAL_HOURS, MAX_ATTEMPTS, pickDemo, resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { CHECK_INTERVAL_TIERS, intervalFor, isDue, nextCheckHour, slotOf } from "@/lib/guard/schedule";
import { dashboardView } from "@/lib/guard/views";
import { CONN_LOCK_SECONDS } from "@/lib/guard/service";
import { addConnection, connRef, getLog, listConnRefs, listDemoConnRefs, MAX_CONNECTIONS } from "@/lib/guard/store";
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
      ids.push((await addConnection(kv, entitlement.id, { label: `C${c}`, target, budgetUsd, token: FAKE_TOKEN })).id);
    }
  }
  return ids;
}

beforeEach(() => {
  resetCronMemory();
  // Non-demo tokens go through providerFetch → global fetch: answer with the offline data (counted above).
  vi.stubGlobal("fetch", demoFetch());
});
afterEach(() => {
  providerCalls.n = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
      const r = await runCronSlice(kv, { now: new Date(now), batch: 2, interval: 1 });
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
    expect((await runCronSlice(kv, { now: new Date(now + 60_000), batch: 2, interval: 1 })).checked).toBe(0);
  });

  it("overlapping runs never check the same connection twice in an hour", async () => {
    let now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    await seed(kv, 30);
    for (let minute = 0; minute < 10; minute++) {
      now = HOUR + minute * 60_000;
      await Promise.all([1, 2, 3, 4].map(() => runCronSlice(kv, { now: new Date(now), batch: 2, interval: 1 })));
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
    await addConnection(kv, "cs_test_lapsed", { label: "x", target, budgetUsd: 1, token: FAKE_TOKEN }); // no entitlement
    await kv.del("budget-guard:bg:allconns"); // data written before the index existed
    const r = await runCronSlice(kv, { now: new Date(now) }); // Vercel: no batch limit
    expect(r).toMatchObject({ initialized: true, checked: 2, skipped: 1, remaining: 0 });
  });

});

/** Play `hours` hours minute by minute; returns, per connection id, the hour indexes it was checked in. */
async function playHours(kv: KV, startHour: number, hours: number, stats: ReturnType<typeof counted>["stats"]) {
  const checkedIn = new Map<string, number[]>();
  for (let h = 0; h < hours; h++) {
    resetCronMemory();
    const before = new Map(stats.stateWrites);
    for (let minute = 0; minute < 60; minute++) {
      const r = await runCronSlice(kv, { now: new Date(startHour + h * 3600_000 + minute * 60_000 + 1000), batch: 2 });
      if (!r.initialized && r.remaining === 0 && r.checked === 0) break;
    }
    for (const [k, n] of stats.stateWrites) {
      const delta = n - (before.get(k) ?? 0);
      if (delta === 0) continue;
      expect(delta).toBe(1); // never twice in one hour
      const id = k.slice(k.lastIndexOf(":") + 1);
      checkedIn.set(id, [...(checkedIn.get(id) ?? []), h]);
    }
  }
  return checkedIn;
}

describe("check interval by number of connections (lib/guard/schedule.ts)", () => {
  it("tiers: ≤50 every hour, ≤90 every 2h, ≤120 3h, ≤150 4h, ≤190 6h, ≤225 8h, more 12h", () => {
    expect([1, 50, 51, 90, 91, 120, 121, 150, 151, 190, 191, 225, 226, 1000].map((n) => intervalFor(n))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 6, 6, 8, 8, 12, 12]);
    expect(CHECK_INTERVAL_TIERS.at(-1)?.upTo).toBe(Infinity);
  });

  it("slots spread connections evenly and nextCheckHour lands on the slot", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `conn_${i.toString(16).padStart(16, "0")}`);
    const perSlot = [0, 0, 0];
    for (const id of ids) perSlot[slotOf(id, 3)]++;
    for (const n of perSlot) expect(n).toBeGreaterThan(70); // ~100 each
    const now = new Date(HOUR + 5 * 60_000);
    for (const id of ids.slice(0, 20)) {
      const next = nextCheckHour(id, now, 3);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
      expect(next.getTime() - HOUR).toBeLessThanOrEqual(3 * 3600_000);
      expect(isDue(id, next, 3)).toBe(true);
    }
  });

  it("100 connections (every 3h): each is checked exactly once in every 3-hour window", async () => {
    let now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    const ids = await seed(kv, 100);
    const checkedIn = await playHours(kv, HOUR, 12, stats);
    for (const id of ids) {
      const hours = checkedIn.get(id) ?? [];
      expect(hours.length).toBe(4); // 12 hours / 3
      for (let i = 1; i < hours.length; i++) expect(hours[i] - hours[i - 1]).toBe(3);
    }
    now = HOUR + 12 * 3600_000;
    const view = await dashboardView(kv, { id: "cs_test_acct0", email: "a0@example.com", entitlement: {} as never });
    expect(view.checkIntervalHours).toBe(3); // shown on the dashboard
    expect(view.connections[0].snapshot?.nextCheckAt).toBeTruthy();
  });

  it("growing from 40 to 70 connections switches 1h → 2h; no gap longer than the new interval", async () => {
    const now = HOUR;
    const { kv, stats } = counted(createMemoryKV(() => now));
    const first = await seed(kv, 40);
    const before = await playHours(kv, HOUR, 2, stats);
    for (const id of first) expect(before.get(id)).toEqual([0, 1]);
    // 30 more connections on new accounts.
    for (let a = 100; a < 110; a++) {
      const { entitlement } = await upsertEntitlement(kv, { id: `cs_test_more${a}`, email: `m${a}@example.com`, plan: "monthly", source: "stripe" });
      for (let c = 0; c < 3; c++) await addConnection(kv, entitlement.id, { label: `M${c}`, target, budgetUsd: 100, token: FAKE_TOKEN });
    }
    const after = await playHours(kv, HOUR + 2 * 3600_000, 6, stats);
    for (const id of first) {
      const hours = [1, ...(after.get(id) ?? []).map((h) => h + 2)];
      for (let i = 1; i < hours.length; i++) expect(hours[i] - hours[i - 1]).toBeLessThanOrEqual(2);
      expect(hours.length - 1).toBe(3); // 6 hours / 2
    }
  });
});

describe("R3-02: demo connections and lapsed accounts don't stretch the check interval", () => {
  /** `n` demo accounts with 3 demo-token connections each (what anyone can create on a demo deployment). */
  async function demoFlood(kv: KV, accounts: number) {
    for (let a = 0; a < accounts; a++) {
      const { entitlement } = await upsertEntitlement(kv, { id: `cs_test_flood${a}`, email: `f${a}@example.com`, plan: "monthly", source: "stripe" });
      for (let c = 0; c < 3; c++) await addConnection(kv, entitlement.id, { label: `D${c}`, target, budgetUsd: 100, token: "demo" });
    }
  }

  it("300 demo connections: real ones stay hourly; demo ones go to their own index, a few per hour", async () => {
    const now = HOUR;
    const kv = createMemoryKV(() => now);
    const real = await seed(kv, 10);
    await demoFlood(kv, 100);
    expect((await listConnRefs(kv)).length).toBe(10);
    expect((await listDemoConnRefs(kv)).length).toBe(300);
    let demoChecked = 0;
    for (let h = 0; h < DEMO_INTERVAL_HOURS; h++) {
      resetCronMemory();
      const r = await runCronSlice(kv, { now: new Date(HOUR + h * 3600_000) });
      expect(r.intervalHours).toBe(1); // 10 real connections → hourly, whatever the demo count
      expect(r.checked - real.length).toBeLessThanOrEqual(DEMO_CHECKS_PER_HOUR);
      demoChecked += r.checked - real.length;
    }
    expect(demoChecked).toBeGreaterThan(0);
    expect(demoChecked).toBeLessThanOrEqual(DEMO_CHECKS_PER_HOUR * DEMO_INTERVAL_HOURS);
  });

  it("a demo connection found in the real index (data from before the fix) moves to the demo index", async () => {
    const now = HOUR;
    const kv = createMemoryKV(() => now);
    await seed(kv, 1);
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_old", email: "old@example.com", plan: "monthly", source: "stripe" });
    const demo = await addConnection(kv, entitlement.id, { label: "D", target, budgetUsd: 100, token: "demo" });
    // Before R3-02 every connection was in allconns.
    await kv.srem("budget-guard:bg:democonns", connRef(entitlement.id, demo.id));
    await kv.sadd("budget-guard:bg:allconns", connRef(entitlement.id, demo.id));
    const r = await runCronSlice(kv, { now: new Date(now), interval: 1 });
    expect(r).toMatchObject({ checked: 1, skipped: 1 });
    expect(await listConnRefs(kv)).not.toContain(connRef(entitlement.id, demo.id));
    expect(await listDemoConnRefs(kv)).toContain(connRef(entitlement.id, demo.id));
  });

  it("lapsed accounts leave the index (no longer counted) and come back when reactivated", async () => {
    const now = HOUR;
    const kv = createMemoryKV(() => now);
    await seed(kv, 3); // cs_test_acct0: 3 connections
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_gone", email: "g@example.com", plan: "monthly", source: "stripe" });
    for (let c = 0; c < 3; c++) await addConnection(kv, entitlement.id, { label: `G${c}`, target, budgetUsd: 100, token: FAKE_TOKEN });
    const canceled = await setStatus(kv, entitlement, "canceled");
    const r = await runCronSlice(kv, { now: new Date(now), interval: 1 });
    expect(r).toMatchObject({ checked: 3, skipped: 3 });
    expect((await listConnRefs(kv)).length).toBe(3);
    await setStatus(kv, canceled, "active"); // resubscribed
    expect((await listConnRefs(kv)).length).toBe(6);
  });

  // Atlas VERIFY #2: the cron's SREM of a lapsed account must not undo a reactivation that happened
  // between its "inactive" read and the SREM.
  it("a reactivation racing the cron's index removal keeps the connections monitored", async () => {
    const now = HOUR;
    const raw = createMemoryKV(() => now);
    const { entitlement } = await upsertEntitlement(raw, { id: "cs_test_race", email: "race@example.com", plan: "monthly", source: "stripe" });
    const conn = await addConnection(raw, entitlement.id, { label: "R", target, budgetUsd: 100, token: FAKE_TOKEN });
    const canceled = await setStatus(raw, entitlement, "canceled");
    let raced = false;
    // Right before the cron's SREM on the index, the customer resubscribes (setStatus → SADD).
    const kv = new Proxy(raw, {
      get: (t, p: keyof KV) =>
        p === "srem"
          ? async (key: string, ...members: string[]) => {
              if (!raced && key.endsWith("bg:allconns")) {
                raced = true;
                await setStatus(raw, canceled, "active");
              }
              return t.srem(key, ...members);
            }
          : t[p],
    }) as KV;
    const r = await runCronSlice(kv, { now: new Date(now), interval: 1 });
    expect(raced).toBe(true);
    expect(r.skipped).toBe(1);
    expect(await listConnRefs(raw)).toContain(connRef(entitlement.id, conn.id));
  });

  // Atlas VERIFY #3: with more demo connections due in an hour than the cap, the same first ones
  // (sorted) were picked every time and the rest never checked — nor dropped when their trial ended.
  //
  // The bound: a demo connection is due in one hour of each 12 (its hash slot), and that hour checks
  // at most DEMO_CHECKS_PER_HOUR of the connections sharing the slot, in turn. So every connection is
  // checked within ceil(size of its slot group / cap) cycles. Connection ids are random, so the group
  // sizes are uneven (60 connections over 12 slots: often 9 or more in one slot) — the bound must use
  // the largest group, not the average (the earlier version did, and failed ~60% of runs).
  it("every demo connection is checked within ceil(its slot group / cap) 12-hour cycles (round robin)", async () => {
    const kv = createMemoryKV(() => HOUR);
    const { stats, kv: c } = counted(kv);
    for (let a = 0; a < 20; a++) {
      const { entitlement } = await upsertEntitlement(kv, { id: `cs_test_rr${a}`, email: `rr${a}@example.com`, plan: "monthly", source: "stripe" });
      for (let i = 0; i < 3; i++) await addConnection(kv, entitlement.id, { label: `D${i}`, target, budgetUsd: 100, token: "demo" });
    }
    const ids = (await listDemoConnRefs(kv)).map((r) => r.slice(r.lastIndexOf("|") + 1));
    const groups = new Map<number, number>();
    for (const id of ids) groups.set(slotOf(id, DEMO_INTERVAL_HOURS), (groups.get(slotOf(id, DEMO_INTERVAL_HOURS)) ?? 0) + 1);
    const cycles = Math.ceil(Math.max(...groups.values()) / DEMO_CHECKS_PER_HOUR);
    const firstCycle = new Map<string, number>();
    for (let h = 0; h < DEMO_INTERVAL_HOURS * cycles; h++) {
      resetCronMemory();
      const before = new Map(stats.stateWrites);
      const r = await runCronSlice(c, { now: new Date(HOUR + h * 3600_000) });
      expect(r.checked).toBeLessThanOrEqual(DEMO_CHECKS_PER_HOUR);
      for (const [k, n] of stats.stateWrites) {
        if (n === before.get(k)) continue;
        const id = k.slice(k.lastIndexOf(":") + 1);
        if (!firstCycle.has(id)) firstCycle.set(id, Math.floor(h / DEMO_INTERVAL_HOURS));
      }
    }
    expect(ids.filter((id) => !firstCycle.has(id))).toEqual([]);
    // …and each one within the bound of its own group.
    for (const id of ids) expect(firstCycle.get(id)!).toBeLessThan(Math.ceil(groups.get(slotOf(id, DEMO_INTERVAL_HOURS))! / DEMO_CHECKS_PER_HOUR));
  });

  it("pickDemo is deterministic and covers any group in ceil(n / cap) cycles, from any starting cycle", () => {
    for (let n = 1; n <= 40; n++) {
      const due = Array.from({ length: n }, (_, i) => `acct|conn_${i.toString(16).padStart(16, "0")}`);
      for (const startCycle of [0, 1, 7, 12345]) {
        const seen = new Set<string>();
        for (let k = 0; k < Math.ceil(n / DEMO_CHECKS_PER_HOUR); k++) {
          const at = new Date((startCycle + k) * DEMO_INTERVAL_HOURS * 3600_000);
          const picked = pickDemo([...due].reverse(), at); // input order doesn't matter
          expect(picked).toEqual(pickDemo(due, at));
          expect(new Set(picked).size).toBe(Math.min(n, DEMO_CHECKS_PER_HOUR));
          for (const r of picked) seen.add(r);
        }
        expect(seen.size, `n=${n} start=${startCycle}`).toBe(n);
      }
    }
  });
});

