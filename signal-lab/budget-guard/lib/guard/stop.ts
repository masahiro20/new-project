import { createHmac, timingSafeEqual } from "node:crypto";

// Stop actions are destructive, so they go through three gates:
//  1. mode "test" (the default) never sends the request; it records what would be sent.
//  2. switching to "live" or stopping by hand needs a signed, short-lived challenge
//     plus the user typing the connection label back.
//  3. automatic stops at 100% only run for connections already armed as "live".

export type StopMode = "off" | "test" | "live";

export interface PlannedRequest {
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
}

export interface StopPlan {
  summary: string;
  requests: PlannedRequest[];
  undo: string;
}

export interface StopResult {
  dryRun: boolean;
  ok: boolean;
  requests: (PlannedRequest & { status?: number; error?: string })[];
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function runStop(
  plan: StopPlan,
  mode: StopMode,
  headers: Record<string, string>,
  fetchImpl: FetchLike = fetch,
): Promise<StopResult> {
  if (mode === "off") return { dryRun: true, ok: false, requests: [] };
  if (mode === "test") return { dryRun: true, ok: true, requests: plan.requests };

  const results: StopResult["requests"] = [];
  for (const req of plan.requests) {
    try {
      const res = await fetchImpl(req.url, {
        method: req.method,
        headers: { ...headers, ...(req.body !== undefined ? { "content-type": "application/json" } : {}) },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });
      results.push({ ...req, status: res.status, ...(res.ok ? {} : { error: (await res.text()).slice(0, 300) }) });
    } catch (err) {
      results.push({ ...req, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { dryRun: false, ok: results.every((r) => r.status !== undefined && r.status < 400), requests: results };
}

// --- Confirmation challenge -------------------------------------------------

export type ConfirmAction = "arm-live" | "stop-now";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function planFingerprint(plan: StopPlan): string {
  return createHmac("sha256", "plan").update(JSON.stringify(plan.requests)).digest("base64url").slice(0, 16);
}

/** Issue a challenge bound to the connection, the action, and the exact plan shown to the user. */
export function issueChallenge(connectionId: string, action: ConfirmAction, plan: StopPlan, secret: string, now = Date.now()): string {
  const payload = [connectionId, action, planFingerprint(plan), now + CHALLENGE_TTL_MS].join("|");
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, secret)}`;
}

export function verifyChallenge(
  challenge: string,
  expect: { connectionId: string; action: ConfirmAction; plan: StopPlan; label: string; typed: string },
  secret: string,
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  const [encoded, mac] = challenge.split(".");
  if (!encoded || !mac) return { ok: false, reason: "malformed" };
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad-signature" };
  const [connectionId, action, fingerprint, exp] = payload.split("|");
  if (connectionId !== expect.connectionId || action !== expect.action) return { ok: false, reason: "wrong-target" };
  if (fingerprint !== planFingerprint(expect.plan)) return { ok: false, reason: "plan-changed" };
  if (Number(exp) < now) return { ok: false, reason: "expired" };
  if (expect.typed.trim() !== expect.label) return { ok: false, reason: "label-mismatch" };
  return { ok: true };
}
