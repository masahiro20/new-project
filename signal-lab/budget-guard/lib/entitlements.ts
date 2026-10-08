import { generateLicenseKey } from "./license";
import { getJSON, key, setJSON, type KV } from "./redis";

// Entitlement = "this buyer may use the product". Stripe is the source of truth;
// this is the KV cache plus reverse indexes (license key, email, subscription…).

export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled" | "refunded" | "unpaid";

export type Entitlement = {
  id: string; // checkout session id (cs_…) or dev_… for dev checkout
  email: string;
  plan: string;
  status: EntitlementStatus;
  source: "stripe" | "dev";
  licenseKey: string;
  customerId?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewEntitlement = Omit<Entitlement, "licenseKey" | "createdAt" | "updatedAt" | "status"> & { status?: EntitlementStatus };

const ACTIVE: EntitlementStatus[] = ["active", "trialing", "past_due"];
export const isActive = (e: Entitlement | null | undefined): e is Entitlement => !!e && ACTIVE.includes(e.status);

const k = {
  ent: (id: string) => key("ent", id),
  license: (licenseKey: string) => key("license", licenseKey),
  email: (email: string) => key("ent-by-email", email.toLowerCase()),
  sub: (id: string) => key("ent-by-sub", id),
  pi: (id: string) => key("ent-by-pi", id),
  customer: (id: string) => key("ent-by-customer", id),
};

export const getEntitlement = (kv: KV, id: string) => getJSON<Entitlement>(kv, k.ent(id));

async function byIndex(kv: KV, indexKey: string): Promise<Entitlement | null> {
  const id = await kv.get(indexKey);
  return id ? getEntitlement(kv, id) : null;
}
export const findByLicense = (kv: KV, licenseKey: string) => byIndex(kv, k.license(licenseKey));
export const findByEmail = (kv: KV, email: string) => byIndex(kv, k.email(email));
export const findBySubscription = (kv: KV, id: string) => byIndex(kv, k.sub(id));
export const findByPaymentIntent = (kv: KV, id: string) => byIndex(kv, k.pi(id));
export const findByCustomer = (kv: KV, id: string) => byIndex(kv, k.customer(id));

/**
 * Idempotent: the first writer for an id wins (SET NX), so the success page and
 * the webhook can race safely. `created` tells the caller whether to send the
 * license email / count the purchase.
 */
export async function upsertEntitlement(
  kv: KV,
  input: NewEntitlement,
  opts: { licenseKey?: string } = {},
): Promise<{ entitlement: Entitlement; created: boolean }> {
  const now = new Date().toISOString();
  const entitlement: Entitlement = {
    status: "active",
    ...input,
    email: input.email.toLowerCase(),
    licenseKey: opts.licenseKey ?? generateLicenseKey(),
    createdAt: now,
    updatedAt: now,
  };
  const created = await setJSON(kv, k.ent(entitlement.id), entitlement, { nx: true });
  if (!created) {
    const existing = await getEntitlement(kv, entitlement.id);
    if (!existing) throw new Error(`entitlement ${entitlement.id} vanished during upsert`);
    return { entitlement: existing, created: false };
  }
  await kv.set(k.license(entitlement.licenseKey), entitlement.id);
  await kv.set(k.email(entitlement.email), entitlement.id); // latest purchase wins for magic links
  if (entitlement.subscriptionId) await kv.set(k.sub(entitlement.subscriptionId), entitlement.id);
  if (entitlement.paymentIntentId) await kv.set(k.pi(entitlement.paymentIntentId), entitlement.id);
  if (entitlement.customerId) await kv.set(k.customer(entitlement.customerId), entitlement.id);
  return { entitlement, created: true };
}

export async function setStatus(kv: KV, e: Entitlement, status: EntitlementStatus): Promise<Entitlement> {
  const next = { ...e, status, updatedAt: new Date().toISOString() };
  await setJSON(kv, k.ent(e.id), next);
  return next;
}
