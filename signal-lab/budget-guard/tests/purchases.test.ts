import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { config } from "@/lib/config";
import { newConsent } from "@/lib/consent";
import { DAY_MS, getEntitlement, upsertEntitlement } from "@/lib/entitlements";
import { resetCronMemory, runCronSlice } from "@/lib/guard/cron";
import { deleteAccount } from "@/lib/guard/retention";
import { fiscalYear, fiscalYearDeleteAfter, getPurchase, purchaseDeleteAfter, recordPurchase, sweepPurchases } from "@/lib/payments/purchases";
import { processStripeEvent } from "@/lib/payments/stripe-webhook";
import { createMemoryKV } from "@/lib/redis";

const ev = (id: string, type: string, object: object, created = 1791500000) => ({ id, type, created, data: { object } }) as unknown as Stripe.Event;
const deps = (kv: ReturnType<typeof createMemoryKV>) => ({ kv, after: () => undefined, onNew: vi.fn(async () => {}) });
const yearly = config.pricing.plans.find((p) => p.interval === "year")?.id ?? config.pricing.plans[0].id;

describe("purchase records (7 years, tax): what is written", () => {
  it("one-time payment: recorded at checkout.session.completed, Stripe payment id as the number; idempotent", async () => {
    const kv = createMemoryKV();
    const session = {
      id: "cs_test_once", mode: "payment", payment_status: "paid", amount_total: 7900, currency: "jpy", created: 1791500000,
      payment_intent: "pi_once", customer: "cus_1", subscription: null, customer_details: { email: "buyer@example.com" },
      metadata: { product: config.slug, plan: yearly },
    };
    expect(await processStripeEvent(ev("evt_1", "checkout.session.completed", session), deps(kv))).toBe("handled");
    const rec = await getPurchase(kv, "pi_once");
    expect(rec).toEqual({ kind: "payment", at: new Date(1791500000 * 1000).toISOString(), amount: 7900, currency: "jpy", plan: yearly, invoiceNumber: "pi_once" });
    expect(JSON.stringify(rec)).not.toMatch(/buyer@|cus_1|cs_test/); // date, amount, plan, number only
    // Same session delivered again as another event → still one record.
    await processStripeEvent(ev("evt_2", "checkout.session.async_payment_succeeded", session), deps(kv));
    expect(await kv.smembers(`budget-guard:purchases:fy:${fiscalYear(new Date(rec!.at))}`)).toEqual(["pi_once"]);
  });

  it("subscription: one record per paid invoice — the first and every renewal; not at checkout", async () => {
    const kv = createMemoryKV();
    await processStripeEvent(
      ev("evt_s", "checkout.session.completed", {
        id: "cs_test_sub", mode: "subscription", payment_status: "paid", amount_total: 900, currency: "usd", created: 1791500000,
        subscription: "sub_1", customer: "cus_2", payment_intent: null, customer_details: { email: "s@example.com" },
        metadata: { product: config.slug, plan: "monthly" },
      }),
      deps(kv),
    );
    expect(await kv.smembers("budget-guard:purchases:fys")).toEqual([]); // the invoice records it
    const invoice = (id: string, number: string | null, paidAt: number, amount = 900, product = config.slug) => ({
      id, number, amount_paid: amount, currency: "usd", created: paidAt - 60, status_transitions: { paid_at: paidAt },
      parent: { subscription_details: { metadata: { product, plan: "monthly" }, subscription: "sub_1" } },
    });
    expect(await processStripeEvent(ev("evt_i1", "invoice.paid", invoice("in_1", "BG-0001", 1791500100)), deps(kv))).toBe("handled");
    expect(await processStripeEvent(ev("evt_i2", "invoice.paid", invoice("in_2", "BG-0002", 1794100000)), deps(kv))).toBe("handled"); // renewal
    expect(await processStripeEvent(ev("evt_i3", "invoice.paid", invoice("in_3", "X-1", 1794100000, 900, "other-product")), deps(kv))).toBe("ignored");
    expect(await processStripeEvent(ev("evt_i4", "invoice.paid", invoice("in_4", "BG-0003", 1794100000, 0)), deps(kv))).toBe("ignored"); // nothing paid
    expect(await processStripeEvent(ev("evt_i5", "invoice.paid", invoice("in_5", null, 1794200000)), deps(kv))).toBe("handled"); // no number yet → id
    expect((await getPurchase(kv, "BG-0001"))?.amount).toBe(900);
    expect((await getPurchase(kv, "BG-0002"))?.at).toBe(new Date(1794100000 * 1000).toISOString());
    expect((await getPurchase(kv, "in_5"))?.invoiceNumber).toBe("in_5");
  });

  it("refunds: a separate negative record per refund step; the payment record stays", async () => {
    const kv = createMemoryKV();
    const session = {
      id: "cs_test_ref", mode: "payment", payment_status: "paid", amount_total: 7900, currency: "jpy", created: 1791500000,
      payment_intent: "pi_ref", customer: "cus_3", subscription: null, customer_details: { email: "r@example.com" },
      metadata: { product: config.slug, plan: yearly },
    };
    await processStripeEvent(ev("evt_c", "checkout.session.completed", session), deps(kv));
    await processStripeEvent(ev("evt_r1", "charge.refunded", { id: "ch_1", refunded: false, amount_refunded: 1000, currency: "jpy", payment_intent: "pi_ref" }, 1791600000), deps(kv));
    expect((await getEntitlement(kv, "cs_test_ref"))?.status).toBe("active"); // partial: access kept
    await processStripeEvent(ev("evt_r2", "charge.refunded", { id: "ch_1", refunded: true, amount_refunded: 7900, currency: "jpy", payment_intent: "pi_ref" }, 1791700000), deps(kv));
    expect((await getEntitlement(kv, "cs_test_ref"))?.status).toBe("refunded");
    expect(await getPurchase(kv, "refund:ch_1:1000")).toMatchObject({ kind: "refund", amount: -1000, invoiceNumber: "pi_ref", plan: yearly });
    expect(await getPurchase(kv, "refund:ch_1:7900")).toMatchObject({ kind: "refund", amount: -7900, at: new Date(1791700000 * 1000).toISOString() });
    expect((await getPurchase(kv, "pi_ref"))?.amount).toBe(7900);
    // A refund for something that isn't ours is not recorded.
    expect(await processStripeEvent(ev("evt_r3", "charge.refunded", { id: "ch_x", refunded: true, amount_refunded: 5, currency: "jpy", payment_intent: "pi_other" }), deps(kv))).toBe("ignored");
  });
});

describe("purchase records: deleted after 7 years (safe side)", () => {
  it("deadline = fiscal-year end + 7 years + 15 months (one setting)", () => {
    expect(fiscalYear(new Date("2026-10-09T00:00:00Z"))).toBe(2026);
    expect(purchaseDeleteAfter(new Date("2026-10-09T00:00:00Z")).toISOString()).toBe("2035-04-01T00:00:00.000Z");
    expect(purchaseDeleteAfter(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2035-04-01T00:00:00.000Z");
    expect(fiscalYearDeleteAfter(2027).toISOString()).toBe("2036-04-01T00:00:00.000Z");
    // March fiscal year end: April 2026 belongs to FY2027.
    expect(fiscalYear(new Date("2026-04-10T00:00:00Z"), 3)).toBe(2027);
    expect(fiscalYear(new Date("2026-03-10T00:00:00Z"), 3)).toBe(2026);
  });

  it("kept until the deadline, deleted from it, later years untouched; the cron sweeps them", async () => {
    const kv = createMemoryKV();
    const rec = (at: string, n: string) => recordPurchase(kv, n, { kind: "payment", at, amount: 900, currency: "usd", plan: "monthly", invoiceNumber: n });
    await rec("2026-02-01T00:00:00Z", "A-1");
    await rec("2026-11-01T00:00:00Z", "A-2");
    await rec("2027-02-01T00:00:00Z", "B-1");
    expect((await sweepPurchases(kv, new Date("2035-03-31T23:59:59Z"))).deleted).toBe(0);
    expect(await getPurchase(kv, "A-1")).toBeTruthy();
    expect((await sweepPurchases(kv, new Date("2035-04-01T00:00:00Z"))).deleted).toBe(2);
    expect(await getPurchase(kv, "A-1")).toBeNull();
    expect(await getPurchase(kv, "B-1")).toBeTruthy();
    expect(await kv.smembers("budget-guard:purchases:fys")).toEqual(["2027"]);
    // Through the cron's sweep (00 UTC is a sweep hour).
    resetCronMemory();
    const r = await runCronSlice(kv, { now: new Date("2036-04-01T00:00:30Z"), batch: 2 });
    expect(r.deletedPurchases).toBe(1);
    expect(await kv.smembers("budget-guard:purchases:fys")).toEqual([]);
  });
});

describe("tombstone after the 30-day deletion", () => {
  it("Stripe: keeps id/status/plan/dates/consent only, and expires with that year's purchase records", async () => {
    let now = Date.parse("2026-10-09T00:00:00Z");
    const kv = createMemoryKV(() => now);
    const { entitlement } = await upsertEntitlement(kv, {
      id: "cs_test_tomb", email: "t@example.com", plan: "monthly", source: "stripe",
      customerId: "cus_t", subscriptionId: "sub_t", paymentIntentId: "pi_t", consent: newConsent("checkout"),
    });
    await deleteAccount(kv, { ...entitlement, status: "canceled" }, new Date(now));
    const t = await getEntitlement(kv, "cs_test_tomb");
    expect(t).toMatchObject({ id: "cs_test_tomb", status: "canceled", plan: "monthly", email: "", licenseKey: "" });
    expect(t?.consent).toBeTruthy();
    expect(t?.customerId).toBeUndefined();
    expect(t?.subscriptionId).toBeUndefined();
    expect(t?.paymentIntentId).toBeUndefined();
    now = purchaseDeleteAfter(new Date(entitlement.createdAt)).getTime() - DAY_MS;
    expect(await getEntitlement(kv, "cs_test_tomb")).toBeTruthy(); // still blocks re-fulfilment
    now += 2 * DAY_MS;
    expect(await getEntitlement(kv, "cs_test_tomb")).toBeNull();
  });

  it("demo: the tombstone expires after 90 days", async () => {
    let now = Date.parse("2026-10-09T00:00:00Z");
    const kv = createMemoryKV(() => now);
    const { entitlement } = await upsertEntitlement(kv, { id: "demo_TOMBSTONETOMBSTONE0123", email: "d@example.com", plan: "monthly", source: "demo" });
    await deleteAccount(kv, entitlement, new Date(now));
    now += 89 * DAY_MS;
    expect(await getEntitlement(kv, entitlement.id)).toBeTruthy();
    now += 2 * DAY_MS;
    expect(await getEntitlement(kv, entitlement.id)).toBeNull();
  });
});
