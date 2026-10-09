import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// after() needs a Next request scope; record the callbacks instead.
const afterCalls: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCalls.push(fn) }));

import { POST as signout } from "@/app/api/access/signout/route";
import { POST as license } from "@/app/api/access/license/route";
import { DELETE as delConn, GET as getConn, POST as postConn } from "@/app/api/app/connections/[id]/route";
import { POST as addConn } from "@/app/api/app/connections/route";
import { POST as slack } from "@/app/api/app/slack/route";
import { GET as state } from "@/app/api/app/state/route";
import { POST as complete } from "@/app/api/checkout/complete/route";
import { GET as demoGet, POST as demoPay } from "@/app/api/checkout/demo/route";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { readCookie, sameOrigin } from "@/lib/api";
import { newConsent } from "@/lib/consent";
import { setStatus, upsertEntitlement, type Entitlement } from "@/lib/entitlements";
import { getConnection } from "@/lib/guard/store";
import { createDemoCheckout } from "@/lib/payments/demo";
import { getKV } from "@/lib/redis";

const BASE = "http://localhost:3000";
const ORIGIN = BASE;

type Opts = { method?: string; body?: unknown; cookie?: string; origin?: string | null; site?: string };
function req(path: string, o: Opts = {}): Request {
  const headers = new Headers({ host: "localhost:3000" });
  if (o.body !== undefined) headers.set("content-type", "application/json");
  if (o.cookie) headers.set("cookie", `${ACCESS_COOKIE}=${o.cookie}`);
  if (o.origin !== null) headers.set("origin", o.origin ?? ORIGIN);
  if (o.site) headers.set("sec-fetch-site", o.site);
  return new Request(BASE + path, { method: o.method ?? (o.body !== undefined ? "POST" : "GET"), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function buyer(id: string): Promise<{ e: Entitlement; cookie: string }> {
  const { entitlement } = await upsertEntitlement(getKV(), { id, email: `${id}@example.com`, plan: "monthly", source: "stripe", consent: newConsent("checkout") });
  return { e: entitlement, cookie: await signAccessToken({ sub: entitlement.id, plan: entitlement.plan }) };
}

let alice: { e: Entitlement; cookie: string };
let bob: { e: Entitlement; cookie: string };
let aliceConn: string;

beforeAll(async () => {
  alice = await buyer("cs_test_alice");
  bob = await buyer("cs_test_bob");
});
afterEach(() => vi.unstubAllEnvs());

describe("sameOrigin (CSRF)", () => {
  it("accepts this site's Origin and rejects others", () => {
    expect(sameOrigin(req("/x", { method: "POST" }))).toBe(true);
    expect(sameOrigin(req("/x", { method: "POST", origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(req("/x", { method: "POST", origin: null }))).toBe(false);
    expect(sameOrigin(req("/x", { method: "POST", origin: "null" }))).toBe(false);
    expect(sameOrigin(req("/x", { method: "POST", site: "cross-site" }))).toBe(false);
  });
  it("normalises proxy headers (case, default port, lists) without trusting other origins", () => {
    const behindProxy = (origin: string, xfh: string, xfp = "https") =>
      sameOrigin(new Request("http://internal:8080/x", { method: "POST", headers: { origin, "x-forwarded-host": xfh, "x-forwarded-proto": xfp } }), []);
    expect(behindProxy("https://example.com", "Example.COM:443")).toBe(true);
    expect(behindProxy("https://example.com", "example.com, proxy.internal", "https,http")).toBe(true);
    expect(behindProxy("https://evil.example", "example.com")).toBe(false);
    expect(behindProxy("http://example.com", "example.com")).toBe(false);
  });
  it("readCookie parses the Cookie header", () => {
    expect(readCookie(new Request(BASE, { headers: { cookie: `a=1; ${ACCESS_COOKIE}=tok%2E; b=2` } }), ACCESS_COOKIE)).toBe("tok.");
  });
});

describe("/api/app/* auth", () => {
  it("GET state: 401 without / with a forged cookie, 200 with a valid one", async () => {
    expect((await state(req("/api/app/state"))).status).toBe(401);
    const forged = await signAccessToken({ sub: alice.e.id, plan: "monthly" }, new TextEncoder().encode("x".repeat(40)));
    expect((await state(req("/api/app/state", { cookie: forged }))).status).toBe(401);
    const ok = await state(req("/api/app/state", { cookie: alice.cookie }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = await ok.json();
    expect(body.me.email).toBe("cs_test_alice@example.com");
    expect(body.connections).toEqual([]);
  });

  it("POST add connection: 403 bad origin (before auth), 401 without cookie, 400 bad input, 201 ok", async () => {
    const input = { provider: "openai", label: "OpenAI prod", budgetUsd: "100", projectId: "proj_1", token: "demo", consent: true };
    expect((await addConn(req("/api/app/connections", { body: input, cookie: alice.cookie, origin: "https://evil.example" }))).status).toBe(403);
    expect((await addConn(req("/api/app/connections", { body: input, cookie: alice.cookie, origin: null }))).status).toBe(403);
    expect((await addConn(req("/api/app/connections", { body: input, cookie: alice.cookie, site: "cross-site" }))).status).toBe(403);
    expect((await addConn(req("/api/app/connections", { body: input }))).status).toBe(401);
    expect((await addConn(req("/api/app/connections", { body: { ...input, budgetUsd: "-1" }, cookie: alice.cookie }))).status).toBe(400);
    const res = await addConn(req("/api/app/connections", { body: input, cookie: alice.cookie }));
    expect(res.status).toBe(201);
    aliceConn = (await res.json()).id;
    expect(aliceConn).toMatch(/^conn_[a-f0-9]{16}$/);
  });

  it("the demo token is refused in a real production deploy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCESS_SECRET", "test-secret-test-secret-test-secret-0000");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const cookie = await signAccessToken({ sub: alice.e.id, plan: "monthly" });
    const input = { provider: "openai", label: "x", budgetUsd: "5", projectId: "proj_1", token: "demo", consent: true };
    const res = await addConn(req("/api/app/connections", { body: input, cookie }));
    expect(res.status).toBe(400);
  });

  it("connections are scoped to the account: another buyer gets 404", async () => {
    expect((await getConn(req(`/api/app/connections/${aliceConn}`, { cookie: bob.cookie }), ctx(aliceConn))).status).toBe(404);
    expect((await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "check" }, cookie: bob.cookie }), ctx(aliceConn))).status).toBe(404);
    expect((await getConn(req(`/api/app/connections/nope`, { cookie: alice.cookie }), ctx("nope"))).status).toBe(404);
  });

  it("GET connection returns the plan + challenges but never the sealed token", async () => {
    const res = await getConn(req(`/api/app/connections/${aliceConn}`, { cookie: alice.cookie }), ctx(aliceConn));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/sealed|v1\./);
    const body = JSON.parse(text);
    expect(body.plan.requests.length).toBeGreaterThan(0);
    expect(body.challenges["arm-live"]).toContain(".");
  });

  it("confirm: typed label + HMAC challenge are both required", async () => {
    const view = await (await getConn(req(`/api/app/connections/${aliceConn}`, { cookie: alice.cookie }), ctx(aliceConn))).json();
    const confirm = (challenge: string, typed: string, origin?: string) =>
      postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "confirm", action: "arm-live", challenge, typed }, cookie: alice.cookie, origin }), ctx(aliceConn));

    let r = await confirm(view.challenges["arm-live"], "wrong label");
    expect(r.status).toBe(400);
    expect((await r.json()).msg).toBe("confirm-label-mismatch");

    r = await confirm(view.challenges["arm-live"].slice(0, -2) + "xx", "OpenAI prod");
    expect((await r.json()).msg).toBe("confirm-bad-signature");

    r = await confirm(view.challenges["stop-now"], "OpenAI prod"); // challenge for another action
    expect((await r.json()).msg).toBe("confirm-wrong-target");

    r = await confirm(view.challenges["arm-live"], "OpenAI prod", "https://evil.example");
    expect(r.status).toBe(403);
    expect((await getConnection(getKV(), alice.e.id, aliceConn))?.stopMode).toBe("test");

    r = await confirm(view.challenges["arm-live"], "OpenAI prod");
    expect(r.status).toBe(200);
    expect((await r.json()).msg).toBe("armed");
    expect((await getConnection(getKV(), alice.e.id, aliceConn))?.stopMode).toBe("live");

    // Disarming needs no confirmation.
    r = await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "mode", mode: "test" }, cookie: alice.cookie }), ctx(aliceConn));
    expect((await r.json()).msg).toBe("mode-test");
  });

  it("check / test-stop / bad op", async () => {
    let r = await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "check" }, cookie: alice.cookie }), ctx(aliceConn));
    expect((await r.json()).msg).toBe("checked");
    r = await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "test-stop" }, cookie: alice.cookie }), ctx(aliceConn));
    expect((await r.json()).msg).toBe("tested");
    // While the hourly cron holds this connection, "Check now" says busy instead of checking in parallel.
    await getKV().set(`budget-guard:bg:lock:${aliceConn}`, "cron", { ex: 60 });
    r = await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "check" }, cookie: alice.cookie }), ctx(aliceConn));
    expect(r.status).toBe(409);
    expect((await r.json()).msg).toBe("busy");
    await getKV().del(`budget-guard:bg:lock:${aliceConn}`);
    r = await postConn(req(`/api/app/connections/${aliceConn}`, { body: { op: "nope" }, cookie: alice.cookie }), ctx(aliceConn));
    expect(r.status).toBe(400);
    const s = await (await state(req("/api/app/state", { cookie: alice.cookie }))).json();
    expect(s.connections[0].snapshot.spendUsd).toBeGreaterThan(0);
    expect(s.log.length).toBeGreaterThan(0);
  });

  it("slack: bad URL is 400, cross-origin is 403", async () => {
    expect((await slack(req("/api/app/slack", { body: { op: "save", url: "https://evil.example/hook" }, cookie: alice.cookie }))).status).toBe(400);
    expect((await slack(req("/api/app/slack", { body: { op: "remove" }, cookie: alice.cookie, origin: "https://evil.example" }))).status).toBe(403);
    expect((await slack(req("/api/app/slack", { body: { op: "save", url: "demo" }, cookie: alice.cookie }))).status).toBe(200);
  });

  it("DELETE: cross-origin 403, then 200", async () => {
    expect((await delConn(req(`/api/app/connections/${aliceConn}`, { method: "DELETE", cookie: alice.cookie, origin: "https://evil.example" }), ctx(aliceConn))).status).toBe(403);
    expect((await delConn(req(`/api/app/connections/${aliceConn}`, { method: "DELETE", cookie: alice.cookie }), ctx(aliceConn))).status).toBe(200);
    expect(await getConnection(getKV(), alice.e.id, aliceConn)).toBeUndefined();
  });

  it("a canceled entitlement loses access (401)", async () => {
    const carol = await buyer("cs_test_carol");
    await setStatus(getKV(), carol.e, "canceled");
    expect((await state(req("/api/app/state", { cookie: carol.cookie }))).status).toBe(401);
  });
});

describe("/api/access/*", () => {
  it("license sign-in: 403 cross-origin, 401 unknown key, cookie on success", async () => {
    expect((await license(req("/api/access/license", { body: { license: alice.e.licenseKey }, origin: "https://evil.example" }))).status).toBe(403);
    expect((await license(req("/api/access/license", { body: { license: "SLAB-0000-0000-0000" } }))).status).toBe(401);
    const ok = await license(req("/api/access/license", { body: { license: alice.e.licenseKey } }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(new RegExp(`${ACCESS_COOKIE}=.+HttpOnly`, "i"));
    expect(ok.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
  });
  it("sign-out requires same origin", async () => {
    expect((await signout(req("/api/access/signout", { body: {}, origin: "https://evil.example" }))).status).toBe(403);
    expect((await signout(req("/api/access/signout", { body: {} }))).status).toBe(200);
  });
});

describe("/api/checkout/demo + /api/checkout/complete", () => {
  const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA", consent: true };

  it("pays with a test card, keeps last4 only, then completes into an entitlement", async () => {
    const kv = getKV();
    const co = await createDemoCheckout(kv, "monthly");
    const info = await (await demoGet(req(`/api/checkout/demo?id=${co.id}`))).json();
    expect(info.state).toBe("pending");

    expect((await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card }, origin: "https://evil.example" }))).status).toBe(403);
    const bad = await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card, number: "4242 4242 4242 4241" } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors.number).toBeTruthy();

    // Not paid yet → complete says not paid.
    expect((await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).status).toBe(404);

    const paid = await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card } }));
    expect(paid.status).toBe(200);
    expect((await paid.json()).redirect).toBe(`/success?session_id=${co.id}`);
    const stored = (await kv.get(`budget-guard:demo-checkout:${co.id}`)) ?? "";
    expect(stored).toContain('"last4":"4242"');
    expect(stored).not.toContain("4242 4242");
    expect(stored).not.toContain("123\"");

    const done = await complete(req("/api/checkout/complete", { body: { session_id: co.id } }));
    expect(done.status).toBe(200);
    const body = await done.json();
    expect(body).toMatchObject({ paid: true, demo: true, active: true });
    expect(body.licenseKey).toMatch(/^SLAB-/);
    expect(afterCalls.length).toBeGreaterThan(0); // license email queued after the response
  });

  it("refuses demo payments in stripe mode", async () => {
    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const co = await createDemoCheckout(getKV(), "monthly");
    expect((await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card } }))).status).toBe(403);
    expect((await demoGet(req(`/api/checkout/demo?id=${co.id}`))).status).toBe(404);
    expect((await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).status).toBe(404);
  });
});
