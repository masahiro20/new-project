"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import type { CardField } from "@/lib/payments/card";
import { isDemoCheckoutId, payDemoCheckout, setDemoPlanStatus } from "@/lib/payments/demo";
import { isDemoMode } from "@/lib/payments/mode";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

// Server Actions are public endpoints. Every one re-checks that demo mode is
// active, so nothing here can mint an entitlement once billing is live.
// Card fields are read once, validated, and dropped: never stored, never logged.

export type PayState = { status: "idle" | "error"; message: string; errors?: Partial<Record<CardField, string>> };

const emailSchema = z.email().max(254);

export async function payDemoAction(id: string, _prev: PayState, formData: FormData): Promise<PayState> {
  if (!isDemoMode()) return { status: "error", message: "デモ決済は無効です（PAYMENTS_MODE が demo ではありません） / Demo payments are disabled." };
  if (!isDemoCheckoutId(id)) return { status: "error", message: "チェックアウトが見つかりません / Checkout not found." };
  const kv = getKV();
  if (!(await rateLimit(kv, `demo-pay:${clientIp(await headers())}`, 20, 600))) {
    return { status: "error", message: "しばらく時間をおいて再度お試しください / Too many attempts." };
  }
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = rawEmail ? emailSchema.safeParse(rawEmail) : null;
  if (email && !email.success) return { status: "error", message: "メールアドレスを確認してください / Check the email address.", errors: {} };

  const result = await payDemoCheckout(
    kv,
    id,
    {
      number: String(formData.get("number") ?? ""),
      expiry: String(formData.get("expiry") ?? ""),
      cvc: String(formData.get("cvc") ?? ""),
      name: String(formData.get("name") ?? ""),
    },
    { email: email?.data },
  );
  if (!result.ok) {
    return result.reason === "not_found"
      ? { status: "error", message: "チェックアウトの有効期限が切れました。料金ページからやり直してください / Checkout expired." }
      : { status: "error", message: "入力内容を確認してください / Please check the card details.", errors: result.errors };
  }
  redirect(`/success?session_id=${id}`);
}

/** Demo "portal": the signed-in buyer cancels or reactivates their demo plan. */
export async function demoPortalAction(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect("/app");
  const action = formData.get("action") === "reactivate" ? "reactivate" : "cancel";
  const claims = await verifyAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!claims || !isDemoCheckoutId(claims.sub)) redirect("/access");
  await setDemoPlanStatus(getKV(), claims.sub, action);
  redirect(`/checkout/demo/portal?done=${action}`);
}
