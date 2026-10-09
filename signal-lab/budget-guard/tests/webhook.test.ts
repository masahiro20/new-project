import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { findByLicense, getEntitlement, isActive } from "@/lib/entitlements";
import { claimEvent, processStripeEvent } from "@/lib/payments/stripe-webhook";
import { createMemoryKV } from "@/lib/redis";

const ev = (id: string, type: string, object: object) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

const completed = (id = "evt_1", overrides: object = {}) =>
  ev(id, "checkout.session.completed", {
    id: "cs_test_abc",
    payment_status: "paid",
    metadata: { product: config.slug, plan: "monthly" },
    customer_details: { email: "Buyer@Example.com" },
    customer: "cus_1",
    subscription: "sub_1",
    payment_intent: null,
    ...overrides,
  });

function setup() {
  const kv = createMemoryKV();
  const tasks: (() => Promise<void>)[] = [];
  const onNew = vi.fn(async () => {});
  return { kv, tasks, onNew, deps: { kv, after: (t: () => Promise<void>) => void tasks.push(t), onNew } };
}

describe("stripe webhook", () => {
  it("claims an event id only once (SET NX)", async () => {
    const kv = createMemoryKV();
    expect(await claimEvent(kv, "evt_x")).toBe(true);
    expect(await claimEvent(kv, "evt_x")).toBe(false);
  });

  it("creates an entitlement on checkout.session.completed and defers the email", async () => {
    const { kv, tasks, onNew, deps } = setup();
    expect(await processStripeEvent(completed(), deps)).toBe("handled");
    const e = await getEntitlement(kv, "cs_test_abc");
    expect(e).toMatchObject({ email: "buyer@example.com", plan: "monthly", status: "active", subscriptionId: "sub_1" });
    expect(await findByLicense(kv, e!.licenseKey)).toEqual(e);
    expect(onNew).not.toHaveBeenCalled();
    await Promise.all(tasks.map((t) => t()));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("keeps the consent from the session metadata when the webhook fulfils first", async () => {
    const { kv, deps } = setup();
    const metadata = { product: config.slug, plan: "monthly", consent_at: "2026-10-09T00:00:00.000Z", consent_privacy: "p1", consent_terms: "t1", consent_via: "checkout" };
    await processStripeEvent(completed("evt_c", { metadata }), deps);
    expect((await getEntitlement(kv, "cs_test_abc"))?.consent).toEqual({ at: metadata.consent_at, privacy: "p1", terms: "t1", via: "checkout" });
  });

  it("ignores redelivered events and doesn't re-send the email", async () => {
    const { tasks, deps } = setup();
    await processStripeEvent(completed(), deps);
    expect(await processStripeEvent(completed(), deps)).toBe("duplicate");
    // A different event for the same session is idempotent too.
    expect(await processStripeEvent(completed("evt_2"), deps)).toBe("handled");
    expect(tasks).toHaveLength(1);
  });

  it("ignores other products and unpaid sessions", async () => {
    const { deps } = setup();
    expect(await processStripeEvent(completed("evt_a", { metadata: { product: "other", plan: "monthly" } }), deps)).toBe("ignored");
    expect(await processStripeEvent(completed("evt_b", { payment_status: "unpaid" }), deps)).toBe("ignored");
  });

  it("reflects subscription updates and cancellation", async () => {
    const { kv, deps } = setup();
    await processStripeEvent(completed(), deps);
    await processStripeEvent(ev("evt_u", "customer.subscription.updated", { id: "sub_1", status: "past_due" }), deps);
    expect((await getEntitlement(kv, "cs_test_abc"))?.status).toBe("past_due");
    await processStripeEvent(ev("evt_d", "customer.subscription.deleted", { id: "sub_1", status: "canceled" }), deps);
    const e = await getEntitlement(kv, "cs_test_abc");
    expect(e?.status).toBe("canceled");
    expect(isActive(e)).toBe(false);
  });

  it("marks full refunds as refunded and keeps access on partial refunds", async () => {
    const { kv, deps } = setup();
    await processStripeEvent(completed("evt_1", { id: "cs_test_pay", subscription: null, payment_intent: "pi_1", metadata: { product: config.slug, plan: config.pricing.plans[0].id } }), deps);
    expect(await processStripeEvent(ev("evt_p", "charge.refunded", { refunded: false, payment_intent: "pi_1" }), deps)).toBe("ignored");
    expect((await getEntitlement(kv, "cs_test_pay"))?.status).toBe("active");
    expect(await processStripeEvent(ev("evt_r", "charge.refunded", { refunded: true, payment_intent: "pi_1", customer: "cus_1" }), deps)).toBe("handled");
    expect((await getEntitlement(kv, "cs_test_pay"))?.status).toBe("refunded");
  });

  it("releases the claim when handling fails so Stripe's retry is processed", async () => {
    const { deps } = setup();
    const bad = completed("evt_f", { metadata: { product: config.slug, plan: "no-such-plan" } });
    await expect(processStripeEvent(bad, deps)).rejects.toThrow("unknown plan");
    await expect(processStripeEvent(bad, deps)).rejects.toThrow("unknown plan"); // not "duplicate"
  });
});
