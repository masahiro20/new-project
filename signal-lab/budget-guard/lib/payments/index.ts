import { track } from "../analytics";
import { config, getPlan } from "../config";
import { findByLicense, getEntitlement, upsertEntitlement, type Entitlement } from "../entitlements";
import { t } from "../i18n";
import { sendMail } from "../mail";
import type { KV } from "../redis";
import { isProduction, siteUrl } from "../site";
import { isCheckoutSessionId, stripeConfigured, stripeProvider } from "../stripe";
import { devProvider, isDevCheckoutId } from "./dev";
import type { CompletedCheckout, PaymentProvider } from "./types";

export type { CompletedCheckout, PaymentProvider } from "./types";

/** Dev checkout: no Stripe key, or PAYMENT_DISABLED=true — and never in production. */
export function devCheckoutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  return !env.STRIPE_SECRET_KEY || env.PAYMENT_DISABLED === "true";
}

export function getPaymentProvider(): PaymentProvider {
  if (devCheckoutEnabled()) return devProvider;
  if (!stripeConfigured() && isProduction()) throw new Error("STRIPE_SECRET_KEY must be set in production");
  return stripeProvider;
}

/** Turn a paid checkout into an entitlement (idempotent). */
export async function fulfillCheckout(kv: KV, checkout: CompletedCheckout, source: Entitlement["source"]) {
  if (!getPlan(checkout.planId)) throw new Error(`unknown plan "${checkout.planId}" on checkout ${checkout.id}`);
  return upsertEntitlement(kv, {
    id: checkout.id,
    email: checkout.email,
    plan: checkout.planId,
    status: checkout.status,
    source,
    customerId: checkout.customerId,
    subscriptionId: checkout.subscriptionId,
    paymentIntentId: checkout.paymentIntentId,
  }, { licenseKey: checkout.licenseKey });
}

/** Side effects for a brand-new entitlement. Run inside after(). */
export async function onNewEntitlement(kv: KV, entitlement: Entitlement, provider = getPaymentProvider()): Promise<void> {
  const results = await Promise.allSettled([
    sendMail({
      to: entitlement.email,
      subject: t.mail.licenseSubject(config.name),
      text: t.mail.licenseBody(config.name, entitlement.licenseKey, `${siteUrl()}/access`),
    }),
    provider.saveLicense(entitlement),
    track(kv, "purchase"),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("[payments] post-purchase task failed", r.reason);
}

/** Which provider issued a checkout id — null if that provider isn't active here (e.g. dev_ ids in production). */
export function providerForCheckout(id: string): PaymentProvider | null {
  if (isDevCheckoutId(id)) return devCheckoutEnabled() ? devProvider : null;
  if (isCheckoutSessionId(id)) return stripeConfigured() ? stripeProvider : null;
  return null;
}

/** KV first; on a cache miss, ask the provider and re-cache (Stripe is the source of truth). */
export async function resolveEntitlement(kv: KV, id: string): Promise<Entitlement | null> {
  const cached = await getEntitlement(kv, id);
  if (cached) return cached;
  const provider = providerForCheckout(id);
  const checkout = provider && (await provider.getCompletedCheckout(id));
  if (!checkout) return null;
  return (await fulfillCheckout(kv, checkout, provider.name === "dev" ? "dev" : "stripe")).entitlement;
}

export async function resolveLicense(kv: KV, licenseKey: string): Promise<Entitlement | null> {
  const cached = await findByLicense(kv, licenseKey);
  if (cached) return cached;
  if (!stripeConfigured() || devCheckoutEnabled()) return null;
  const id = await stripeProvider.findCheckoutIdByLicense(licenseKey);
  return id ? resolveEntitlement(kv, id) : null;
}
