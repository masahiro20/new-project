import { badRequest, guard, json, readJson } from "@/lib/api";
import { getKV } from "@/lib/redis";
import { demoTokensAllowed, isDemoToken } from "@/lib/guard/demo";
import { adapterFor, type Target } from "@/lib/guard/providers";
import { addSchema, targetSchema } from "@/lib/guard/schemas";
import { CONSENT_REQUIRED_ERROR, consentCurrent, hasConsentFlag, newConsent } from "@/lib/consent";
import { fetchFor } from "@/lib/guard/service";
import { addConnection } from "@/lib/guard/store";

/** POST (JSON): add a connection. The token is verified with a read-only call before it is sealed and stored. */
export async function POST(request: Request) {
  const kv = getKV();
  const account = await guard(request, kv, { mutation: true });
  if (account instanceof Response) return account;
  const raw = await readJson(request);
  if (!raw) return badRequest();
  if (!hasConsentFlag(raw)) return json({ error: CONSENT_REQUIRED_ERROR, consentRequired: true }, 400);
  // A newer Privacy Policy / Terms must be accepted on the dashboard first.
  if (!consentCurrent(account.entitlement.consent)) return json({ error: "Please review and accept the updated Privacy Policy and Terms first.", msg: "consent-required" }, 403);
  const base = addSchema.safeParse(raw);
  const target = targetSchema.safeParse({ ...raw, projectIds: raw.projectIds ?? "", keepKeyIds: raw.keepKeyIds ?? "" });
  if (!base.success || !target.success) {
    const issue = (base.error ?? target.error)?.issues[0];
    return badRequest(issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input");
  }
  if (isDemoToken(base.data.token) && !demoTokensAllowed()) return badRequest("The demo token only works in development or with PAYMENTS_MODE=demo");
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await adapterFor(target.data as Target).fetchSpend(target.data as Target, base.data.token, monthStart, now, fetchFor(base.data.token));
  } catch (err) {
    return badRequest(`Could not read usage with this token: ${err instanceof Error ? err.message : err}`);
  }
  try {
    const conn = await addConnection(kv, account.id, { ...base.data, target: target.data as Target, consent: newConsent("add-connection") });
    return json({ ok: true, id: conn.id, message: "Connection added in test mode. Run a check to see current spend." }, 201);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : String(err));
  }
}
