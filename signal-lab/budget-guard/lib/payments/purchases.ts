import { key, type KV } from "../redis";

// Purchase records kept for tax bookkeeping (Privacy Policy / Terms: "purchase records are
// kept for 7 years, even after the account is deleted"; docs/legal-changes.md §2.4).
// Real (Stripe) purchases only — demo purchases charge nothing and are not recorded.
//
// One key per record, `purchase:{invoiceNumber}`, holding ONLY: when, amount + currency,
// plan, invoice number (and whether it is a payment or a refund). No email, no customer.
//   - Subscriptions: one record per paid invoice (invoice.paid), so the first payment AND
//     every monthly / yearly renewal is recorded; the number is Stripe's invoice number.
//   - One-time payments (no invoice): recorded at checkout.session.completed; Stripe's
//     payment ID (pi_…, or the checkout session cs_… when there is none) stands in for the
//     invoice number.
//   - Refunds: a separate record with a negative amount (the payment's record stays):
//     `purchase:refund:{charge}:{cumulative refunded}`, number = the payment ID (pi_…).
//
// Deletion: every record of a fiscal year shares one deletion date, PURCHASE_RETENTION below
// (safe side: fiscal-year end + 7 years + margin). Records are bucketed by fiscal year
// (`purchases:fy:{year}`), and the retention sweep deletes due buckets bit by bit.

/**
 * THE setting. "7 years, starting as tax law provides" — implemented on the long side:
 * delete on the 1st of the month `extraMonths` after the end of the fiscal year (ending in
 * `fiscalYearEndMonth`) that is `years` years after the purchase's fiscal year. With
 * December and 15 months: a purchase in 2026 is deleted on 2035-04-01 (end of FY2033 = the
 * 7th year + 15 months, which covers the filing deadline of 2–3 months and leaves a margin).
 */
export const PURCHASE_RETENTION = { fiscalYearEndMonth: 12, years: 7, extraMonths: 15 } as const;

export type PurchaseRecord = {
  kind: "payment" | "refund";
  /** ISO time of the payment / refund. */
  at: string;
  /** Smallest currency unit, as Stripe reports it (JPY: yen; USD: cents). Negative for refunds. */
  amount: number;
  currency: string;
  plan: string;
  /** Stripe invoice number; for payments without an invoice, Stripe's payment ID (see above). */
  invoiceNumber: string;
};

/** Fiscal year a date belongs to, named by the calendar year in which it ends. */
export function fiscalYear(at: Date, endMonth: number = PURCHASE_RETENTION.fiscalYearEndMonth): number {
  const y = at.getUTCFullYear();
  return at.getUTCMonth() + 1 > endMonth ? y + 1 : y;
}

/** When records of fiscal year `fy` may be deleted (UTC midnight). */
export function fiscalYearDeleteAfter(fy: number, r = PURCHASE_RETENTION): Date {
  // First day after the end of fiscal year fy + years, then + extraMonths.
  return new Date(Date.UTC(fy + r.years, r.fiscalYearEndMonth + r.extraMonths, 1));
}
export const purchaseDeleteAfter = (at: Date) => fiscalYearDeleteAfter(fiscalYear(at));

const k = {
  record: (id: string) => key("purchase", id),
  fy: (fy: number) => key("purchases", "fy", String(fy)),
  fys: () => key("purchases", "fys"),
};
export const purchaseKeys = k;

/**
 * Idempotent (SET NX: the same invoice can arrive in two events / Stripe retries).
 * Upstash: SET NX + SADD bucket + SADD fiscal-year list = 3 commands per new record.
 */
export async function recordPurchase(kv: KV, id: string, rec: PurchaseRecord): Promise<boolean> {
  if (!(await kv.set(k.record(id), JSON.stringify(rec), { nx: true }))) return false;
  const fy = fiscalYear(new Date(rec.at));
  await kv.sadd(k.fy(fy), id);
  await kv.sadd(k.fys(), String(fy));
  return true;
}

export const getPurchase = async (kv: KV, id: string): Promise<PurchaseRecord | null> => {
  const raw = await kv.get(k.record(id));
  return raw ? (JSON.parse(raw) as PurchaseRecord) : null;
};

/**
 * Delete records whose fiscal year passed its deletion date, at most `maxRecords` per call.
 * Upstash: SMEMBERS fiscal-year list (1) — usually all it costs — and per due year
 * SMEMBERS bucket + DEL records (one command) + SREM bucket (+ SREM year when emptied).
 */
export async function sweepPurchases(kv: KV, now = new Date(), maxRecords = 100): Promise<{ deleted: number }> {
  let deleted = 0;
  const fys = (await kv.smembers(k.fys())).map(Number).filter((fy) => Number.isFinite(fy) && now >= fiscalYearDeleteAfter(fy));
  for (const fy of fys.sort()) {
    if (deleted >= maxRecords) break;
    const ids = (await kv.smembers(k.fy(fy))).slice(0, maxRecords - deleted);
    if (ids.length) {
      await kv.del(...ids.map(k.record));
      await kv.srem(k.fy(fy), ...ids);
      deleted += ids.length;
    }
    if ((await kv.scard(k.fy(fy))) === 0) await kv.srem(k.fys(), String(fy));
  }
  return { deleted };
}
