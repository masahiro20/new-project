import { afterEach, describe, expect, it, vi } from "vitest";
import { findByEmail, getEntitlement, isActive, upsertEntitlement } from "@/lib/entitlements";
import { checkAll } from "@/lib/guard/service";
import { addConnection } from "@/lib/guard/store";
import { entitlementUsable, fulfillCheckout, getPaymentProvider, providerForCheckout, resolveEntitlement } from "@/lib/payments";
import { expiryInFuture, luhnValid, validateCard } from "@/lib/payments/card";
import { createDemoCheckout, createDemoProvider, getDemoCheckout, isDemoCheckoutId, payDemoCheckout, setDemoPlanStatus } from "@/lib/payments/demo";
import { getPaymentsMode, isDemoMode, isExplicitDemo, PaymentsConfigError, showDemoBanner } from "@/lib/payments/mode";
import { createMemoryKV } from "@/lib/redis";

const KEY = "sk_test_dummy"; // never used to call Stripe in these tests
const NOW = new Date("2026-10-08T00:00:00Z");
const goodCard = { number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123", name: "Taro Yamada" };

afterEach(() => vi.unstubAllEnvs());

describe("getPaymentsMode", () => {
  const cases: [string, Record<string, string | undefined>, "demo" | "stripe"][] = [
    ["unset, no key → demo", {}, "demo"],
    ["unset, key → stripe", { STRIPE_SECRET_KEY: KEY }, "stripe"],
    ["empty string is unset", { PAYMENTS_MODE: "", STRIPE_SECRET_KEY: KEY }, "stripe"],
    ["demo, no key", { PAYMENTS_MODE: "demo" }, "demo"],
    ["demo wins over a key", { PAYMENTS_MODE: "demo", STRIPE_SECRET_KEY: KEY }, "demo"],
    ["stripe with key", { PAYMENTS_MODE: "stripe", STRIPE_SECRET_KEY: KEY }, "stripe"],
    ["case/space insensitive", { PAYMENTS_MODE: " Stripe ", STRIPE_SECRET_KEY: KEY }, "stripe"],
    ["production + explicit demo", { NODE_ENV: "production", PAYMENTS_MODE: "demo" }, "demo"],
    ["production + unset, no key → demo", { NODE_ENV: "production" }, "demo"],
    ["production + key → stripe", { NODE_ENV: "production", STRIPE_SECRET_KEY: KEY }, "stripe"],
  ];
  it.each(cases)("%s", (_name, env, expected) => {
    expect(getPaymentsMode(env)).toBe(expected);
  });

  it("stripe without a key is a clear error", () => {
    expect(() => getPaymentsMode({ PAYMENTS_MODE: "stripe" })).toThrow(PaymentsConfigError);
    expect(() => getPaymentsMode({ PAYMENTS_MODE: "stripe", STRIPE_SECRET_KEY: "  " })).toThrow(/STRIPE_SECRET_KEY is not set/);
    expect(() => getPaymentsMode({ NODE_ENV: "production", PAYMENTS_MODE: "stripe" })).toThrow(PaymentsConfigError);
  });

  it("rejects unknown values", () => {
    expect(() => getPaymentsMode({ PAYMENTS_MODE: "dev" })).toThrow(/must be "demo" or "stripe"/);
  });

  it("isDemoMode / isExplicitDemo never throw", () => {
    expect(isDemoMode({ PAYMENTS_MODE: "stripe" })).toBe(false);
    expect(isDemoMode({})).toBe(true);
    expect(isExplicitDemo({})).toBe(false);
    expect(isExplicitDemo({ PAYMENTS_MODE: "demo" })).toBe(true);
  });
});

describe("getPaymentProvider", () => {
  it("selects by mode", () => {
    expect(getPaymentProvider({}).name).toBe("demo");
    expect(getPaymentProvider({ NODE_ENV: "production", PAYMENTS_MODE: "demo" }).name).toBe("demo");
    expect(getPaymentProvider({ STRIPE_SECRET_KEY: KEY }).name).toBe("stripe");
  });
  it("throws on stripe without key", () => {
    expect(() => getPaymentProvider({ PAYMENTS_MODE: "stripe" })).toThrow(PaymentsConfigError);
  });
});

describe("demo banner", () => {
  it("is shown only in demo mode", () => {
    expect(showDemoBanner({})).toBe(true);
    expect(showDemoBanner({ NODE_ENV: "production", PAYMENTS_MODE: "demo" })).toBe(true);
    expect(showDemoBanner({ STRIPE_SECRET_KEY: KEY })).toBe(false);
    expect(showDemoBanner({ PAYMENTS_MODE: "stripe", STRIPE_SECRET_KEY: KEY })).toBe(false);
    expect(showDemoBanner({ PAYMENTS_MODE: "stripe" })).toBe(false); // misconfigured is not "demo"
  });
});

describe("card validation", () => {
  it("Luhn", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
    expect(luhnValid("4000056655665556")).toBe(true);
  });
  it("expiry must be this month or later", () => {
    expect(expiryInFuture("10/26", NOW)).toBe(true);
    expect(expiryInFuture("09/26", NOW)).toBe(false);
    expect(expiryInFuture("1/2027", NOW)).toBe(true);
    expect(expiryInFuture("13/30", NOW)).toBe(false);
  });
  it("accepts the test card and returns last4 only", () => {
    expect(validateCard(goodCard, NOW)).toEqual({ ok: true, last4: "4242" });
    expect(validateCard({ ...goodCard, cvc: "1234" }, NOW).ok).toBe(true);
  });
  it("reports each bad field", () => {
    const r = validateCard({ number: "4242 4242 4242 4241", expiry: "01/20", cvc: "12", name: " " }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["cvc", "expiry", "name", "number"]);
    expect(validateCard({ ...goodCard, expiry: "1230" }, NOW).ok).toBe(false);
    expect(validateCard({ ...goodCard, number: "4242" }, NOW).ok).toBe(false);
  });
});

describe("demo checkout", () => {
  it("create → pay → getCompletedCheckout → entitlement (source demo)", async () => {
    const kv = createMemoryKV();
    const provider = createDemoProvider(() => kv);
    const url = await provider.createCheckout({ id: "monthly" } as never);
    const id = new URL(url, "http://x").searchParams.get("id")!;
    expect(url).toMatch(/^\/checkout\/demo\?id=demo_/);
    expect(isDemoCheckoutId(id)).toBe(true);
    expect(provider.ownsCheckoutId(id)).toBe(true);

    expect(await provider.getCompletedCheckout(id)).toBeNull(); // not paid yet

    const bad = await payDemoCheckout(kv, id, { ...goodCard, number: "1234 5678 9012 3456" }, { now: NOW });
    expect(bad).toMatchObject({ ok: false, reason: "invalid_card" });
    expect(await provider.getCompletedCheckout(id)).toBeNull();

    const paid = await payDemoCheckout(kv, id, goodCard, { email: "buyer@example.com", now: NOW });
    expect(paid.ok).toBe(true);
    const stored = await getDemoCheckout(kv, id);
    expect(stored).toMatchObject({ status: "paid", last4: "4242", email: "buyer@example.com" });
    // Only last4 survives: no full number, CVC, expiry or name anywhere in the record.
    const raw = JSON.stringify(stored);
    for (const secret of ["4242424242424242", "4242 4242", "12/30", "Taro"]) expect(raw).not.toContain(secret);

    const checkout = await provider.getCompletedCheckout(id);
    expect(checkout).toEqual({ id, email: "buyer@example.com", planId: "monthly", status: "active", createdAt: expect.any(String) }); // createdAt = paidAt (R2-01)
    const { entitlement, created } = await fulfillCheckout(kv, checkout!, provider.name);
    expect(created).toBe(true);
    expect(entitlement).toMatchObject({ id, source: "demo", plan: "monthly", status: "active" });

    // Paying again is idempotent.
    expect(await payDemoCheckout(kv, id, goodCard, { now: NOW })).toMatchObject({ ok: true });
  });

  it("unknown / malformed ids are not found", async () => {
    const kv = createMemoryKV();
    expect(await payDemoCheckout(kv, "demo_AAAAAAAAAAAAAAAAAAAAAAAA", goodCard, { now: NOW })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await payDemoCheckout(kv, "cs_test_abc", goodCard, { now: NOW })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("demo portal cancels and reactivates", async () => {
    const kv = createMemoryKV();
    const record = await createDemoCheckout(kv, "monthly");
    await payDemoCheckout(kv, record.id, goodCard, { now: NOW });
    const checkout = await createDemoProvider(() => kv).getCompletedCheckout(record.id);
    await fulfillCheckout(kv, checkout!, "demo");
    expect((await setDemoPlanStatus(kv, record.id, "cancel"))?.status).toBe("canceled");
    expect(isActive(await getEntitlement(kv, record.id))).toBe(false);
    expect((await createDemoProvider(() => kv).getCompletedCheckout(record.id))?.status).toBe("canceled");
    expect((await setDemoPlanStatus(kv, record.id, "reactivate"))?.status).toBe("active");
  });
});

describe("demo ids in stripe mode", () => {
  const stripeEnv = { PAYMENTS_MODE: "stripe", STRIPE_SECRET_KEY: KEY };
  const demoId = "demo_ABCDEFGHJKMNPQRSTVWXYZ01";

  it("providerForCheckout routes ids only to the active provider", () => {
    expect(providerForCheckout(demoId, {})?.name).toBe("demo");
    expect(providerForCheckout(demoId, stripeEnv)).toBeNull();
    expect(providerForCheckout(demoId, { STRIPE_SECRET_KEY: KEY })).toBeNull(); // auto → stripe
    expect(providerForCheckout("cs_test_abc", stripeEnv)?.name).toBe("stripe");
    expect(providerForCheckout("cs_test_abc", {})).toBeNull(); // demo never calls Stripe
    expect(providerForCheckout("dev_AAAAAAAAAAAAAAAA", {})).toBeNull(); // old dev provider is gone
  });

  it("an existing demo entitlement stops granting access once billing is live", async () => {
    const kv = createMemoryKV();
    const record = await createDemoCheckout(kv, "monthly");
    await payDemoCheckout(kv, record.id, goodCard, { now: NOW });
    const { entitlement } = await fulfillCheckout(kv, (await createDemoProvider(() => kv).getCompletedCheckout(record.id))!, "demo");

    vi.stubEnv("PAYMENTS_MODE", "demo");
    expect(await resolveEntitlement(kv, record.id)).toMatchObject({ id: record.id, source: "demo" });

    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", KEY);
    expect(entitlementUsable(entitlement)).toBe(false);
    expect(await resolveEntitlement(kv, record.id)).toBeNull();
    expect(entitlementUsable({ ...entitlement, source: "stripe" })).toBe(true);
  });

  it("a stale demo entitlement is no longer monitored by the cron once billing is live", async () => {
    const kv = createMemoryKV();
    vi.stubEnv("PAYMENTS_MODE", "demo");
    await upsertEntitlement(kv, { id: demoId, email: "a@example.com", plan: "monthly", source: "demo" });
    await addConnection(kv, demoId, { label: "A", target: { provider: "vercel", teamId: "team_1", projectIds: ["prj_1"] }, budgetUsd: 10, token: "demo" });
    expect((await checkAll(kv)).accounts).toBe(1); // demo mode: monitored
    vi.stubEnv("PAYMENTS_MODE", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", KEY);
    expect((await checkAll(kv)).accounts).toBe(0);
  });

  it("a demo purchase never takes over the magic-link email of a real entitlement", async () => {
    const kv = createMemoryKV();
    await upsertEntitlement(kv, { id: "cs_test_real", email: "Buyer@example.com", plan: "lifetime", source: "stripe" });
    await upsertEntitlement(kv, { id: demoId, email: "buyer@example.com", plan: "monthly", source: "demo" });
    expect((await findByEmail(kv, "buyer@example.com"))?.id).toBe("cs_test_real");
  });
});

describe("build-time payments mode (static pages)", () => {
  it("resolveBuildPaymentsMode: explicit mode wins; no key needed at build", async () => {
    const { resolveBuildPaymentsMode } = await import("@/lib/payments/mode");
    expect(resolveBuildPaymentsMode({})).toBe("demo");
    expect(resolveBuildPaymentsMode({ PAYMENTS_MODE: "stripe" })).toBe("stripe"); // Cloudflare: key is a runtime secret
    expect(resolveBuildPaymentsMode({ STRIPE_SECRET_KEY: KEY })).toBe("stripe");
    expect(resolveBuildPaymentsMode({ PAYMENTS_MODE: "demo", STRIPE_SECRET_KEY: KEY })).toBe("demo");
    expect(() => resolveBuildPaymentsMode({ PAYMENTS_MODE: "free" })).toThrow(PaymentsConfigError);
  });

  it("banner follows the build; checkout fails closed when runtime ≠ build", async () => {
    const { assertBuildModeMatches, demoCheckoutEnabled, showDemoBannerAtBuild } = await import("@/lib/payments/mode");
    expect(showDemoBannerAtBuild({ STRIPE_SECRET_KEY: KEY }, "demo")).toBe(true);
    expect(showDemoBannerAtBuild({}, "stripe")).toBe(false);
    expect(showDemoBannerAtBuild({}, undefined)).toBe(true); // tests: falls back to env
    expect(() => assertBuildModeMatches("stripe", "demo")).toThrow(/Rebuild/);
    expect(() => assertBuildModeMatches("demo", "stripe")).toThrow(PaymentsConfigError);
    expect(() => assertBuildModeMatches("stripe", "stripe")).not.toThrow();
    expect(() => getPaymentProvider({ STRIPE_SECRET_KEY: KEY }, undefined, "demo")).toThrow(PaymentsConfigError);
    expect(getPaymentProvider({ STRIPE_SECRET_KEY: KEY }, undefined, "stripe").name).toBe("stripe");
    expect(demoCheckoutEnabled({}, "stripe")).toBe(false);
    expect(demoCheckoutEnabled({}, "demo")).toBe(true);
    expect(demoCheckoutEnabled({ STRIPE_SECRET_KEY: KEY }, "demo")).toBe(false);
  });
});
