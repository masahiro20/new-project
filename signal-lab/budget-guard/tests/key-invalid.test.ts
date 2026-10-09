import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { upsertEntitlement } from "@/lib/entitlements";
import { trialMetrics } from "@/lib/guard/admin";
import { checkConnection, type Connection } from "@/lib/guard/check";
import { DEMO_INTERVAL_HOURS, resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { isDue } from "@/lib/guard/schedule";
import { setSlackUrl } from "@/lib/guard/service";
import { addConnection, getLog, updateConnection } from "@/lib/guard/store";
import { devOutbox } from "@/lib/mail";
import { FAKE_TOKEN, stubProviders } from "./helpers/providers";
import { createMemoryKV, type KV } from "@/lib/redis";

const NOW = new Date("2026-10-09T03:00:00Z");
const openai = { provider: "openai" as const, projectId: "proj_1" };
const ok = (spend = 10) => Response.json({ data: [{ results: [{ amount: { value: spend, currency: "usd" } }] }], has_more: false, next_page: null });
const status = (s: number) => new Response("nope", { status: s });

afterEach(() => vi.unstubAllGlobals());

describe("token rejected (401/403): notify once, re-arm when fixed", () => {
  const conn: Connection = { id: "conn_0000000000000001", label: "OpenAI prod", target: openai, budgetUsd: 100, stopMode: "test", sealedToken: "x" };
  const run = (prev: Parameters<typeof checkConnection>[1], res: Response, now = NOW) =>
    checkConnection(conn, prev, { token: "sk-admin-x", fetchImpl: async () => res.clone(), now });

  it("401 → one key-invalid notice; again → plain error; works → cleared; 403 → notified again", async () => {
    const a = await run(undefined, status(401));
    expect(a.notices.map((n) => n.kind)).toEqual(["key-invalid"]);
    expect(a.state.keyInvalidAt).toBeTruthy();

    const b = await run(a.state, status(401));
    expect(b.notices.map((n) => n.kind)).toEqual(["error"]); // dashboard only, no second mail

    const c = await run(b.state, ok());
    expect(c.state.keyInvalidAt).toBeUndefined();
    expect(c.notices).toEqual([]);

    const d = await run(c.state, status(403));
    expect(d.notices.map((n) => n.kind)).toEqual(["key-invalid"]);
  });

  it("other failures (500, network) are not reported as an invalid key", async () => {
    expect((await run(undefined, status(500))).notices.map((n) => n.kind)).toEqual(["error"]);
    const r = await checkConnection(conn, undefined, { token: "t", fetchImpl: async () => { throw new Error("socket hang up"); }, now: NOW });
    expect(r.notices.map((n) => n.kind)).toEqual(["error"]);
  });

  it("the 'already told you' flag survives the monthly reset (no new mail just because the month changed)", async () => {
    const a = await run(undefined, status(401));
    const nextMonth = await run(a.state, status(401), new Date("2026-11-01T01:00:00Z"));
    expect(nextMonth.notices.map((n) => n.kind)).toEqual(["error"]);
    expect(nextMonth.state.period).toBe("2026-11");
  });
});

describe("through the cron: mail + Slack once, Upstash commands unchanged", () => {
  beforeEach(() => resetCronMemory());

  it("mails and posts to Slack once per invalid key, 5 commands per check as before", async () => {
    let now = NOW.getTime();
    const raw = createMemoryKV(() => now);
    let commands = 0;
    const kv = new Proxy(raw, {
      get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...a: unknown[]) => (commands++, (t[p] as (...x: unknown[]) => unknown).apply(t, a)) : t[p]),
    }) as KV;
    const { entitlement } = await upsertEntitlement(raw, { id: "cs_test_k", email: "k@example.com", plan: "monthly", source: "stripe" });
    // A non-demo token, so the (stubbed) global fetch is used.
    await addConnection(raw, entitlement.id, { label: "OpenAI prod", target: openai, budgetUsd: 100, token: FAKE_TOKEN });
    await setSlackUrl(raw, entitlement.id, "https://hooks.slack.com/services/T000/B000/xyz");

    let providerStatus = 401;
    const slackPosts: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://hooks.slack.com/")) {
        slackPosts.push(String(init?.body));
        return new Response("ok");
      }
      return providerStatus === 200 ? ok() : status(providerStatus);
    });

    const mails = () => devOutbox.filter((m) => m.subject.includes("token rejected")).length;
    const before = mails();
    const hourly = async (h: number) => {
      resetCronMemory();
      now = NOW.getTime() + h * 3600_000;
      commands = 0;
      await runCronSlice(kv, { now: new Date(now), batch: 2, interval: 1 }); // list + 1 item
      return commands;
    };
    expect(await hourly(0)).toBe(6 + 5); // building the list (6, incl. the demo index since R3-02) + one check (5): same as a check without the alert
    expect(mails() - before).toBe(1);
    expect(slackPosts.length).toBe(1);
    expect(slackPosts[0]).toContain("token rejected");

    await hourly(1); // still invalid: no second mail / Slack
    expect(mails() - before).toBe(1);
    expect(slackPosts.length).toBe(1);

    providerStatus = 200; // fixed
    await hourly(2);
    providerStatus = 403; // invalid again → told again
    await hourly(3);
    expect(mails() - before).toBe(2);
    expect(slackPosts.length).toBe(2);
    expect((await getLog(raw, entitlement.id)).filter((e) => e.kind === "key-invalid").length).toBe(2);
  });
});

describe("GET /api/admin/stats trial metrics", () => {
  it("counts connections, modes and this month's alerts from both indexes (4 commands), auth unchanged", async () => {
    stubProviders(); // non-demo tokens: the cron checks them through (stubbed) fetch
    let now = NOW.getTime();
    const raw = createMemoryKV(() => now);
    const { entitlement: a } = await upsertEntitlement(raw, { id: "cs_test_m1", email: "m1@example.com", plan: "monthly", source: "stripe" });
    const { entitlement: b } = await upsertEntitlement(raw, { id: "cs_test_m2", email: "m2@example.com", plan: "monthly", source: "stripe" });
    await addConnection(raw, a.id, { label: "warn", target: openai, budgetUsd: 100, token: FAKE_TOKEN }); // offline spend $85 → 80%
    await addConnection(raw, a.id, { label: "over", target: openai, budgetUsd: 10, token: FAKE_TOKEN }); // → 100% + test stop
    const v = await addConnection(raw, b.id, { label: "v", target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] }, budgetUsd: 1000, token: "demo" });
    await updateConnection(raw, b.id, v.id, { stopMode: "off" });
    resetCronMemory();
    await runCronSlice(raw, { now: new Date(now), interval: 1 });

    let commands = 0;
    const kv = new Proxy(raw, {
      get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...x: unknown[]) => (commands++, (t[p] as (...y: unknown[]) => unknown).apply(t, x)) : t[p]),
    }) as KV;
    now += 60_000;
    const m = await trialMetrics(kv, new Date(now));
    expect(commands).toBe(4); // SMEMBERS ×2 (real + demo index) + MGET×2
    expect(m).toMatchObject({
      month: "2026-10",
      accounts: 2,
      connections: { total: 3, byProvider: { openai: 2, vercel: 1, anthropic: 0 }, demoToken: 1 },
      stopMode: { off: 1, test: 2, live: 0 },
      thisMonth: { warned: 1, reachedLimit: 1, testStopRecords: 1, keyInvalid: 0 },
      // the demo-token connection: checked every 12h (R3-02); whether this hour is its slot depends on its random id (Ren QA: failed ~1/12)
      neverChecked: isDue(v.id, new Date(NOW), DEMO_INTERVAL_HOURS) ? 0 : 1,
    });
    expect(m.lastCheckedAt).toBe(NOW.toISOString());

    // Route: still 404 without the admin token.
    vi.stubEnv("ADMIN_TOKEN", "admin-token-for-tests-0123456789");
    (globalThis as { __slabKV?: KV }).__slabKV = raw;
    expect((await adminStats(new Request("http://x/api/admin/stats"))).status).toBe(404);
    const res = await adminStats(new Request("http://x/api/admin/stats", { headers: { authorization: "Bearer admin-token-for-tests-0123456789" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).trial.connections.total).toBe(3);
    delete (globalThis as { __slabKV?: KV }).__slabKV;
    vi.unstubAllEnvs();
  });
});
