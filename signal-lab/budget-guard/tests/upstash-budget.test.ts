import { beforeEach, describe, expect, it, vi } from "vitest";

// Count Upstash commands (one per KV call — MGET/MSET count as one) for the cron and the
// dashboard, and check the monthly estimate against the free tier (500k commands/month).
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { GET as state } from "@/app/api/app/state/route";
import { POST as track } from "@/app/api/track/route";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { upsertEntitlement } from "@/lib/entitlements";
import { resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { addConnection } from "@/lib/guard/store";
import { createMemoryKV, type KV } from "@/lib/redis";

const HOUR = Date.parse("2026-10-09T03:00:00Z");
const FREE_COMMANDS_PER_MONTH = 500_000;

function counted(kv: KV) {
  const s = { n: 0 };
  const wrapped = new Proxy(kv, {
    get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...a: unknown[]) => (s.n++, (t[p] as (...x: unknown[]) => unknown).apply(t, a)) : t[p]),
  }) as KV;
  return { kv: wrapped, s };
}

async function oneConnection(budgetUsd: number) {
  let now = HOUR;
  const raw = createMemoryKV(() => now);
  const { entitlement } = await upsertEntitlement(raw, { id: "cs_test_a", email: "a@example.com", plan: "monthly", source: "stripe" });
  await addConnection(raw, entitlement.id, { label: "A", target: { provider: "openai", projectId: "p" }, budgetUsd, token: "demo" }); // demo spend $85
  return { raw, setNow: (t: number) => (now = t), entitlement };
}

/** Commands of one run that checks exactly one connection, minus the run's own SMEMBERS. */
async function perItem(budgetUsd: number) {
  resetCronMemory(); // each scenario is its own isolate
  const { raw, setNow } = await oneConnection(budgetUsd);
  const { kv, s } = counted(raw);
  await runCronSlice(kv, { now: new Date(HOUR), batch: 2, maxKvOps: 1 }); // fills the hour's list only
  const init = s.n;
  setNow(HOUR + 60_000);
  s.n = 0;
  const r = await runCronSlice(kv, { now: new Date(HOUR + 60_000), batch: 2 });
  expect(r.checked).toBe(1);
  return { init, item: s.n - 1, notices: r.notices };
}

const measured: Record<string, number> = {};

beforeEach(() => resetCronMemory());

describe("Upstash commands", () => {
  it("cron: idle run, hour-list run, one connection (no notice / notice / stop)", async () => {
    const quiet = await perItem(1000); // $85 of $1000: nothing to say
    const warn = await perItem(100); // 85% → 80% mail
    const stop = await perItem(10); // over budget → limit mail + (test-mode) stop
    expect(warn.notices).toBe(1);
    expect(stop.notices).toBe(2);

    // Idle: the hour is done. Same isolate → 0 commands; a fresh isolate → 1 (SMEMBERS).
    resetCronMemory();
    const { raw } = await oneConnection(1000);
    const { kv, s } = counted(raw);
    expect((await runCronSlice(kv, { now: new Date(HOUR), batch: 2 })).checked).toBe(1);
    s.n = 0;
    await runCronSlice(kv, { now: new Date(HOUR + 120_000), batch: 2 });
    const idleWarm = s.n;
    resetCronMemory();
    s.n = 0;
    await runCronSlice(kv, { now: new Date(HOUR + 180_000), batch: 2 });
    const idleCold = s.n;

    Object.assign(measured, { init: quiet.init, itemQuiet: quiet.item, itemNotice: warn.item, itemStop: stop.item, idleWarm, idleCold, runBase: 1 });
    console.log("[upstash] cron commands", JSON.stringify(measured));
    expect(idleWarm).toBe(0);
    expect(idleCold).toBe(1);
    expect(quiet.item).toBeLessThanOrEqual(5); // lock, MGET, MSET, unlock, SREM
    expect(warn.item).toBe(quiet.item); // notices ride on the same MSET
    expect(stop.item).toBe(quiet.item);
    expect(quiet.init).toBeLessThanOrEqual(5);
  });

  it("dashboard: GET /api/app/state + the pageview beacon", async () => {
    const { raw, entitlement } = await oneConnection(1000);
    for (const label of ["B", "C"]) await addConnection(raw, entitlement.id, { label, target: { provider: "openai", projectId: "p" }, budgetUsd: 100, token: "demo" });
    const { kv, s } = counted(raw);
    (globalThis as { __slabKV?: KV }).__slabKV = kv;
    const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    const headers = { cookie: `${ACCESS_COOKIE}=${cookie}`, "x-forwarded-for": "10.0.0.1" };
    await track(new Request("http://localhost:3000/api/track", { method: "POST", body: JSON.stringify({ event: "pageview" }), headers })); // first of the window/day: + EXPIREs
    s.n = 0;
    expect((await state(new Request("http://localhost:3000/api/app/state", { headers }))).status).toBe(200);
    const stateCmds = s.n;
    s.n = 0;
    await track(new Request("http://localhost:3000/api/track", { method: "POST", body: JSON.stringify({ event: "pageview" }), headers }));
    const pageview = s.n;
    delete (globalThis as { __slabKV?: KV }).__slabKV;
    Object.assign(measured, { dashboardState: stateCmds, pageview });
    console.log("[upstash] dashboard commands", JSON.stringify({ dashboardState: stateCmds, pageview }));
    expect(stateCmds).toBeLessThanOrEqual(3); // entitlement + MGET + MGET snapshots
    expect(pageview).toBeLessThanOrEqual(2); // rate-limit INCR + HINCRBY
  });

  it("monthly estimate fits the free tier with 100 connections", () => {
    const m = measured;
    const DAYS = 30;
    const HOURS = 24 * DAYS;
    /** Assumptions: Cloudflare cron every minute, 2 connections per run; worst case a fresh isolate every idle minute; 2 connections per person; 10 dashboard opens a day. */
    const estimate = (connections: number) => {
      const workRunsPerHour = Math.ceil(connections / 2);
      const cron =
        HOURS * (m.init + workRunsPerHour * m.runBase + connections * m.itemNotice) + // notices cost the same as quiet checks
        HOURS * (60 - workRunsPerHour - 1) * m.idleCold; // worst case: every idle minute in a new isolate
      const people = Math.ceil(connections / 2);
      const dashboard = people * 10 * DAYS * (m.dashboardState + m.pageview);
      return { connections, cron, dashboard, total: cron + dashboard };
    };
    const rows = [0, 10, 50, 100].map(estimate);
    let max = 0;
    while (estimate(max + 1).total <= FREE_COMMANDS_PER_MONTH) max++;
    console.log("[upstash] monthly estimate", JSON.stringify({ rows, maxConnections: max }));
    expect(estimate(100).total).toBeLessThan(FREE_COMMANDS_PER_MONTH);
  });
});
