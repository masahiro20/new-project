import type { Plan } from "../config";
import type { ConsentRecord } from "../consent";
import type { Entitlement, EntitlementStatus } from "../entitlements";

// Provider boundary. Exactly two implementations: `demo` (no money moves, see
// demo.ts) and `stripe` (stripe.ts). Which one is active is decided by
// getPaymentsMode() in mode.ts — never by the caller.

/** "demo": in-app fake card page, no external calls. "stripe": real Stripe Checkout. */
export type PaymentsMode = "demo" | "stripe";

/** A checkout that has been paid, normalised across providers. */
export type CompletedCheckout = {
  id: string;
  email: string;
  planId: string;
  status: EntitlementStatus;
  customerId?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
  /** Previously issued key stored at the provider (used when rebuilding a lost KV cache). */
  licenseKey?: string;
  /** Consent given at checkout (stored with the checkout, copied onto the entitlement). */
  consent?: ConsentRecord;
  /**
   * When the purchase happened (Stripe: session.created). Becomes the entitlement's createdAt,
   * so rebuilding a lost KV cache doesn't reopen the 24h license-key window (R2-01).
   */
  createdAt?: string;
};

export interface PaymentProvider {
  /** Also used as Entitlement.source. */
  readonly name: PaymentsMode;
  /** Does this id look like one of this provider's checkouts (cs_… / demo_…)? Format check only. */
  ownsCheckoutId(id: string): boolean;
  /** Returns the URL to send the buyer to (absolute for Stripe, app-relative for demo). */
  createCheckout(plan: Plan, opts?: { email?: string; consent?: ConsentRecord }): Promise<string>;
  /** null unless `id` is a paid checkout for this product. */
  getCompletedCheckout(id: string): Promise<CompletedCheckout | null>;
  /** Billing portal URL (cancel / update card). */
  createPortalUrl(entitlement: Entitlement): Promise<string>;
  /** Fallback when a license key isn't in KV: look it up at the provider. */
  findCheckoutIdByLicense(licenseKey: string): Promise<string | null>;
  /** Persist the license key at the provider so KV can be rebuilt from it. */
  saveLicense(entitlement: Entitlement): Promise<void>;
}
