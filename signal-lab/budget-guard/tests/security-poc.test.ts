import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// The Atlas review's PoCs (qa/p2-security/poc-baseline.test.ts.txt, written against 88cc595),
// turned around: each one now asserts that the attack / failure no longer works.
// Fix details and the remaining items: docs/security-review-atlas.md.

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (_fn: () => unknown) => undefined }));

import { POST as signout } from "@/app/api/access/signout/route";
import { GET as state } from "@/app/api/app/state/route";
import { POST as complete } from "@/app/api/checkout/complete/route";
import { POST as demoPay } from "@/app/api/checkout/demo/route";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { findByEmail, getEntitlement, upsertEntitlement } from "@/lib/entitlements";
import { checkConnection, type Connection } from "@/lib/guard/check";
import { decryptSecret, encryptionKey } from "@/lib/guard/crypto";
import { demoFetch } from "@/lib/guard/demo";
import { devOutbox } from "@/lib/mail";
import { checkConnectionLocked, handleVercelWebhook, setVercelWebhookSecret } from "@/lib/guard/service";
import { addConnection, getLog, updateConnection } from "@/lib/guard/store";
import { createDemoCheckout } from "@/lib/payments/demo";
import { createMemoryKV, getKV } from "@/lib/redis";

const BASE = "http://localhost:3000";
function req(path: string, o: { body?: unknown; cookie?: string } = {}): Request {
  const headers = new Headers({ host: "localhost:3000", origin: BASE });
  if (o.body !== undefined) headers.set("content-type", "application/json");
  if (o.cookie) headers.set("cookie", `${ACCESS_COOKIE}=${o.cookie}`);
  return new Request(BASE + path, { method: o.body !== undefined ? "POST" : "GET", headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const vconn = (stopMode: Connection["stopMode"], budgetUsd = 50): Connection => ({
  id: "c1",
  label: "Vercel prod",
  budgetUsd,
  stopMode,
  sealedToken: "",
  target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] },
});

describe("Atlas PoCs (baseline 88cc595) — the attacks now fail", () => {
  it("R3-01: a test-mode dry run no longer blocks the live stop after arming", async () => {
    const f = demoFetch({ vercel: 60 });
    const t = await checkConnection(vconn("test"), undefined, { token: "t", fetchImpl: f, now: new Date("2026-10-15T10:00:00Z") });
    expect(t.state.stoppedAt).toBeUndefined();
    expect(t.state.stopTestedAt).toBeTruthy();
    const live = await checkConnection(vconn("live"), t.state, { token: "t", fetchImpl: f, now: new Date("2026-10-15T11:00:00Z") });
    expect(live.stop).toMatchObject({ dryRun: false, ok: true });
    expect(live.notices.map((n) => n.kind)).toContain("stopped");
  });

  it("R3-07: a non-numeric spend is an error, not level ok", async () => {
    const f = async () => Response.json({ data: [{ results: [{ amount: { value: "n/a", currency: "usd" } }] }], has_more: false });
    const r = await checkConnection({ ...vconn("live"), target: { provider: "openai", projectId: "p" } }, undefined, { token: "t", fetchImpl: f, now: new Date("2026-10-15T10:00:00Z") });
    expect(r.evaluation).toBeUndefined();
    expect(r.notices.map((n) => n.kind)).toEqual(["error"]);
  });

  it("R1-06: a 4-byte GCM tag is refused", () => {
    const key = encryptionKey();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from("conn_x"));
    const ct = Buffer.concat([c.update("secret", "utf8"), c.final()]);
    const tag = c.getAuthTag().subarray(0, 4);
    const sealed = ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
    expect(() => decryptSecret(sealed, "conn_x")).toThrow(/Malformed/);
  });

  it("R1-04: NODE_ENV unset → no dev key (fail closed)", () => {
    expect(() => encryptionKey({} as NodeJS.ProcessEnv)).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("R1-01: an undecryptable token is reported to the operator (console.error, id only)", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "dev_r101", email: "r101@example.com", plan: "monthly", source: "demo" });
    const conn = await addConnection(kv, entitlement.id, { label: "L", target: { provider: "vercel", teamId: "t", projectIds: ["p"] }, budgetUsd: 10, token: "demo" }, randomBytes(32));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await checkConnectionLocked(kv, entitlement.id, conn.id, new Date(), { email: entitlement.email });
    expect(r.status === "checked" && r.notices.map((n) => n.kind)).toEqual(["error"]);
    const logged = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain(conn.id);
    expect(logged).not.toContain(conn.sealedToken);
  });

  it("R2-01: the checkout id no longer reveals the license key 30 days later", async () => {
    const kv = getKV();
    const co = await createDemoCheckout(kv, "monthly", "victim1@example.com");
    await demoPay(req("/api/checkout/demo", { body: { id: co.id, number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "A B", consent: true } }));
    const first = await (await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).json();
    expect(first.licenseKey).toMatch(/^SLAB-/);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 30 * 24 * 3600 * 1000);
    const late = await (await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).json();
    expect(late.licenseKey).toBeNull();
  });

  it("R2-02: a copied cookie stops working after sign-out", async () => {
    const { entitlement } = await upsertEntitlement(getKV(), { id: "cs_test_poc202", email: "poc202@example.com", plan: "monthly", source: "stripe" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    expect((await state(req("/api/app/state", { cookie }))).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-09T10:00:05Z"));
    await signout(req("/api/access/signout", { body: {}, cookie }));
    expect((await state(req("/api/app/state", { cookie }))).status).toBe(401);
  });

  it("R2-03: a demo purchase can't take over an active demo entitlement's email index", async () => {
    const kv = createMemoryKV();
    await upsertEntitlement(kv, { id: "demo_victimAAAAAAAAAAAAAAAA", email: "v@example.com", plan: "monthly", source: "demo" });
    await upsertEntitlement(kv, { id: "demo_attackerBBBBBBBBBBBBBB", email: "v@example.com", plan: "monthly", source: "demo" });
    expect((await findByEmail(kv, "v@example.com"))?.id).toBe("demo_victimAAAAAAAAAAAAAAAA");
  });

  it("R3-03: Vercel's 100% alert alone no longer stops a connection far below its Budget Guard budget ($42.50 of $1000)", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "dev_r303", email: "r303@example.com", plan: "monthly", source: "demo" });
    const conn = await addConnection(kv, entitlement.id, { label: "V", target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] }, budgetUsd: 1000, token: "demo" });
    await setVercelWebhookSecret(kv, entitlement.id, conn.id, "s3cret-value");
    await updateConnection(kv, entitlement.id, conn.id, { stopMode: "live" });
    const body = JSON.stringify({ budgetAmount: 20, currentSpend: 20, teamId: "team_1", thresholdPercent: 100 });
    const sig = createHmac("sha1", "s3cret-value").update(body).digest("hex");
    const oct = await handleVercelWebhook(kv, conn.id, body, sig, new Date("2026-10-20T00:00:00Z"));
    expect(oct.outcome.result).toBe("handled");
    await oct.followUp?.();
    expect((await getLog(kv, entitlement.id)).map((e) => e.kind)).not.toContain("stopped");
  });

  it("R2-04/R3-09: the same signed 100% body replayed next month is a duplicate (no second forced stop)", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "dev_replay", email: "rp@example.com", plan: "monthly", source: "demo" });
    const conn = await addConnection(kv, entitlement.id, { label: "V", target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] }, budgetUsd: 1000, token: "demo" });
    await setVercelWebhookSecret(kv, entitlement.id, conn.id, "s3cret-value");
    // Opted in to "Stop on Vercel's 100% alert" (R3-03), so the October alert is a real stop.
    await updateConnection(kv, entitlement.id, conn.id, { stopMode: "live", vercelLimitStops: true });
    const body = JSON.stringify({ budgetAmount: 20, currentSpend: 20, teamId: "team_1", thresholdPercent: 100 });
    const sig = createHmac("sha1", "s3cret-value").update(body).digest("hex");
    const oct = await handleVercelWebhook(kv, conn.id, body, sig, new Date("2026-10-20T00:00:00Z"));
    await oct.followUp?.();
    expect(oct.outcome.result).toBe("handled");
    const nov = await handleVercelWebhook(kv, conn.id, body, sig, new Date("2026-11-02T00:00:00Z"));
    expect(nov.outcome.result).toBe("duplicate");
    expect(nov.followUp).toBeUndefined();
    const kinds = (await getLog(kv, entitlement.id)).map((e) => e.kind);
    expect(kinds.filter((k) => k === "stopped").length).toBe(1);
    expect(kinds.filter((k) => k === "vercel-alert").length).toBe(1);
    expect(await getEntitlement(kv, entitlement.id)).toBeTruthy();
    expect(devOutbox.length).toBeGreaterThan(0);
  });
});
