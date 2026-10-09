import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/lib/redis";
import { upsertEntitlement } from "@/lib/entitlements";
import { devOutbox } from "@/lib/mail";
import { isSlackWebhookUrl, postSlack, verifyVercelSignature } from "@/lib/guard/notify-channels";
import { handleVercelWebhook, notify, setSlackUrl, setVercelWebhookSecret } from "@/lib/guard/service";
import { addConnection, getConnection, getLog, getSettings, getState, updateConnection } from "@/lib/guard/store";

const sign = (body: string, secret: string) => createHmac("sha1", secret).update(body).digest("hex");
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXX";

function recorder(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 200 ? "ok" : "no_service", { status });
  };
  return Object.assign(f, { calls });
}

describe("Vercel signature", () => {
  const body = JSON.stringify({ budgetAmount: 500, currentSpend: 500, teamId: "team_1", thresholdPercent: 100 });
  it("accepts hex HMAC-SHA1 of the raw body (case-insensitive)", () => {
    expect(verifyVercelSignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
    expect(verifyVercelSignature(body, sign(body, "s3cret").toUpperCase(), "s3cret")).toBe(true);
  });
  it("rejects a wrong secret, a changed body, or a missing header", () => {
    expect(verifyVercelSignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifyVercelSignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifyVercelSignature(body, null, "s3cret")).toBe(false);
    expect(verifyVercelSignature(body, "abc", "s3cret")).toBe(false);
  });
});

describe("Slack", () => {
  it("only accepts incoming webhook URLs", () => {
    expect(isSlackWebhookUrl(SLACK)).toBe(true);
    expect(isSlackWebhookUrl("https://evil.example.com/services/T/B/X")).toBe(false);
    expect(isSlackWebhookUrl("http://hooks.slack.com/services/T/B/X")).toBe(false);
    expect(isSlackWebhookUrl("https://hooks.slack.com/services/T/B/X?redirect=1")).toBe(false);
  });
  it("posts {text} as JSON and surfaces errors", async () => {
    const f = recorder();
    await postSlack(SLACK, "hi", f);
    expect(f.calls[0]).toMatchObject({ url: SLACK, init: { method: "POST", body: '{"text":"hi"}' } });
    await expect(postSlack(SLACK, "hi", recorder(404))).rejects.toThrow("Slack 404");
    await expect(postSlack("https://example.com", "hi", recorder())).rejects.toThrow();
  });
  it("stores the URL encrypted and mirrors notices; a Slack failure is logged, not thrown", async () => {
    const kv = createMemoryKV();
    await setSlackUrl(kv, "acct", SLACK);
    const settings = await getSettings(kv, "acct");
    expect(JSON.stringify(settings)).not.toContain("XXXXXXXX");
    expect(settings.slackHint).toBe("hooks.slack.com/…XXXX");
    const f = recorder();
    await notify(kv, "acct", "me@example.com", [{ kind: "warn", connectionId: "c", message: "80%" }], f);
    expect(JSON.parse(String(f.calls[0].init.body)).text).toContain("80%");
    await notify(kv, "acct", "me@example.com", [{ kind: "error", connectionId: "c", message: "x" }], f);
    expect(f.calls).toHaveLength(1); // routine errors are not pushed
    await notify(kv, "acct", "me@example.com", [{ kind: "limit", connectionId: "c", message: "100%" }], recorder(500));
    expect((await getLog(kv, "acct"))[0].message).toContain("Slack delivery failed");
  });
});

describe("Vercel Spend Management webhook", () => {
  async function setup(opts: { secret?: string; stopMode?: "test" | "live" } = {}) {
    const kv = createMemoryKV();
    const { entitlement } = await upsertEntitlement(kv, { id: "dev_hook", email: "a@example.com", plan: "monthly", source: "demo" });
    const conn = await addConnection(kv, entitlement.id, {
      label: "Vercel prod",
      target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] },
      budgetUsd: 1000, // demo spend $42.50 — far below, so only Vercel's own 100% can trigger a stop
      token: "demo",
    });
    if (opts.secret) await setVercelWebhookSecret(kv, entitlement.id, conn.id, opts.secret);
    if (opts.stopMode) await updateConnection(kv, entitlement.id, conn.id, { stopMode: opts.stopMode });
    return { kv, acct: entitlement.id, conn };
  }
  const payload = (pct: number, teamId = "team_1") => JSON.stringify({ budgetAmount: 200, currentSpend: (200 * pct) / 100, teamId, thresholdPercent: pct });

  it("rejects requests when no secret is set, the signature is wrong, or the id is unknown", async () => {
    const a = await setup();
    const body = payload(75);
    expect((await handleVercelWebhook(a.kv, a.conn.id, body, sign(body, "x"))).outcome.status).toBe(401);
    const b = await setup({ secret: "s3cret-value" });
    expect((await handleVercelWebhook(b.kv, b.conn.id, body, sign(body, "wrong"))).outcome.status).toBe(401);
    expect((await handleVercelWebhook(b.kv, "conn_0000000000000000", body, sign(body, "s3cret-value"))).outcome.status).toBe(401);
  });
  it("seals the secret and rejects bad payloads or another team", async () => {
    const { kv, acct, conn } = await setup({ secret: "s3cret-value" });
    expect((await getConnection(kv, acct, conn.id))?.sealedWebhookSecret).not.toContain("s3cret");
    const bad = '{"hello":1}';
    expect((await handleVercelWebhook(kv, conn.id, bad, sign(bad, "s3cret-value"))).outcome).toEqual({ status: 400, result: "invalid_payload" });
    const other = payload(75, "team_other");
    expect((await handleVercelWebhook(kv, conn.id, other, sign(other, "s3cret-value"))).outcome.result).toBe("team_mismatch");
  });
  it("logs a 75% alert once, mails it, and ignores retries", async () => {
    const { kv, acct, conn } = await setup({ secret: "s3cret-value" });
    const body = payload(75);
    const first = await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"));
    expect(first.outcome).toEqual({ status: 200, result: "handled" });
    const before = devOutbox.length;
    await first.followUp?.();
    expect(devOutbox.slice(before).map((m) => m.subject)).toEqual(["[Budget Guard] Vercel Spend Management alert"]);
    expect((await getLog(kv, acct)).some((e) => e.kind === "vercel-alert")).toBe(true);
    const retry = await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"));
    expect(retry.outcome.result).toBe("duplicate");
    expect(retry.followUp).toBeUndefined();
  });
  it("at 100% without the opt-in: re-checks now and judges by the Budget Guard budget (R3-03) — no stop below it", async () => {
    const { kv, acct, conn } = await setup({ secret: "s3cret-value", stopMode: "live" });
    const body = payload(100);
    const { outcome, followUp } = await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"));
    expect(outcome.result).toBe("handled");
    await followUp?.();
    const kinds = (await getLog(kv, acct)).map((e) => e.kind);
    expect(kinds).toEqual(["vercel-alert"]); // checked ($42.50 of $1000): nothing to say, nothing stopped
    expect((await getState(kv, acct, conn.id))?.stoppedAt).toBeUndefined();
  });
  it("at 100% without the opt-in, a spend over the Budget Guard budget still stops right away", async () => {
    const { kv, acct, conn } = await setup({ secret: "s3cret-value", stopMode: "live" });
    await updateConnection(kv, acct, conn.id, { budgetUsd: 40 }); // demo spend $42.50 > $40
    const body = payload(100);
    await (await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"))).followUp?.();
    expect((await getLog(kv, acct)).map((e) => e.kind)).toContain("stopped");
  });
  it("at 100% with the opt-in: Vercel's figure counts as the limit, through the usual gates (test mode → dry run, live → stop)", async () => {
    const t = await setup({ secret: "s3cret-value", stopMode: "test" });
    await updateConnection(t.kv, t.acct, t.conn.id, { vercelLimitStops: true });
    const body = payload(100);
    await (await handleVercelWebhook(t.kv, t.conn.id, body, sign(body, "s3cret-value"))).followUp?.();
    const kinds = (await getLog(t.kv, t.acct)).map((e) => e.kind);
    expect(kinds).toContain("stop-test");
    expect(kinds).not.toContain("stopped");

    const l = await setup({ secret: "s3cret-value", stopMode: "live" });
    await updateConnection(l.kv, l.acct, l.conn.id, { vercelLimitStops: true });
    await (await handleVercelWebhook(l.kv, l.conn.id, body, sign(body, "s3cret-value"))).followUp?.();
    expect((await getLog(l.kv, l.acct)).map((e) => e.kind)).toContain("stopped");
  });
  it("50% and 75% alerts only trigger a check, opted in or not", async () => {
    const { kv, acct, conn } = await setup({ secret: "s3cret-value", stopMode: "live" });
    await updateConnection(kv, acct, conn.id, { vercelLimitStops: true });
    for (const pct of [50, 75]) {
      const body = payload(pct);
      await (await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"))).followUp?.();
    }
    const kinds = (await getLog(kv, acct)).map((e) => e.kind);
    expect(kinds.filter((k) => k === "vercel-alert").length).toBe(2);
    expect(kinds).not.toContain("stopped");
  });
  it("ignores webhooks for lapsed accounts", async () => {
    const { kv, conn } = await setup({ secret: "s3cret-value" });
    await kv.del("budget-guard:ent:dev_hook");
    const body = payload(100);
    expect((await handleVercelWebhook(kv, conn.id, body, sign(body, "s3cret-value"))).outcome.result).toBe("inactive");
  });
});
