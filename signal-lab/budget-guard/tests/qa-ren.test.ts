import { afterEach, describe, expect, it, vi } from "vitest";

// Ren's Budget Guard QA (qa/p2-bg, against a972716): regressions for the findings taken in.
// The table of all findings: docs/qa-ren-bg.md.

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { POST as license } from "@/app/api/access/license/route";
import { POST as postConn } from "@/app/api/app/connections/[id]/route";
import { ACCESS_COOKIE, signAccessToken } from "@/lib/access";
import { newConsent } from "@/lib/consent";
import { upsertEntitlement } from "@/lib/entitlements";
import { DEMO_SLACK_URL, postSlack } from "@/lib/guard/notify-channels";
import { stripeProvider } from "@/lib/payments/stripe";
import { addConnection } from "@/lib/guard/store";
import { getKV } from "@/lib/redis";

const BASE = "http://localhost:3000";
function req(path: string, body: unknown, cookie?: string): Request {
  const headers = new Headers({ host: "localhost:3000", origin: BASE, "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  if (cookie) headers.set("cookie", `${ACCESS_COOKIE}=${cookie}`);
  return new Request(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const PROD = { NODE_ENV: "production", ACCESS_SECRET: "Q3x9Lm2Vb7Np4Rt8Kw1Yz6Hc5Jd0FgSa-qa-ren", STRIPE_SECRET_KEY: "sk_test_" + "a1B2c3D4".repeat(4) };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Ren QA: a demo connection saved earlier, in a real production deploy", () => {
  it("test-stop / stop-now answer 502 plan-failed instead of 500", async () => {
    const kv = getKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "cs_test_ren1", email: "ren1@example.com", plan: "monthly", source: "stripe", consent: newConsent("checkout") });
    const conn = await addConnection(kv, entitlement.id, { label: "OpenAI prod", target: { provider: "openai", projectId: "proj_1" }, budgetUsd: 10, token: "demo" });
    for (const [k, v] of Object.entries(PROD)) vi.stubEnv(k, v);
    const cookie = await signAccessToken({ sub: entitlement.id, plan: "monthly" });
    for (const body of [{ op: "test-stop" }, { op: "confirm", action: "stop-now", challenge: "x", typed: "OpenAI prod" }]) {
      const res = await postConn(req(`/api/app/connections/${conn.id}`, body, cookie), ctx(conn.id));
      expect(res.status).toBe(502);
      expect((await res.json()).msg).toBe("plan-failed");
    }
  });

  it("a saved demo Slack URL fails instead of reporting success", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", PROD.STRIPE_SECRET_KEY);
    await expect(postSlack(DEMO_SLACK_URL, "hi")).rejects.toThrow(/demo Slack URL/);
    vi.stubEnv("NODE_ENV", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(postSlack(DEMO_SLACK_URL, "hi")).resolves.toBeUndefined();
  });
});

describe("Ren QA: license sign-in when Stripe can't be reached", () => {
  it("answers 503 (try again), not 500", async () => {
    for (const [k, v] of Object.entries(PROD)) vi.stubEnv(k, v);
    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.spyOn(stripeProvider, "findCheckoutIdByLicense").mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await license(req("/api/access/license", { license: "SLAB-2345-6789-ABCD" }));
    expect(res.status).toBe(503);
  });
});
