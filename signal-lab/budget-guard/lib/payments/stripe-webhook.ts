import type Stripe from "stripe";
import { config } from "../config";
import { findByCustomer, findByPaymentIntent, findBySubscription, setStatus } from "../entitlements";
import { key, type KV } from "../redis";
import { mapSubscriptionStatus } from "../stripe";
import { fulfillCheckout, onNewEntitlement } from "./index";

// Stripe webhook logic, kept free of Next.js so it can be unit-tested.
// The route verifies the signature and passes `after` in.

export const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const eventKey = (id: string) => key("stripe-event", id);

/** SET NX EX 7d: true only for the first delivery of an event id. */
export const claimEvent = (kv: KV, eventId: string) => kv.set(eventKey(eventId), "1", { nx: true, ex: EVENT_TTL_SECONDS });
export const releaseEvent = (kv: KV, eventId: string) => kv.del(eventKey(eventId));

export type WebhookDeps = {
  kv: KV;
  /** next/server's after() in the route; tests pass a collector. */
  after: (task: () => Promise<void>) => void;
  onNew?: typeof onNewEntitlement;
};
export type WebhookResult = "duplicate" | "handled" | "ignored";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id);

export async function processStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  const { kv } = deps;
  if (!(await claimEvent(kv, event.id))) return "duplicate";
  try {
    return await handle(event, deps);
  } catch (error) {
    await releaseEvent(kv, event.id); // let Stripe's retry run it again
    throw error;
  }
}

async function handle(event: Stripe.Event, { kv, after, onNew = onNewEntitlement }: WebhookDeps): Promise<WebhookResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.metadata?.product !== config.slug) return "ignored";
      if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return "ignored";
      const { entitlement, created } = await fulfillCheckout(
        kv,
        {
          id: s.id,
          email: s.customer_details?.email ?? s.customer_email ?? "",
          planId: s.metadata.plan ?? "",
          status: "active",
          customerId: idOf(s.customer),
          subscriptionId: idOf(s.subscription),
          paymentIntentId: idOf(s.payment_intent),
        },
        "stripe",
      );
      // Email + purchase counter are the slow part; the entitlement itself is already saved.
      if (created) after(() => onNew(kv, entitlement));
      return "handled";
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const entitlement = await findBySubscription(kv, sub.id);
      if (!entitlement) return "ignored";
      await setStatus(kv, entitlement, event.type === "customer.subscription.deleted" ? "canceled" : mapSubscriptionStatus(sub.status));
      return "handled";
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn(`[webhook] invoice.payment_failed invoice=${invoice.id} customer=${idOf(invoice.customer)}`);
      return "handled";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      if (!charge.refunded) return "ignored"; // partial refund: keep access
      const pi = idOf(charge.payment_intent);
      const customer = idOf(charge.customer);
      const entitlement = (pi && (await findByPaymentIntent(kv, pi))) || (customer && (await findByCustomer(kv, customer))) || null;
      if (!entitlement) return "ignored";
      await setStatus(kv, entitlement, "refunded");
      return "handled";
    }
    default:
      return "ignored";
  }
}
