import { beforeEach, describe, expect, it, vi } from "vitest";

// Count Upstash commands for the cron and the dashboard, two ways:
//   "command": one per call (how Upstash documents billing: per command)
//   "perKey":  worst case — every key of an MGET / MSET counted as its own command
// and check the monthly estimate against the free tier (500k commands/month) with the
// check-interval tiers of lib/guard/schedule.ts.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { GET as state } from "@/app/api/app/state/route";
import { POST as track } from "@/app/api/track/route";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { upsertEntitlement } from "@/lib/entitlements";
import { resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { CHECK_INTERVAL_TIERS, intervalFor } from "@/lib/guard/schedule";
import { addConnection } from "@/lib/guard/store";
import { createMemoryKV, type KV } from "@/lib/redis";

const HOUR = Date.parse("2026-10-09T03:00:00Z");
const FREE = 500_000;
type Mode = "command" | "perKey";

function counted(kv: KV, mode: Mode) {
  const s = { n: 0 };
  const cost = (p: keyof KV, a: unknown[]) => (mode === "perKey" && p === "mget" ? a.length : mode === "perKey" && p === "mset" ? Object.keys(a[0] as object).length : 1);
  const wrapped = new Proxy(kv, {
    get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...a: unknown[]) => ((s.n += cost(p, a)), (t[p] as (...x: unknown[]) => unknown).apply(t, a)) : t[p]),
  }) as KV;
  return { kv: wrapped, s };
}

async function oneConnection(budgetUsd: number) {
  const raw = createMemoryKV(() => HOUR);
  const { entitlement } = await upsertEntitlement(raw, { id: "cs_test_a", email: "a@example.com", plan: "monthly", source: "stripe" });
  await addConnection(raw, entitlement.id, { label: "A", target: { provider: "openai", projectId: "p" }, budgetUsd, token: "demo" }); // demo spend $85
  return { raw, entitlement };
}

type Costs = { init: number; itemQuiet: number; itemNotice: number; itemStop: number; idleWarm: number; idleCold: number; runBase: number; dashboardState: number; pageview: number };

async function measure(mode: Mode): Promise<Costs> {
  const item = async (budgetUsd: number) => {
    resetCronMemory();
    const { raw } = await oneConnection(budgetUsd);
    const { kv, s } = counted(raw, mode);
    await runCronSlice(kv, { now: new Date(HOUR), batch: 2, maxKvOps: 1, interval: 1 }); // builds the hour's list only
    const init = s.n;
    s.n = 0;
    const r = await runCronSlice(kv, { now: new Date(HOUR + 60_000), batch: 2 });
    expect(r.checked).toBe(1);
    return { init, item: s.n - 1, notices: r.notices };
  };
  const quiet = await item(1000); // $85 of $1000: nothing to say
  const warn = await item(100); // 85% → 80% mail
  const stop = await item(10); // over budget → limit mail + (test-mode) stop
  expect([warn.notices, stop.notices]).toEqual([1, 2]);

  resetCronMemory();
  const { raw, entitlement } = await oneConnection(1000);
  const { kv, s } = counted(raw, mode);
  await runCronSlice(kv, { now: new Date(HOUR), batch: 2, interval: 1 });
  s.n = 0;
  await runCronSlice(kv, { now: new Date(HOUR + 120_000), batch: 2 });
  const idleWarm = s.n;
  resetCronMemory();
  s.n = 0;
  await runCronSlice(kv, { now: new Date(HOUR + 180_000), batch: 2 });
  const idleCold = s.n;

  // Dashboard (3 connections) and one pageview beacon.
  for (const label of ["B", "C"]) await addConnection(raw, entitlement.id, { label, target: { provider: "openai", projectId: "p" }, budgetUsd: 100, token: "demo" });
  (globalThis as { __slabKV?: KV }).__slabKV = kv;
  const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
  const headers = { cookie: `${ACCESS_COOKIE}=${cookie}`, "x-forwarded-for": "10.0.0.1" };
  const beacon = () => track(new Request("http://localhost:3000/api/track", { method: "POST", body: JSON.stringify({ event: "pageview" }), headers }));
  await beacon(); // first of the day in this isolate: + EXPIRE
  s.n = 0;
  expect((await state(new Request("http://localhost:3000/api/app/state", { headers }))).status).toBe(200);
  const dashboardState = s.n;
  s.n = 0;
  await beacon();
  const pageview = s.n;
  delete (globalThis as { __slabKV?: KV }).__slabKV;

  return { init: quiet.init, itemQuiet: quiet.item, itemNotice: warn.item, itemStop: stop.item, idleWarm, idleCold, runBase: 1, dashboardState, pageview };
}

/**
 * Monthly commands (30 days). Assumptions (docs §7.1): cron every minute, 2 connections
 * per run; every idle minute in a fresh isolate (worst case); every check costs as much
 * as one with notices; people = connections / 2, each opening the dashboard 10 times a
 * day (+ its pageview); 1,000 landing-page views a day.
 */
export function estimate(c: Costs, connections: number, intervalHours: number) {
  const HOURS = 24 * 30;
  const perHour = connections / intervalHours;
  const workRuns = Math.min(59, Math.ceil(perHour / 2));
  const cron = HOURS * (c.init + workRuns * c.runBase + perHour * Math.max(c.itemNotice, c.itemStop) + (59 - workRuns) * c.idleCold);
  const dashboard = Math.ceil(connections / 2) * 10 * 30 * (c.dashboardState + c.pageview);
  const lp = 1000 * 30 * c.pageview;
  return { connections, intervalHours, cron: Math.round(cron), dashboard, lp, total: Math.round(cron + dashboard + lp) };
}

const costs: Partial<Record<Mode, Costs>> = {};

beforeEach(() => resetCronMemory());

describe("Upstash commands", () => {
  it("per command: idle 0/1, list 5, one connection 5 whatever the outcome, dashboard 2, pageview 1", async () => {
    const c = (costs.command = await measure("command"));
    console.log("[upstash] per command", JSON.stringify(c));
    expect(c).toMatchObject({ idleWarm: 0, idleCold: 1, init: 5, itemQuiet: 5, itemNotice: 5, itemStop: 5, dashboardState: 2, pageview: 1 });
  });

  it("worst case (MGET/MSET counted per key)", async () => {
    const c = (costs.perKey = await measure("perKey"));
    console.log("[upstash] per key", JSON.stringify(c));
    expect(c.idleWarm).toBe(0);
    expect(c.idleCold).toBe(1);
    expect(c.itemNotice).toBeLessThanOrEqual(10); // lock + MGET×5 + MSET×2 + unlock + SREM
    expect(c.dashboardState).toBeLessThanOrEqual(4); // entitlement + MGET×3
  });

  it("every tier of CHECK_INTERVAL_TIERS fits the free tier at its upper bound (worst case)", () => {
    const c = costs.perKey!;
    for (const tier of CHECK_INTERVAL_TIERS) {
      if (!Number.isFinite(tier.upTo)) continue;
      expect(estimate(c, tier.upTo, tier.hours).total, `≤${tier.upTo} every ${tier.hours}h`).toBeLessThanOrEqual(FREE);
    }
    // The lower tiers are needed: the next-shorter interval would not fit just above each bound.
    for (let i = 1; i < CHECK_INTERVAL_TIERS.length; i++) {
      const prev = CHECK_INTERVAL_TIERS[i - 1];
      expect(estimate(c, prev.upTo + 1, prev.hours).total).toBeGreaterThan(FREE * 0.9);
    }
  });

  it("100 and 200 connections stay within 500k/month even counted per key", () => {
    const table = [0, 10, 50, 100, 150, 200].map((n) => ({
      ...estimate(costs.perKey!, n, intervalFor(n)),
      perCommand: estimate(costs.command!, n, intervalFor(n)).total,
    }));
    console.log("[upstash] monthly", JSON.stringify(table));
    const maxPerInterval = [1, 2, 3, 4, 6, 8, 12].map((h) => {
      let n = 0;
      while (estimate(costs.perKey!, n + 1, h).total <= FREE) n++;
      return { hours: h, maxConnections: n };
    });
    console.log("[upstash] max connections per interval (worst case)", JSON.stringify(maxPerInterval));
    expect(estimate(costs.perKey!, 100, intervalFor(100)).total).toBeLessThanOrEqual(FREE);
    expect(estimate(costs.perKey!, 200, intervalFor(200)).total).toBeLessThanOrEqual(FREE);
  });
});
