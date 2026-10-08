import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/guard/crypto";
import { currentState, evaluate } from "../lib/guard/evaluate";
import { issueChallenge, runStop, verifyChallenge, type StopPlan } from "../lib/guard/stop";
import { anthropic, openai, vercel } from "../lib/guard/providers";
import { checkConnection, type Connection } from "../lib/guard/check";
import { demoFetch } from "../lib/guard/demo";

const key = randomBytes(32);
const now = new Date("2026-10-08T12:00:00Z");
const monthStart = new Date("2026-10-01T00:00:00Z");

describe("token encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = encryptSecret("sk-admin-secret-123", "conn_1", key);
    expect(sealed).not.toContain("secret");
    expect(decryptSecret(sealed, "conn_1", key)).toBe("sk-admin-secret-123");
  });
  it("rejects another connection id, another key, or tampering", () => {
    const sealed = encryptSecret("tok", "conn_1", key);
    expect(() => decryptSecret(sealed, "conn_2", key)).toThrow();
    expect(() => decryptSecret(sealed, "conn_1", randomBytes(32))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("x").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "conn_1", key)).toThrow();
  });
  it("masks tokens", () => expect(maskSecret("sk-ant-admin01-abcdef")).toBe("sk-a…cdef"));
});

describe("evaluate", () => {
  const fresh = { period: "2026-10" };
  it("ok below 80%", () => expect(evaluate(79, 100, fresh).level).toBe("ok"));
  it("warns once at 80%", () => {
    const e = evaluate(80, 100, fresh);
    expect(e).toMatchObject({ level: "warn", notifyWarn: true, runStop: false });
    expect(evaluate(90, 100, { ...fresh, warnedAt: "x" }).notifyWarn).toBe(false);
  });
  it("stops once at 100%, and only if enabled", () => {
    expect(evaluate(100, 100, fresh)).toMatchObject({ level: "limit", notifyLimit: true, notifyWarn: false, runStop: true });
    expect(evaluate(150, 100, { ...fresh, stoppedAt: "x" }).runStop).toBe(false);
    expect(evaluate(150, 100, fresh, { stopEnabled: false }).runStop).toBe(false);
  });
  it("re-arms in a new month", () => {
    expect(currentState({ period: "2026-09", stoppedAt: "x" }, now)).toEqual({ period: "2026-10" });
  });
  it("rejects a non-positive budget", () => expect(() => evaluate(1, 0, fresh)).toThrow());
});

describe("stop gates", () => {
  const plan: StopPlan = { summary: "s", requests: [{ method: "POST", url: "https://api.vercel.com/v1/projects/p/pause" }], undo: "u" };
  const secret = "test-secret";
  it("test mode never calls the network", async () => {
    const f = demoFetch();
    const r = await runStop(plan, "test", {}, f);
    expect(r.dryRun).toBe(true);
    expect(f.calls).toHaveLength(0);
  });
  it("live mode sends the planned requests", async () => {
    const f = demoFetch();
    const r = await runStop(plan, "live", { authorization: "Bearer t" }, f);
    expect(r.ok).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: plan.requests[0].url, init: { method: "POST" } });
  });
  it("challenge requires matching target, plan, label and freshness", () => {
    const c = issueChallenge("conn_1", "arm-live", plan, secret, 0);
    const base = { connectionId: "conn_1", action: "arm-live" as const, plan, label: "My Vercel", typed: "My Vercel" };
    expect(verifyChallenge(c, base, secret, 1000)).toEqual({ ok: true });
    expect(verifyChallenge(c, { ...base, typed: "my vercel" }, secret, 1000)).toMatchObject({ ok: false, reason: "label-mismatch" });
    expect(verifyChallenge(c, { ...base, action: "stop-now" }, secret, 1000)).toMatchObject({ reason: "wrong-target" });
    expect(verifyChallenge(c, { ...base, plan: { ...plan, requests: [] } }, secret, 1000)).toMatchObject({ reason: "plan-changed" });
    expect(verifyChallenge(c, base, secret, 10 * 60 * 1000)).toMatchObject({ reason: "expired" });
    expect(verifyChallenge(c, base, "other", 1000)).toMatchObject({ reason: "bad-signature" });
  });
});

describe("provider adapters", () => {
  it("vercel sums JSONL BilledCost given as number or string", async () => {
    const f = demoFetch({ vercel: 10 });
    const s = await vercel.fetchSpend({ provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] }, "t", monthStart, now, f);
    expect(s.spendUsd).toBe(10);
    expect(f.calls[0].url).toContain("/v1/billing/charges?from=2026-10-01");
    expect(f.calls[0].url).toContain("teamId=team_1");
  });
  it("openai reads amount.value in USD and filters the project", async () => {
    const f = demoFetch({ openai: 12.34 });
    const s = await openai.fetchSpend({ provider: "openai", projectId: "proj_1" }, "t", monthStart, now, f);
    expect(s.spendUsd).toBeCloseTo(12.34);
    expect(f.calls[0].url).toContain(`start_time=${monthStart.getTime() / 1000}`);
    expect(f.calls[0].url).toContain("project_ids[]=proj_1");
  });
  it("anthropic converts cents strings and keeps only the workspace", async () => {
    const f = demoFetch({ anthropicCents: 2550 });
    const s = await anthropic.fetchSpend({ provider: "anthropic", workspaceId: "wrkspc_demo", keepKeyIds: [] }, "t", monthStart, now, f);
    expect(s.spendUsd).toBeCloseTo(25.5);
    expect(f.calls[0].init.headers).toMatchObject({ "anthropic-version": "2023-06-01" });
  });
  it("anthropic stop plan deactivates keys except the kept ones", async () => {
    const plan = await anthropic.planStop({ provider: "anthropic", workspaceId: "wrkspc_demo", keepKeyIds: ["apikey_demo_2"] }, "t", 100, demoFetch());
    expect(plan.requests).toEqual([{ method: "POST", url: "https://api.anthropic.com/v1/organizations/api_keys/apikey_demo_1", body: { status: "inactive" } }]);
  });
  it("openai stop plan sets a monthly hard limit in cents", async () => {
    const plan = await openai.planStop({ provider: "openai", projectId: "proj_1" }, "t", 50, demoFetch());
    expect(plan.requests[0].body).toEqual({ threshold_amount: 5000, currency: "USD", interval: "month" });
  });
  it("surfaces HTTP errors", async () => {
    const f = async () => new Response("nope", { status: 401 });
    await expect(openai.fetchSpend({ provider: "openai", projectId: "p" }, "t", monthStart, now, f)).rejects.toThrow("401");
  });
});

describe("checkConnection", () => {
  const conn = (budgetUsd: number, stopMode: Connection["stopMode"]): Connection => ({
    id: "c1", label: "Vercel prod", budgetUsd, stopMode, sealedToken: "",
    target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] },
  });
  it("warns at 80% without stopping", async () => {
    const r = await checkConnection(conn(50, "live"), undefined, { token: "t", fetchImpl: demoFetch({ vercel: 42.5 }), now });
    expect(r.notices.map((n) => n.kind)).toEqual(["warn"]);
    expect(r.state.warnedAt).toBeDefined();
  });
  it("in test mode records a would-be stop and sends nothing mutating", async () => {
    const f = demoFetch({ vercel: 60 });
    const r = await checkConnection(conn(50, "test"), undefined, { token: "t", fetchImpl: f, now });
    expect(r.notices.map((n) => n.kind)).toEqual(["limit", "stop-test"]);
    expect(f.calls.every((c) => (c.init.method ?? "GET") === "GET")).toBe(true);
    const again = await checkConnection(conn(50, "test"), r.state, { token: "t", fetchImpl: f, now });
    expect(again.notices).toEqual([]);
  });
  it("in live mode pauses the project", async () => {
    const f = demoFetch({ vercel: 60 });
    const r = await checkConnection(conn(50, "live"), undefined, { token: "t", fetchImpl: f, now });
    expect(r.notices.map((n) => n.kind)).toEqual(["limit", "stopped"]);
    expect(f.calls.some((c) => c.init.method === "POST" && c.url.includes("/pause"))).toBe(true);
  });
  it("retries a failed stop next pass", async () => {
    const f = async (url: string, init: RequestInit) =>
      init.method === "POST" ? new Response("err", { status: 500 }) : demoFetch({ vercel: 60 })(url, init);
    const r = await checkConnection(conn(50, "live"), undefined, { token: "t", fetchImpl: f, now });
    expect(r.notices.map((n) => n.kind)).toEqual(["limit", "stop-failed"]);
    expect(r.state.stoppedAt).toBeUndefined();
  });
  it("reports fetch errors without throwing", async () => {
    const r = await checkConnection(conn(50, "live"), undefined, { token: "t", fetchImpl: async () => new Response("x", { status: 403 }), now });
    expect(r.notices[0].kind).toBe("error");
  });
});
