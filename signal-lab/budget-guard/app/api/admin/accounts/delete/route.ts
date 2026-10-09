import { z } from "zod";
import { adminAuthorized } from "@/lib/admin-auth";
import { findByEmail, findByLicense, getEntitlement } from "@/lib/entitlements";
import { normalizeLicenseKey } from "@/lib/license";
import { getKV } from "@/lib/redis";
import { deleteAccount } from "@/lib/guard/retention";

const force = { force: z.boolean().optional() };
const schema = z.union([
  z.object({ id: z.string().min(1).max(200), ...force }),
  z.object({ email: z.email().max(254), ...force }),
  z.object({ licenseKey: z.string().min(1).max(40), ...force }),
]);

/**
 * POST (JSON {id} | {email} | {licenseKey}) with `Authorization: Bearer $ADMIN_TOKEN`:
 * delete an account now (deletion requests: within 7 days). Same deletion as the 30-day
 * retention sweep (lib/guard/retention.ts). Does NOT cancel a Stripe subscription: while
 * one is still billing, the call is refused (409) unless the body has `force: true`.
 */
export async function POST(request: Request) {
  if (!adminAuthorized(request)) return new Response(null, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "send {id} or {email} or {licenseKey}" }, { status: 400 });
  const kv = getKV();
  const d = parsed.data;
  const e =
    "id" in d ? await getEntitlement(kv, d.id) : "email" in d ? await findByEmail(kv, d.email) : await findByLicense(kv, normalizeLicenseKey(d.licenseKey) ?? "");
  if (!e) return Response.json({ error: "not found" }, { status: 404 });
  if (e.deletedAt) return Response.json({ deleted: true, id: e.id, alreadyDeletedAt: e.deletedAt });
  const stillBilling = e.source === "stripe" && ["active", "trialing", "past_due"].includes(e.status);
  // Deleting the account does not cancel the subscription: refuse unless the operator says so explicitly.
  if (stillBilling && d.force !== true) {
    return Response.json(
      { error: "The Stripe subscription is still active. Cancel it in Stripe first, or send force: true to delete anyway.", stillBilling: true },
      { status: 409 },
    );
  }
  const r = await deleteAccount(kv, e);
  if (r.busy) return Response.json({ error: "a check of this account is running: retry in a minute" }, { status: 409 });
  const { deletedKeys } = r;
  return Response.json(
    { deleted: true, id: e.id, deletedKeys, ...(stillBilling && { warning: "The Stripe subscription is still active: cancel it in Stripe." }) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
