import type Stripe from "stripe";
import { config } from "../config";
import { findByCustomer, findByPaymentIntent, findBySubscription, setStatus } from "../entitlements";
import { key, type KV } from "../redis";
import { consentFromMetadata, mapSubscriptionStatus, stripeProvider } from "./stripe";
import { fulfillCheckout, onNewEntitlement } from "./index";
import { recordPurchase } from "./purchases";

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
/** Stripe timestamps are Unix seconds; fall back to now if one is missing. */
const isoFromUnix = (s: number | null | undefined) => new Date(typeof s === "number" && s > 0 ? s * 1000 : Date.now()).toISOString();

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
          consent: consentFromMetadata(s.metadata),
        },
        "stripe",
      );
      // Purchase record (tax bookkeeping, 7 years). Subscriptions are recorded per paid
      // invoice (invoice.paid, incl. the first one); a one-time payment has no invoice, so it
      // is recorded here with Stripe's payment ID standing in for the invoice number.
      if (s.mode === "payment" && s.amount_total) {
        const number = idOf(s.payment_intent) ?? s.id;
        await recordPurchase(kv, number, {
          kind: "payment",
          at: isoFromUnix(s.created),
          amount: s.amount_total,
          currency: s.currency ?? "",
          plan: s.metadata.plan ?? "",
          invoiceNumber: number,
        });
      }
      // Email + purchase counter are the slow part; the entitlement itself is already saved.
      if (created) after(() => onNew(kv, entitlement, stripeProvider));
      return "handled";
    }
    case "invoice.paid": {
      // Every paid subscription invoice — the first one and each renewal — is one purchase record.
      const invoice = event.data.object;
      const meta = invoice.parent?.subscription_details?.metadata;
      if (meta?.product !== config.slug || !invoice.amount_paid) return "ignored";
      const number = invoice.number ?? invoice.id!;
      await recordPurchase(kv, number, {
        kind: "payment",
        at: isoFromUnix(invoice.status_transitions?.paid_at ?? invoice.created),
        amount: invoice.amount_paid,
        currency: invoice.currency,
        plan: meta.plan ?? "",
        invoiceNumber: number,
      });
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
      const pi = idOf(charge.payment_intent);
      const customer = idOf(charge.customer);
      const entitlement = (pi && (await findByPaymentIntent(kv, pi))) || (customer && (await findByCustomer(kv, customer))) || null;
      if (!entitlement) return "ignored"; // not one of ours
      // Refund record (negative amount; the payment's own record stays). One per refund step:
      // the amount is the cumulative refunded total of the charge at that point.
      const number = pi ?? charge.id;
      await recordPurchase(kv, `refund:${charge.id}:${charge.amount_refunded}`, {
        kind: "refund",
        at: isoFromUnix(event.created),
        amount: -charge.amount_refunded,
        currency: charge.currency,
        plan: entitlement.plan,
        invoiceNumber: number,
      });
      if (!charge.refunded) return "handled"; // partial refund: keep access
      await setStatus(kv, entitlement, "refunded");
      return "handled";
    }
    default:
      return "ignored";
  }
}
