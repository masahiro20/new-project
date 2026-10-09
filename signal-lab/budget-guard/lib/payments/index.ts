import { track } from "../analytics";
import { config, getPlan } from "../config";
import { findByLicense, getEntitlement, upsertEntitlement, type Entitlement } from "../entitlements";
import { t } from "../i18n";
import { sendMail } from "../mail";
import type { KV } from "../redis";
import { isProduction, siteUrl, warnOnce } from "../site";
import { demoProvider } from "./demo";
import { assertBuildModeMatches, getPaymentsMode, isDemoMode } from "./mode";
import { stripeProvider } from "./stripe";
import type { CompletedCheckout, PaymentProvider, PaymentsMode } from "./types";

export type { CompletedCheckout, PaymentProvider, PaymentsMode } from "./types";
export { getPaymentsMode, isDemoMode, PaymentsConfigError, showDemoBanner, DEMO_BANNER } from "./mode";

type Env = Record<string, string | undefined>;

const PROVIDERS: Record<PaymentsMode, PaymentProvider> = { demo: demoProvider, stripe: stripeProvider };

/**
 * The provider for new checkouts. The only place that picks one.
 * Throws PaymentsConfigError when PAYMENTS_MODE is invalid (e.g. stripe without a key).
 */
export function getPaymentProvider(
  env: Env = process.env,
  providers: Record<PaymentsMode, PaymentProvider> = PROVIDERS,
  built?: PaymentsMode,
): PaymentProvider {
  const mode = getPaymentsMode(env);
  // Static pages carry the build's banner; never start a checkout under the other mode.
  if (built !== undefined) assertBuildModeMatches(mode, built);
  else assertBuildModeMatches(mode);
  if (mode === "demo" && isProduction() && !env.PAYMENTS_MODE) {
    warnOnce("payments-auto-demo", "[payments] STRIPE_SECRET_KEY is not set — running in DEMO mode (no real charges). Set the Stripe keys to go live.");
  }
  return providers[mode];
}

/** Like getPaymentsMode but null instead of throwing (for lookups that must not crash every page). */
function activeMode(env: Env): PaymentsMode | null {
  try {
    return getPaymentsMode(env);
  } catch {
    return null;
  }
}

/**
 * Which provider issued a checkout id — null unless that provider is the active
 * one. So demo_ ids are refused once billing is live (no free entitlements), and
 * nothing calls Stripe while in demo mode. Entitlements already in KV still
 * resolve from KV first (see resolveEntitlement).
 */
export function providerForCheckout(id: string, env: Env = process.env): PaymentProvider | null {
  const provider = Object.values(PROVIDERS).find((p) => p.ownsCheckoutId(id));
  return provider && provider.name === activeMode(env) ? provider : null;
}

/** Demo entitlements only count while demo mode is active. */
export function entitlementUsable(e: Entitlement | null, env: Env = process.env): e is Entitlement {
  return !!e && (e.source !== "demo" || isDemoMode(env));
}

/** Turn a paid checkout into an entitlement (idempotent). `source` is the provider's name. */
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
export async function onNewEntitlement(kv: KV, entitlement: Entitlement, provider: PaymentProvider = PROVIDERS[entitlement.source]): Promise<void> {
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

/** KV first; on a cache miss, ask the provider and re-cache (Stripe is the source of truth). */
export async function resolveEntitlement(kv: KV, id: string): Promise<Entitlement | null> {
  const cached = await getEntitlement(kv, id);
  if (cached) return entitlementUsable(cached) ? cached : null;
  const provider = providerForCheckout(id);
  const checkout = provider && (await provider.getCompletedCheckout(id));
  if (!checkout) return null;
  return (await fulfillCheckout(kv, checkout, provider.name)).entitlement;
}

export async function resolveLicense(kv: KV, licenseKey: string): Promise<Entitlement | null> {
  const cached = await findByLicense(kv, licenseKey);
  if (cached) return entitlementUsable(cached) ? cached : null;
  if (activeMode(process.env) !== "stripe") return null;
  const id = await stripeProvider.findCheckoutIdByLicense(licenseKey);
  return id ? resolveEntitlement(kv, id) : null;
}
