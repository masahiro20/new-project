import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Regression tests for the P2 security review (Atlas, qa/p2-security). One describe per finding.

// after() needs a Next request scope; record the callbacks instead.
const afterCalls: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCalls.push(fn) }));

import { GET as getConn, POST as postConn } from "@/app/api/app/connections/[id]/route";
import { POST as signout } from "@/app/api/access/signout/route";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { GET as state } from "@/app/api/app/state/route";
import { POST as complete } from "@/app/api/checkout/complete/route";
import { GET as demoPortal } from "@/app/api/checkout/demo/portal/route";
import { POST as demoPay } from "@/app/api/checkout/demo/route";
import { POST as magic } from "@/app/api/access/magic/route";
import { POST as addConn } from "@/app/api/app/connections/route";
import { ACCESS_COOKIE, accessSecret, signAccessToken } from "@/lib/access";
import { newConsent } from "@/lib/consent";
import { findByEmail, setStatus, upsertEntitlement } from "@/lib/entitlements";
import { checkConnection, migrateLegacyStop, type Connection } from "@/lib/guard/check";
import { decryptSecret, encryptionKey, encryptSecret } from "@/lib/guard/crypto";
import { demoFetch } from "@/lib/guard/demo";
import { ProviderHttpError } from "@/lib/guard/providers";
import { redactSecrets } from "@/lib/guard/redact";
import { resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { checkConnectionLocked, providerFetch } from "@/lib/guard/service";
import { addConnection, appendLog, getLog, getState, removeConnection, saveState, updateConnection } from "@/lib/guard/store";
import { createDemoCheckout, DEMO_CHECKOUTS_PER_DAY } from "@/lib/payments/demo";
import { createMemoryKV, getKV, upstashErrorMessage } from "@/lib/redis";

const BASE = "http://localhost:3000";
type Opts = { method?: string; body?: unknown; cookie?: string };
function req(path: string, o: Opts = {}): Request {
  const headers = new Headers({ host: "localhost:3000", origin: BASE });
  if (o.body !== undefined) headers.set("content-type", "application/json");
  if (o.cookie) headers.set("cookie", `${ACCESS_COOKIE}=${o.cookie}`);
  return new Request(BASE + path, { method: o.method ?? (o.body !== undefined ? "POST" : "GET"), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const vercelConn = (stopMode: Connection["stopMode"], budgetUsd = 50): Connection => ({
  id: "conn_r301",
  label: "Vercel prod",
  budgetUsd,
  stopMode,
  sealedToken: "",
  target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] },
});

describe("R3-01: a test-mode dry run must not block the live stop after arming", () => {
  it("test → live in the same month: the next check runs the stop", async () => {
    const f = demoFetch({ vercel: 60 }); // $60 of $50
    const test = await checkConnection(vercelConn("test"), undefined, { token: "t", fetchImpl: f, now: new Date("2026-10-15T10:00:00Z") });
    expect(test.notices.map((n) => n.kind)).toContain("stop-test");
    expect(test.state.stoppedAt).toBeUndefined();
    expect(test.state.stopTestedAt).toBeTruthy();

    // Test mode still records the dry run once a month.
    const again = await checkConnection(vercelConn("test"), test.state, { token: "t", fetchImpl: f, now: new Date("2026-10-15T11:00:00Z") });
    expect(again.notices.map((n) => n.kind)).not.toContain("stop-test");

    const live = await checkConnection(vercelConn("live"), again.state, { token: "t", fetchImpl: f, now: new Date("2026-10-15T12:00:00Z") });
    expect(live.stop?.dryRun).toBe(false);
    expect(live.stop?.ok).toBe(true);
    expect(live.notices.map((n) => n.kind)).toContain("stopped");
    expect(live.state.stoppedAt).toBeTruthy();

    // ...and only once a month in live mode, too.
    const after = await checkConnection(vercelConn("live"), live.state, { token: "t", fetchImpl: f, now: new Date("2026-10-15T13:00:00Z") });
    expect(after.stop).toBeUndefined();
  });

  // Data written before the fix: migrated when read (migrateLegacyStop), not on arm-live — clearing
  // stoppedAt on arm-live would allow a second live stop in a month (live → test → live).
  const NOW = new Date("2026-10-15T12:00:00Z");
  const legacy = { period: "2026-10", stoppedAt: "2026-10-15T09:00:00.000Z", limitNotifiedAt: "x" };
  const dryRunEntry = { kind: "stop-test" as const, connectionId: "conn_r301", at: legacy.stoppedAt, message: "TEST MODE — would have run: …" };

  it("migrateLegacyStop: a dry run proven by the log becomes stopTestedAt", () => {
    expect(migrateLegacyStop(legacy, [dryRunEntry], "conn_r301", NOW)).toEqual({ period: "2026-10", stopTestedAt: legacy.stoppedAt, limitNotifiedAt: "x", stopModel: 2 });
  });
  it("migrateLegacyStop: a real stop, or one whose entry left the log, stays a stop", () => {
    const real = { ...dryRunEntry, kind: "stopped" as const, message: "Stopped: …" };
    expect(migrateLegacyStop(legacy, [real], "conn_r301", NOW)?.stoppedAt).toBe(legacy.stoppedAt);
    expect(migrateLegacyStop(legacy, [], "conn_r301", NOW)?.stoppedAt).toBe(legacy.stoppedAt);
    // Another connection's dry run at the same second proves nothing for this one.
    expect(migrateLegacyStop(legacy, [{ ...dryRunEntry, connectionId: "conn_other" }], "conn_r301", NOW)?.stoppedAt).toBe(legacy.stoppedAt);
    // The "Stop action ARMED" entry is kind stop-test too, but not a dry run.
    expect(migrateLegacyStop(legacy, [{ ...dryRunEntry, message: "Stop action ARMED (live): …" }], "conn_r301", NOW)?.stoppedAt).toBe(legacy.stoppedAt);
  });
  it("migrateLegacyStop: states written by the new code are left alone", () => {
    const fresh = { period: "2026-10", stoppedAt: legacy.stoppedAt, stopModel: 2 as const };
    expect(migrateLegacyStop(fresh, [dryRunEntry], "conn_r301", NOW)).toBe(fresh);
  });

  it("legacy dry-run stoppedAt + armed live: the next locked check runs the stop and saves stopModel 2", async () => {
    const kv = createMemoryKV();
    const conn = await addConnection(kv, "acct_r301", { label: "OpenAI prod", target: { provider: "openai", projectId: "proj_1" }, budgetUsd: 10, token: "demo" });
    await updateConnection(kv, "acct_r301", conn.id, { stopMode: "live" });
    await saveState(kv, "acct_r301", conn.id, legacy);
    await appendLog(kv, "acct_r301", [{ ...dryRunEntry, connectionId: conn.id }]);
    const r = await checkConnectionLocked(kv, "acct_r301", conn.id, NOW);
    expect(r.status === "checked" && r.notices.map((n) => n.kind)).toContain("stopped");
    const s = await getState(kv, "acct_r301", conn.id);
    expect(s).toMatchObject({ stoppedAt: NOW.toISOString(), stopTestedAt: legacy.stoppedAt, stopModel: 2, limitNotifiedAt: "x" });
  });

  it("live stop → test → live in one month: no second stop (once a month)", async () => {
    const kv = createMemoryKV();
    const conn = await addConnection(kv, "acct_r301b", { label: "OpenAI prod", target: { provider: "openai", projectId: "proj_1" }, budgetUsd: 10, token: "demo" });
    await updateConnection(kv, "acct_r301b", conn.id, { stopMode: "live" });
    const first = await checkConnectionLocked(kv, "acct_r301b", conn.id, NOW);
    expect(first.status === "checked" && first.notices.map((n) => n.kind)).toContain("stopped");
    await updateConnection(kv, "acct_r301b", conn.id, { stopMode: "test" });
    const inTest = await checkConnectionLocked(kv, "acct_r301b", conn.id, new Date("2026-10-15T13:00:00Z"));
    expect(inTest.status === "checked" && inTest.notices).toEqual([]); // no TEST MODE mail after a real stop
    await updateConnection(kv, "acct_r301b", conn.id, { stopMode: "live" });
    const third = await checkConnectionLocked(kv, "acct_r301b", conn.id, new Date("2026-10-15T14:00:00Z"));
    expect(third.status === "checked" && third.notices.map((n) => n.kind)).not.toContain("stopped");
  });
});

describe("R1-06: AES-GCM tag / IV length are fixed (16 / 12 bytes)", () => {
  const key = randomBytes(32);
  /** Seal with a truncated tag, as a forger with KV write access would try. */
  function sealShortTag(plain: string, aad: string, tagBytes: number): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv, { authTagLength: tagBytes });
    c.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
  }
  it("rejects 4- and 8-byte tags (Node accepts them without authTagLength)", () => {
    expect(() => decryptSecret(sealShortTag("sk-secret", "conn_x", 4), "conn_x", key)).toThrow();
    expect(() => decryptSecret(sealShortTag("sk-secret", "conn_x", 8), "conn_x", key)).toThrow();
  });
  it("rejects a non-12-byte IV and a truncated tag from a real ciphertext", () => {
    const [v, iv, tag, ct] = encryptSecret("sk-secret", "conn_x", key).split(".");
    const shortTag = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptSecret([v, iv, shortTag, ct].join("."), "conn_x", key)).toThrow();
    const longIv = Buffer.concat([Buffer.from(iv, "base64url"), Buffer.alloc(4)]).toString("base64url");
    expect(() => decryptSecret([v, longIv, tag, ct].join("."), "conn_x", key)).toThrow();
  });
  it("still opens normal ciphertexts (16-byte tag) — existing data stays readable", () => {
    expect(decryptSecret(encryptSecret("sk-secret", "conn_x", key), "conn_x", key)).toBe("sk-secret");
    expect(encryptSecret("sk-secret", "conn_x", key).split(".")[2]).toHaveLength(22); // 16 bytes base64url
  });
});

describe("R1-04: the public dev key only in development / test", () => {
  it("throws when NODE_ENV is unset, staging or production and no key is set", () => {
    for (const NODE_ENV of [undefined, "", "staging", "production"]) {
      expect(() => encryptionKey({ NODE_ENV } as NodeJS.ProcessEnv)).toThrow("TOKEN_ENCRYPTION_KEY is not set");
    }
  });
  it("uses the dev key in development / test, and a set key everywhere", () => {
    expect(encryptionKey({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toHaveLength(32);
    expect(encryptionKey({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toHaveLength(32);
    const k = randomBytes(32);
    expect(encryptionKey({ TOKEN_ENCRYPTION_KEY: k.toString("base64") } as unknown as NodeJS.ProcessEnv).equals(k)).toBe(true);
  });
});

describe("R1-02: key rotation (TOKEN_ENCRYPTION_KEY_PREVIOUS)", () => {
  it("opens data sealed with a previous key, seals new data with the current key", () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const sealedOld = encryptSecret("sk-old", "conn_rot", oldKey);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", newKey.toString("base64"));
    expect(() => decryptSecret(sealedOld, "conn_rot")).toThrow(); // without the previous key: unreadable
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", ` ${randomBytes(32).toString("base64")}, ${oldKey.toString("base64")} `);
    expect(decryptSecret(sealedOld, "conn_rot")).toBe("sk-old");
    const sealedNew = encryptSecret("sk-new", "conn_rot");
    expect(decryptSecret(sealedNew, "conn_rot", newKey)).toBe("sk-new");
    expect(() => decryptSecret(sealedNew, "conn_rot", oldKey)).toThrow();
    // An explicit key never falls back to the others.
    expect(() => decryptSecret(sealedOld, "conn_rot", newKey)).toThrow();
  });
  it("a malformed previous key is a clear error", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_PREVIOUS", "short");
    expect(() => decryptSecret(encryptSecret("x", "a", randomBytes(32)), "a")).toThrow("TOKEN_ENCRYPTION_KEY_PREVIOUS");
  });
});

describe("R1-01: a token that can't be decrypted is reported to the operator", () => {
  it("logs console.error with the connection id (never the sealed value)", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "dev_r101", email: "r101@example.com", plan: "monthly", source: "demo" });
    // Sealed with a key the server doesn't have (rotated / wrong TOKEN_ENCRYPTION_KEY).
    const conn = await addConnection(kv, entitlement.id, { label: "L", target: { provider: "vercel", teamId: "t", projectIds: ["p"] }, budgetUsd: 10, token: "demo" }, randomBytes(32));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await checkConnectionLocked(kv, entitlement.id, conn.id, new Date(), { email: entitlement.email });
    expect(r.status).toBe("checked");
    expect(err).toHaveBeenCalledOnce();
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain(conn.id);
    expect(line).not.toContain(conn.sealedToken);
    expect(r.status === "checked" && r.tokenError).toBe(true);
    err.mockRestore();
  });

  it("the cron run counts it (tokenErrors), so the invocation fails visibly", async () => {
    vi.stubEnv("PAYMENTS_MODE", "demo");
    resetCronMemory();
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_r101c", email: "r101c@example.com", plan: "monthly", source: "stripe" });
    await addConnection(kv, entitlement.id, { label: "L", target: { provider: "openai", projectId: "p" }, budgetUsd: 10, token: "sk-proj-not-a-real-key-0000" }, randomBytes(32));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runCronSlice(kv, { now: new Date(), interval: 1 });
    expect(r).toMatchObject({ checked: 1, tokenErrors: 1 });
    err.mockRestore();
  });
});

describe("R1-05: provider error bodies are redacted before they reach mail / Slack / logs", () => {
  it("masks key-like strings, bearer tokens and token fields", () => {
    const out = redactSecrets('Incorrect API key provided: sk-admin-abcd1234****wxyz. Authorization: Bearer abcdef123456 {"token":"tok_9f3c8a7b"}');
    expect(out).not.toMatch(/abcd1234|abcdef123456|tok_9f3c8a7b/);
    expect(out).toContain("sk-[redacted]");
    expect(out).toContain("Incorrect API key provided");
  });
  it("ProviderHttpError carries the redacted body", () => {
    const e = new ProviderHttpError("api.openai.com", 401, "Incorrect API key provided: sk-proj-1234567890abcdef");
    expect(e.message).toBe("api.openai.com 401: Incorrect API key provided: sk-[redacted]");
  });
});

describe("R2-01: the checkout id reveals the license key only within 24h of purchase", () => {
  it("returns the key right after purchase and at 23h, but not after 24h", async () => {
    const kv = getKV();
    const co = await createDemoCheckout(kv, "monthly", "r201@example.com");
    const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA" };
    expect((await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card, consent: true } }))).status).toBe(200);
    const first = await (await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).json();
    expect(first.licenseKey).toMatch(/^SLAB-/);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 23 * 3600 * 1000);
    expect((await (await complete(req("/api/checkout/complete", { body: { session_id: co.id } }))).json()).licenseKey).toBe(first.licenseKey);

    vi.setSystemTime(Date.now() + 2 * 3600 * 1000); // 25h after purchase
    const late = await complete(req("/api/checkout/complete", { body: { session_id: co.id } }));
    expect(late.status).toBe(200);
    const body = await late.json();
    expect(body).toMatchObject({ paid: true, active: true, licenseKey: null });
    expect(JSON.stringify(body)).not.toContain(first.licenseKey);
  });
});

describe("R2-02: sign-out revokes the account's access cookies server side", () => {
  it("a copied cookie is rejected after sign-out; a new sign-in works", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
    const kv = getKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_r202", email: "r202@example.com", plan: "monthly", source: "stripe" });
    const stolen = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    expect((await state(req("/api/app/state", { cookie: stolen }))).status).toBe(200);

    vi.setSystemTime(new Date("2026-10-09T10:05:00Z"));
    expect((await signout(req("/api/access/signout", { body: {}, cookie: stolen }))).status).toBe(200);
    expect((await state(req("/api/app/state", { cookie: stolen }))).status).toBe(401);

    vi.setSystemTime(new Date("2026-10-09T10:06:00Z"));
    const fresh = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    expect((await state(req("/api/app/state", { cookie: fresh }))).status).toBe(200);
  });
  it("sign-out without a cookie still answers 200 and changes nothing", async () => {
    expect((await signout(req("/api/access/signout", { body: {} }))).status).toBe(200);
  });
  it("the demo portal also rejects a signed-out cookie", async () => {
    vi.stubEnv("PAYMENTS_MODE", "demo");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T11:00:00Z"));
    const kv = getKV();
    const co = await createDemoCheckout(kv, "monthly", "r202d@example.com");
    const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA" };
    await demoPay(req("/api/checkout/demo", { body: { id: co.id, ...card, consent: true } }));
    await complete(req("/api/checkout/complete", { body: { session_id: co.id } }));
    const cookie = await signAccessToken({ sub: co.id, plan: "monthly" });
    expect((await demoPortal(req("/api/checkout/demo/portal", { cookie }))).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-09T11:05:00Z"));
    await signout(req("/api/access/signout", { body: {}, cookie }));
    expect((await demoPortal(req("/api/checkout/demo/portal", { cookie }))).status).toBe(401);
  });
});

describe("R2-03: a demo purchase never takes over the email index of an active entitlement", () => {
  it("an attacker's demo purchase with the victim's email leaves the magic link pointing at the victim", async () => {
    const kv = createMemoryKV();
    await upsertEntitlement(kv, { id: "demo_victimAAAAAAAAAAAAAAAA", email: "V@example.com", plan: "monthly", source: "demo" });
    await upsertEntitlement(kv, { id: "demo_attackerBBBBBBBBBBBBBB", email: "v@example.com", plan: "monthly", source: "demo" });
    expect((await findByEmail(kv, "v@example.com"))?.id).toBe("demo_victimAAAAAAAAAAAAAAAA");
  });
  it("a lapsed demo entitlement can still be replaced by a new demo purchase", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "demo_oldCCCCCCCCCCCCCCCCCCC", email: "w@example.com", plan: "monthly", source: "demo" });
    await setStatus(kv, entitlement, "canceled");
    await upsertEntitlement(kv, { id: "demo_newDDDDDDDDDDDDDDDDDDD", email: "w@example.com", plan: "monthly", source: "demo" });
    expect((await findByEmail(kv, "w@example.com"))?.id).toBe("demo_newDDDDDDDDDDDDDDDDDDD");
  });
});

describe("R3-05: provider calls have a timeout and never follow redirects", () => {
  it("passes redirect: manual + an abort signal, and refuses a 3xx", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response(null, { status: 307, headers: { location: "https://elsewhere.example/" } });
    });
    try {
      await expect(providerFetch("https://api.anthropic.com/v1/x", { method: "POST", headers: { "x-api-key": "k" } })).rejects.toThrow("redirect refused");
      expect(seen[0].redirect).toBe("manual");
      expect(seen[0].signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("R3-07: a non-numeric spend is a fetch error, not \"ok\"", () => {
  it("NaN from the provider is reported and never evaluated", async () => {
    const f = async () => Response.json({ data: [{ results: [{ amount: { value: "n/a", currency: "usd" } }] }], has_more: false });
    const conn: Connection = { ...vercelConn("live"), target: { provider: "openai", projectId: "proj_1" } };
    const r = await checkConnection(conn, undefined, { token: "t", fetchImpl: f, now: new Date("2026-10-15T10:00:00Z") });
    expect(r.evaluation).toBeUndefined();
    expect(r.notices).toEqual([expect.objectContaining({ kind: "error", message: expect.stringContaining("non-numeric spend") })]);
  });
});

describe("R2-09: admin/stats compares byte lengths (no 500 on a multi-byte header)", () => {
  it("a Latin-1 header of the same string length is a plain 404", async () => {
    vi.stubEnv("ADMIN_TOKEN", "admin-token-0123456789");
    const wrong = "admin-token-012345678\u00e9"; // same string length, one more byte in UTF-8
    const res = await adminStats(new Request("http://x/api/admin/stats", { headers: { authorization: `Bearer ${wrong}` } }));
    expect(res.status).toBe(404);
    const ok = await adminStats(new Request("http://x/api/admin/stats", { headers: { authorization: "Bearer admin-token-0123456789" } }));
    expect(ok.status).toBe(200);
  });
});

// --- Fixes added while taking the review in (no Atlas patch) -------------------------------------

describe("R3-02: demo purchases are capped site-wide per day", () => {
  it("after DEMO_CHECKOUTS_PER_DAY paid demo checkouts, the next one is refused (429)", async () => {
    vi.stubEnv("PAYMENTS_MODE", "demo");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
    const kv = getKV();
    await kv.set("budget-guard:rl:demo-paid:2026-10-12", String(DEMO_CHECKOUTS_PER_DAY - 1));
    const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA", consent: true };
    const a = await createDemoCheckout(kv, "monthly", "cap1@example.com");
    expect((await demoPay(req("/api/checkout/demo", { body: { id: a.id, ...card } }))).status).toBe(200);
    const b = await createDemoCheckout(kv, "monthly", "cap2@example.com");
    expect((await demoPay(req("/api/checkout/demo", { body: { id: b.id, ...card } }))).status).toBe(429);
    vi.setSystemTime(new Date("2026-10-13T00:00:01Z")); // next UTC day
    expect((await demoPay(req("/api/checkout/demo", { body: { id: b.id, ...card } }))).status).toBe(200);
  });
});

describe("R1-13 / ACCESS_SECRET: published dummy secrets and a missing secret fail closed", () => {
  const zeroKey = Buffer.alloc(32).toString("base64");
  it("the all-zero TOKEN_ENCRYPTION_KEY is refused outside dev/test, warned in an explicit demo", () => {
    expect(() => encryptionKey({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: zeroKey } as NodeJS.ProcessEnv)).toThrow(/example value/);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(encryptionKey({ NODE_ENV: "production", PAYMENTS_MODE: "demo", TOKEN_ENCRYPTION_KEY: zeroKey } as NodeJS.ProcessEnv).length).toBe(32);
    expect(encryptionKey({ NODE_ENV: "test", TOKEN_ENCRYPTION_KEY: zeroKey } as NodeJS.ProcessEnv).length).toBe(32);
    warn.mockRestore();
    expect(encryptionKey({ NODE_ENV: "production", TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") } as NodeJS.ProcessEnv).length).toBe(32);
  });
  it("ACCESS_SECRET: unset is an error unless NODE_ENV is development/test; the example value too", () => {
    expect(() => accessSecret({})).toThrow(/ACCESS_SECRET/);
    expect(() => accessSecret({ NODE_ENV: "staging" })).toThrow(/ACCESS_SECRET/);
    expect(accessSecret({ NODE_ENV: "test" }).length).toBeGreaterThan(0);
    expect(() => accessSecret({ NODE_ENV: "production", ACCESS_SECRET: "local-dummy-access-secret-change-me-0123456789" })).toThrow(/example value/);
    expect(accessSecret({ NODE_ENV: "production", ACCESS_SECRET: "x".repeat(20) + randomBytes(12).toString("hex") }).length).toBeGreaterThan(0);
  });
});

describe("R2-07: magic links are limited per recipient too", () => {
  it("a 4th request for one address within 10 minutes answers the same but sends nothing", async () => {
    const before = afterCalls.length;
    for (let i = 0; i < 4; i++) {
      const res = await magic(req("/api/access/magic", { body: { email: "flood-target@example.com" } }));
      expect(res.status).toBe(200);
    }
    expect(afterCalls.length - before).toBe(3);
  });
});

describe("R1-10: add-connection is rate limited per account", () => {
  it("the 11th attempt in an hour is 429 before any provider call", async () => {
    const kv = getKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_r110", email: "r110@example.com", plan: "monthly", source: "stripe", consent: newConsent("checkout") });
    const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    const body = { provider: "openai", label: "x", budgetUsd: "100", projectId: "proj_1", token: "sk-proj-not-a-real-key-0000", consent: true };
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url), new Response("unauthorized", { status: 401 })));
    for (let i = 0; i < 10; i++) expect((await addConn(req("/api/app/connections", { body, cookie }))).status).toBe(400);
    const n = calls.length;
    expect((await addConn(req("/api/app/connections", { body, cookie }))).status).toBe(429);
    expect(calls.length).toBe(n);
    vi.unstubAllGlobals();
  });
});

describe("R1-12: Upstash errors don't carry the command (keys / values)", () => {
  it("drops ', command was: …'", () => {
    const msg = upstashErrorMessage("set", new Error('ERR max requests limit exceeded, command was: ["set","budget-guard:ent-by-email:a@example.com","v1.sealed"]'));
    expect(msg).toBe("Upstash set failed: ERR max requests limit exceeded");
  });
});

describe("R3-11: stop failures mail once a month; a manual stop takes the lock and counts as this month's stop", () => {
  it("a failing stop is retried every check but reported once", async () => {
    const failing = Object.assign(async (url: string, init: RequestInit) => ((init.method ?? "GET") === "GET" ? demoFetch({ vercel: 60 })(url, init) : new Response("boom", { status: 500 })), { calls: [] });
    const t1 = await checkConnection(vercelConn("live"), undefined, { token: "t", fetchImpl: failing, now: new Date("2026-10-15T10:00:00Z") });
    expect(t1.notices.map((n) => n.kind)).toContain("stop-failed");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const t2 = await checkConnection(vercelConn("live"), t1.state, { token: "t", fetchImpl: failing, now: new Date("2026-10-15T11:00:00Z") });
    expect(t2.stop?.ok).toBe(false); // retried
    expect(t2.notices.map((n) => n.kind)).not.toContain("stop-failed"); // not mailed again
    err.mockRestore();
  });

  it("stop-now is refused (409) while a check holds the lock, and afterwards blocks the automatic stop this month", async () => {
    const kv = getKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_r311", email: "r311@example.com", plan: "monthly", source: "stripe", consent: newConsent("checkout") });
    const cookie = await signAccessToken({ sub: entitlement.id, plan: entitlement.plan });
    const conn = await addConnection(kv, entitlement.id, { label: "OpenAI prod", target: { provider: "openai", projectId: "proj_1" }, budgetUsd: 10, token: "demo" });
    const view = await (await getConn(req(`/api/app/connections/${conn.id}`, { cookie }), ctx(conn.id))).json();
    const body = { op: "confirm", action: "stop-now", challenge: view.challenges["stop-now"], typed: "OpenAI prod" };
    await kv.set(`budget-guard:bg:lock:${conn.id}`, "1", { ex: 60 });
    expect((await postConn(req(`/api/app/connections/${conn.id}`, { body, cookie }), ctx(conn.id))).status).toBe(409);
    await kv.del(`budget-guard:bg:lock:${conn.id}`);
    expect((await (await postConn(req(`/api/app/connections/${conn.id}`, { body, cookie }), ctx(conn.id))).json()).msg).toBe("stopped");
    expect((await getState(kv, entitlement.id, conn.id))?.stoppedAt).toBeTruthy();
    await updateConnection(kv, entitlement.id, conn.id, { stopMode: "live" });
    const r = await checkConnectionLocked(kv, entitlement.id, conn.id, new Date());
    expect(r.status === "checked" && r.notices.map((n) => n.kind)).not.toContain("stopped");
  });
});

describe("R1-09: deleting a connection removes its log entries", () => {
  it("the account's other entries stay", async () => {
    const kv = createMemoryKV();
    const a = await addConnection(kv, "acct_r109", { label: "A", target: { provider: "openai", projectId: "p" }, budgetUsd: 10, token: "demo" });
    const b = await addConnection(kv, "acct_r109", { label: "B", target: { provider: "openai", projectId: "p" }, budgetUsd: 10, token: "demo" });
    const at = new Date().toISOString();
    await appendLog(kv, "acct_r109", [{ kind: "warn", connectionId: a.id, message: "a", at }, { kind: "warn", connectionId: b.id, message: "b", at }]);
    await removeConnection(kv, "acct_r109", a.id);
    expect((await getLog(kv, "acct_r109")).map((e) => e.connectionId)).toEqual([b.id]);
  });
});

describe("R2-03 follow-up: a demo entitlement whose 30-day trial ended can be replaced in the email index", () => {
  it("still status active, but the trial is over", async () => {
    const kv = createMemoryKV();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
    await upsertEntitlement(kv, { id: "demo_oldAAAAAAAAAAAAAAAAAAAA", email: "t@example.com", plan: "monthly", source: "demo" });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    await upsertEntitlement(kv, { id: "demo_newBBBBBBBBBBBBBBBBBBBB", email: "t@example.com", plan: "monthly", source: "demo" });
    expect((await findByEmail(kv, "t@example.com"))?.id).toBe("demo_newBBBBBBBBBBBBBBBBBBBB");
  });
});

describe("R2-01 follow-up: a rebuilt entitlement keeps the purchase time", () => {
  it("createdAt comes from the provider, so a lost KV cache doesn't reopen the 24h window", async () => {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_r201b", email: "b@example.com", plan: "monthly", source: "stripe" }, { createdAt: "2026-09-01T00:00:00.000Z" });
    expect(entitlement.createdAt).toBe("2026-09-01T00:00:00.000Z");
    // A future or broken time falls back to now.
    const { entitlement: e2 } = await upsertEntitlement(kv, { id: "cs_test_r201c", email: "c@example.com", plan: "monthly", source: "stripe" }, { createdAt: "2999-01-01T00:00:00Z" });
    expect(Date.parse(e2.createdAt)).toBeLessThanOrEqual(Date.now());
  });
});
