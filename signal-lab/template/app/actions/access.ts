"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requestMagicLink } from "@/lib/access";
import { config } from "@/lib/config";
import { isActive } from "@/lib/entitlements";
import { t } from "@/lib/i18n";
import { normalizeLicenseKey } from "@/lib/license";
import { resolveLicense } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";
import { grantAccess, revokeAccess } from "@/lib/session";

// Server Actions are public endpoints: validate and rate-limit every input.

export type FormState = { status: "idle" | "ok" | "error"; message: string };

async function limited(name: string, limit: number): Promise<boolean> {
  return !(await rateLimit(getKV(), `${name}:${clientIp(await headers())}`, limit, 600));
}

export async function redeemLicense(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await limited("license", 10)) return { status: "error", message: t.access.limited };
  const licenseKey = normalizeLicenseKey(String(formData.get("license") ?? ""));
  const entitlement = licenseKey ? await resolveLicense(getKV(), licenseKey) : null;
  if (!isActive(entitlement)) return { status: "error", message: t.access.invalidLicense };
  await grantAccess(entitlement);
  redirect("/app");
}

const emailSchema = z.email().max(254);

export async function requestLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!config.access.magicLink) return { status: "error", message: t.access.invalidToken };
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: t.waitlist.invalid };
  if (await limited("magic", 5)) return { status: "error", message: t.access.limited };
  // Lookup + send happen after the response, so known and unknown emails look identical.
  const kv = getKV();
  after(() => requestMagicLink(kv, parsed.data).then(() => undefined, (e) => console.error("[access] magic link failed", e)));
  return { status: "ok", message: t.access.magicSent };
}

export async function signOut(): Promise<void> {
  await revokeAccess();
  redirect("/");
}
