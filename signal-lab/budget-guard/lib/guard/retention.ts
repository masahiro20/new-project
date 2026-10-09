import { DAY_MS, entitlementKeys, trialEndsAt, type Entitlement, type EntitlementStatus } from "../entitlements";
import { isDemoMode } from "../payments/mode";
import { purchaseDeleteAfter } from "../payments/purchases";
import { key, type KV } from "../redis";
import { connRef, storeKeys, type StoredConnection } from "./store";

// "Kept for 30 days after the subscription or the 30-day trial ends, then deleted"
// (Privacy Policy "Retention and deletion", docs/legal-changes.md §2.3).
//
// When does an account end?
//   - Stripe: the entitlement turns canceled / refunded / unpaid → setStatus() stamps endedAt
//     (reactivation clears it).
//   - Demo purchase = trial: 30 days after the purchase (trialEndsAt), or earlier if the site
//     leaves demo mode (the sweep stamps endedAt the first time it sees that).
// Every such entitlement is in the `retention` set (added on demo purchase / on ending), so
// the sweep never scans all keys. It runs on the cron's list-building run every
// SWEEP_EVERY_HOURS hours and deletes at most MAX_DELETES_PER_SWEEP accounts, to stay inside
// the 50-subrequest limit of a run and the Upstash free tier.

export const RETENTION_DAYS = 30;
export const SWEEP_EVERY_HOURS = 6;
export const MAX_DELETES_PER_SWEEP = 2;
/** Purchase records per sweep: one DEL for all of them, so this bounds payload, not commands. */
export const MAX_PURCHASES_PER_SWEEP = 200;
const ENDED: EntitlementStatus[] = ["canceled", "refunded", "unpaid"];

/** When the account ended (ISO), or null if it is still running. */
export function endedAt(e: Entitlement, now = new Date(), demoMode = isDemoMode()): string | null {
  if (e.endedAt) return e.endedAt;
  if (ENDED.includes(e.status)) return e.updatedAt; // ended before endedAt existed
  if (e.source === "demo") {
    const trialEnd = trialEndsAt(e);
    if (now >= trialEnd) return trialEnd.toISOString();
    if (!demoMode) return now.toISOString(); // demo mode switched off: ends now
  }
  return null;
}

export const deleteAfter = (ended: string) => new Date(Date.parse(ended) + RETENTION_DAYS * DAY_MS);

/**
 * Delete an account's data. Kept: a minimal tombstone of the entitlement (id, plan, source,
 * status, dates, consent record, and for Stripe the customer/subscription/payment ids that tie
 * it to Stripe's own payment records) — no email, no license key. The tombstone also stops a
 * Stripe checkout id from being re-fulfilled into a fresh account. Whether payment records
 * must be kept longer for tax/accounting is an open question (docs/legal-changes.md §2.1).
 *
 * Takes every connection's check lock first (the same lock the cron, "Check now" and the
 * Vercel webhook use), so a check that is running right now can't write the state / activity
 * keys back after they were deleted. If one is busy nothing is deleted: `{ busy: true }`, retry later.
 * Reverse indexes (license, email, subscription, payment, customer) are deleted only while they
 * still point at this entitlement — a Stripe customer can own several entitlements.
 * Upstash: MGET (connections + indexes) + SET NX per connection + DEL (all keys, one command)
 * + 3×SREM + SET = 6 + connections.
 */
export async function deleteAccount(kv: KV, e: Entitlement, now = new Date()): Promise<{ deletedKeys: number; busy?: false } | { deletedKeys: 0; busy: true }> {
  const ek = entitlementKeys;
  const indexKeys = [
    e.licenseKey ? ek.license(e.licenseKey) : null,
    e.email ? ek.email(e.email) : null,
    e.subscriptionId ? ek.sub(e.subscriptionId) : null,
    e.paymentIntentId ? ek.pi(e.paymentIntentId) : null,
    e.customerId ? ek.customer(e.customerId) : null,
  ].filter((x): x is string => !!x);
  const [connsRaw, ...owners] = await kv.mget(storeKeys.conns(e.id), ...indexKeys);
  const conns = connsRaw ? (JSON.parse(connsRaw) as StoredConnection[]) : [];
  const locks: string[] = [];
  for (const c of conns) {
    if (!(await kv.set(storeKeys.connLock(c.id), "deleting", { nx: true, ex: 120 }))) {
      if (locks.length) await kv.del(...locks);
      return { deletedKeys: 0, busy: true };
    }
    locks.push(storeKeys.connLock(c.id));
  }
  const keys = [
    storeKeys.conns(e.id), // connections incl. sealed tokens and webhook secrets
    storeKeys.settings(e.id), // sealed Slack URL
    storeKeys.activity(e.id), // log + snapshots
    ...conns.flatMap((c) => [storeKeys.state(e.id, c.id), key("bg", "owner", c.id)]),
    ...indexKeys.filter((_, i) => owners[i] === e.id), // only if it still points here
    key("demo-checkout", e.id), // demo purchase record (email, last 4 digits)
    ...locks,
  ];
  const deletedKeys = await kv.del(...keys);
  if (conns.length) await kv.srem(key("bg", "allconns"), ...conns.map((c) => connRef(e.id, c.id)));
  await kv.srem(key("bg", "accounts"), e.id);
  await kv.srem(ek.retention(), e.id);
  // Tombstone: what is left of the entitlement. Kept: the id + status (so the same Stripe
  // checkout can't be fulfilled into a fresh account), plan and dates (when it existed / ended
  // / was deleted), and the consent record (proof of consent; no personal data). Dropped: email,
  // license key and Stripe's customer / subscription / payment ids — the tax record is the
  // separate purchase record (lib/payments/purchases.ts). It expires on its own: Stripe → with
  // that purchase's records (7 years, safe side); demo → 90 days (by then the demo checkout
  // record it could be re-fulfilled from has expired too).
  const tombstone: Entitlement = {
    id: e.id,
    plan: e.plan,
    source: e.source,
    status: ENDED.includes(e.status) ? e.status : "canceled",
    email: "",
    licenseKey: "",
    createdAt: e.createdAt,
    updatedAt: now.toISOString(),
    endedAt: e.endedAt ?? endedAt(e, now) ?? now.toISOString(),
    deletedAt: now.toISOString(),
    ...(e.consent && { consent: e.consent }),
  };
  await kv.set(ek.ent(e.id), JSON.stringify(tombstone), { ex: tombstoneTtlSeconds(e, now) });
  return { deletedKeys };
}

/** Seconds the tombstone lives: Stripe → until its purchase year's records are deleted; demo → 90 days. */
export function tombstoneTtlSeconds(e: Pick<Entitlement, "source" | "createdAt">, now = new Date()): number {
  const until = e.source === "stripe" ? purchaseDeleteAfter(new Date(e.createdAt)).getTime() : now.getTime() + DEMO_TOMBSTONE_DAYS * DAY_MS;
  return Math.max(DAY_MS / 1000, Math.ceil((until - now.getTime()) / 1000));
}
export const DEMO_TOMBSTONE_DAYS = 90;

export type SweepResult = { candidates: number; deleted: string[]; pending: number };

/** SMEMBERS retention + MGET entitlements, then up to `maxDeletes` deletions (6 + connections commands each). */
export async function sweepRetention(kv: KV, now = new Date(), maxDeletes = MAX_DELETES_PER_SWEEP): Promise<SweepResult> {
  const ids = await kv.smembers(entitlementKeys.retention());
  const result: SweepResult = { candidates: ids.length, deleted: [], pending: 0 };
  if (ids.length === 0) return result;
  const raws = await kv.mget(...ids.map((id) => entitlementKeys.ent(id)));
  const drop: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const e = raws[i] ? (JSON.parse(raws[i]!) as Entitlement) : null;
    if (!e || e.deletedAt) {
      drop.push(ids[i]);
      continue;
    }
    const ended = endedAt(e, now);
    if (ended && !e.endedAt && e.source === "demo" && now < trialEndsAt(e)) {
      // Demo mode was switched off: remember when, so the 30 days count from today, not from every sweep.
      await kv.set(entitlementKeys.ent(e.id), JSON.stringify({ ...e, endedAt: ended }));
      continue;
    }
    if (!ended) {
      if (e.source !== "demo") drop.push(e.id); // reactivated Stripe subscription: off the list until it ends again
      continue;
    }
    if (now < deleteAfter(ended)) continue;
    if (result.deleted.length >= maxDeletes) {
      result.pending++;
      continue;
    }
    if ((await deleteAccount(kv, e, now)).busy) {
      result.pending++; // a check of one of its connections is running: next sweep
      continue;
    }
    result.deleted.push(e.id);
  }
  if (drop.length) await kv.srem(entitlementKeys.retention(), ...drop);
  return result;
}
