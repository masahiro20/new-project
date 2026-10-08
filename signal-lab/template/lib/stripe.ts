import Stripe from "stripe";
import { config, type Plan } from "./config";
import type { Entitlement, EntitlementStatus } from "./entitlements";
import type { CompletedCheckout, PaymentProvider } from "./payments/types";
import { siteUrl } from "./site";

let stripe: Stripe | null = null;
export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  stripe ??= new Stripe(secret);
  return stripe;
}

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const isCheckoutSessionId = (id: string) => /^cs_(test_|live_)?[A-Za-z0-9]+$/.test(id);

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id);
const LICENSE_META = `${config.slug}_license`;
const ENTITLEMENT_META = `${config.slug}_entitlement`;

export function mapSubscriptionStatus(status: Stripe.Subscription.Status): EntitlementStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "unpaid"; // incomplete, unpaid, paused
  }
}

export async function createCheckoutUrl(plan: Plan, opts: { email?: string } = {}): Promise<string> {
  const metadata = { product: config.slug, plan: plan.id };
  const recurring = plan.mode === "subscription" && plan.interval ? { interval: plan.interval } : undefined;
  const session = await getStripe().checkout.sessions.create({
    mode: plan.mode,
    line_items: [
      {
        // Inline price_data: nothing to pre-create in Stripe. Switch to lookup_key once a product graduates.
        price_data: {
          currency: config.pricing.currency,
          unit_amount: plan.amount,
          product_data: { name: `${config.name} — ${plan.label}` },
          ...(recurring && { recurring }),
        },
        quantity: 1,
      },
    ],
    metadata,
    // customer_creation is only valid in payment mode; subscriptions always create a customer.
    ...(plan.mode === "payment" ? { customer_creation: "always" as const, payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
    customer_email: opts.email,
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/pricing?canceled=1`,
    locale: config.locale,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** Retrieve a session and confirm it's paid and for this product (no need to wait for the webhook). */
export async function getCompletedCheckout(sessionId: string): Promise<CompletedCheckout | null> {
  if (!isCheckoutSessionId(sessionId)) return null;
  const s = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["customer", "subscription", "payment_intent.latest_charge"] });
  if (s.metadata?.product !== config.slug || s.status !== "complete") return null;
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;

  let status: EntitlementStatus = "active";
  if (s.subscription && typeof s.subscription !== "string") status = mapSubscriptionStatus(s.subscription.status);
  const charge = typeof s.payment_intent === "object" ? s.payment_intent?.latest_charge : null;
  if (charge && typeof charge === "object" && charge.refunded) status = "refunded";

  return {
    id: s.id,
    email: s.customer_details?.email ?? s.customer_email ?? "",
    planId: s.metadata.plan ?? "",
    status,
    customerId: idOf(s.customer),
    subscriptionId: idOf(s.subscription),
    paymentIntentId: idOf(s.payment_intent),
    licenseKey: s.customer && typeof s.customer === "object" && !s.customer.deleted ? s.customer.metadata[LICENSE_META] : undefined,
  };
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  createCheckout: createCheckoutUrl,
  getCompletedCheckout,
  async createPortalUrl(entitlement: Entitlement) {
    if (!entitlement.customerId) throw new Error("entitlement has no Stripe customer");
    const portal = await getStripe().billingPortal.sessions.create({ customer: entitlement.customerId, return_url: `${siteUrl()}/app` });
    return portal.url;
  },
  // licenseKey is already normalised to SLAB-XXXX-XXXX-XXXX, so it's safe inside the search query.
  async findCheckoutIdByLicense(licenseKey: string) {
    const res = await getStripe().customers.search({ query: `metadata['${LICENSE_META}']:'${licenseKey}'`, limit: 1 });
    return res.data[0]?.metadata[ENTITLEMENT_META] ?? null;
  },
  async saveLicense(entitlement: Entitlement) {
    if (!entitlement.customerId) return;
    await getStripe().customers.update(entitlement.customerId, {
      metadata: { [LICENSE_META]: entitlement.licenseKey, [ENTITLEMENT_META]: entitlement.id },
    });
  },
};
