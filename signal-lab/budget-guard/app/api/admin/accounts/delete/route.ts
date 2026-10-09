import { z } from "zod";
import { adminAuthorized } from "@/lib/admin-auth";
import { findByEmail, findByLicense, getEntitlement } from "@/lib/entitlements";
import { normalizeLicenseKey } from "@/lib/license";
import { getKV } from "@/lib/redis";
import { deleteAccount } from "@/lib/guard/retention";

const schema = z.union([
  z.object({ id: z.string().min(1).max(200) }),
  z.object({ email: z.email().max(254) }),
  z.object({ licenseKey: z.string().min(1).max(40) }),
]);

/**
 * POST (JSON {id} | {email} | {licenseKey}) with `Authorization: Bearer $ADMIN_TOKEN`:
 * delete an account now (deletion requests: within 7 days). Same deletion as the 30-day
 * retention sweep (lib/guard/retention.ts). Does NOT cancel a Stripe subscription — do
 * that in Stripe first (the response warns when it is still active).
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
  const { deletedKeys } = await deleteAccount(kv, e);
  return Response.json(
    { deleted: true, id: e.id, deletedKeys, ...(stillBilling && { warning: "The Stripe subscription is still active: cancel it in Stripe." }) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
