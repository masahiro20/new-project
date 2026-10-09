import { CROCKFORD } from "../license";
import type { ConsentRecord } from "../consent";
import { getPlan } from "../config";
import { getEntitlement, setStatus, type Entitlement } from "../entitlements";
import { getJSON, getKV, key, setJSON, type KV } from "../redis";
import { validateCard, type CardInput } from "./card";
import type { CompletedCheckout, PaymentProvider } from "./types";

// DEMO provider: no money moves and nothing external is called. The buyer is sent
// to an in-app card page (/checkout/demo?id=demo_…), "pays" with a test card, and
// the checkout is marked paid in KV. Only last4 of the card is kept.
// Selected only while getPaymentsMode() === "demo"; demo_ ids are refused otherwise.

export const DEMO_EMAIL = "demo@example.com";
const PENDING_TTL_SECONDS = 60 * 60; // unpaid checkouts expire after 1 hour
const PAID_TTL_SECONDS = 90 * 24 * 60 * 60;

export type DemoCheckout = {
  id: string;
  planId: string;
  email: string;
  status: "pending" | "paid" | "canceled";
  last4?: string;
  createdAt: string;
  paidAt?: string;
  /** Consent given on /pricing, then again on the card page (latest wins). */
  consent?: ConsentRecord;
};

const recordKey = (id: string) => key("demo-checkout", id);

const ID_RE = /^demo_[0-9A-Za-z]{24}$/;
export const isDemoCheckoutId = (id: string) => ID_RE.test(id);

function newDemoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `demo_${Array.from(bytes, (b) => CROCKFORD[b & 31]).join("")}`;
}

export async function createDemoCheckout(kv: KV, planId: string, email?: string, consent?: ConsentRecord): Promise<DemoCheckout> {
  if (!getPlan(planId)) throw new Error(`unknown plan "${planId}"`);
  const record: DemoCheckout = { id: newDemoId(), planId, email: email || DEMO_EMAIL, status: "pending", createdAt: new Date().toISOString(), ...(consent && { consent }) };
  await setJSON(kv, recordKey(record.id), record, { ex: PENDING_TTL_SECONDS });
  return record;
}

export async function getDemoCheckout(kv: KV, id: string): Promise<DemoCheckout | null> {
  return isDemoCheckoutId(id) ? getJSON<DemoCheckout>(kv, recordKey(id)) : null;
}

export type PayResult = { ok: true; checkout: DemoCheckout } | { ok: false; reason: "not_found" | "invalid_card"; errors?: Partial<Record<keyof CardInput, string>> };

/**
 * Validate the card and mark the checkout paid. Idempotent: paying an already
 * paid checkout returns it unchanged. The card itself is dropped here (last4 only).
 */
export async function payDemoCheckout(kv: KV, id: string, card: CardInput, opts: { email?: string; now?: Date; consent?: ConsentRecord } = {}): Promise<PayResult> {
  const record = await getDemoCheckout(kv, id);
  if (!record) return { ok: false, reason: "not_found" };
  if (record.status !== "pending") return { ok: true, checkout: record };
  const result = validateCard(card, opts.now);
  if (!result.ok) return { ok: false, reason: "invalid_card", errors: result.errors };
  const paid: DemoCheckout = { ...record, email: opts.email || record.email, status: "paid", last4: result.last4, paidAt: new Date().toISOString(), ...(opts.consent && { consent: opts.consent }) };
  await setJSON(kv, recordKey(id), paid, { ex: PAID_TTL_SECONDS });
  return { ok: true, checkout: paid };
}

/** Demo "portal": cancel or reactivate a demo plan (entitlement + checkout record). */
export async function setDemoPlanStatus(kv: KV, entitlementId: string, action: "cancel" | "reactivate"): Promise<Entitlement | null> {
  const entitlement = await getEntitlement(kv, entitlementId);
  if (!entitlement || entitlement.source !== "demo") return null;
  const record = await getDemoCheckout(kv, entitlementId);
  if (record && record.status !== "pending") {
    await setJSON(kv, recordKey(record.id), { ...record, status: action === "cancel" ? "canceled" : "paid" } satisfies DemoCheckout, { ex: PAID_TTL_SECONDS });
  }
  return setStatus(kv, entitlement, action === "cancel" ? "canceled" : "active");
}

export function createDemoProvider(kv: () => KV = getKV): PaymentProvider {
  return {
    name: "demo",
    ownsCheckoutId: isDemoCheckoutId,
    async createCheckout(plan, opts = {}) {
      const record = await createDemoCheckout(kv(), plan.id, opts.email, opts.consent);
      return `/checkout/demo?id=${record.id}`;
    },
    async getCompletedCheckout(id): Promise<CompletedCheckout | null> {
      const record = await getDemoCheckout(kv(), id);
      if (!record || record.status === "pending" || !getPlan(record.planId)) return null;
      return { id, email: record.email, planId: record.planId, status: record.status === "canceled" ? "canceled" : "active", ...(record.consent && { consent: record.consent }) };
    },
    async createPortalUrl() {
      return "/checkout/demo/portal";
    },
    async findCheckoutIdByLicense() {
      return null; // nothing outside KV to look in
    },
    async saveLicense() {},
  };
}

export const demoProvider = createDemoProvider();
