import { demoTokensAllowed } from "./demo";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FetchLike } from "./stop";

// --- Vercel Spend Management webhook ------------------------------------------
// https://vercel.com/docs/spend-management#webhook-payload
// https://vercel.com/docs/webhooks/webhooks-api#securing-webhooks
// x-vercel-signature = hex(HMAC-SHA1(secret, raw body)). Sent at 50/75/100%
// (budgets created before 2025-09: 100% only).

export function verifyVercelSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(createHmac("sha1", secret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const spendPayloadSchema = z.object({
  budgetAmount: z.number().nonnegative(),
  currentSpend: z.number().nonnegative(),
  teamId: z.string().min(1),
  thresholdPercent: z.number().int().min(0).max(1000),
});
export type SpendPayload = z.infer<typeof spendPayloadSchema>;

// --- Slack incoming webhook ----------------------------------------------------
// https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks
// POST JSON {"text": …}; 200 "ok" on success. The URL itself is the secret.

export const DEMO_SLACK_URL = "demo";
const SLACK_URL = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/;

export function isSlackWebhookUrl(url: string): boolean {
  return SLACK_URL.test(url);
}

/** Posts to Slack, or logs when the URL is the dev-only "demo" value. */
export async function postSlack(url: string, text: string, fetchImpl: FetchLike = fetch): Promise<void> {
  if (url === DEMO_SLACK_URL) {
    // A "demo" URL saved earlier must not report success where demo values are refused (Ren QA).
    if (!demoTokensAllowed()) throw new Error("The demo Slack URL only works in development or a demo deployment. Save your real Slack webhook URL.");
    console.info(`[slack:dev] ${text}`);
    return;
  }
  if (!isSlackWebhookUrl(url)) throw new Error("Not a Slack incoming webhook URL");
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    redirect: "manual", // never follow (see providerFetch in service.ts); a 3xx is !ok below
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text()).slice(0, 100)}`);
}
