import { z } from "zod";
import { badRequest, forbiddenOrigin, json, readJson, sameOrigin } from "@/lib/api";
import { formatAmount, getPlan } from "@/lib/config";
import { CONSENT_REQUIRED_ERROR, hasConsentFlag, newConsent } from "@/lib/consent";
import { t } from "@/lib/i18n";
import { DEMO_CHECKOUTS_PER_DAY, getDemoCheckout, isDemoCheckoutId, payDemoCheckout } from "@/lib/payments/demo";
import { demoCheckoutEnabled } from "@/lib/payments/mode";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV, key } from "@/lib/redis";

// In-app stand-in for Stripe Checkout while PAYMENTS_MODE=demo (page: /checkout/demo).
// Every handler re-checks demo mode, so nothing here can mint an entitlement once
// billing is live. Card fields are read once, validated, and dropped: never stored
// (last4 only), never logged, never echoed back.

const DISABLED = "デモ決済は無効です（PAYMENTS_MODE が demo ではありません） / Demo payments are disabled.";

/** GET ?id=demo_…: what the card page needs to render. The id itself is the capability. */
export async function GET(request: Request) {
  if (!demoCheckoutEnabled()) return json({ state: "disabled" }, 404);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const checkout = await getDemoCheckout(getKV(), id);
  const plan = checkout && getPlan(checkout.planId);
  if (!checkout || !plan) return json({ state: "not-found" }, 404);
  const sub = plan.mode === "subscription" && plan.interval;
  return json({
    state: checkout.status === "pending" ? "pending" : "done",
    id: checkout.id,
    planLabel: plan.label,
    amountLabel: `${formatAmount(plan.amount)}${sub ? t.price[plan.interval!] : ""}`,
  });
}

const emailSchema = z.email().max(254);

/** POST (JSON {id, number, expiry, cvc, name, email?}): "pay" with a test card. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  if (!demoCheckoutEnabled()) return json({ error: DISABLED }, 403);
  const body = await readJson(request);
  const id = String(body?.id ?? "");
  if (!body || !isDemoCheckoutId(id)) return badRequest("チェックアウトが見つかりません / Checkout not found.");
  if (!hasConsentFlag(body)) return json({ error: CONSENT_REQUIRED_ERROR, consentRequired: true }, 400);
  const kv = getKV();
  if (!(await rateLimit(kv, `demo-pay:${clientIp(request.headers)}`, 20, 600))) {
    return json({ error: "しばらく時間をおいて再度お試しください / Too many attempts." }, 429);
  }
  // R3-02: a site-wide daily cap on demo purchases (each one is a free account that can add connections).
  const paidToday = key("rl", "demo-paid", new Date().toISOString().slice(0, 10));
  if (Number(await kv.get(paidToday)) >= DEMO_CHECKOUTS_PER_DAY) {
    return json({ error: "本日のデモ購入の受付は終了しました。明日もう一度お試しください / Demo sign-ups are closed for today." }, 429);
  }
  const rawEmail = String(body.email ?? "").trim().toLowerCase();
  const email = rawEmail ? emailSchema.safeParse(rawEmail) : null;
  if (email && !email.success) return badRequest("メールアドレスを確認してください / Check the email address.");

  const result = await payDemoCheckout(
    kv,
    id,
    { number: String(body.number ?? ""), expiry: String(body.expiry ?? ""), cvc: String(body.cvc ?? ""), name: String(body.name ?? "") },
    { email: email?.data, consent: newConsent("demo-card") },
  );
  if (!result.ok) {
    return result.reason === "not_found"
      ? json({ error: "チェックアウトの有効期限が切れました。料金ページからやり直してください / Checkout expired." }, 404)
      : json({ error: "入力内容を確認してください / Please check the card details.", errors: result.errors }, 400);
  }
  if ((await kv.incr(paidToday)) === 1) await kv.expire(paidToday, 2 * 86_400);
  return json({ ok: true, redirect: `/success?session_id=${id}` });
}
