import { getPlan } from "../config";
import { getJSON, getKV, key, setJSON } from "../redis";
import type { PaymentProvider } from "./types";

// DEV ONLY: a fake checkout that "pays" instantly so the whole purchase → license →
// /app flow works without Stripe. Never selected when NODE_ENV=production.

type Pending = { planId: string; email: string };
const pendingKey = (id: string) => key("dev-checkout", id);
export const isDevCheckoutId = (id: string) => /^dev_[A-Za-z0-9]{16}$/.test(id);

export const devProvider: PaymentProvider = {
  name: "dev",
  async createCheckout(plan, opts = {}) {
    const id = `dev_${Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url").replace(/[-_]/g, "x").slice(0, 16)}`;
    await setJSON(getKV(), pendingKey(id), { planId: plan.id, email: opts.email || "dev@example.com" } satisfies Pending, { ex: 3600 });
    return `/success?session_id=${id}`;
  },
  async getCompletedCheckout(id) {
    if (!isDevCheckoutId(id)) return null;
    const pending = await getJSON<Pending>(getKV(), pendingKey(id));
    if (!pending || !getPlan(pending.planId)) return null;
    return { id, email: pending.email, planId: pending.planId, status: "active" };
  },
  async createPortalUrl() {
    return "/app?portal=dev";
  },
  async findCheckoutIdByLicense() {
    return null;
  },
  async saveLicense() {},
};
