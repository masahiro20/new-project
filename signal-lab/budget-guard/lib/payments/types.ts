import type { Plan } from "../config";
import type { Entitlement, EntitlementStatus } from "../entitlements";

// Provider boundary. Stripe is the only implementation for now; a Merchant of
// Record (Lemon Squeezy / Polar) would implement the same interface plus its own
// webhook route.

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
};

export interface PaymentProvider {
  readonly name: "stripe" | "dev";
  /** Returns the URL to send the buyer to. */
  createCheckout(plan: Plan, opts?: { email?: string }): Promise<string>;
  /** null unless `id` is a paid checkout for this product. */
  getCompletedCheckout(id: string): Promise<CompletedCheckout | null>;
  /** Billing portal URL (cancel / update card). */
  createPortalUrl(entitlement: Entitlement): Promise<string>;
  /** Fallback when a license key isn't in KV: look it up at the provider. */
  findCheckoutIdByLicense(licenseKey: string): Promise<string | null>;
  /** Persist the license key at the provider so KV can be rebuilt from it. */
  saveLicense(entitlement: Entitlement): Promise<void>;
}
