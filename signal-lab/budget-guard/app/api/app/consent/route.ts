import { guard, json, readJson } from "@/lib/api";
import { CONSENT_REQUIRED_ERROR, hasConsentFlag, newConsent } from "@/lib/consent";
import { saveConsent } from "@/lib/entitlements";
import { getKV } from "@/lib/redis";

/** POST (JSON {consent: true}): agree again after the Privacy Policy / Terms changed. One write (the entitlement). */
export async function POST(request: Request) {
  const kv = getKV();
  const account = await guard(request, kv, { mutation: true });
  if (account instanceof Response) return account;
  if (!hasConsentFlag(await readJson(request))) return json({ error: CONSENT_REQUIRED_ERROR, consentRequired: true }, 400);
  const e = await saveConsent(kv, account.entitlement, newConsent("reconsent"));
  return json({ ok: true, consent: e.consent });
}
