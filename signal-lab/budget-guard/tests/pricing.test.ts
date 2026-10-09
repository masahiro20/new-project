import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { POST as checkout } from "@/app/api/checkout/route";
import { POST as demoPay } from "@/app/api/checkout/demo/route";
import { PlanCard } from "@/components/PlanCard";
import { config, getPlan, purchasablePlan } from "@/lib/config";
import { readFileSync } from "node:fs";
import { CHECK_INTERVAL_TIERS, checkCadence, checkCadenceJa } from "@/lib/guard/schedule";
import { createDemoCheckout } from "@/lib/payments/demo";
import { getKV } from "@/lib/redis";

// Owner's decisions (2026-10-09): the check frequency on the pricing card comes from the tier
// table, and yearly billing is "coming soon" (Stripe yearly never verified) — shown, not sold.
const BASE = "http://localhost:3000";
const req = (path: string, body: unknown) =>
  new Request(BASE + path, { method: "POST", headers: { host: "localhost:3000", origin: BASE, "content-type": "application/json", "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllEnvs());

describe("pricing: check frequency from CHECK_INTERVAL_TIERS", () => {
  it("states the range and the hourly limit of the current tiers, as a total over all users", () => {
    const first = CHECK_INTERVAL_TIERS[0];
    const max = Math.max(...CHECK_INTERVAL_TIERS.map((t) => t.hours));
    expect(checkCadence()).toBe(`Checked every 1–${max} hours depending on total load (hourly up to ${first.upTo} connections across all users)`);
    expect(getPlan("monthly")!.features).toContain(checkCadence());
    expect(JSON.stringify(config.pricing.plans)).not.toMatch(/Hourly checks|Two months free/);
  });
  it("the copies in docs/lp.md and the experience demo say the same (update them when the tiers change)", () => {
    const lp = readFileSync(new URL("../docs/lp.md", import.meta.url), "utf8");
    const demo = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
    expect(lp).toContain(checkCadence());
    expect(lp).toContain(checkCadenceJa());
    expect(demo).toContain(checkCadenceJa());
    for (const text of [lp, demo]) expect(text).not.toMatch(/Two months free|2 か月分お得|2か月分お得|Hourly checks/);
  });
  it("follows the tiers when they change", () => {
    expect(checkCadenceJa([{ upTo: 80, hours: 1 }, { upTo: Infinity, hours: 6 }])).toBe("全利用者の接続数の合計に応じて 1〜6 時間ごとに確認（合計 80 接続までは毎時）");
    expect(checkCadence([{ upTo: 80, hours: 1 }, { upTo: Infinity, hours: 6 }])).toBe("Checked every 1–6 hours depending on total load (hourly up to 80 connections across all users)");
    expect(checkCadence([{ upTo: Infinity, hours: 1 }])).toBe("Hourly checks");
  });
});

describe("pricing: yearly is coming soon", () => {
  it("is flagged, not purchasable, and its card has no price or buy button", () => {
    expect(getPlan("yearly")?.comingSoon).toBe(true);
    expect(purchasablePlan("yearly")).toBeUndefined();
    expect(purchasablePlan("monthly")?.id).toBe("monthly");
    const html = renderToStaticMarkup(PlanCard({ plan: getPlan("yearly")! }));
    expect(html).toContain("Annual billing coming soon");
    expect(html).not.toContain("$79");
    expect(html).not.toContain("<button");
    expect(renderToStaticMarkup(PlanCard({ plan: getPlan("monthly")! }))).toContain("<button");
  });

  it("/api/checkout refuses yearly (400) and still sells monthly", async () => {
    vi.stubEnv("PAYMENTS_MODE", "demo");
    const yearly = await checkout(req("/api/checkout", { plan: "yearly", consent: true }));
    expect(yearly.status).toBe(400);
    expect(await yearly.json()).toMatchObject({ error: "plan not available yet" });
    expect((await checkout(req("/api/checkout", { plan: "monthly", consent: true }))).status).toBe(200);
  });

  it("the demo checkout refuses yearly too — creating one, and paying one created earlier", async () => {
    vi.stubEnv("PAYMENTS_MODE", "demo");
    const kv = getKV();
    await expect(createDemoCheckout(kv, "yearly")).rejects.toThrow(/not available/);
    // A pending yearly checkout from before the change (written directly).
    const id = "demo_YEARLYAAAAAAAAAAAAAAAAAA";
    await kv.set(`budget-guard:demo-checkout:${id}`, JSON.stringify({ id, planId: "yearly", email: "y@example.com", status: "pending", createdAt: new Date().toISOString() }), { ex: 3600 });
    const card = { number: "4242 4242 4242 4242", expiry: "12/34", cvc: "123", name: "TARO YAMADA", consent: true };
    const res = await demoPay(req("/api/checkout/demo", { id, ...card }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("not available yet");
  });
});
