import type { ConsentRecord } from "./consent";
import { reindexAccount } from "./guard/store";
import { generateLicenseKey } from "./license";
import { getJSON, key, setJSON, type KV } from "./redis";

// Entitlement = "this buyer may use the product". Stripe is the source of truth;
// this is the KV cache plus reverse indexes (license key, email, subscription…).

export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled" | "refunded" | "unpaid";

export type Entitlement = {
  id: string; // checkout session id (cs_…) or demo_… for demo checkout
  email: string;
  plan: string;
  status: EntitlementStatus;
  source: "stripe" | "demo"; // = PaymentProvider.name
  licenseKey: string;
  customerId?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
  /** Latest consent to the Privacy Policy and Terms (version + when + how). */
  consent?: ConsentRecord;
  /** When the entitlement stopped being active (canceled / refunded / unpaid, or a demo trial ended). */
  endedAt?: string;
  /** The account's data was deleted (this record is the minimal tombstone that remains). */
  deletedAt?: string;
};

/** Demo purchases are trials: 30 days from the purchase (docs/legal-changes.md, Terms "Demo and trial"). */
export const TRIAL_DAYS = 30;
export const DAY_MS = 86_400_000;
export const trialEndsAt = (e: Pick<Entitlement, "createdAt">) => new Date(Date.parse(e.createdAt) + TRIAL_DAYS * DAY_MS);
/** A demo entitlement whose 30-day trial is over. */
export const trialEnded = (e: Entitlement, now = new Date()) => e.source === "demo" && now >= trialEndsAt(e);

const ENDED: EntitlementStatus[] = ["canceled", "refunded", "unpaid"];

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
  /**
   * Server-side sign-out (R2-02): access cookies issued before this epoch second are rejected.
   * A key of its own, not a field of the entitlement, so sign-out never races the Stripe
   * webhook's setStatus (a read-modify-write of the entitlement could turn a cancel back to active).
   */
  sessAfter: (id: string) => key("sess-after", id),
  /** Entitlements that may need deleting later (ended ones + every demo/trial): the retention sweep's list. */
  retention: () => key("retention"),
};

/** Raw keys (for deletion and batched reads). */
export const entitlementKeys = k;

/**
 * Sign out everywhere: cookies issued before now stop working. Expires with the longest
 * cookie lifetime (+1 day), after which every older cookie has expired on its own anyway.
 */
export async function revokeSessions(kv: KV, id: string, sessionDays: number, nowSeconds = Math.floor(Date.now() / 1000)): Promise<void> {
  await kv.set(k.sessAfter(id), String(nowSeconds), { ex: (sessionDays + 1) * 86_400 });
}

/** True when a cookie issued at `iat` was revoked by a later sign-out (`raw` = the sess-after value). */
export function sessionRevoked(iat: number | undefined, raw: string | null | undefined): boolean {
  if (!raw) return false;
  const after = Number(raw);
  return Number.isFinite(after) && (iat ?? 0) < after;
}

export const getEntitlement = (kv: KV, id: string) => getJSON<Entitlement>(kv, k.ent(id));
/** KV key of an entitlement (for batched reads: MGET). */
export const entitlementKey = (id: string) => k.ent(id);

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
  opts: { licenseKey?: string; /** Purchase time from the provider (default: now). */ createdAt?: string } = {},
): Promise<{ entitlement: Entitlement; created: boolean }> {
  const now = new Date().toISOString();
  const createdAt = opts.createdAt && Number.isFinite(Date.parse(opts.createdAt)) && Date.parse(opts.createdAt) <= Date.now() ? opts.createdAt : now;
  const entitlement: Entitlement = {
    status: "active",
    ...input,
    email: input.email.toLowerCase(),
    licenseKey: opts.licenseKey ?? generateLicenseKey(),
    createdAt,
    updatedAt: now,
  };
  const created = await setJSON(kv, k.ent(entitlement.id), entitlement, { nx: true });
  if (!created) {
    const existing = await getEntitlement(kv, entitlement.id);
    if (!existing) throw new Error(`entitlement ${entitlement.id} vanished during upsert`);
    return { entitlement: existing, created: false };
  }
  await kv.set(k.license(entitlement.licenseKey), entitlement.id);
  // Latest purchase wins for magic links — except a demo purchase (buyer-chosen, unverified
  // email, no payment) never takes over an email that points at a real (stripe) entitlement
  // or at someone's still-active demo entitlement (otherwise anyone could redirect that
  // person's magic link into an account the attacker also holds the license key for).
  const prevByEmail = entitlement.source === "demo" ? await findByEmail(kv, entitlement.email) : null;
  const prevLapsed = !!prevByEmail && prevByEmail.source === "demo" && (!isActive(prevByEmail) || trialEnded(prevByEmail) || !!prevByEmail.deletedAt);
  if (!prevByEmail || prevLapsed) await kv.set(k.email(entitlement.email), entitlement.id);
  if (entitlement.subscriptionId) await kv.set(k.sub(entitlement.subscriptionId), entitlement.id);
  if (entitlement.paymentIntentId) await kv.set(k.pi(entitlement.paymentIntentId), entitlement.id);
  if (entitlement.customerId) await kv.set(k.customer(entitlement.customerId), entitlement.id);
  if (entitlement.source === "demo" || ENDED.includes(entitlement.status)) await kv.sadd(k.retention(), entitlement.id);
  return { entitlement, created: true };
}

export async function setStatus(kv: KV, e: Entitlement, status: EntitlementStatus, now = new Date()): Promise<Entitlement> {
  const ended = ENDED.includes(status);
  const next: Entitlement = { ...e, status, updatedAt: now.toISOString() };
  if (ended) next.endedAt = e.endedAt && ENDED.includes(e.status) ? e.endedAt : now.toISOString();
  else delete next.endedAt; // reactivated: the 30-day deletion clock stops
  await setJSON(kv, k.ent(e.id), next);
  if (ended && !ENDED.includes(e.status)) await kv.sadd(k.retention(), e.id); // only on the transition (rare)
  // Active again: the cron dropped this account's connections from its index when it found the
  // account lapsed (R3-02), so put them back. Only on the transition (rare).
  if (isActive(next) && !isActive(e)) await reindexAccount(kv, next.id);
  return next;
}

/** Store a fresh consent on the entitlement (re-consent after a version bump). */
export async function saveConsent(kv: KV, e: Entitlement, consent: ConsentRecord): Promise<Entitlement> {
  const next: Entitlement = { ...e, consent, updatedAt: consent.at };
  await setJSON(kv, k.ent(e.id), next);
  return next;
}
