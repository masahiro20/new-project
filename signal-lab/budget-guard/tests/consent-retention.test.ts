import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { POST as adminDelete } from "@/app/api/admin/accounts/delete/route";
import { POST as consentRoute } from "@/app/api/app/consent/route";
import { POST as postConn } from "@/app/api/app/connections/[id]/route";
import { POST as addConn } from "@/app/api/app/connections/route";
import { GET as state } from "@/app/api/app/state/route";
import { POST as complete } from "@/app/api/checkout/complete/route";
import { POST as demoPay } from "@/app/api/checkout/demo/route";
import { POST as checkout } from "@/app/api/checkout/route";
import { LEGAL_VERSIONS } from "@/content/legal/version";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { consentCurrent, newConsent } from "@/lib/consent";
import { DAY_MS, getEntitlement, setStatus, upsertEntitlement, type Entitlement } from "@/lib/entitlements";
import { resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { deleteAccount, sweepRetention } from "@/lib/guard/retention";
import { setSlackUrl } from "@/lib/guard/service";
import { addConnection, getConnection, listConnRefs } from "@/lib/guard/store";
import { resolveEntitlement } from "@/lib/payments";
import { getDemoCheckout } from "@/lib/payments/demo";
import { createMemoryKV, getKV, type KV } from "@/lib/redis";

const BASE = "http://localhost:3000";
function req(path: string, o: { body?: unknown; cookie?: string; method?: string; auth?: string } = {}) {
  const headers = new Headers({ host: "localhost:3000", origin: BASE, "content-type": "application/json", "x-forwarded-for": `10.1.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}` });
  if (o.cookie) headers.set("cookie", `${ACCESS_COOKIE}=${o.cookie}`);
  if (o.auth) headers.set("authorization", `Bearer ${o.auth}`);
  return new Request(BASE + path, { method: o.method ?? (o.body !== undefined ? "POST" : "GET"), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA" };
const openai = { provider: "openai" as const, projectId: "proj_1" };

afterEach(() => vi.unstubAllEnvs());

describe("consent (Privacy Policy incl. transfer abroad + Terms)", () => {
  it("buy: /api/checkout and the demo card page need consent: true; it lands on the entitlement", async () => {
    expect((await checkout(req("/api/checkout", { body: { plan: "monthly" } }))).status).toBe(400);
    expect((await checkout(req("/api/checkout", { body: { plan: "monthly", consent: "yes" } }))).status).toBe(400);
    const r = await checkout(req("/api/checkout", { body: { plan: "monthly", consent: true } }));
    expect(r.status).toBe(200);
    const id = new URL((await r.json()).url, BASE).searchParams.get("id")!;
    expect((await getDemoCheckout(getKV(), id))?.consent).toMatchObject({ via: "checkout", ...LEGAL_VERSIONS });

    expect((await demoPay(req("/api/checkout/demo", { body: { id, ...card } }))).status).toBe(400); // no checkbox
    expect((await getDemoCheckout(getKV(), id))?.status).toBe("pending");
    expect((await demoPay(req("/api/checkout/demo", { body: { id, ...card, consent: true } }))).status).toBe(200);
    expect((await complete(req("/api/checkout/complete", { body: { session_id: id } }))).status).toBe(200);
    const e = await getEntitlement(getKV(), id);
    expect(e?.consent).toMatchObject({ via: "demo-card", ...LEGAL_VERSIONS });
    expect(Date.parse(e!.consent!.at)).toBeGreaterThan(0);
  });

  it("add connection: 400 without consent; 403 until an outdated consent is renewed; arm-live blocked too", async () => {
    const { entitlement } = await upsertEntitlement(getKV(), {
      id: "cs_test_consent", email: "c@example.com", plan: "monthly", source: "stripe",
      consent: { at: "2025-01-01T00:00:00.000Z", privacy: "2025-01-01", terms: "2025-01-01", via: "checkout" }, // = the policy changed since
    });
    const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    const input = { provider: "openai", label: "OpenAI prod", budgetUsd: "100", projectId: "proj_1", token: "demo" };

    expect((await addConn(req("/api/app/connections", { body: input, cookie }))).status).toBe(400);
    const blocked = await addConn(req("/api/app/connections", { body: { ...input, consent: true }, cookie }));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).msg).toBe("consent-required");
    expect((await (await state(req("/api/app/state", { cookie }))).json()).me.consentRequired).toBe(true);

    // A connection that existed before the bump can't be armed live either.
    const conn = await addConnection(getKV(), entitlement.id, { label: "old", target: openai, budgetUsd: 100, token: "demo" });
    const armed = await postConn(req(`/api/app/connections/${conn.id}`, { body: { op: "confirm", action: "arm-live", challenge: "x.y", typed: "old" }, cookie }), ctx(conn.id));
    expect(armed.status).toBe(403);
    expect((await armed.json()).msg).toBe("consent-required");

    // Re-consent screen → POST /api/app/consent.
    expect((await consentRoute(req("/api/app/consent", { body: {}, cookie }))).status).toBe(400);
    expect((await consentRoute(req("/api/app/consent", { body: { consent: true }, cookie }))).status).toBe(200);
    const after = await getEntitlement(getKV(), entitlement.id);
    expect(consentCurrent(after?.consent)).toBe(true);
    expect(after?.consent?.via).toBe("reconsent");
    expect((await (await state(req("/api/app/state", { cookie }))).json()).me.consentRequired).toBe(false);

    const ok = await addConn(req("/api/app/connections", { body: { ...input, consent: true }, cookie }));
    expect(ok.status).toBe(201);
    const added = await getConnection(getKV(), entitlement.id, (await ok.json()).id);
    expect(added?.consent).toMatchObject({ via: "add-connection", ...LEGAL_VERSIONS }); // stored with the connection: no extra write
  });
});

// ---------------------------------------------------------------- retention

async function account(kv: KV, id: string, source: "stripe" | "demo", createdAt: Date) {
  const { entitlement } = await upsertEntitlement(kv, { id, email: `${id}@example.com`, plan: "monthly", source, consent: newConsent("checkout", createdAt) });
  const e: Entitlement = { ...entitlement, createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString() };
  await kv.set(`budget-guard:ent:${id}`, JSON.stringify(e));
  const conn = await addConnection(kv, id, { label: "A", target: openai, budgetUsd: 100, token: "demo" });
  await setSlackUrl(kv, id, "https://hooks.slack.com/services/T/B/x");
  await kv.set(`budget-guard:bg:${id}:activity`, JSON.stringify({ log: [{ kind: "warn", connectionId: conn.id, message: "m", at: createdAt.toISOString() }], snaps: {} }));
  return { e, conn };
}

async function gone(kv: KV, e: Entitlement, connId: string) {
  for (const k of [`bg:${e.id}:conns`, `bg:${e.id}:settings`, `bg:${e.id}:activity`, `bg:${e.id}:state:${connId}`, `bg:owner:${connId}`, `license:${e.licenseKey}`, `ent-by-email:${e.email}`]) {
    expect(await kv.get(`budget-guard:${k}`), k).toBeNull();
  }
  expect((await listConnRefs(kv)).some((r) => r.startsWith(`${e.id}|`))).toBe(false);
  const tomb = await getEntitlement(kv, e.id);
  expect(tomb).toMatchObject({ id: e.id, email: "", licenseKey: "" });
  expect(tomb?.deletedAt).toBeTruthy();
  expect(tomb?.consent).toBeTruthy(); // proof of consent kept (no personal data)
}

describe("retention: deleted 30 days after the subscription / trial ends", () => {
  beforeEach(() => resetCronMemory());
  const T = new Date("2026-10-01T00:00:00Z");

  it("Stripe: canceled at T → kept at T+29d, deleted after T+30d; access and Stripe re-fulfilment are gone", async () => {
    const kv = createMemoryKV();
    const { e, conn } = await account(kv, "cs_test_r1", "stripe", T);
    await setStatus(kv, e, "canceled", T);
    expect((await sweepRetention(kv, new Date(T.getTime() + 29 * DAY_MS))).deleted).toEqual([]);
    expect(await getConnection(kv, e.id, conn.id)).toBeTruthy();
    expect((await sweepRetention(kv, new Date(T.getTime() + 30 * DAY_MS + 1000))).deleted).toEqual([e.id]);
    await gone(kv, e, conn.id);
    expect(await resolveEntitlement(kv, e.id)).toBeNull(); // the tombstone answers; Stripe is not asked again
    expect(await kv.smembers("budget-guard:retention")).toEqual([]);
  });

  it("reactivated before the 30 days → nothing is deleted", async () => {
    const kv = createMemoryKV();
    const { e } = await account(kv, "cs_test_r2", "stripe", T);
    const canceled = await setStatus(kv, e, "canceled", T);
    await setStatus(kv, canceled, "active", new Date(T.getTime() + 5 * DAY_MS));
    expect((await sweepRetention(kv, new Date(T.getTime() + 90 * DAY_MS))).deleted).toEqual([]);
    expect((await getEntitlement(kv, e.id))?.email).toBe("cs_test_r2@example.com");
  });

  it("demo = 30-day trial: monitoring stops at day 30, data is deleted after day 60", async () => {
    const kv = createMemoryKV();
    vi.stubEnv("PAYMENTS_MODE", "demo");
    const { e, conn } = await account(kv, "demo_ABCDEFGHJKMNPQRSTVWXYZ01", "demo", T);
    expect((await sweepRetention(kv, new Date(T.getTime() + 59 * DAY_MS))).deleted).toEqual([]);
    expect((await sweepRetention(kv, new Date(T.getTime() + 60 * DAY_MS + 1000))).deleted).toEqual([e.id]);
    await gone(kv, e, conn.id);
  });

  it("demo mode switched off before the trial ends: the end is stamped once, deletion 30 days later", async () => {
    const kv = createMemoryKV();
    vi.stubEnv("PAYMENTS_MODE", "demo");
    const { e } = await account(kv, "demo_ZYXWVTSRQPNMKJHGFEDCBA98", "demo", T);
    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const off = new Date(T.getTime() + 2 * DAY_MS);
    await sweepRetention(kv, off);
    expect((await getEntitlement(kv, e.id))?.endedAt).toBe(off.toISOString());
    expect((await sweepRetention(kv, new Date(off.getTime() + 29 * DAY_MS))).deleted).toEqual([]);
    expect((await sweepRetention(kv, new Date(off.getTime() + 30 * DAY_MS + 1000))).deleted).toEqual([e.id]);
  });

  it("at most 2 deletions per sweep; the cron's list-building run sweeps every 6 hours", async () => {
    const kv = createMemoryKV();
    for (let i = 0; i < 5; i++) {
      const { e } = await account(kv, `cs_test_m${i}`, "stripe", T);
      await setStatus(kv, e, "refunded", T);
    }
    const late = new Date("2026-11-05T00:30:00Z"); // hour index divisible by 6 (00 UTC)
    const r = await runCronSlice(kv, { now: late, batch: 2 });
    expect(r.deletedAccounts).toBe(2);
    resetCronMemory();
    const r2 = await runCronSlice(kv, { now: new Date("2026-11-05T01:00:30Z"), batch: 2 }); // not a sweep hour
    expect(r2.deletedAccounts).toBeUndefined();
    expect((await sweepRetention(kv, late)).deleted.length).toBe(2);
    expect((await sweepRetention(kv, late)).deleted.length).toBe(1);
  });
});

describe("admin manual deletion (requests: within 7 days)", () => {
  it("404 without the admin token; deletes by email; warns when Stripe still bills", async () => {
    const kv = getKV();
    const { e, conn } = await account(kv, "cs_test_req", "stripe", new Date());
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email } }))).status).toBe(404);
    vi.stubEnv("ADMIN_TOKEN", "admin-token-for-tests-0123456789");
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email }, auth: "wrong-token-for-tests-0123456789" }))).status).toBe(404);
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email }, auth: "\u00e9dmin-token-for-tests-0123456789" }))).status).toBe(404); // non-ASCII: no throw
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: {}, auth: "admin-token-for-tests-0123456789" }))).status).toBe(400);
    // Still billing in Stripe → refused unless force: true.
    const refused = await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email }, auth: "admin-token-for-tests-0123456789" }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).stillBilling).toBe(true);
    expect((await getEntitlement(kv, e.id))?.deletedAt).toBeUndefined();
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email, force: "yes" }, auth: "admin-token-for-tests-0123456789" }))).status).toBe(400);
    const res = await adminDelete(req("/api/admin/accounts/delete", { body: { email: e.email, force: true }, auth: "admin-token-for-tests-0123456789" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ deleted: true, id: e.id });
    expect(body.warning).toContain("Stripe");
    await gone(kv, e, conn.id);
    const cookie = await signAccessToken({ sub: e.id, plan: "monthly" });
    expect((await state(req("/api/app/state", { cookie }))).status).toBe(401);
    expect((await adminDelete(req("/api/admin/accounts/delete", { body: { id: e.id }, auth: "admin-token-for-tests-0123456789" }))).status).toBe(200); // idempotent
  });

  it("deleteAccount keeps indexes that point at another entitlement, and waits for a running check", async () => {
    const kv = createMemoryKV();
    const { e, conn } = await account(kv, "cs_test_old", "stripe", T0());
    const old: Entitlement = { ...e, customerId: "cus_shared" };
    await kv.set("budget-guard:ent-by-customer:cus_shared", "cs_test_new"); // the customer's newer purchase
    await kv.set(`budget-guard:bg:lock:${conn.id}`, "1", { ex: 120 }); // a check is running
    expect(await deleteAccount(kv, old)).toEqual({ deletedKeys: 0, busy: true });
    expect(await getConnection(kv, e.id, conn.id)).toBeTruthy();
    await kv.del(`budget-guard:bg:lock:${conn.id}`);
    expect((await deleteAccount(kv, old)).busy).toBeFalsy();
    await gone(kv, e, conn.id);
    expect(await kv.get("budget-guard:ent-by-customer:cus_shared")).toBe("cs_test_new");
    expect(await kv.get(`budget-guard:bg:lock:${conn.id}`)).toBeNull();
  });

  it("deleteAccount costs 7 Upstash commands + 1 per connection (its lock)", async () => {
    const raw = createMemoryKV();
    const { e } = await account(raw, "cs_test_cost", "stripe", T0());
    let n = 0;
    const kv = new Proxy(raw, { get: (t, p: keyof KV) => (typeof t[p] === "function" ? (...a: unknown[]) => (n++, (t[p] as (...x: unknown[]) => unknown).apply(t, a)) : t[p]) }) as KV;
    await deleteAccount(kv, e);
    expect(n).toBe(8); // 1 connection (+1 since R3-02: SREM from the demo index too)
  });
});

function T0() {
  return new Date("2026-10-01T00:00:00Z");
}
