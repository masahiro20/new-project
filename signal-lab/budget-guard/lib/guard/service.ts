import { createHash } from "node:crypto";
import { accessSecret } from "../access";
import { getEntitlement, isActive } from "../entitlements";
import { sendMail } from "../mail";
import type { KV } from "../redis";
import { isProduction, siteUrl } from "../site";
import { checkConnection, type Notice } from "./check";
import { decryptSecret, encryptSecret } from "./crypto";
import { periodKey } from "./evaluate";
import { DEMO_SLACK_URL, postSlack, spendPayloadSchema, verifyVercelSignature } from "./notify-channels";
import { demoFetch, isDemoToken } from "./demo";
import { adapterFor } from "./providers";
import type { FetchLike, StopPlan } from "./stop";
import {
  appendLog,
  claimHookEvent,
  getConnection,
  getSettings,
  getState,
  listAccounts,
  listConnections,
  ownerOf,
  saveSettings,
  saveSnapshot,
  saveState,
  updateConnection,
  type StoredConnection,
} from "./store";

// Glue between the pure guard logic and the template's KV, mail and entitlements.

/** Real fetch, or the offline demo for the "demo" token (refused in production). */
export function fetchFor(token: string): FetchLike {
  if (!isDemoToken(token)) return fetch;
  if (isProduction()) throw new Error("The demo token is disabled in production");
  return demoFetch();
}

export function openToken(conn: StoredConnection): string {
  return decryptSecret(conn.sealedToken, conn.id);
}

/** Separate HMAC key for stop confirmations, derived from ACCESS_SECRET. */
export function challengeSecret(): string {
  return createHash("sha256").update(accessSecret()).update("budget-guard:stop-challenge").digest("base64url");
}

export async function planFor(conn: StoredConnection): Promise<StopPlan> {
  const token = openToken(conn);
  return adapterFor(conn.target).planStop(conn.target, token, conn.budgetUsd, fetchFor(token));
}

const SUBJECT: Record<Notice["kind"], string> = {
  warn: "80% of budget reached",
  limit: "Budget reached",
  stopped: "Stop action executed",
  "stop-test": "Stop action (test mode) would have run",
  "stop-failed": "Stop action FAILED",
  error: "Usage check failed",
  "vercel-alert": "Vercel Spend Management alert",
  info: "Notice",
};

// --- Slack -------------------------------------------------------------------

export async function setSlackUrl(kv: KV, acct: string, url: string | null): Promise<void> {
  const settings = await getSettings(kv, acct);
  if (url === null) {
    delete settings.sealedSlackUrl;
    delete settings.slackHint;
  } else {
    if (url === DEMO_SLACK_URL && isProduction()) throw new Error("The demo Slack URL only works in development");
    settings.sealedSlackUrl = encryptSecret(url, `${acct}:slack`);
    settings.slackHint = url === DEMO_SLACK_URL ? "demo" : `hooks.slack.com/…${url.slice(-4)}`;
  }
  await saveSettings(kv, acct, settings);
}

async function slackUrl(kv: KV, acct: string): Promise<string | null> {
  const { sealedSlackUrl } = await getSettings(kv, acct);
  return sealedSlackUrl ? decryptSecret(sealedSlackUrl, `${acct}:slack`) : null;
}

export async function sendSlackTest(kv: KV, acct: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const url = await slackUrl(kv, acct);
  if (!url) throw new Error("No Slack webhook saved");
  await postSlack(url, "Budget Guard test message: alerts for this account will appear here.", fetchImpl);
}

// --- Notifications -----------------------------------------------------------

/** Email every notice except routine errors; mirror the same to Slack when configured. */
export async function notify(kv: KV, acct: string, email: string, notices: Notice[], fetchImpl: FetchLike = fetch): Promise<void> {
  const mailable = notices.filter((n) => n.kind !== "error" && n.kind !== "info");
  if (mailable.length === 0) return;
  for (const n of mailable) {
    await sendMail({ to: email, subject: `[Budget Guard] ${SUBJECT[n.kind]}`, text: `${n.message}\n\nDashboard: ${siteUrl()}/app` });
  }
  const url = await slackUrl(kv, acct).catch(() => null);
  if (!url) return;
  try {
    await postSlack(url, mailable.map((n) => `*${SUBJECT[n.kind]}* — ${n.message}`).join("\n"), fetchImpl);
  } catch (err) {
    // A broken Slack hook must not block email or stop actions; surface it on the dashboard.
    await appendLog(kv, acct, [{ kind: "error", connectionId: "", message: `Slack delivery failed: ${err instanceof Error ? err.message : err}`, at: new Date().toISOString() }]);
  }
}

export async function checkAccount(
  kv: KV,
  acct: string,
  email: string,
  now = new Date(),
  only?: string,
  opts: { forceLimit?: boolean; notifyFetch?: FetchLike } = {},
): Promise<Notice[]> {
  const all: Notice[] = [];
  for (const conn of await listConnections(kv, acct)) {
    if (only && conn.id !== only) continue;
    let token: string;
    let fetchImpl: FetchLike;
    try {
      token = openToken(conn);
      fetchImpl = fetchFor(token);
    } catch (err) {
      all.push({ kind: "error", connectionId: conn.id, message: `${conn.label}: ${err instanceof Error ? err.message : err}` });
      continue;
    }
    const result = await checkConnection(conn, (await getState(kv, acct, conn.id)) ?? undefined, {
      token,
      fetchImpl,
      now,
      forceLimit: opts.forceLimit,
    });
    await saveState(kv, acct, conn.id, result.state);
    await saveSnapshot(kv, acct, conn.id, {
      spendUsd: result.spendUsd ?? 0,
      ratio: result.evaluation?.ratio ?? 0,
      level: result.evaluation?.level ?? "ok",
      checkedAt: now.toISOString(),
      error: result.notices.find((n) => n.kind === "error")?.message,
    });
    all.push(...result.notices);
  }
  await appendLog(kv, acct, all.map((n) => ({ ...n, at: now.toISOString() })));
  await notify(kv, acct, email, all, opts.notifyFetch);
  return all;
}

// --- Vercel Spend Management webhook --------------------------------------------

export async function setVercelWebhookSecret(kv: KV, acct: string, connId: string, secret: string | null): Promise<void> {
  await updateConnection(kv, acct, connId, { sealedWebhookSecret: secret === null ? undefined : encryptSecret(secret, `${connId}:webhook`) });
}

export type HookOutcome =
  | { status: 200; result: "handled" | "duplicate" | "inactive" }
  | { status: 400 | 401 | 404; result: string };

/**
 * Verifies and records a Spend Management webhook for one connection. Returns a
 * follow-up to run after the response (Vercel times out at 30s), so the route can
 * hand it to after().
 */
export async function handleVercelWebhook(
  kv: KV,
  connId: string,
  rawBody: string,
  signature: string | null,
  now = new Date(),
): Promise<{ outcome: HookOutcome; followUp?: () => Promise<unknown> }> {
  // Unknown connection, wrong provider, no secret and bad signature all look the same to the caller.
  const unauthorized = { outcome: { status: 401, result: "invalid_signature" } as HookOutcome };
  const acct = await ownerOf(kv, connId);
  const conn = acct ? await getConnection(kv, acct, connId) : undefined;
  if (!acct || !conn || conn.target.provider !== "vercel" || !conn.sealedWebhookSecret) return unauthorized;
  if (!verifyVercelSignature(rawBody, signature, decryptSecret(conn.sealedWebhookSecret, `${conn.id}:webhook`))) return unauthorized;

  let payload;
  try {
    payload = spendPayloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return { outcome: { status: 400, result: "invalid_payload" } };
  }
  if (payload.teamId !== conn.target.teamId) return { outcome: { status: 400, result: "team_mismatch" } };

  const ent = await getEntitlement(kv, acct);
  if (!isActive(ent)) return { outcome: { status: 200, result: "inactive" } };
  if (!(await claimHookEvent(kv, conn.id, `${periodKey(now)}:${payload.thresholdPercent}`))) {
    return { outcome: { status: 200, result: "duplicate" } };
  }

  const notice: Notice = {
    kind: "vercel-alert",
    connectionId: conn.id,
    message: `${conn.label}: Vercel Spend Management reports $${payload.currentSpend} of its $${payload.budgetAmount} on-demand budget (${payload.thresholdPercent}% threshold).`,
  };
  await appendLog(kv, acct, [{ ...notice, at: now.toISOString() }]);
  const reachedLimit = payload.thresholdPercent >= 100;
  return {
    outcome: { status: 200, result: "handled" },
    // Mail the alert, then re-check now instead of waiting for the hourly cron. At 100%
    // we treat Vercel's own figure as the limit, so an armed stop runs immediately.
    followUp: async () => {
      await notify(kv, acct, ent.email, [notice]);
      await checkAccount(kv, acct, ent.email, now, conn.id, { forceLimit: reachedLimit });
    },
  };
}

/** Hourly cron: every account with an active entitlement. */
export async function checkAll(kv: KV, now = new Date()): Promise<{ accounts: number; notices: number }> {
  let accounts = 0;
  let notices = 0;
  for (const acct of await listAccounts(kv)) {
    const ent = await getEntitlement(kv, acct);
    if (!isActive(ent)) continue; // lapsed subscriptions stop being monitored
    accounts++;
    notices += (await checkAccount(kv, acct, ent.email, now)).length;
  }
  return { accounts, notices };
}
